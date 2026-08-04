import { WatchSourceConfig } from '@/infrastructure/config/config-schemas';
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

export interface WatchSourceConfigOverrides {
  id?: string;
  path?: string;
  memoryBank?: string;
  description?: string;
  exclude?: string[];
  debounceMs?: number;
}

export function aWatchSourceConfig(overrides?: WatchSourceConfigOverrides): WatchSourceConfig {
  const id = overrides?.id ?? 'watch-source';
  const memoryBank = overrides?.memoryBank ?? id;
  return {
    id,
    path: overrides?.path ?? faker.system.filePath(),
    memoryBank,
    description: overrides?.description,
    exclude: overrides?.exclude ?? [`**/${faker.lorem.word()}/**`],
    debounceMs: overrides?.debounceMs ?? 3000,
  };
}
