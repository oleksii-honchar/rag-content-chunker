import { Test, TestingModule } from '@nestjs/testing';
import { AggregateResult } from '../utils/aggregate-result';
import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { FileMemoryTrackerRepository } from './file-memory-tracker.repository';
import {
  aFileMemoryTracker,
  aFileMemoryTrackerRepositoryService,
} from './file-memory-tracker.repository.test-utils';
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
      const memId = 'mem-1';
      const newTracker = aFileMemoryTracker();
      const props = newTracker.toJson();
      (newTracker as FileMemoryTracker & { remember: jest.Mock }).remember = jest
        .fn()
        .mockReturnValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      repository.findOrCreate.mockResolvedValue(AggregateResult.ok(newTracker, []));
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory(props.filePath, memId, props.sourceId, props.memoryBank);

      expect(repository.findOrCreate).toHaveBeenCalledWith(expect.any(Object));
      expect((newTracker as unknown as { remember: jest.Mock }).remember).toHaveBeenCalledWith(memId);
      expect(repository.upsertMemory).toHaveBeenCalledWith(newTracker.id, memId);
      expect(result).toEqual(expect.objectContaining({ filePath: props.filePath }));
    });

    it('finds existing tracker via findOrCreate then upserts memory link', async () => {
      const existingTracker = aFileMemoryTracker();
      const props = existingTracker.toJson();
      const memId = 'mem-002';
      (existingTracker as FileMemoryTracker & { remember: jest.Mock }).remember = jest
        .fn()
        .mockReturnValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      repository.findOrCreate.mockResolvedValue(AggregateResult.ok(existingTracker, []));
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory(props.filePath, memId, props.sourceId, props.memoryBank);

      expect(repository.findOrCreate).toHaveBeenCalledWith(expect.any(Object));
      expect((existingTracker as unknown as { remember: jest.Mock }).remember).toHaveBeenCalledWith(memId);
      expect(repository.upsertMemory).toHaveBeenCalledWith(existingTracker.id, memId);
      expect(result).toEqual(expect.objectContaining({ filePath: props.filePath }));
    });

    it('returns aggregate with updated memoryIds after remember', async () => {
      const memId = 'mem-002';
      const updatedTracker = aFileMemoryTracker({ memoryIds: [memId] });
      const props = updatedTracker.toJson();
      (updatedTracker as FileMemoryTracker & { remember: jest.Mock }).remember = jest
        .fn()
        .mockReturnValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      repository.findOrCreate.mockResolvedValue(AggregateResult.ok(updatedTracker, []));
      repository.upsertMemory.mockResolvedValue(undefined);

      const result = await service.trackMemory(props.filePath, memId, props.sourceId, props.memoryBank);

      expect(result).toEqual(expect.objectContaining({ id: updatedTracker.id }));
      expect(result.memoryIds).toContain(memId);
    });
  });

  describe('forgetMemory', () => {
    it('uses aggregate forget logic then deletes memory link via repository', async () => {
      const tracker = aFileMemoryTracker();
      const props = tracker.toJson();
      const memId = 'mem-001';
      (tracker as FileMemoryTracker & { forget: jest.Mock }).forget = jest
        .fn()
        .mockReturnValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      repository.findByFilePath.mockResolvedValue(AggregateResult.ok(tracker, []));
      repository.deleteMemory.mockResolvedValue(undefined);

      const result = await service.forgetMemory(props.filePath, memId);

      expect(repository.findByFilePath).toHaveBeenCalledWith(props.filePath);
      expect((tracker as unknown as { forget: jest.Mock }).forget).toHaveBeenCalledWith(memId);
      expect(repository.deleteMemory).toHaveBeenCalledWith(tracker.id, memId);
      expect(result).toEqual(expect.objectContaining({ filePath: props.filePath }));
    });

    it('returns null when tracker does not exist', async () => {
      repository.findByFilePath.mockResolvedValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      const result = await service.forgetMemory('/nonexistent/file.txt', 'mem-001');

      expect(repository.findByFilePath).toHaveBeenCalledWith('/nonexistent/file.txt');
      expect(repository.deleteMemory).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns aggregate after forget', async () => {
      const updatedTracker = aFileMemoryTracker();
      const props = updatedTracker.toJson();
      const memId = 'mem-001';
      (updatedTracker as FileMemoryTracker & { forget: jest.Mock }).forget = jest
        .fn()
        .mockReturnValue(AggregateResult.ok(null as unknown as FileMemoryTracker, []));

      repository.findByFilePath.mockResolvedValue(AggregateResult.ok(updatedTracker, []));
      repository.deleteMemory.mockResolvedValue(undefined);

      const result = await service.forgetMemory(props.filePath, memId);

      expect(result).toEqual(expect.objectContaining({ id: updatedTracker.id }));
      expect(result!.memoryIds).not.toContain(memId);
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
