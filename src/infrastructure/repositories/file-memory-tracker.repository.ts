import { FileMemoryTracker } from '@/domain/file-memory-tracker.aggregate';
import { generateId } from '@/utils/big-endian-id';
import { ErrorWithDetails } from '@/utils/error-with-details';
import { Result } from '@/utils/result';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FileMemoryTrackerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByFilePath(filePath: string): Promise<Result<FileMemoryTracker | null>> {
    const tracker = await this.prisma.fileTracker.findUnique({
      where: { filePath },
      include: { memories: true },
    });

    if (!tracker) {
      return Result.ko([new ErrorWithDetails(`Can't find tracker; filePath=${filePath}`)]);
    }

    const memoryIds = tracker.memories.map((m: { memoryId: string }) => m.memoryId);

    const result = FileMemoryTracker.of({
      id: tracker.id,
      filePath: tracker.filePath,
      memoryIds,
      sourceId: tracker.sourceId,
      memoryBank: tracker.memoryBank,
    });

    return result.isOk()
      ? result
      : Result.ko([new ErrorWithDetails('Invalid FileMemoryTracker', 'InvalidFileMemoryTracker')]);
  }

  /**
   * Find existing tracker by filePath, or save the provided aggregate with a pre-generated ID.
   * Aggregate-first: caller creates the aggregate with domain logic, repository just persists it.
   */
  async findOrCreate(tracker: FileMemoryTracker): Promise<Result<FileMemoryTracker>> {
    const existing = await this.findByFilePath(tracker.filePath);
    if (existing.isOk() && existing.getValue()) {
      return existing as Result<FileMemoryTracker>;
    }

    return await this.upsert(tracker);
  }

  /**
   * Save (upsert) a FileMemoryTracker aggregate to the database.
   * Infrastructure term — just persists the aggregate as-is.
   */
  async upsert(tracker: FileMemoryTracker): Promise<Result<FileMemoryTracker>> {
    const saved = await this.prisma.fileTracker.upsert({
      where: { filePath: tracker.filePath },
      create: {
        id: tracker.id,
        filePath: tracker.filePath,
        sourceId: tracker.sourceId,
        memoryBank: tracker.memoryBank,
      },
      update: {
        sourceId: tracker.sourceId,
        memoryBank: tracker.memoryBank,
      },
      include: { memories: true },
    });

    const memoryIds = saved.memories.map((m: { memoryId: string }) => m.memoryId);

    const result = FileMemoryTracker.of({
      id: saved.id,
      filePath: saved.filePath,
      memoryIds,
      sourceId: saved.sourceId,
      memoryBank: saved.memoryBank,
    });

    return result;
  }

  /**
   * Upsert a single memory link for a tracker.
   * Infrastructure term — just persists the link, no domain logic.
   */
  async upsertMemory(fileTrackerId: bigint, memoryId: string): Promise<void> {
    const id = generateId();
    await this.prisma.fileMemoryTracker.upsert({
      where: {
        fileTrackerId_memoryId: {
          fileTrackerId,
          memoryId,
        },
      },
      create: {
        id,
        fileTrackerId,
        memoryId,
      },
      update: {},
    });
  }

  /**
   * Delete a single memory link by fileTrackerId and memoryId.
   */
  async deleteMemory(fileTrackerId: bigint, memoryId: string): Promise<void> {
    await this.prisma.fileMemoryTracker.deleteMany({
      where: {
        fileTrackerId,
        memoryId,
      },
    });
  }

  async getMemoryIds(filePath: string): Promise<string[]> {
    const tracker = await this.prisma.fileTracker.findUnique({
      where: { filePath },
      include: { memories: true },
    });

    if (!tracker) {
      return [];
    }

    return tracker.memories.map((m: { memoryId: string }) => m.memoryId);
  }

  /**
   * Delete tracker by filePath (cascade deletes memories).
   */
  async deleteByFilePath(filePath: string): Promise<void> {
    try {
      await this.prisma.fileTracker.delete({
        where: { filePath },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code !== 'P2025') {
        throw error;
      }
    }
  }
}
