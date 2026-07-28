import { Test, TestingModule } from '@nestjs/testing';
import { AppBootstrapService } from './app-bootstrap.service';
import { AppModule } from './app.module';
import { Configuration } from './infrastructure/config/config-schemas';
import { ConfigurationService } from './infrastructure/config/configuration.service';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';
import { MnemosyneClient } from './infrastructure/mcp/mnemosyne-client.service';
import { FileProcessingQueue } from './infrastructure/queue/file-processing-queue.service';

const mockWatcher = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('chokidar', () => ({
  watch: jest.fn(() => mockWatcher),
}));

const createMockLogger = (): BasePinoLogger => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  child: jest.fn().mockReturnThis(),
  setContext: jest.fn(),
});

const mockLogger = createMockLogger();

// Create a mock config service that reads from its own 'config' property
// so tests can set it via defineProperty
const createMockConfigService = (): ConfigurationService => {
  const mock: Record<string, unknown> = {
    config: null as Configuration | null,
    load: jest.fn().mockResolvedValue({ isOk: () => true, getValue: () => ({}) }),
    getWatchSources: function (this: typeof mock) {
      return (this.config as Configuration | null)?.watchSources ?? [];
    },
    getMcpConfig: function (this: typeof mock) {
      return (this.config as Configuration | null)?.mcp ?? {};
    },
    getTelemetryConfig: function (this: typeof mock) {
      return (this.config as Configuration | null)?.telemetry ?? {};
    },
    getChunkingConfig: function (this: typeof mock) {
      return (this.config as Configuration | null)?.chunking ?? { strategy: 'content-aware' };
    },
    getEnrichmentConfig: function (this: typeof mock) {
      return (this.config as Configuration | null)?.enrichment ?? { enabled: false };
    },
    initializeDefaultConfig: jest.fn(),
    getConfig: function (this: typeof mock) {
      return this.config ?? {};
    },
  };
  return mock as unknown as ConfigurationService;
};

describe('AppModule Integration', () => {
  let module: TestingModule;
  let bootstrapService: AppBootstrapService;
  let configService: ConfigurationService;
  let logger: BasePinoLogger;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BasePinoLogger)
      .useValue(mockLogger)
      .overrideProvider(ConfigurationService)
      .useValue(createMockConfigService())
      .overrideProvider(MnemosyneClient)
      .useValue({
        initialize: jest.fn().mockResolvedValue({ isOk: () => true }),
        remember: jest.fn().mockResolvedValue({ isOk: () => true }),
        healthCheck: jest.fn().mockResolvedValue({ isOk: () => true, getValue: () => true }),
      })
      .overrideProvider(FileProcessingQueue)
      .useValue({
        addToQueue: jest.fn().mockResolvedValue(undefined),
        length: 0,
        isProcessing: jest.fn().mockReturnValue(false),
        waitForEmpty: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    bootstrapService = module.get(AppBootstrapService);
    configService = module.get(ConfigurationService);
    logger = module.get(BasePinoLogger);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  it('should import AppModule and be defined', () => {
    expect(AppModule).toBeDefined();
  });

  it('should compile without errors', () => {
    expect(module).toBeDefined();
  });

  it('should provide AppBootstrapService', () => {
    expect(bootstrapService).toBeDefined();
  });

  it('should inject ConfigurationService into AppBootstrapService', () => {
    expect(configService).toBeDefined();
  });

  it('should inject BasePinoLogger into AppBootstrapService', () => {
    expect(logger).toBeDefined();
  });

  describe('AppBootstrapService.onApplicationBootstrap', () => {
    it('should print config summary with watch sources', async () => {
      const infoSpy = jest.spyOn(logger, 'info');

      // Set up mock config
      const mockConfig = {
        watchSources: [
          {
            id: 'test-source',
            path: '/test/path',
            include: ['*.md'],
            exclude: [],
            debounceMs: 3000,
            ignorePatterns: [],
          },
        ],
        chunking: {
          strategy: 'content-aware',
          maxSizes: {
            agentSessions: 400,
            obsidianNotes: 500,
            codeFiles: 400,
            configuration: 'per-key',
            plainText: 450,
          },
          overlap: 50,
          hardCap: 600,
        },
        enrichment: { enabled: false, maxConcurrency: 1, timeoutMs: 15000, docMaxTokens: 16000 },
        mcp: { url: 'http://test-mcp:8080', timeoutMs: 30000, maxRetries: 3, retryDelayMs: 1000 },
        telemetry: {
          enabled: true,
          endpoint: 'test-endpoint',
          service: 'test-service',
          metrics: { chunking: true, ingestion: true, errors: true },
        },
      };

      // Use reflection to set private config property
      const configDescriptor = Object.getOwnPropertyDescriptor(ConfigurationService.prototype, 'config');
      Object.defineProperty(configService, 'config', {
        value: mockConfig,
        writable: true,
      });

      await bootstrapService.onApplicationBootstrap();

      expect(infoSpy).toHaveBeenCalledWith('📋 Configuration Summary:');
      expect(infoSpy).toHaveBeenCalledWith('  Watch sources: 1');
      expect(infoSpy).toHaveBeenCalledWith('    - test-source: /test/path');
      expect(infoSpy).toHaveBeenCalledWith('  Chunking strategy: content-aware');
      expect(infoSpy).toHaveBeenCalledWith('  Enrichment: disabled');
      expect(infoSpy).toHaveBeenCalledWith('  MCP endpoint: http://test-mcp:8080');
      expect(infoSpy).toHaveBeenCalledWith('  Telemetry: enabled');
    });

    it('should print multiple watch sources', async () => {
      const infoSpy = jest.spyOn(logger, 'info');

      const mockConfig = {
        watchSources: [
          {
            id: 'source-1',
            path: '/path/one',
            include: ['*.md'],
            exclude: [],
            debounceMs: 3000,
            ignorePatterns: [],
          },
          {
            id: 'source-2',
            path: '/path/two',
            include: ['*.ts'],
            exclude: [],
            debounceMs: 2000,
            ignorePatterns: [],
          },
        ],
        chunking: {
          strategy: 'recursive',
          maxSizes: {
            agentSessions: 400,
            obsidianNotes: 500,
            codeFiles: 400,
            configuration: 'per-key',
            plainText: 450,
          },
          overlap: 50,
          hardCap: 600,
        },
        enrichment: { enabled: true, maxConcurrency: 3, timeoutMs: 15000, docMaxTokens: 16000 },
        mcp: { url: 'http://mcp-endpoint:9000', timeoutMs: 30000, maxRetries: 3, retryDelayMs: 1000 },
        telemetry: {
          enabled: false,
          endpoint: '',
          service: '',
          metrics: { chunking: false, ingestion: false, errors: false },
        },
      };

      Object.defineProperty(configService, 'config', {
        value: mockConfig,
        writable: true,
      });

      await bootstrapService.onApplicationBootstrap();

      expect(infoSpy).toHaveBeenCalledWith('  Watch sources: 2');
      expect(infoSpy).toHaveBeenCalledWith('    - source-1: /path/one');
      expect(infoSpy).toHaveBeenCalledWith('    - source-2: /path/two');
      expect(infoSpy).toHaveBeenCalledWith('  Chunking strategy: recursive');
      expect(infoSpy).toHaveBeenCalledWith('  Enrichment: enabled');
      expect(infoSpy).toHaveBeenCalledWith('  MCP endpoint: http://mcp-endpoint:9000');
      expect(infoSpy).toHaveBeenCalledWith('  Telemetry: disabled');
    });
  });
});
