import { Chunk } from '../../domain/chunk.entity';
import { Result } from '../../utils/result';

export interface ChunkContentConfig {
  maxTokens: number;
  overlapTokens: number;
  hardCapTokens: number;
  filePath: string;
  sourceId: string;
}

export interface Chunker {
  chunk(content: string, config: ChunkContentConfig): Promise<Result<Chunk[]>>;
}
