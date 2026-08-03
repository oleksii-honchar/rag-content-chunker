/**
 * Test utilities for FileMemoryTrackerRepository.
 * Provides mock implementations for testing without real Prisma database.
 */

import { FileMemoryTracker } from '../domain/file-memory-tracker.aggregate';

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
    id: 'tracker-001',
    filePath: '/test/file.txt',
    sourceId: 'source-001',
    namespace: 'vault-knowledge',
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
    id: 'fm-001',
    memoryId: 'mem-001',
    fileTrackerId: 'tracker-001',
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
    findOrCreate: jest.fn().mockResolvedValue({} as FileMemoryTracker),
    remember: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
    getMemoryIds: jest.fn().mockResolvedValue([]),
    removeMappings: jest.fn().mockResolvedValue(undefined),
  };
}
