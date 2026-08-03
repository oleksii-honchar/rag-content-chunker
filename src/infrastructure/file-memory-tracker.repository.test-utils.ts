/**
 * Test utilities for FileMemoryTrackerRepository.
 * Provides mock implementations for testing without real Prisma database.
 */

import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';
import { faker } from '../utils/test-faker';

/**
 * Aggregate-level test builder for FileMemoryTracker domain entity.
 * Uses faker for randomized but deterministic values (seed 42).
 */
export function aFileMemoryTracker(
  overrides?: Partial<{
    id: string;
    filePath: string;
    memoryIds: string[];
    sourceId: string;
    namespace: string;
  }>,
): FileMemoryTracker {
  const result = FileMemoryTracker.of({
    id: faker.string.uuid(),
    filePath: faker.system.filePath(),
    memoryIds: [],
    sourceId: faker.string.alphanumeric(12),
    namespace: faker.word.adjective(),
    ...overrides,
  });
  return result.getValue();
}

export interface PrismaFileMemoryTrackerRecord {
  id: string;
  filePath: string;
  sourceId: string;
  namespace: string;
  createdAt: Date;
  updatedAt: Date;
  memories: { id: string; memoryId: string; fileTrackerId: string }[];
}

export interface PrismaFileMemoryTrackerMemoryRecord {
  id: string;
  memoryId: string;
  fileTrackerId: string;
  createdAt: Date;
}

export function aPrismaFileMemoryTracker(
  overrides?: Partial<PrismaFileMemoryTrackerRecord>,
): PrismaFileMemoryTrackerRecord {
  return {
    id: faker.string.uuid(),
    filePath: faker.system.filePath(),
    sourceId: faker.string.alphanumeric(12),
    namespace: faker.word.adjective(),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    memories: [],
    ...overrides,
  };
}

export function aPrismaFileMemoryTrackerMemory(
  overrides?: Partial<PrismaFileMemoryTrackerMemoryRecord>,
): PrismaFileMemoryTrackerMemoryRecord {
  return {
    id: faker.string.uuid(),
    memoryId: faker.string.uuid(),
    fileTrackerId: faker.string.uuid(),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Returns a stub FileMemoryTrackerRepository that resolves all calls with safe defaults.
 */
export function aFileMemoryTrackerRepositoryService() {
  return {
    findByFilePath: jest.fn().mockResolvedValue(null),
    findOrCreate: jest.fn().mockImplementation((tracker: FileMemoryTracker) => Promise.resolve(tracker)),
    save: jest
      .fn()
      .mockImplementation((tracker: FileMemoryTracker) =>
        Promise.resolve({ isOk: () => true, getValue: () => tracker }),
      ),
    upsertMemory: jest.fn().mockResolvedValue(undefined),
    deleteMemory: jest.fn().mockResolvedValue(undefined),
    getMemoryIds: jest.fn().mockResolvedValue([]),
    deleteByFilePath: jest.fn().mockResolvedValue(undefined),
  };
}
