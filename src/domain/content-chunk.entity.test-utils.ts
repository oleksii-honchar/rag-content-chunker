import { generateId } from '../utils/big-endian-id';
import { faker } from '../utils/test-faker';
import { ContentChunk, ContentChunkProps, FILE_ROLES } from './content-chunk.entity';

export function aContentChunk(overrides?: Partial<ContentChunkProps>): ContentChunk {
  const props: ContentChunkProps = {
    id: generateId(),
    text: faker.lorem.paragraph(),
    chunkIndex: 0,
    totalChunks: 1,
    sectionHeader: faker.lorem.sentence(),
    breadcrumb: faker.lorem.words(3).split(' ').join(' > '),
    language: undefined,
    fileRole: FILE_ROLES.DOCS,
    oversized: false,
    startLine: 1,
    endLine: 10,
    metadata: {},
    importance: 0.5,
    tags: faker.lorem.words(2).split(' ') as string[],
    memoryBank: faker.lorem.word(),
    ...overrides,
  };
  return ContentChunk.of(props).getValue();
}
