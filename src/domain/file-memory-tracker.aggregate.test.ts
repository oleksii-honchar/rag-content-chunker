import { FileMemoryTracker } from './file-memory-tracker.aggregate';

describe('FileMemoryTracker', () => {
  const validProps = {
    id: 'tracker-001',
    filePath: '/test/file.txt',
    memoryIds: ['mem-001'],
    sourceId: 'source-001',
    namespace: 'vault-knowledge',
  };

  describe('of', () => {
    it('with valid props returns ok with tracker', () => {
      const result = FileMemoryTracker.of(validProps);

      expect(result.isOk()).toBe(true);
      const tracker = result.getValue();
      expect(tracker.id).toBe(validProps.id);
      expect(tracker.filePath).toBe(validProps.filePath);
      expect(tracker.memoryIds).toEqual(validProps.memoryIds);
      expect(tracker.sourceId).toBe(validProps.sourceId);
      expect(tracker.namespace).toBe(validProps.namespace);
    });

    it('with empty filePath returns ko', () => {
      const result = FileMemoryTracker.of({
        ...validProps,
        filePath: '',
      });

      expect(result.isKo()).toBe(true);
    });

    it('with empty memoryIds returns ok (allowed for findOrCreate)', () => {
      const result = FileMemoryTracker.of({
        ...validProps,
        memoryIds: [],
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().memoryIds).toEqual([]);
    });

    it('with empty sourceId returns ko', () => {
      const result = FileMemoryTracker.of({
        ...validProps,
        sourceId: '',
      });

      expect(result.isKo()).toBe(true);
    });

    it('with empty namespace returns ko', () => {
      const result = FileMemoryTracker.of({
        ...validProps,
        namespace: '',
      });

      expect(result.isKo()).toBe(true);
    });

    it('with missing required fields returns ko', () => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        // missing memoryIds, sourceId, namespace
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with invalid filePath returns ko', () => {
      const result = FileMemoryTracker.of({
        ...validProps,
        filePath: '',
      });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('of', () => {
    it('with valid props returns ok', () => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001', 'mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      });

      expect(result.isOk()).toBe(true);
      const tracker = result.getValue();
      expect(tracker.id).toBe('tracker-001');
      expect(tracker.filePath).toBe('/test/file.txt');
      expect(tracker.memoryIds).toEqual(['mem-001', 'mem-002']);
      expect(tracker.sourceId).toBe('source-001');
      expect(tracker.namespace).toBe('vault-knowledge');
    });

    it('with invalid filePath returns ko', () => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '',
        memoryIds: ['mem-001'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      });

      expect(result.isKo()).toBe(true);
    });

    it('with empty memoryIds returns ok (allowed for findOrCreate)', () => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: [],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().memoryIds).toEqual([]);
    });

    it('with missing required fields returns ko', () => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        // missing memoryIds, sourceId, namespace
      } as never);

      expect(result.isKo()).toBe(true);
    });
  });

  describe('remember', () => {
    it('appends new memoryId to list', () => {
      const tracker = FileMemoryTracker.of(validProps).getValue();

      const result = tracker.remember('mem-002');

      expect(result.isOk()).toBe(true);
      const updated = result.getValue();
      expect(updated.memoryIds).toEqual(['mem-001', 'mem-002']);
    });

    it('returns new instance without mutating original', () => {
      const tracker = FileMemoryTracker.of(validProps).getValue();

      tracker.remember('mem-002');

      expect(tracker.memoryIds).toEqual(['mem-001']);
    });

    it('does not add duplicate memoryId', () => {
      const tracker = FileMemoryTracker.of(validProps).getValue();

      const result = tracker.remember('mem-001');

      expect(result.isOk()).toBe(true);
      const updated = result.getValue();
      expect(updated.memoryIds).toEqual(['mem-001']);
    });

    it('with empty memoryId returns ko', () => {
      const tracker = FileMemoryTracker.of(validProps).getValue();

      const result = tracker.remember('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('forget', () => {
    it('removes existing memoryId from list', () => {
      const tracker = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001', 'mem-002', 'mem-003'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      }).getValue();

      const result = tracker.forget('mem-002');

      expect(result.isOk()).toBe(true);
      const updated = result.getValue();
      expect(updated.memoryIds).toEqual(['mem-001', 'mem-003']);
    });

    it('returns new instance without mutating original', () => {
      const tracker = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001', 'mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      }).getValue();

      tracker.forget('mem-001');

      expect(tracker.memoryIds).toEqual(['mem-001', 'mem-002']);
    });

    it('returns original unchanged when memoryId not found', () => {
      const tracker = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      }).getValue();

      const result = tracker.forget('mem-999');

      expect(result.isOk()).toBe(true);
      const updated = result.getValue();
      expect(updated.memoryIds).toEqual(['mem-001']);
    });
  });

  describe('getters', () => {
    let tracker: FileMemoryTracker;

    beforeEach(() => {
      const result = FileMemoryTracker.of({
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001', 'mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      });
      tracker = result.getValue();
    });

    it('all getters return correct values', () => {
      expect(tracker.id).toBe('tracker-001');
      expect(tracker.filePath).toBe('/test/file.txt');
      expect(tracker.memoryIds).toEqual(['mem-001', 'mem-002']);
      expect(tracker.sourceId).toBe('source-001');
      expect(tracker.namespace).toBe('vault-knowledge');
    });
  });
});
