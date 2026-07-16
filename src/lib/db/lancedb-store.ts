import * as lancedb from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32, Int32, Utf8 } from "apache-arrow";
import { DocumentChunk, VectorStore, SearchOptions, MetadataFilter, VectorStoreConfig, VectorStoreCapabilities } from "../../types";

/**
 * Interface representing the structure of a row as stored inside LanceDB.
 * Enforces strict typing and prevents the use of the `any` keyword.
 */
interface LanceDBRow {
  id: string;
  url: string;
  title: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  vector: Float32Array | number[];
  _distance?: number;
}

/**
 * LanceDBStore implements the VectorStore interface using @lancedb/lancedb.
 * 
 * Why this class exists:
 * It isolates the database-specific storage logic from the core application pipeline.
 * It manages connection persistence, Apache Arrow schema definitions, vector insertions,
 * and high-performance vector searches, converting raw columnar data back to standard 
 * domain-level TypeScript objects (DocumentChunks).
 */
export class LanceDBStore implements VectorStore {
  readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsUpsert: true,
    supportsDelete: true
  };
  
  private readonly dbUri: string;
  private readonly tableName: string;
  private readonly embeddingDimension: number;
  
  private dbConnection: lancedb.Connection | null = null;
  private dbTable: lancedb.Table | null = null;

  /**
   * Constructs the LanceDB vector store.
   * 
   * @param config Generic configuration options including URI, namespace, and embedding dimension.
   */
  constructor(config: VectorStoreConfig) {
    this.dbUri = config.uri;
    this.tableName = config.namespace || "web_chunks";
    this.embeddingDimension = config.embeddingDimension;
  }

  /**
   * Helper getter to retrieve the connection safely, throwing a clear runtime exception if uninitialized.
   */
  private get connection(): lancedb.Connection {
    if (!this.dbConnection) {
      throw new Error("LanceDBStore is not initialized. Call initialize() first.");
    }
    return this.dbConnection;
  }

  /**
   * Helper getter to retrieve the table safely, throwing a clear runtime exception if uninitialized.
   */
  private get table(): lancedb.Table {
    if (!this.dbTable) {
      throw new Error("LanceDB table has not been created or opened. Call initialize() first.");
    }
    return this.dbTable;
  }

  /**
   * Initializes the LanceDB connection, checks if the table exists, and creates it with the Arrow schema if it does not.
   */
  async initialize(): Promise<void> {
    try {
      // Connect to the local directory where database binary files are stored
      this.dbConnection = await lancedb.connect(this.dbUri);

      // Check if table is already registered in this database connection
      const tables = await this.dbConnection.tableNames();
      
      if (tables.includes(this.tableName)) {
        this.dbTable = await this.dbConnection.openTable(this.tableName);
      } else {
        // Enforce strict Apache Arrow schema for native vector search performance
        const schema = new Schema([
          new Field("id", new Utf8()),
          new Field("url", new Utf8()),
          new Field("title", new Utf8()),
          new Field("content", new Utf8()),
          new Field("chunkIndex", new Int32()),
          new Field("totalChunks", new Int32()),
          new Field("startOffset", new Int32()),
          new Field("endOffset", new Int32()),
          new Field(
            "vector",
            new FixedSizeList(
              this.embeddingDimension,
              new Field("item", new Float32(), true)
            )
          ),
        ]);

        // Create empty table configured with schema
        this.dbTable = await this.dbConnection.createEmptyTable(this.tableName, schema);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize LanceDB connection: ${errorMessage}`);
    }
  }

  /**
   * Validates that the LanceDB store is available and the table is accessible.
   */
  async validate(): Promise<void> {
    try {
      await this.count();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`LanceDB validation failed: ${errorMessage}`);
    }
  }

  /**
   * Builds a SQL filter expression from domain-level metadata filters.
   */
  private buildSqlFilter(filters: MetadataFilter[]): string {
    return filters.map(f => {
      const field = f.field;
      const op = f.operator;
      const val = f.value;
      
      const escapeStr = (s: string) => s.replace(/'/g, "''");
      const formatVal = (v: any): string => {
        if (typeof v === "string") {
          return `'${escapeStr(v)}'`;
        } else if (typeof v === "number" || typeof v === "boolean") {
          return String(v);
        } else if (Array.isArray(v)) {
          return `(${v.map(formatVal).join(", ")})`;
        } else {
          return `'${escapeStr(String(v))}'`;
        }
      };

      switch (op) {
        case "eq":
          return `${field} = ${formatVal(val)}`;
        case "neq":
          return `${field} != ${formatVal(val)}`;
        case "gt":
          return `${field} > ${formatVal(val)}`;
        case "lt":
          return `${field} < ${formatVal(val)}`;
        case "contains":
          if (typeof val === "string") {
            return `${field} LIKE '%${escapeStr(val)}%'`;
          }
          return `${field} = ${formatVal(val)}`;
        case "in":
          return `${field} IN ${formatVal(val)}`;
        default:
          throw new Error(`Unsupported filter operator: ${op}`);
      }
    }).join(" AND ");
  }

  /**
   * Performs a vector similarity search on the stored chunks.
   * 
   * @param queryEmbedding Vector representing the user's question.
   * @param limit Top-k results limit.
   * @param options Additional search overrides, including metadata filters.
   */
  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: SearchOptions
  ): Promise<DocumentChunk[]> {
    try {
      if (queryEmbedding.length !== this.embeddingDimension) {
        throw new Error(
          `Query embedding dimension (${queryEmbedding.length}) does not match configured store dimension (${this.embeddingDimension}).`
        );
      }

      // Initialize query builder
      let query = this.table.vectorSearch(queryEmbedding).limit(limit);

      // Support metadata filtering if provided
      if (options?.filters && options.filters.length > 0) {
        const filterStr = this.buildSqlFilter(options.filters);
        query = query.where(filterStr);
      }

      // Execute query and retrieve records
      const results = (await query.toArray()) as unknown as LanceDBRow[];

      // Map DB schema records back into domain-specific DocumentChunks
      return results.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        content: row.content,
        chunkIndex: row.chunkIndex,
        totalChunks: row.totalChunks,
        startOffset: row.startOffset,
        endOffset: row.endOffset,
        // Convert Float32Array back to standard JS array of numbers
        embedding: Array.from(row.vector),
        // LanceDB returns L2/cosine distance as _distance; assign to optional score
        score: row._distance,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Similarity search failed: ${errorMessage}`);
    }
  }

  /**
   * Inserts or updates document chunks in the database using the database's native capability when available.
   * If unsupported (as in this specific version of LanceDB's basic JS api), we emulate it internally inside the adapter.
   * 
   * @param documents Array of chunks containing embeddings.
   */
  async upsert(documents: DocumentChunk[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    try {
      // Validate embeddings before insertion
      for (const doc of documents) {
        if (!doc.embedding) {
          throw new Error(`Document chunk with ID ${doc.id} is missing its embedding.`);
        }
        if (doc.embedding.length !== this.embeddingDimension) {
          throw new Error(
            `Document chunk embedding dimension (${doc.embedding.length}) does not match configured store dimension (${this.embeddingDimension}).`
          );
        }
      }

      // Perform simulated upsert by deleting existing chunk IDs first to avoid duplicate keys in append-only tables
      const ids = documents.map(d => d.id);
      const deleteExpr = `id IN (${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(", ")})`;
      await this.table.delete(deleteExpr);

      // Map DocumentChunk domain objects into Arrow-compatible DB records
      const records = documents.map((doc) => ({
        id: doc.id,
        url: doc.url,
        title: doc.title,
        content: doc.content,
        chunkIndex: doc.chunkIndex,
        totalChunks: doc.totalChunks,
        startOffset: doc.startOffset,
        endOffset: doc.endOffset,
        vector: doc.embedding,
      }));

      // Append data rows to LanceDB
      await this.table.add(records);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to upsert documents in LanceDB: ${errorMessage}`);
    }
  }

  /**
   * Deletes document chunks matching standard metadata filters.
   * 
   * @param options Filter options defining which documents to delete.
   */
  async delete(options: SearchOptions): Promise<void> {
    if (!options.filters || options.filters.length === 0) {
      throw new Error("delete options must include filters to prevent accidental full table wipe.");
    }
    try {
      const filterStr = this.buildSqlFilter(options.filters);
      await this.table.delete(filterStr);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete documents: ${errorMessage}`);
    }
  }

  /**
   * Returns the count of rows currently stored in this table.
   */
  async count(): Promise<number> {
    try {
      return await this.table.countRows();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to count rows: ${errorMessage}`);
    }
  }

  /**
   * Deletes all documents in this store by dropping the table, resetting references, and re-initializing.
   */
  async clear(): Promise<void> {
    try {
      // Drop table from disk
      await this.connection.dropTable(this.tableName);
      
      // Reset local reference
      this.dbTable = null;

      // Re-run initialization to re-create the table with standard schema structure
      await this.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clear LanceDB store: ${errorMessage}`);
    }
  }
}
