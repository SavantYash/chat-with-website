import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";
import {
  Schema,
  Field,
  Utf8,
  Int32,
  Float32,
  FixedSizeList,
} from "apache-arrow";
import {
  VectorStore,
  VectorStoreConfig,
  VectorStoreCapabilities,
  DocumentChunk,
  SearchOptions,
  MetadataFilter,
  SourceType,
  SourceMetadata,
} from "../../types";

interface LanceDBRow {
  id: string;
  url: string;
  title: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  pageNumber?: number | null;
  metadata?: string | null;
  vector: Float32Array;
  _distance?: number;
}

/**
 * LanceDBStore implements the VectorStore interface using local/embedded LanceDB.
 * Provides high-fidelity persistence for multi-source RAG knowledge (Websites and Files).
 */
export class LanceDBStore implements VectorStore {
  readonly capabilities: VectorStoreCapabilities = {
    supportsMetadataFiltering: true,
    supportsUpsert: true,
    supportsDelete: true,
  };

  private readonly dbUri: string;
  private readonly tableName: string;
  private readonly embeddingDimension: number;
  private dbConnection: lancedb.Connection | null = null;
  private dbTable: lancedb.Table | null = null;

  constructor(config: VectorStoreConfig) {
    this.dbUri = config.uri || "./data/lancedb";
    this.tableName = config.namespace || "web_chunks";
    this.embeddingDimension = config.embeddingDimension;

    if (!this.embeddingDimension || this.embeddingDimension <= 0) {
      throw new Error(
        "[LanceDBStore] embeddingDimension must be a positive integer."
      );
    }
  }

  private get connection(): lancedb.Connection {
    if (!this.dbConnection) {
      throw new Error(
        "[LanceDBStore] Database connection not initialized. Call initialize() first."
      );
    }
    return this.dbConnection;
  }

  private get table(): lancedb.Table {
    if (!this.dbTable) {
      throw new Error(
        `[LanceDBStore] Table '${this.tableName}' not loaded. Call initialize() first.`
      );
    }
    return this.dbTable;
  }

  async initialize(): Promise<void> {
    try {
      // Ensure local target directory exists if URI is a local path
      if (!this.dbUri.startsWith("s3://") && !this.dbUri.startsWith("gs://")) {
        const resolvedPath = path.isAbsolute(this.dbUri)
          ? this.dbUri
          : path.resolve(process.cwd(), this.dbUri);
        if (!fs.existsSync(resolvedPath)) {
          fs.mkdirSync(resolvedPath, { recursive: true });
        }
      }

      this.dbConnection = await lancedb.connect(this.dbUri);

      const tableNames = await this.dbConnection.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.dbTable = await this.dbConnection.openTable(this.tableName);
      } else {
        const schema = new Schema([
          new Field("id", new Utf8(), false),
          new Field("url", new Utf8(), false),
          new Field("title", new Utf8(), false),
          new Field("content", new Utf8(), false),
          new Field("chunkIndex", new Int32(), false),
          new Field("totalChunks", new Int32(), false),
          new Field("startOffset", new Int32(), false),
          new Field("endOffset", new Int32(), false),
          new Field("sourceType", new Utf8(), true),
          new Field("sourceName", new Utf8(), true),
          new Field("sourceUrl", new Utf8(), true),
          new Field("fileName", new Utf8(), true),
          new Field("fileType", new Utf8(), true),
          new Field("pageNumber", new Int32(), true),
          new Field("metadata", new Utf8(), true),
          new Field(
            "vector",
            new FixedSizeList(
              this.embeddingDimension,
              new Field("item", new Float32(), true)
            ),
            false
          ),
        ]);

        this.dbTable = await this.dbConnection.createEmptyTable(
          this.tableName,
          schema
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] Failed to initialize LanceDB: ${errorMessage}`
      );
    }
  }

  async validate(): Promise<void> {
    try {
      await this.count();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] LanceDB validation failed: ${errorMessage}`
      );
    }
  }

  private buildSqlFilter(filters: MetadataFilter[]): string {
    return filters
      .map((f) => {
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
      })
      .join(" AND ");
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit: number,
    options?: SearchOptions
  ): Promise<DocumentChunk[]> {
    try {
      if (queryEmbedding.length !== this.embeddingDimension) {
        throw new Error(
          `[LanceDBStore] Query embedding dimension (${queryEmbedding.length}) does not match configured store dimension (${this.embeddingDimension}).`
        );
      }

      let query = this.table.vectorSearch(queryEmbedding).limit(limit);

      if (options?.filters && options.filters.length > 0) {
        const filterStr = this.buildSqlFilter(options.filters);
        query = query.where(filterStr);
      }

      const results = (await query.toArray()) as unknown as LanceDBRow[];

      return results.map((row) => {
        let parsedMetadata: SourceMetadata | undefined = undefined;
        if (row.metadata) {
          try {
            parsedMetadata = JSON.parse(row.metadata) as SourceMetadata;
          } catch {
            // fallback
          }
        }

        const effectiveSourceType =
          (row.sourceType as SourceType) ||
          parsedMetadata?.sourceType ||
          (row.url?.startsWith("http") ? "website" : "file");

        const effectiveSourceName =
          row.sourceName || parsedMetadata?.sourceName || row.title;

        const effectiveSourceUrl =
          row.sourceUrl ||
          parsedMetadata?.sourceUrl ||
          (row.url?.startsWith("http") ? row.url : undefined);

        const effectiveFileName =
          row.fileName ||
          parsedMetadata?.fileName ||
          (!row.url?.startsWith("http") ? row.url : undefined);

        const effectiveFileType =
          row.fileType || parsedMetadata?.fileType || undefined;

        const effectivePageNumber =
          row.pageNumber !== null && row.pageNumber !== undefined
            ? Number(row.pageNumber)
            : parsedMetadata?.pageNumber;

        return {
          id: row.id,
          url: row.url,
          title: row.title,
          content: row.content,
          chunkIndex: row.chunkIndex,
          totalChunks: row.totalChunks,
          startOffset: row.startOffset,
          endOffset: row.endOffset,
          sourceType: effectiveSourceType,
          sourceName: effectiveSourceName,
          sourceUrl: effectiveSourceUrl,
          fileName: effectiveFileName,
          fileType: effectiveFileType,
          pageNumber: effectivePageNumber,
          metadata: parsedMetadata || {
            sourceType: effectiveSourceType,
            sourceName: effectiveSourceName,
            sourceUrl: effectiveSourceUrl,
            fileName: effectiveFileName,
            fileType: effectiveFileType,
            pageNumber: effectivePageNumber,
          },
          embedding: Array.from(row.vector),
          score: row._distance !== undefined ? Number(row._distance) : undefined,
        };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] Similarity search failed: ${errorMessage}`
      );
    }
  }

  async upsert(documents: DocumentChunk[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    try {
      for (const doc of documents) {
        if (!doc.embedding) {
          throw new Error(
            `Document chunk with ID ${doc.id} is missing its embedding.`
          );
        }
        if (doc.embedding.length !== this.embeddingDimension) {
          throw new Error(
            `Document chunk embedding dimension (${doc.embedding.length}) does not match configured store dimension (${this.embeddingDimension}).`
          );
        }
      }

      const ids = documents.map((d) => d.id);
      const deleteExpr = `id IN (${ids
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(", ")})`;
      await this.table.delete(deleteExpr).catch(() => {});

      const records = documents.map((doc) => {
        const metadataObj = doc.metadata || {
          sourceType: doc.sourceType || (doc.url.startsWith("http") ? "website" : "file"),
          sourceName: doc.sourceName || doc.title,
          sourceUrl: doc.sourceUrl || (doc.url.startsWith("http") ? doc.url : undefined),
          fileName: doc.fileName || (!doc.url.startsWith("http") ? doc.url : undefined),
          fileType: doc.fileType,
          pageNumber: doc.pageNumber,
        };

        return {
          id: doc.id,
          url: doc.url,
          title: doc.title,
          content: doc.content,
          chunkIndex: doc.chunkIndex,
          totalChunks: doc.totalChunks,
          startOffset: doc.startOffset,
          endOffset: doc.endOffset,
          sourceType: doc.sourceType || (doc.url.startsWith("http") ? "website" : "file"),
          sourceName: doc.sourceName || doc.title || null,
          sourceUrl: doc.sourceUrl || (doc.url.startsWith("http") ? doc.url : null),
          fileName: doc.fileName || (!doc.url.startsWith("http") ? doc.url : null),
          fileType: doc.fileType || null,
          pageNumber: doc.pageNumber !== undefined ? doc.pageNumber : null,
          metadata: JSON.stringify(metadataObj),
          vector: doc.embedding,
        };
      });

      await this.table.add(records);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] Failed to upsert documents: ${errorMessage}`
      );
    }
  }

  async delete(options: SearchOptions): Promise<void> {
    if (!options.filters || options.filters.length === 0) {
      throw new Error(
        "delete options must include filters to prevent accidental full table wipe."
      );
    }
    try {
      const filterStr = this.buildSqlFilter(options.filters);
      await this.table.delete(filterStr);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] Failed to delete documents: ${errorMessage}`
      );
    }
  }

  async count(): Promise<number> {
    try {
      return await this.table.countRows();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`[LanceDBStore] Failed to count rows: ${errorMessage}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.connection.dropTable(this.tableName);
      this.dbTable = null;
      await this.initialize();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `[LanceDBStore] Failed to clear LanceDB store: ${errorMessage}`
      );
    }
  }
}
