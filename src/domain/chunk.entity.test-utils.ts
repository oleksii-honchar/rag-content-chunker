import { Chunk, ChunkProps, FILE_ROLES } from './chunk.entity';

export function aChunk(overrides?: Partial<ChunkProps>): Chunk {
  const props: ChunkProps = {
    id: crypto.randomUUID(),
    text: 'Test chunk content',
    chunkIndex: 0,
    totalChunks: 1,
    sectionHeader: 'Test Section',
    breadcrumb: 'root > test',
    language: undefined,
    fileRole: FILE_ROLES.DOCS,
    oversized: false,
    startLine: 1,
    endLine: 10,
    metadata: {},
    ...overrides,
  };
  return Chunk.of(props).getValue();
}
