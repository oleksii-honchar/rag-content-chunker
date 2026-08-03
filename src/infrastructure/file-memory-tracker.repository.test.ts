import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { FileMemoryTrackerRepository } from './file-memory-tracker.repository';
import {
  aPrismaFileMemoryTracker,
  aPrismaFileMemoryTrackerMemory,
  PrismaFileMemoryTrackerRecord,
} from './file-memory-tracker.repository.test-utils';
import { PrismaService } from './prisma/prisma.service';

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

  const createTestTracker = (): FileMemoryTracker => {
    const result = FileMemoryTracker.of({
      id: 'tracker-test-001',
      filePath: '/test/file.txt',
      memoryIds: ['mem-001'],
      sourceId: 'source-001',
      namespace: 'vault-knowledge',
    });
    return result.getValue();
  };

  const createPrismaTrackerRecord = (
    tracker: FileMemoryTracker,
    memories: PrismaFileMemoryTrackerRecord['memories'] = [],
  ): PrismaFileMemoryTrackerRecord =>
    aPrismaFileMemoryTracker({
      id: tracker.id,
      filePath: tracker.filePath,
      sourceId: tracker.sourceId,
      namespace: tracker.namespace,
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
      const tracker = createTestTracker();
      const prismaRecord = createPrismaTrackerRecord(tracker, [
        aPrismaFileMemoryTrackerMemory({ id: 'fm-1', memoryId: 'mem-001', fileTrackerId: tracker.id }),
        aPrismaFileMemoryTrackerMemory({ id: 'fm-2', memoryId: 'mem-002', fileTrackerId: tracker.id }),
      ]);

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);

      const result = await repository.findByFilePath('/test/file.txt');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(tracker.id);
      expect(result!.filePath).toBe('/test/file.txt');
      expect(result!.memoryIds).toEqual(['mem-001', 'mem-002']);
      expect(result!.sourceId).toBe('source-001');
      expect(result!.namespace).toBe('vault-knowledge');
    });

    it('calls prisma with correct where clause and include memories', async () => {
      const tracker = createTestTracker();
      prismaFileTracker.findUnique.mockResolvedValue(createPrismaTrackerRecord(tracker));

      await repository.findByFilePath('/test/file.txt');

      expect(prismaFileTracker.findUnique).toHaveBeenCalledWith({
        where: { filePath: '/test/file.txt' },
        include: { memories: true },
      });
    });

    it('returns null when no record found', async () => {
      prismaFileTracker.findUnique.mockResolvedValue(null);

      const result = await repository.findByFilePath('/nonexistent/file.txt');

      expect(result).toBeNull();
    });

    it('returns empty memoryIds when tracker has no memories', async () => {
      const tracker = createTestTracker();
      const prismaRecord = createPrismaTrackerRecord(
        FileMemoryTracker.of({
          id: tracker.id,
          filePath: tracker.filePath,
          memoryIds: [],
          sourceId: tracker.sourceId,
          namespace: tracker.namespace,
        }).getValue(),
        [],
      );

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);

      const result = await repository.findByFilePath('/test/file.txt');

      expect(result!.memoryIds).toEqual([]);
    });
  });

  describe('findOrCreate', () => {
    it('creates new FileTracker when not exists', async () => {
      const newTracker = aPrismaFileMemoryTracker({
        id: 'tracker-new',
        filePath: '/new/file.md',
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prismaFileTracker.upsert.mockResolvedValue(newTracker);

      const result = await repository.findOrCreate('/new/file.md', 'source-001', 'vault-knowledge');

      expect(prismaFileTracker.upsert).toHaveBeenCalledWith({
        where: { filePath: '/new/file.md' },
        create: {
          id: expect.any(String),
          filePath: '/new/file.md',
          sourceId: 'source-001',
          namespace: 'vault-knowledge',
        },
        update: {
          sourceId: 'source-001',
          namespace: 'vault-knowledge',
        },
        include: { memories: true },
      });
      expect(result.filePath).toBe('/new/file.md');
      expect(result.sourceId).toBe('source-001');
      expect(result.namespace).toBe('vault-knowledge');
    });

    it('returns existing FileTracker with memories when already exists', async () => {
      const existingTracker = aPrismaFileMemoryTracker({
        id: 'tracker-existing',
        filePath: '/existing/file.md',
        sourceId: 'source-001',
        namespace: 'vault-knowledge',
        createdAt: new Date(),
        updatedAt: new Date(),
        memories: [
          aPrismaFileMemoryTrackerMemory({
            id: 'fm-1',
            memoryId: 'mem-001',
            fileTrackerId: 'tracker-existing',
          }),
        ],
      });

      prismaFileTracker.upsert.mockResolvedValue(existingTracker);

      const result = await repository.findOrCreate('/existing/file.md', 'source-001', 'vault-knowledge');

      expect(result.id).toBe('tracker-existing');
      expect(result.memoryIds).toEqual(['mem-001']);
    });
  });

  describe('remember', () => {
    it('calls fileMemoryTracker upsert with correct unique constraint', async () => {
      prismaFileMemoryTracker.upsert.mockResolvedValue(
        aPrismaFileMemoryTrackerMemory({
          id: 'fm-1',
          memoryId: 'mem-001',
          fileTrackerId: 'tracker-001',
          createdAt: new Date(),
        }),
      );

      await repository.remember('tracker-001', 'mem-001');

      expect(prismaFileMemoryTracker.upsert).toHaveBeenCalledWith({
        where: {
          fileTrackerId_memoryId: {
            fileTrackerId: 'tracker-001',
            memoryId: 'mem-001',
          },
        },
        create: {
          id: expect.any(String),
          fileTrackerId: 'tracker-001',
          memoryId: 'mem-001',
        },
        update: {},
      });
    });

    it('is idempotent — upsert with same fileTrackerId+memoryId does nothing on update', async () => {
      prismaFileMemoryTracker.upsert.mockResolvedValue(
        aPrismaFileMemoryTrackerMemory({
          id: 'fm-1',
          memoryId: 'mem-001',
          fileTrackerId: 'tracker-001',
          createdAt: new Date(),
        }),
      );

      await repository.remember('tracker-001', 'mem-001');
      await repository.remember('tracker-001', 'mem-001');

      expect(prismaFileMemoryTracker.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('forget', () => {
    it('deletes the memory mapping when tracker exists', async () => {
      const tracker = createTestTracker();
      const prismaRecord = createPrismaTrackerRecord(tracker, [
        aPrismaFileMemoryTrackerMemory({ id: 'fm-1', memoryId: 'mem-001', fileTrackerId: tracker.id }),
      ]);

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);
      prismaFileMemoryTracker.deleteMany.mockResolvedValue({ count: 1 });

      await repository.forget('/test/file.txt', 'mem-001');

      expect(prismaFileMemoryTracker.deleteMany).toHaveBeenCalledWith({
        where: {
          fileTrackerId: tracker.id,
          memoryId: 'mem-001',
        },
      });
    });

    it('does nothing when tracker does not exist', async () => {
      prismaFileTracker.findUnique.mockResolvedValue(null);

      await repository.forget('/nonexistent/file.txt', 'mem-001');

      expect(prismaFileMemoryTracker.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getMemoryIds', () => {
    it('returns array of memory IDs when tracker exists', async () => {
      const tracker = createTestTracker();
      const prismaRecord = createPrismaTrackerRecord(tracker, [
        aPrismaFileMemoryTrackerMemory({ id: 'fm-1', memoryId: 'mem-001', fileTrackerId: tracker.id }),
        aPrismaFileMemoryTrackerMemory({ id: 'fm-2', memoryId: 'mem-002', fileTrackerId: tracker.id }),
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
      const tracker = createTestTracker();
      const prismaRecord = createPrismaTrackerRecord(
        FileMemoryTracker.of({
          id: tracker.id,
          filePath: tracker.filePath,
          memoryIds: [],
          sourceId: tracker.sourceId,
          namespace: tracker.namespace,
        }).getValue(),
        [],
      );

      prismaFileTracker.findUnique.mockResolvedValue(prismaRecord);

      const result = await repository.getMemoryIds('/test/file.txt');

      expect(result).toEqual([]);
    });
  });

  describe('removeMappings', () => {
    it('deletes FileTracker record (cascade deletes memories)', async () => {
      prismaFileTracker.delete.mockResolvedValue(
        aPrismaFileMemoryTracker({
          id: 'tracker-001',
          filePath: '/test/file.txt',
          sourceId: 'source-001',
          namespace: 'vault-knowledge',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await repository.removeMappings('/test/file.txt');

      expect(prismaFileTracker.delete).toHaveBeenCalledWith({
        where: { filePath: '/test/file.txt' },
      });
    });

    it('swallows Prisma RecordNotFoundError when record does not exist', async () => {
      const error = new Error('Record to delete does not exist.');
      (error as Prisma.PrismaClientKnownRequestError).code = 'P2025';

      prismaFileTracker.delete.mockRejectedValue(error);

      await expect(repository.removeMappings('/nonexistent/file.txt')).resolves.not.toThrow();
      expect(prismaFileTracker.delete).toHaveBeenCalledWith({
        where: { filePath: '/nonexistent/file.txt' },
      });
    });
  });
});
