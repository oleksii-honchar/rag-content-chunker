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
    id: bigint;
    filePath: string;
    memoryIds: string[];
    sourceId: string;
    memoryBank: string;
  }>,
): FileMemoryTracker {
  const result = FileMemoryTracker.of({
    id: faker.number.bigInt({ min: 1n, max: 9223372036854775807n }),
    filePath: faker.system.filePath(),
    memoryIds: [],
    sourceId: faker.string.alphanumeric(12),
    memoryBank: faker.word.adjective(),
    ...overrides,
  });
  return result.getValue();
}

export interface PrismaFileMemoryTrackerRecord {
  id: bigint;
  filePath: string;
  sourceId: string;
  memoryBank: string;
  createdAt: Date;
  updatedAt: Date;
  memories: { id: bigint; memoryId: string; fileTrackerId: bigint }[];
}

export interface PrismaFileMemoryTrackerMemoryRecord {
  id: bigint;
  memoryId: string;
  fileTrackerId: bigint;
  createdAt: Date;
}

export function aPrismaFileMemoryTracker(
  overrides?: Partial<PrismaFileMemoryTrackerRecord>,
): PrismaFileMemoryTrackerRecord {
  return {
    id: faker.number.bigInt({ min: 1n, max: 9223372036854775807n }),
    filePath: faker.system.filePath(),
    sourceId: faker.string.alphanumeric(12),
    memoryBank: faker.word.adjective(),
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
    id: faker.number.bigInt({ min: 1n, max: 9223372036854775807n }),
    memoryId: faker.string.uuid(),
    fileTrackerId: faker.number.bigInt({ min: 1n, max: 9223372036854775807n }),
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
