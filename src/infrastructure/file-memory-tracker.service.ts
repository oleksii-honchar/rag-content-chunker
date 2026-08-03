import { Injectable } from '@nestjs/common';
import { FileMemoryTrackerRepository } from './file-memory-tracker.repository';

@Injectable()
export class FileMemoryTrackerService {
  constructor(private readonly repository: FileMemoryTrackerRepository) {}

  async remember(filePath: string, memoryId: string, sourceId: string, namespace: string): Promise<void> {
    const tracker = await this.repository.findOrCreate(filePath, sourceId, namespace);
    await this.repository.remember(tracker.id, memoryId);
  }

  async forget(filePath: string, memoryId: string): Promise<void> {
    await this.repository.forget(filePath, memoryId);
  }

  async getMemoryIds(filePath: string): Promise<string[]> {
    return this.repository.getMemoryIds(filePath);
  }

  async removeMappings(filePath: string): Promise<void> {
    await this.repository.removeMappings(filePath);
  }
}
