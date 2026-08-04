import { generateId } from '../utils/big-endian-id';
import { faker } from '../utils/test-faker';
import { WatchSource, WatchSourceProps } from './watch-source.entity';

export function aWatchSource(overrides?: Partial<WatchSourceProps>): WatchSource {
  const props: WatchSourceProps = {
    id: generateId(),
    path: faker.system.filePath(),
    include: [`*.${faker.lorem.word().slice(0, 3)}`],
    exclude: [`**/${faker.lorem.word()}/**`],
    debounceMs: 3000,
    ignorePatterns: [],
    ...overrides,
  };
  return WatchSource.of(props).getValue();
}
