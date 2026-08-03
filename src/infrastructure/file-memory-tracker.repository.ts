import { Injectable } from '@nestjs/common';
import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { generateId } from '../utils/id-generator';
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

  async findOrCreate(filePath: string, sourceId: string, namespace: string): Promise<FileMemoryTracker> {
    const id = generateId();
    const tracker = await this.prisma.fileTracker.upsert({
      where: { filePath },
      create: {
        id,
        filePath,
        sourceId,
        namespace,
      },
      update: {
        sourceId,
        namespace,
      },
      include: { memories: true },
    });

    const memoryIds = tracker.memories.map((m: { memoryId: string }) => m.memoryId);

    const result = FileMemoryTracker.of({
      id: tracker.id,
      filePath: tracker.filePath,
      memoryIds,
      sourceId: tracker.sourceId,
      namespace: tracker.namespace,
    });

    return result.getValue();
  }

  async remember(fileTrackerId: string, memoryId: string): Promise<void> {
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

  async forget(filePath: string, memoryId: string): Promise<void> {
    const tracker = await this.prisma.fileTracker.findUnique({
      where: { filePath },
      include: { memories: true },
    });

    if (!tracker) {
      return;
    }

    await this.prisma.fileMemoryTracker.deleteMany({
      where: {
        fileTrackerId: tracker.id,
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

  async removeMappings(filePath: string): Promise<void> {
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
