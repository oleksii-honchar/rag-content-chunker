/**
 * Test utilities for WatchSourceConfig.
 *
 * Shared factory for creating WatchSourceConfig instances in tests.
 * Follows the aX naming convention used across the codebase.
 */

import { WatchSourceConfig } from './config-schemas';

/**
 * Type alias for a WatchSourceConfig created via the aSource factory.
 * Useful when you want to document that a value is a test fixture.
 */
export type AWatchSourceConfig = WatchSourceConfig;

/**
 * Creates a WatchSourceConfig with sensible defaults for tests.
 *
 * Defaults match the common patterns used in existing test files:
 * - id: 'test-source'
 * - path: '/tmp/test-source'
 * - namespace: derived from id (same as WatchSourceConfig schema behavior)
 * - exclude: single-element array with git ignore pattern
 * - debounceMs: 3000
 *
 * @param overrides - Partial WatchSourceConfig to override defaults
 * @returns AWatchSourceConfig instance
 *
 * @example
 * const source = aSource();
 * const custom = aSource({ id: 'vault', path: '~/vault' });
 */
export const aSource = (overrides?: Partial<WatchSourceConfig>): AWatchSourceConfig => ({
  id: overrides?.id ?? 'test-source',
  path: overrides?.path ?? '/tmp/test-source',
  namespace: overrides?.namespace ?? overrides?.id ?? 'test-source',
  exclude: overrides?.exclude ?? ['**/.git/**'],
  debounceMs: overrides?.debounceMs ?? 3000,
  ...overrides,
});
