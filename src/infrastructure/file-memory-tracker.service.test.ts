import { Test, TestingModule } from '@nestjs/testing';
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

  describe('remember', () => {
    it('creates new tracker via findOrCreate then remembers memory', async () => {
      const newTracker = {
        id: 'tracker-new',
        filePath: '/new/file.md',
        memoryIds: [],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      };
      repository.findOrCreate.mockResolvedValue(newTracker as never);
      repository.remember.mockResolvedValue(undefined);

      await service.remember('/new/file.md', 'mem-abc', 'source-001', 'vault-knowledge');

      expect(repository.findOrCreate).toHaveBeenCalledWith('/new/file.md', 'source-001', 'vault-knowledge');
      expect(repository.remember).toHaveBeenCalledWith('tracker-new', 'mem-abc');
    });

    it('finds existing tracker via findOrCreate then remembers memory', async () => {
      const existingTracker = {
        id: 'tracker-existing',
        filePath: '/existing/file.md',
        memoryIds: ['mem-001'],
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
      };
      repository.findOrCreate.mockResolvedValue(existingTracker as never);
      repository.remember.mockResolvedValue(undefined);

      await service.remember('/existing/file.md', 'mem-002', 'source-001', 'vault-knowledge');

      expect(repository.findOrCreate).toHaveBeenCalledWith(
        '/existing/file.md',
        'source-001',
        'vault-knowledge',
      );
      expect(repository.remember).toHaveBeenCalledWith('tracker-existing', 'mem-002');
    });
  });

  describe('forget', () => {
    it('delegates to repository.forget', async () => {
      repository.forget.mockResolvedValue(undefined);

      await service.forget('/test/file.txt', 'mem-001');

      expect(repository.forget).toHaveBeenCalledWith('/test/file.txt', 'mem-001');
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

  describe('removeMappings', () => {
    it('deletes tracker record for file path via repository', async () => {
      repository.removeMappings.mockResolvedValue(undefined);

      await service.removeMappings('/test/file.txt');

      expect(repository.removeMappings).toHaveBeenCalledWith('/test/file.txt');
    });

    it('is idempotent — no error when record does not exist', async () => {
      repository.removeMappings.mockResolvedValue(undefined);

      await expect(service.removeMappings('/nonexistent/file.txt')).resolves.not.toThrow();
      expect(repository.removeMappings).toHaveBeenCalledWith('/nonexistent/file.txt');
    });
  });
});
