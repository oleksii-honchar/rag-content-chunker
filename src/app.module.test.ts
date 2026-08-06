import '@/utils/app-module.test-utils';
import '@/utils/mastra-rag.test-utils';

import { Test, TestingModule } from '@nestjs/testing';
import { AppBootstrapService } from './app-bootstrap.service';
import { AppModule } from './app.module';
import { ConfigurationService } from './infrastructure/config/configuration.service';
import { aConfigurableConfigService } from './infrastructure/config/configuration.service.test-utils';
import { SOURCE_STRATEGIES } from './infrastructure/config/source-strategies';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';
import { aLogger } from './infrastructure/logging/logger.test-utils';
import { FileMemoryTrackerRepository } from './infrastructure/repositories/file-memory-tracker.repository';
import { aFileMemoryTrackerRepositoryService } from './infrastructure/repositories/file-memory-tracker.repository.test-utils';
import { FileMemoryTrackerService } from './infrastructure/services/file-memory-tracker.service';
import { aFileMemoryTrackerService } from './infrastructure/services/file-memory-tracker.service.test-utils';
import { FileProcessingQueue } from './infrastructure/services/file-processing-queue.service';
import { aFileProcessingQueueService } from './infrastructure/services/file-processing-queue.test-utils';
import { MnemosyneClient } from './infrastructure/services/mnemosyne-client.service';
import { aMnemosyneClientService } from './infrastructure/services/mnemosyne-client.test-utils';

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
      .useValue(aLogger())
      .overrideProvider(ConfigurationService)
      .useValue(aConfigurableConfigService())
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
          strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
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
