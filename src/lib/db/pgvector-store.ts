import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
    DocumentChunk,
    MetadataFilter,
    SearchOptions,
    VectorStore,
    VectorStoreConfig,
    VectorStoreCapabilities,
} from "../../types";

interface PgVectorStoreConfig extends VectorStoreConfig {
    serviceRoleKey: string;
}

interface SupabaseWebChunkRow {
    id: string;
    url: string;
    title: string;
    content: string;

    chunkindex: number;
    totalchunks: number;
    startoffset: number;
    endoffset: number;

    embedding: number[];
    similarity?: number;
}

/**
 * PgVectorStore implements VectorStore using a Supabase Postgres backend with pgvector.
 *
 * This adapter preserves the existing DocumentChunk model and relies on a pre-existing
 * `web_chunks` table and a `match_web_chunks` RPC function in the database.
 */
export class PgVectorStore implements VectorStore {
    readonly capabilities: VectorStoreCapabilities = {
        supportsMetadataFiltering: true,
        supportsUpsert: true,
        supportsDelete: true,
    };


    private readonly supabaseUrl: string;
    private readonly serviceRoleKey: string;
    private readonly tableName: string;
    private readonly embeddingDimension: number;
    private client: SupabaseClient | null = null;

    constructor(config: PgVectorStoreConfig) {
        this.supabaseUrl = config.uri;
        this.serviceRoleKey = config.serviceRoleKey;
        this.tableName = config.namespace || "web_chunks";
        this.embeddingDimension = config.embeddingDimension;

        if (!this.supabaseUrl) {
            throw new Error("[PgVectorStore] Supabase URL is required.");
        }
        if (!this.serviceRoleKey) {
            throw new Error("[PgVectorStore] SUPABASE_SERVICE_ROLE_KEY is required.");
        }
    }

    private getClient(): SupabaseClient {
        if (!this.client) {
            throw new Error("PgVectorStore is not initialized. Call initialize() first.");
        }
        return this.client;
    }

    async initialize(): Promise<void> {
        try {
            this.client = createClient(this.supabaseUrl, this.serviceRoleKey, {
                auth: {
                    persistSession: false,
                },
            });

            const { error } = await this.client
                .from(this.tableName)
                .select("id", { head: true, count: "exact" });

            if (error) {
                const msg = error.message || "Unknown Supabase error.";
                if (msg.includes("404")) {
                    throw new Error(
                        `[PgVectorStore] Supabase table '${this.tableName}' does not exist. Create the table before using PgVectorStore.`
                    );
                }

                if (msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("permission")) {
                    throw new Error(
                        `[PgVectorStore] Supabase authentication failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`
                    );
                }

                throw new Error(`[PgVectorStore] Failed to verify Supabase connectivity: ${msg}`);
            }
        } catch (error: any) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`[PgVectorStore] Initialization failed: ${message}`);
        }
    }

    async validate(): Promise<void> {
        this.ensureInitialized();

        const { error } = await this.getClient()
            .from(this.tableName)
            .select("id", { head: true, count: "exact" });

        if (error) {
            const msg = error.message || "Unknown Supabase error.";
            if (msg.includes("404")) {
                throw new Error(
                    `[PgVectorStore] Validation failed: Supabase table '${this.tableName}' does not exist.`
                );
            }

            if (msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("permission")) {
                throw new Error(
                    `[PgVectorStore] Validation failed: Supabase authentication failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`
                );
            }

            throw new Error(`[PgVectorStore] Validation failed: ${msg}`);
        }
    }

    async similaritySearch(
        queryEmbedding: number[],
        limit: number,
        options?: SearchOptions
    ): Promise<DocumentChunk[]> {
        this.ensureInitialized();
        this.validateEmbedding(queryEmbedding);

        const rpcParams: Record<string, unknown> = {
            query_embedding: queryEmbedding,
            match_count: limit,
        };

        if (options?.filters?.length) {
            rpcParams.filters = options.filters.map((filter) => ({
                field: filter.field,
                operator: filter.operator,
                value: filter.value,
            }));
        }

        const { data, error } = await this.getClient().rpc(this.tableName === "web_chunks" ? "match_web_chunks" : "match_web_chunks", rpcParams);

        if (error) {
            throw new Error(`[PgVectorStore] similaritySearch RPC failed: ${error.message}`);
        }

        if (!data) {
            return [];
        }

        const rows = Array.isArray(data) ? data : [data];
        return rows.map(this.mapRowToDocumentChunk);
    }

    async upsert(documents: DocumentChunk[]): Promise<void> {
        this.ensureInitialized();
        if (documents.length === 0) {
            return;
        }

        const batchSize = 200;
        for (let offset = 0; offset < documents.length; offset += batchSize) {
            const batch = documents.slice(offset, offset + batchSize).map((document) => {
                if (!document.embedding) {
                    throw new Error(`Document chunk with ID ${document.id} is missing its embedding.`);
                }
                this.validateEmbedding(document.embedding);

                return this.mapDocumentChunkToRow(document);
                // return {
                //     id: document.id,
                //     url: document.url,
                //     title: document.title,
                //     content: document.content,
                //     chunkIndex: document.chunkIndex,
                //     totalChunks: document.totalChunks,
                //     startOffset: document.startOffset,
                //     endOffset: document.endOffset,
                //     vector: document.embedding,
                // };
            });

            const { error } = await this.getClient()
                .from(this.tableName)
                .upsert(batch, { onConflict: "id" });

            if (error) {
                throw new Error(`[PgVectorStore] Failed to upsert documents: ${error.message}`);
            }
        }
    }

    async delete(options: SearchOptions): Promise<void> {
        this.ensureInitialized();
        if (!options.filters || options.filters.length === 0) {
            throw new Error("delete options must include filters to prevent accidental full table wipe.");
        }

        let query = this.getClient().from(this.tableName).delete();
        for (const filter of options.filters) {
            query = this.applyFilter(query, filter);
        }

        const { error } = await query;
        if (error) {
            throw new Error(`[PgVectorStore] Failed to delete documents: ${error.message}`);
        }
    }

    async count(): Promise<number> {
        this.ensureInitialized();

        const { count, error } = await this.getClient()
            .from(this.tableName)
            .select("id", { count: "exact", head: true });

        if (error) {
            throw new Error(`[PgVectorStore] Failed to count rows: ${error.message}`);
        }

        return count ?? 0;
    }

    async clear(): Promise<void> {
        this.ensureInitialized();

        const { error } = await this.getClient()
            .from(this.tableName)
            .delete()
            .neq("id", "");

        if (error) {
            throw new Error(`[PgVectorStore] Failed to clear rows: ${error.message}`);
        }
    }

    private ensureInitialized(): void {
        if (!this.client) {
            throw new Error("PgVectorStore is not initialized. Call initialize() first.");
        }
    }

    private validateEmbedding(embedding: number[]): void {
        if (embedding.length !== this.embeddingDimension) {
            throw new Error(
                `Embedding dimension mismatch: expected ${this.embeddingDimension}, received ${embedding.length}`
            );
        }
    }

    private applyFilter(query: any, filter: MetadataFilter): any {
        const field = filter.field;
        const value = filter.value;

        switch (filter.operator) {
            case "eq":
                return query.eq(field, value);
            case "neq":
                return query.neq(field, value);
            case "gt":
                return query.gt(field, value);
            case "lt":
                return query.lt(field, value);
            case "contains":
                if (typeof value === "string") {
                    return query.ilike(field, `%${this.escapeLike(value)}%`);
                }
                return query.eq(field, value);
            case "in":
                if (!Array.isArray(value)) {
                    throw new Error("'in' filter operator requires an array value.");
                }
                return query.in(field, value);
            default:
                throw new Error(`Unsupported filter operator: ${filter.operator}`);
        }
    }

    private mapDocumentChunkToRow(
        document: DocumentChunk
    ): SupabaseWebChunkRow {
        return {
            id: document.id,
            url: document.url,
            title: document.title,
            content: document.content,

            chunkindex: document.chunkIndex,
            totalchunks: document.totalChunks,
            startoffset: document.startOffset,
            endoffset: document.endOffset,

            embedding: document.embedding!,
        };
    }

    private mapRowToDocumentChunk(
        row: SupabaseWebChunkRow
    ): DocumentChunk {
        return {
            id: row.id,
            url: row.url,
            title: row.title,
            content: row.content,

            chunkIndex: row.chunkindex,
            totalChunks: row.totalchunks,
            startOffset: row.startoffset,
            endOffset: row.endoffset,

            embedding: row.embedding,
            score: row.similarity,
        };
    }

    private escapeLike(value: string): string {
        return value.replace(/([%_])/g, "\\$1");
    }
}
