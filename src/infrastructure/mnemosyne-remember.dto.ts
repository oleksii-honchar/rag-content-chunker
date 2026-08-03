import { Chunk } from '../domain/content-chunk.entity';

/**
 * Payload shape for the mnemosyne_remember MCP tool call arguments.
 * Maps domain Chunk entity properties to the MCP request format.
 */
export interface MnemosyneRememberPayload {
  content: string;
  namespace: string;
  importance: number;
  source: string;
  metadata: {
    id: string;
    chunkIndex: number;
    totalChunks: number;
    sectionHeader: string;
    breadcrumb: string;
    fileRole: string;
    language?: string;
    startLine?: number;
    endLine?: number;
    importance: number;
    tags: string[];
    namespace: string;
    [key: string]: unknown;
  };
}

/**
 * DTO for transforming a Chunk domain entity into the Mnemosyne remember payload.
 * Encapsulates the mapping logic so MnemosyneClient stays focused on transport.
 */
export class MnemosyneRememberDto {
  static fromChunk(chunk: Chunk): MnemosyneRememberPayload {
    return {
      content: chunk.text,
      namespace: chunk.namespace,
      importance: chunk.importance,
      source: chunk.namespace,
      metadata: {
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        sectionHeader: chunk.sectionHeader,
        breadcrumb: chunk.breadcrumb,
        fileRole: chunk.fileRole,
        ...(chunk.language !== undefined && { language: chunk.language }),
        ...(chunk.startLine !== undefined && { startLine: chunk.startLine }),
        ...(chunk.endLine !== undefined && { endLine: chunk.endLine }),
        importance: chunk.importance,
        tags: chunk.tags,
        namespace: chunk.namespace,
        ...(chunk.metadata || {}),
      },
    };
  }
}
