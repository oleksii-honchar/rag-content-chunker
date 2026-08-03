import { Test, TestingModule } from '@nestjs/testing';
import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { Result } from '../utils/result';
import { FileMemoryTrackerRepository } from './file-memory-tracker.repository';
import { aFileMemoryTrackerRepositoryService } from './file-memory-tracker.repository.test-utils';
import { FileMemoryTrackerService } from './file-memory-tracker.service';

describe('FileMemoryTrackerService', () => {
  let service: FileMemoryTrackerService;
  let repository: ReturnType<typeof aFileMemoryTrackerRepositoryService>;

  beforeEach(async () => {
    repository = aFileMemoryTrackerRepositoryService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FileMemoryTrackerService, { provide: FileMemoryTrackerRepository, useValue: repository }],
    }).compile();

    service = module.get<FileMemoryTrackerService>(FileMemoryTrackerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackMemory', () => {
    it('creates new tracker via findOrCreate then upserts memory link', async () => {
      const newTracker: FileMemoryTracker = {
        id: 'tracker-new',
        filePath: '/new/file.md',
        memoryIds: [],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        remember: jest.fn().mockReturnValue(Result.ok(null as unknown as FileMemoryTracker)),
      } as unknown as FileMemoryTracker;

      repository.findOrCreate.mockResolvedValue(newTracker);
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory('/new/file.md', 'mem-abc', 'source-001', 'vault-knowledge');

      expect(repository.findOrCreate).toHaveBeenCalledWith(expect.any(Object));
      expect(newTracker.remember).toHaveBeenCalledWith('mem-abc');
      expect(repository.upsertMemory).toHaveBeenCalledWith('tracker-new', 'mem-abc');
      expect(result).toEqual(expect.objectContaining({ filePath: '/new/file.md' }));
    });

    it('finds existing tracker via findOrCreate then upserts memory link', async () => {
      const existingTracker: FileMemoryTracker = {
        id: 'tracker-existing',
        filePath: '/existing/file.md',
        memoryIds: ['mem-001'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        remember: jest.fn().mockReturnValue(Result.ok(null as unknown as FileMemoryTracker)),
      } as unknown as FileMemoryTracker;

      repository.findOrCreate.mockResolvedValue(existingTracker);
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory(
        '/existing/file.md',
        'mem-002',
        'source-001',
        'vault-knowledge',
      );

      expect(repository.findOrCreate).toHaveBeenCalledWith(expect.any(Object));
      expect(existingTracker.remember).toHaveBeenCalledWith('mem-002');
      expect(repository.upsertMemory).toHaveBeenCalledWith('tracker-existing', 'mem-002');
      expect(result).toEqual(expect.objectContaining({ filePath: '/existing/file.md' }));
    });

    it('returns aggregate with updated memoryIds after remember', async () => {
      const updatedTracker: FileMemoryTracker = {
        id: 'tracker-001',
        filePath: '/test/file.md',
        memoryIds: ['mem-001', 'mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        remember: jest.fn().mockReturnValue(Result.ok(null as unknown as FileMemoryTracker)),
      } as unknown as FileMemoryTracker;

      repository.findOrCreate.mockResolvedValue(updatedTracker);
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory('/test/file.md', 'mem-002', 'source-001', 'vault-knowledge');

      expect(result).toEqual(expect.objectContaining({ id: 'tracker-001' }));
      expect(result.memoryIds).toContain('mem-002');
    });
  });

  describe('forgetMemory', () => {
    it('uses aggregate forget logic then deletes memory link via repository', async () => {
      const tracker: FileMemoryTracker = {
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-001', 'mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        forget: jest.fn().mockReturnValue(Result.ok(null as unknown as FileMemoryTracker)),
      } as unknown as FileMemoryTracker;

      repository.findByFilePath.mockResolvedValue(tracker);
      repository.deleteMemory.mockResolvedValue(undefined);

      const result = await service.forgetMemory('/test/file.txt', 'mem-001');

      expect(repository.findByFilePath).toHaveBeenCalledWith('/test/file.txt');
      expect(tracker.forget).toHaveBeenCalledWith('mem-001');
      expect(repository.deleteMemory).toHaveBeenCalledWith('tracker-001', 'mem-001');
      expect(result).toEqual(expect.objectContaining({ filePath: '/test/file.txt' }));
    });

    it('returns null when tracker does not exist', async () => {
      repository.findByFilePath.mockResolvedValue(null);

      const result = await service.forgetMemory('/nonexistent/file.txt', 'mem-001');

      expect(repository.findByFilePath).toHaveBeenCalledWith('/nonexistent/file.txt');
      expect(repository.deleteMemory).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns aggregate after forget', async () => {
      const updatedTracker: FileMemoryTracker = {
        id: 'tracker-001',
        filePath: '/test/file.txt',
        memoryIds: ['mem-002'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        forget: jest.fn().mockReturnValue(Result.ok(null as unknown as FileMemoryTracker)),
      } as unknown as FileMemoryTracker;

      repository.findByFilePath.mockResolvedValue(updatedTracker);
      repository.deleteMemory.mockResolvedValue(undefined);

      const result = await service.forgetMemory('/test/file.txt', 'mem-001');

      expect(result).toEqual(expect.objectContaining({ id: 'tracker-001' }));
      expect(result!.memoryIds).not.toContain('mem-001');
    });
  });

  describe('getMemoryIds', () => {
    it('returns array of memory IDs from repository', async () => {
      repository.getMemoryIds.mockResolvedValue(['mem-001', 'mem-002']);

      const result = await service.getMemoryIds('/test/file.txt');

      expect(result).toEqual(['mem-001', 'mem-002']);
      expect(repository.getMemoryIds).toHaveBeenCalledWith('/test/file.txt');
    });

    it('returns empty array when no tracker exists', async () => {
      repository.getMemoryIds.mockResolvedValue([]);

      const result = await service.getMemoryIds('/nonexistent/file.txt');

      expect(result).toEqual([]);
    });
  });

  describe('deleteByFilePath', () => {
    it('deletes tracker record for file path via repository', async () => {
      repository.deleteByFilePath.mockResolvedValue(undefined);

      await service.deleteByFilePath('/test/file.txt');

      expect(repository.deleteByFilePath).toHaveBeenCalledWith('/test/file.txt');
    });

    it('is idempotent — no error when record does not exist', async () => {
      repository.deleteByFilePath.mockResolvedValue(undefined);

      await expect(service.deleteByFilePath('/nonexistent/file.txt')).resolves.not.toThrow();
      expect(repository.deleteByFilePath).toHaveBeenCalledWith('/nonexistent/file.txt');
    });
  });
});
