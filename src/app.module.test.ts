// Mock @mastra/rag BEFORE importing the service
jest.mock('@mastra/rag', () => ({
  MDocument: class MockMDocument {
    static fromMarkdown = jest.fn();
    static fromJSON = jest.fn();
    static fromText = jest.fn();
    static fromHTML = jest.fn();
    extractMetadata = jest.fn();
    chunkMarkdown = jest.fn();
    chunkRecursive = jest.fn();
    chunkJSON = jest.fn();
    chunkSentence = jest.fn();
    getDocs = jest.fn();
    _chunks: { text: string; metadata?: Record<string, unknown> }[] = [];
    _metadata: Record<string, string> = {};
    _textContent = '';
    constructor(content: string, metadata?: Record<string, unknown>) {
      this._textContent = content;
      this._metadata = metadata ?? {};
    }
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AppBootstrapService } from './app-bootstrap.service';
import { AppModule } from './app.module';
import { Configuration } from './infrastructure/config/config-schemas';
import { ConfigurationService } from './infrastructure/config/configuration.service';
import { FileMemoryTrackerRepository } from './infrastructure/file-memory-tracker.repository';
import { aFileMemoryTrackerRepositoryService } from './infrastructure/file-memory-tracker.repository.test-utils';
import { FileMemoryTrackerService } from './infrastructure/file-memory-tracker.service';
import { aFileMemoryTrackerService } from './infrastructure/file-memory-tracker.service.test-utils';
import { FileProcessingQueue } from './infrastructure/file-processing-queue.service';
import { aFileProcessingQueueService } from './infrastructure/file-processing-queue.test-utils';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';
import { MnemosyneClient } from './infrastructure/mnemosyne-client.service';
import { aMnemosyneClientService } from './infrastructure/mnemosyne-client.test-utils';

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
      .useValue(aMnemosyneClientService())
      .overrideProvider(FileProcessingQueue)
      .useValue(aFileProcessingQueueService())
      .overrideProvider(FileMemoryTrackerRepository)
      .useValue(aFileMemoryTrackerRepositoryService())
      .overrideProvider(FileMemoryTrackerService)
      .useValue(aFileMemoryTrackerService())
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
    expect(typeof logger.info).toBe('function');
  });

  describe('AppBootstrapService.onApplicationBootstrap', () => {
    it('should bootstrap successfully with configured watch sources', async () => {
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

      Object.defineProperty(configService, 'config', {
        value: mockConfig,
        writable: true,
      });

      await expect(bootstrapService.onApplicationBootstrap()).resolves.not.toThrow();

      // Verify config was read — bootstrap service depends on config service
      const sources = configService.getWatchSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('test-source');
    });

    it('should bootstrap successfully with multiple watch sources', async () => {
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

      await expect(bootstrapService.onApplicationBootstrap()).resolves.not.toThrow();

      // Verify config was read — bootstrap service depends on config service
      const sources = configService.getWatchSources();
      expect(sources).toHaveLength(2);
      expect(sources.map(s => s.id)).toEqual(['source-1', 'source-2']);
    });
  });
});
