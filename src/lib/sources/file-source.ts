import { KnowledgeSource, NormalizedDocument, IndexingProgressEvent } from "../../types";
import { ExtractorRegistry, defaultExtractorRegistry } from "../extractors";

export interface FileInput {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}

export interface FileSourceOptions {
  files: FileInput[];
  registry?: ExtractorRegistry;
}

/**
 * FileKnowledgeSource encapsulates file parsing for one or more uploaded documents.
 * Implements the KnowledgeSource contract and outputs NormalizedDocuments.
 */
export class FileKnowledgeSource implements KnowledgeSource {
  readonly sourceType = "file" as const;
  readonly sourceName: string;
  private readonly files: FileInput[];
  private readonly registry: ExtractorRegistry;

  constructor(options: FileSourceOptions) {
    if (!options.files || options.files.length === 0) {
      throw new Error("[FileKnowledgeSource] At least one file input must be provided.");
    }
    this.files = options.files;
    this.registry = options.registry ?? defaultExtractorRegistry;
    this.sourceName = this.files.map((f) => f.fileName).join(", ");
  }

  async ingest(
    onProgress?: (event: IndexingProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<NormalizedDocument[]> {
    const allDocuments: NormalizedDocument[] = [];

    for (let i = 0; i < this.files.length; i++) {
      if (signal?.aborted) {
        throw new DOMException("Indexing aborted by user.", "AbortError");
      }

      const file = this.files[i];
      const ext = file.fileName.split(".").pop() || "";

      onProgress?.({
        stage: "extract",
        message: `Extracting content from ${file.fileName} (${i + 1}/${this.files.length})...`,
        details: { fileName: file.fileName, fileIndex: i + 1, totalFiles: this.files.length },
      });

      const extractor = this.registry.getExtractor(ext, file.mimeType);
      const docs = await extractor.extract(file.buffer, file.fileName);

      onProgress?.({
        stage: "extract",
        message: `Extracted ${docs.length} section(s) from ${file.fileName}`,
        details: { fileName: file.fileName, extractedSections: docs.length },
      });

      allDocuments.push(...docs);
    }

    if (allDocuments.length === 0) {
      throw new Error(
        `[FileKnowledgeSource] No extractable documents found in uploaded files: ${this.sourceName}`
      );
    }

    return allDocuments;
  }
}
