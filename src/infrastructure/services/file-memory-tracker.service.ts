import { Injectable } from '@nestjs/common';
import { FileMemoryTracker } from '../../domain/file-memory-tracker.aggregate';
import { generateId } from '../../utils/big-endian-id';
import { FileMemoryTrackerRepository } from '../repositories/file-memory-tracker.repository';

@Injectable()
export class FileMemoryTrackerService {
  constructor(private readonly repository: FileMemoryTrackerRepository) {}

  /**
   * Track a memory for a file.
   * Uses aggregate business logic (remember) then persists via repository.
   * Returns the FileMemoryTracker aggregate after tracking.
   */
  async trackMemory(
    filePath: string,
    memoryId: string,
    sourceId: string,
    memoryBank: string,
  ): Promise<FileMemoryTracker> {
    // Create aggregate with pre-generated ID
    const newTracker = FileMemoryTracker.of({
      id: generateId(),
      filePath,
      memoryIds: [],
      sourceId,
      memoryBank,
    });

    if (newTracker.isKo()) {
      throw new Error('Invalid FileMemoryTracker: ' + newTracker.getErrors()[0].message);
    }

    const findOrCreateResult = await this.repository.findOrCreate(newTracker.getValue());
    if (findOrCreateResult.isKo()) {
      throw new Error('Failed to find or create FileMemoryTracker');
    }
    const tracker = findOrCreateResult.getValue();

    // Use aggregate business logic for remember
    const remembered = tracker.remember(memoryId);
    if (remembered.isKo()) {
      throw new Error('Failed to remember memory: ' + remembered.getErrors()[0].message);
    }
    const updatedTracker = remembered.getValue();

    // Persist via upsert
    const savedResult = await this.repository.upsert(updatedTracker);
    if (savedResult.isKo()) {
      throw new Error('Failed to persist FileMemoryTracker');
    }

    return savedResult.getValue();
  }

  /**
   * Forget a memory for a file.
   * Uses aggregate business logic (forget) then persists via repository.
   * Returns the FileMemoryTracker aggregate, or null if no tracker exists.
   */
  async forgetMemory(filePath: string, memoryId: string): Promise<FileMemoryTracker | null> {
    const trackerResult = await this.repository.findByFilePath(filePath);
    if (!trackerResult.isOk() || !trackerResult.getValue()) {
      return null;
    }

    const tracker = trackerResult.getValue()!;

    // Use aggregate business logic for forget
    const forgotten = tracker.forget(memoryId);
    if (forgotten.isKo()) {
      throw new Error('Failed to forget memory: ' + forgotten.getErrors()[0].message);
    }
    const updatedTracker = forgotten.getValue();

    // Persist via upsert
    const savedResult = await this.repository.upsert(updatedTracker);
    if (savedResult.isKo()) {
      throw new Error('Failed to persist FileMemoryTracker');
    }

    return savedResult.getValue();
  }

  async getMemoryIds(filePath: string): Promise<string[]> {
    return this.repository.getMemoryIds(filePath);
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    await this.repository.deleteByFilePath(filePath);
  }
}
