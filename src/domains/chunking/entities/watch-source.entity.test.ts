import { Result } from '../../../utils/result';
import { WatchSource, WatchSourceProps } from './watch-source.entity';

describe('WatchSource', () => {
  describe('of()', () => {
    it('with valid props returns ok', () => {
      // Arrange
      const props = {
        id: 'test-source-1',
        path: '/tmp/watched',
        include: ['*.md'],
        exclude: ['**/.git/**'],
        debounceMs: 3000,
        ignorePatterns: [],
      };

      // Act
      const result = WatchSource.of(props);

      // Assert
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(WatchSource);
    });

    it('with invalid props (negative debounceMs) returns ko', () => {
      // Arrange
      const props = {
        id: 'test-source-1',
        path: '/tmp/watched',
        include: ['*.md'],
        exclude: [],
        debounceMs: -100,
        ignorePatterns: [],
      };

      // Act
      const result = WatchSource.of(props);

      // Assert
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Invalid watch source data');
    });

    it('with missing required field returns ko', () => {
      // Arrange
      const props = {
        id: 'test-source-1',
        path: '/tmp/watched',
        include: ['*.md'],
        exclude: [],
        // debounceMs missing
        ignorePatterns: [],
      } as unknown as WatchSourceProps;

      // Act
      const result = WatchSource.of(props);

      // Assert
      expect(result.isKo()).toBe(true);
    });
  });

  describe('create()', () => {
    it('returns ok with valid args', () => {
      // Act
      const result = WatchSource.create(
        'my-source',
        '/tmp/test',
        ['*.ts'],
        ['**/node_modules/**'],
        2000,
        ['**/.DS_Store'],
      );

      // Assert
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(WatchSource);
    });
  });

  describe('getters', () => {
    it('all getters return correct values', () => {
      // Arrange
      const props = {
        id: 'getters-test',
        path: '/tmp/getters',
        include: ['*.md', '*.txt'],
        exclude: ['**/archive/**'],
        debounceMs: 5000,
        ignorePatterns: ['**/.DS_Store', '**/Thumbs.db'],
      };

      // Act
      const ws = WatchSource.of(props).getValue();

      // Assert
      expect(ws.id).toBe('getters-test');
      expect(ws.path).toBe('/tmp/getters');
      expect(ws.include).toEqual(['*.md', '*.txt']);
      expect(ws.exclude).toEqual(['**/archive/**']);
      expect(ws.debounceMs).toBe(5000);
      expect(ws.ignorePatterns).toEqual(['**/.DS_Store', '**/Thumbs.db']);
    });
  });

  describe('immutability', () => {
    it('entity is immutable', () => {
      // Arrange
      const ws = WatchSource.of({
        id: 'immutable-test',
        path: '/tmp/immutable',
        include: ['*.md'],
        exclude: [],
        debounceMs: 3000,
        ignorePatterns: [],
      }).getValue();

      // Act + Assert
      expect(() => {
        // @ts-expect-error — testing runtime immutability
        ws.id = 'hacked';
      }).toThrow();

      expect(ws.id).toBe('immutable-test');
    });
  });
});
