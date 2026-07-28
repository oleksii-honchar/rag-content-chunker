import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConfigurationService } from './configuration.service';
import { Configuration } from './config-schemas';
import { BasePinoLogger } from '../logging/base-pino-logger';

// Mock chokidar
jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'rag-config-test-'));
    configPath = path.join(testDir, 'rag-content-chunker.yaml');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  const createModule = async (customConfigPath?: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        {
          provide: 'CONFIG_FILE_PATH',
          useValue: customConfigPath || configPath,
        },
        {
          provide: BasePinoLogger,
          useValue: {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            child: jest.fn().mockReturnThis(),
          },
        },
      ],
    }).compile();

    service = module.get(ConfigurationService);
    return module;
  };

  describe('load()', () => {
    it('returns Result.ok with valid YAML configuration', async () => {
      const validConfig = {
        watchSources: [
          {
            id: 'test-source',
            path: '/test/path',
            include: ['*.md'],
            exclude: ['**/.git/**'],
            debounceMs: 3000,
          },
        ],
        chunking: {
          strategy: 'content-aware',
          maxSizes: {
            agentSessions: 400,
          },
        },
        mcp: {
          url: 'https://test.lan/mcp',
        },
      };

      await fs.writeFile(configPath, yaml.dump(validConfig));
      await createModule();

      const result = await service.load();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const config = result.getValue();
        expect(config.watchSources).toHaveLength(1);
        expect(config.watchSources[0].id).toBe('test-source');
        expect(config.chunking.strategy).toBe('content-aware');
        expect(config.mcp.url).toBe('https://test.lan/mcp');
      }
    });

    it('returns Result.ko with invalid YAML syntax', async () => {
      await fs.writeFile(configPath, 'invalid: yaml: [');
      await createModule();

      const result = await service.load();

      expect(result.isKo()).toBe(true);
      if (result.isKo()) {
        expect(result.getError().message).toMatch(/(YAML|indentation|parse)/i);
      }
    });

    it('returns Result.ko when required fields are missing', async () => {
      const invalidConfig = {
        watchSources: [
          {
            // missing id and path
            include: ['*.md'],
          },
        ],
      };

      await fs.writeFile(configPath, yaml.dump(invalidConfig));
      await createModule();

      const result = await service.load();

      expect(result.isKo()).toBe(true);
      if (result.isKo()) {
        expect(result.getError().message).toContain('validation');
      }
    });

    it('applies defaults when config file is empty object', async () => {
      await fs.writeFile(configPath, '{}');
      await createModule();

      const result = await service.load();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const config = result.getValue();
        expect(config.watchSources).toEqual([]);
        expect(config.chunking.strategy).toBe('content-aware');
        expect(config.mcp.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
        expect(config.telemetry.enabled).toBe(true);
      }
    });
  });

  describe('getWatchSources()', () => {
    it('returns empty array before load', async () => {
      await createModule();
      // service created but load not called yet
      expect(service.getWatchSources()).toEqual([]);
    });

    it('returns watch sources after successful load', async () => {
      const validConfig = {
        watchSources: [
          { id: 'vault', path: '~/vault', include: ['*.md'] },
          { id: 'sessions', path: '~/.agent-sessions', include: ['*.md'] },
        ],
      };

      await fs.writeFile(configPath, yaml.dump(validConfig));
      await createModule();
      await service.load();

      const sources = service.getWatchSources();
      expect(sources).toHaveLength(2);
      expect(sources[0].id).toBe('vault');
      expect(sources[1].id).toBe('sessions');
    });
  });

  describe('getMcpConfig()', () => {
    it('returns default MCP config when not loaded', () => {
      createModule();
      const mcpConfig = service.getMcpConfig();
      expect(mcpConfig.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
      expect(mcpConfig.timeoutMs).toBe(30000);
    });

    it('returns loaded MCP config after load', async () => {
      const validConfig = {
        mcp: {
          url: 'https://custom.lan/mcp/test',
          timeoutMs: 60000,
          maxRetries: 5,
        },
      };

      await fs.writeFile(configPath, yaml.dump(validConfig));
      await createModule();
      await service.load();

      const mcpConfig = service.getMcpConfig();
      expect(mcpConfig.url).toBe('https://custom.lan/mcp/test');
      expect(mcpConfig.timeoutMs).toBe(60000);
      expect(mcpConfig.maxRetries).toBe(5);
    });
  });

  describe('getChunkingConfig()', () => {
    it('returns chunking config with defaults', async () => {
      await fs.writeFile(configPath, '{}');
      await createModule();
      await service.load();

      const config = service.getChunkingConfig();
      expect(config.strategy).toBe('content-aware');
      expect(config.maxSizes.agentSessions).toBe(400);
    });
  });

  describe('getEnrichmentConfig()', () => {
    it('returns enrichment config with defaults', async () => {
      await fs.writeFile(configPath, '{}');
      await createModule();
      await service.load();

      const config = service.getEnrichmentConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxConcurrency).toBe(1);
    });
  });

  describe('getTelemetryConfig()', () => {
    it('returns telemetry config with defaults', async () => {
      await fs.writeFile(configPath, '{}');
      await createModule();
      await service.load();

      const config = service.getTelemetryConfig();
      expect(config.enabled).toBe(true);
      expect(config.endpoint).toBe('clickstack-otel-collector:4317');
    });
  });

  describe('initializeDefaultConfig()', () => {
    it('creates config directory if it does not exist', async () => {
      const newDir = path.join(testDir, 'new-config-dir');
      const newConfigPath = path.join(newDir, 'rag-content-chunker.yaml');

      const module = await createModule(newConfigPath);
      service = module.get(ConfigurationService);

      const result = await service.initializeDefaultConfig();

      expect(result.isOk()).toBe(true);
      const exists = fsSync.existsSync(newConfigPath);
      expect(exists).toBe(true);
    });

    it('creates default YAML with 3 example watch sources', async () => {
      await createModule();
      const result = await service.initializeDefaultConfig();

      expect(result.isOk()).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = yaml.load(content) as unknown as Configuration;

      expect(parsed.watchSources).toBeDefined();
      expect(parsed.watchSources?.length).toBe(3);

      const sourceIds = parsed.watchSources?.map((s) => s.id) ?? [];
      expect(sourceIds).toContain('obsidian-vault');
      expect(sourceIds).toContain('agent-sessions');
      expect(sourceIds).toContain('codebase');
    });

    it('includes default chunking configuration', async () => {
      await createModule();
      await service.initializeDefaultConfig();

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = yaml.load(content) as unknown as Configuration;

      expect(parsed.chunking?.strategy).toBe('content-aware');
      expect(parsed.chunking?.maxSizes?.agentSessions).toBe(400);
    });

    it('includes default MCP configuration', async () => {
      await createModule();
      await service.initializeDefaultConfig();

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = yaml.load(content) as unknown as Configuration;

      expect(parsed.mcp?.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
    });

    it('returns Result.ko if directory creation fails', async () => {
      const unreadableDir = path.join(testDir, 'unreadable');
      fsSync.mkdirSync(unreadableDir, { recursive: true });
      fsSync.chmodSync(unreadableDir, 0o000);

      try {
        const newConfigPath = path.join(unreadableDir, 'nested', 'config.yaml');
        const module = await createModule(newConfigPath);
        service = module.get(ConfigurationService);

        const result = await service.initializeDefaultConfig();
        expect(result.isKo()).toBe(true);
      } finally {
        fsSync.chmodSync(unreadableDir, 0o755);
      }
    });
  });

  describe('config hot-reload', () => {
    it('reloads configuration when file changes', async () => {
      const initialConfig = {
        watchSources: [{ id: 'initial', path: '/initial', include: ['*.md'] }],
      };

      await fs.writeFile(configPath, yaml.dump(initialConfig));
      await createModule();
      await service.load();

      expect(service.getWatchSources()[0]?.id).toBe('initial');

      // Simulate file change by writing new config and calling load again
      // (in production, chokidar watcher triggers load())
      const updatedConfig = {
        watchSources: [
          { id: 'updated', path: '/updated', include: ['*.ts'] },
        ],
      };

      await fs.writeFile(configPath, yaml.dump(updatedConfig));
      const reloadResult = await service.load();

      expect(reloadResult.isOk()).toBe(true);
      expect(service.getWatchSources()[0]?.id).toBe('updated');
    });

    it('handles reload errors gracefully without crashing', async () => {
      await fs.writeFile(configPath, '{}');
      await createModule();
      await service.load();

      // Write invalid YAML
      await fs.writeFile(configPath, 'invalid: yaml: [');

      // Reload should return ko but not throw
      const reloadResult = await service.load();
      expect(reloadResult.isKo()).toBe(true);

      // Previous config should still be available (load failed, config not updated)
      expect(service.getWatchSources()).toEqual([]);
    });
  });
});
