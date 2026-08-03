import { ContentChunk, ContentChunkProps, FILE_ROLES } from './content-chunk.entity';

export function aChunk(overrides?: Partial<ContentChunkProps>): ContentChunk {
  const props: ContentChunkProps = {
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
    importance: 0.5,
    tags: [],
    namespace: 'default',
    ...overrides,
  };
  return ContentChunk.of(props).getValue();
}
