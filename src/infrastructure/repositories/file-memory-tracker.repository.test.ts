import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileMemoryTrackerRepository } from './file-memory-tracker.repository';
import {
  aFileMemoryTracker,
  aPrismaFileMemoryTracker,
  aPrismaFileMemoryTrackerMemory,
  PrismaFileMemoryTrackerRecord,
} from './file-memory-tracker.repository.test-utils';

describe('FileMemoryTrackerRepository', () => {
  let repository: FileMemoryTrackerRepository;
  let prismaFileTracker: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  let prismaFileMemoryTracker: {
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };

  const createPrismaTrackerRecord = (
    tracker: { id: bigint; filePath: string; sourceId: string; memoryBank: string },
    memories: PrismaFileMemoryTrackerRecord['memories'] = [],
  ): PrismaFileMemoryTrackerRecord =>
    aPrismaFileMemoryTracker({
      id: tracker.id,
      filePath: tracker.filePath,
      sourceId: tracker.sourceId,
      memoryBank: tracker.memoryBank,
      memories,
    });

  beforeEach(async () => {
    prismaFileTracker = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    };

    prismaFileMemoryTracker = {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    };

    const mockPrisma = {
      fileTracker: prismaFileTracker,
      fileMemoryTracker: prismaFileMemoryTracker,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FileMemoryTrackerRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repository = module.get<FileMemoryTrackerRepository>(FileMemoryTrackerRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByFilePath', () => {
    it('returns tracker when record exists with memories', async () => {
      const tracker = aFileMemoryTracker({
        filePath: '/test/file.txt',
        memoryIds: ['mem-001'],
      });
      const trackerJson = tracker.toJson();
      const prismaRecord = createPrismaTrackerRecord(trackerJson, [
        aPrismaFileMemoryTrackerMemory({ id: 9001n, memoryId: 'mem-001', fileTrackerId: tracker.id }),
        aPrismaFileMemoryTrackerMemory({ id: 9002n, memoryId: 'mem-002', fileTrackerId: tracker.id }),
      ]);

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);

      const result = await repository.getMemoryIds('/test/file.txt');

      expect(result).toEqual(['mem-001', 'mem-002']);
    });

    it('returns empty array when no tracker found', async () => {
      prismaFileTracker.findUnique.mockResolvedValue(null);

      const result = await repository.getMemoryIds('/nonexistent/file.txt');

      expect(result).toEqual([]);
    });

    it('returns empty array when tracker has no memories', async () => {
      const tracker = aFileMemoryTracker({ filePath: '/test/file.txt', memoryIds: [] });
      const prismaRecord = createPrismaTrackerRecord(tracker.toJson(), []);

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);

      const result = await repository.getMemoryIds('/test/file.txt');

      expect(result).toEqual([]);
    });
  });

  describe('deleteByFilePath', () => {
    it('deletes FileTracker record (cascade deletes memories)', async () => {
      prismaFileTracker.delete.mockResolvedValue(
        aPrismaFileMemoryTracker({
          id: 1001n,
          filePath: '/test/file.txt',
          sourceId: 'source-001',
          memoryBank: 'vault-knowledge',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await repository.deleteByFilePath('/test/file.txt');

      expect(prismaFileTracker.delete).toHaveBeenCalledWith({
        where: { filePath: '/test/file.txt' },
      });
    });

    it('swallows Prisma RecordNotFoundError when record does not exist', async () => {
      const error = new Error('Record to delete does not exist.');
      (error as Prisma.PrismaClientKnownRequestError).code = 'P2025';

      prismaFileTracker.delete.mockRejectedValue(error);

      await expect(repository.deleteByFilePath('/nonexistent/file.txt')).resolves.not.toThrow();
      expect(prismaFileTracker.delete).toHaveBeenCalledWith({
        where: { filePath: '/nonexistent/file.txt' },
      });
    });
  });
});
