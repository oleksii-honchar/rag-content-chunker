/**
 * Test utilities for FileMemoryTrackerService.
 * Provides mock implementations for testing without real tracker infrastructure.
 */

/**
 * Returns a stub FileMemoryTrackerService that resolves all calls successfully by default.
 */
export function aFileMemoryTrackerService() {
  return {
    remember: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
    getMemoryIds: jest.fn().mockResolvedValue([]),
    removeMappings: jest.fn().mockResolvedValue(undefined),
  };
}
