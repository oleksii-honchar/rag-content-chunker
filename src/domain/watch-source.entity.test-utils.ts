import { WatchSource, WatchSourceProps } from './watch-source.entity';

export function aWatchSource(overrides?: Partial<WatchSourceProps>): WatchSource {
  const props: WatchSourceProps = {
    id: 'test-source-1',
    path: '/tmp/watched',
    include: ['*.md'],
    exclude: ['**/.git/**'],
    debounceMs: 3000,
    ignorePatterns: [],
    ...overrides,
  };
  return WatchSource.of(props).getValue();
}
