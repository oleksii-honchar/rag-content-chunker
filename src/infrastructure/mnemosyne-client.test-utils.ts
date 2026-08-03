/**
 * Test utilities for MnemosyneClient.
 * Provides mock implementations for testing without real MCP server.
 */

import { Result } from '../utils/result';

/**
 * Returns a stub MnemosyneClient that resolves all calls successfully by default.
 */
export function aMnemosyneClientService() {
  return {
    initialize: jest.fn().mockResolvedValue(Result.ok(undefined as unknown as void)),
    remember: jest.fn().mockResolvedValue(Result.ok({ memory_id: 'mock-memory-id', status: 'stored' })),
    forget: jest.fn().mockResolvedValue(Result.ok(undefined as unknown as void)),
    registerNamespace: jest.fn().mockResolvedValue(Result.ok(undefined as unknown as void)),
    healthCheck: jest.fn().mockResolvedValue(Result.ok(true)),
    close: jest.fn().mockResolvedValue(undefined),
  };
}
