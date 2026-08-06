import { McpConfig, WatchSourceConfig } from './config-schemas';
import { ConfigurationService } from './configuration.service';
import { SOURCE_STRATEGIES } from './source-strategies';

export function aSourceConfig(overrides?: Partial<WatchSourceConfig>): WatchSourceConfig {
  return {
    id: 'test-source',
    path: '/test/path',
    memoryBank: 'test-memoryBank',
    strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
    description: '',
    exclude: [],
    debounceMs: 3000,
    ...overrides,
  };
}

const DEFAULT_MCP_CONFIG: McpConfig = {
  url: 'http://mcp.test',
  apiKey: 'test-key',
  timeoutMs: 5000,
  maxRetries: 3,
  retryDelayMs: 100,
};

export function aConfigService(
  overrides: Partial<jest.Mocked<ConfigurationService>> = {},
): jest.Mocked<ConfigurationService> {
  const mock = {
    getWatchSources: jest.fn(),
    getChunkingConfig: jest.fn(),
    getEnrichmentConfig: jest.fn(),
    getMcpConfig: jest.fn().mockReturnValue(DEFAULT_MCP_CONFIG),
    getTelemetryConfig: jest.fn(),
    load: jest.fn(),
    initializeDefaultConfig: jest.fn(),
    stop: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ConfigurationService>;

  return mock;
}
