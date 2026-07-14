import * as lancedb from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32, Int32, Utf8 } from "apache-arrow";
import { DocumentChunk, VectorStore } from "../../types";

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
  private readonly dbUri: string;
  private readonly tableName: string;
  private readonly embeddingDimension: number;
  
  private dbConnection: lancedb.Connection | null = null;
  private dbTable: lancedb.Table | null = null;

  /**
   * Constructs the LanceDB vector store.
   * 
   * @param options Configuration options for database URI, table name, and vector dimension.
   */
  constructor(options: { dbUri?: string; tableName?: string; embeddingDimension?: number } = {}) {
    this.dbUri = options.dbUri || "./data/lancedb";
    this.tableName = options.tableName || "web_chunks";
    this.embeddingDimension = options.embeddingDimension || 1536; // Default to standard OpenAI/Gemini dimensions
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
   * Inserts chunks into the table.
   * Maps 'embedding' from DocumentChunk to LanceDB's expected 'vector' field.
   * 
   * @param documents Array of chunks containing embeddings.
   */
  async addDocuments(documents: DocumentChunk[]): Promise<void> {
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
      throw new Error(`Failed to add documents to LanceDB: ${errorMessage}`);
    }
  }

  /**
   * Performs a vector similarity search on the stored chunks.
   * 
   * @param queryEmbedding Vector representing the user's question.
   * @param limit Top-k results limit.
   * @param options Additional search overrides (e.g. metadata filtering under options.filter).
   */
  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: Record<string, unknown>
  ): Promise<DocumentChunk[]> {
    try {
      if (queryEmbedding.length !== this.embeddingDimension) {
        throw new Error(
          `Query embedding dimension (${queryEmbedding.length}) does not match configured store dimension (${this.embeddingDimension}).`
        );
      }

      // Initialize query builder
      let query = this.table.vectorSearch(queryEmbedding).limit(limit);

      // Support SQL-like filter where statement if passed in options
      if (options?.filter && typeof options.filter === "string") {
        query = query.where(options.filter);
      } else if (options?.where && typeof options.where === "string") {
        query = query.where(options.where);
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
