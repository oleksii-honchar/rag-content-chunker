import { generateId } from '../utils/big-endian-id';
import { faker } from '../utils/test-faker';
import { ContentChunk, ContentChunkProps, FILE_ROLES } from './content-chunk.entity';

export function aContentChunk(overrides?: Partial<ContentChunkProps>): ContentChunk {
  const startLine = faker.number.int({ min: 1, max: 99 });
  const endLine = faker.number.int({ min: startLine });
  const importance = Number(faker.number.float({ min: 0, max: 1, fractionDigits: 2 }).toFixed(2));
  const props: ContentChunkProps = {
    id: generateId(),
    text: faker.lorem.paragraph(),
    chunkIndex: 0,
    totalChunks: 1,
    sectionHeader: faker.lorem.sentence(),
    breadcrumb: faker.lorem.words(3).split(' ').join(' > '),
    language: undefined,
    fileRole: faker.helpers.arrayElement(Object.values(FILE_ROLES)),
    oversized: false,
    startLine,
    endLine,
    metadata: {},
    importance,
    tags: faker.lorem.words(2).split(' ') as string[],
    memoryBank: faker.lorem.word(),
    ...overrides,
  };
  return ContentChunk.of(props).getValue();
}
