import { Injectable } from '@nestjs/common';
import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { AggregateResult } from '../utils/aggregate-result';
import { generateId } from '../utils/big-endian-id';
import { ErrorWithDetails } from '../utils/error-with-details';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class FileMemoryTrackerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByFilePath(filePath: string): Promise<FileMemoryTracker | null> {
    const tracker = await this.prisma.fileTracker.findUnique({
      where: { filePath },
      include: { memories: true },
    });

    if (!tracker) {
      return null;
    }

    const memoryIds = tracker.memories.map((m: { memoryId: string }) => m.memoryId);

    const result = FileMemoryTracker.of({
      id: tracker.id,
      filePath: tracker.filePath,
      memoryIds,
      sourceId: tracker.sourceId,
      namespace: tracker.namespace,
    });

    return result.isOk() ? result.getValue() : null;
  }

  /**
   * Find existing tracker by filePath, or save the provided aggregate with a pre-generated ID.
   * Aggregate-first: caller creates the aggregate with domain logic, repository just persists it.
   */
  async findOrCreate(tracker: FileMemoryTracker): Promise<FileMemoryTracker> {
    const existing = await this.findByFilePath(tracker.filePath);
    if (existing) {
      return existing;
    }

    const result = await this.save(tracker);
    if (result.isOk()) {
      return result.getValue();
    }

    throw new Error(
      'Failed to create FileMemoryTracker: ' +
        result
          .getErrors()
          .map(e => e.message)
          .join('; '),
    );
  }

  /**
   * Save (upsert) a FileMemoryTracker aggregate to the database.
   * Infrastructure term — just persists the aggregate as-is.
   */
  async save(tracker: FileMemoryTracker): Promise<AggregateResult<FileMemoryTracker>> {
    const errors: ErrorWithDetails[] = [];

    try {
      const saved = await this.prisma.fileTracker.upsert({
        where: { filePath: tracker.filePath },
        create: {
          id: tracker.id,
          filePath: tracker.filePath,
          sourceId: tracker.sourceId,
          namespace: tracker.namespace,
        },
        update: {
          sourceId: tracker.sourceId,
          namespace: tracker.namespace,
        },
        include: { memories: true },
      });

      const memoryIds = saved.memories.map((m: { memoryId: string }) => m.memoryId);

      const result = FileMemoryTracker.of({
        id: saved.id,
        filePath: saved.filePath,
        memoryIds,
        sourceId: saved.sourceId,
        namespace: saved.namespace,
      });

      if (result.isKo()) {
        errors.push(result.getError());
      } else {
        return AggregateResult.ok(result.getValue());
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(new ErrorWithDetails(message, 'SaveFileMemoryTrackerError'));
    }

    return AggregateResult.ko(errors);
  }

  /**
   * Upsert a single memory link for a tracker.
   * Infrastructure term — just persists the link, no domain logic.
   */
  async upsertMemory(fileTrackerId: string, memoryId: string): Promise<void> {
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
  async deleteMemory(fileTrackerId: string, memoryId: string): Promise<void> {
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
