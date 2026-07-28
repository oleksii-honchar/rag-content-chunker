import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as chokidar from 'chokidar';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Result } from '../../utils/result';
import { BasePinoLogger } from '../logging/base-pino-logger';
import {
  ChunkingConfig,
  Configuration,
  configurationSchema,
  EnrichmentConfig,
  McpConfig,
  TelemetryConfig,
  WatchSourceConfig,
} from './config-schemas';

const DEFAULT_CONFIG: Configuration = {
  watchSources: [
    {
      id: 'obsidian-vault',
      path: '~/vault',
      include: ['*.md', '*.txt'],
      exclude: ['**/.git/**', '**/node_modules/**'],
      debounceMs: 3000,
      ignorePatterns: ['**/.DS_Store', '**/Thumbs.db', '**/.env*'],
    },
    {
      id: 'agent-sessions',
      path: '~/.agent-sessions',
      include: ['*.md'],
      exclude: ['**/archive/**'],
      debounceMs: 5000,
      ignorePatterns: [],
    },
    {
      id: 'codebase',
      path: '~/www/project',
      include: ['*.ts', '*.js', '*.py'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      debounceMs: 2000,
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
  enrichment: {
    enabled: false,
    llmUrl: undefined,
    llmModel: undefined,
    apiKey: undefined,
    maxConcurrency: 1,
    timeoutMs: 15000,
    docMaxTokens: 16000,
  },
  mcp: {
    url: 'https://lite-llm.lan/mcp/mnemosyne',
    apiKey: undefined,
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  telemetry: {
    enabled: true,
    endpoint: 'clickstack-otel-collector:4317',
    service: 'rag-content-chunker',
    metrics: {
      chunking: true,
      ingestion: true,
      errors: true,
    },
  },
};

@Injectable()
export class ConfigurationService implements OnApplicationBootstrap {
  private config: Configuration | null = null;
  private watcher: chokidar.FSWatcher | null = null;

  constructor(
    private readonly logger: BasePinoLogger,
    @Inject('CONFIG_FILE_PATH') private readonly configFilePath: string,
  ) {}

  async load(): Promise<Result<Configuration>> {
    try {
      const content = await fs.readFile(this.configFilePath, 'utf-8');
      const parsed = yaml.load(content) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        return Result.ko(new Error('YAML parsing failed: invalid configuration format'));
      }

      const result = configurationSchema.safeParse(parsed);

      if (!result.success) {
        const errors = result.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        return Result.ko(new Error(`Configuration validation failed: ${errors}`));
      }

      this.config = result.data;
      this.logger.info('Configuration loaded successfully', {
        path: this.configFilePath,
        watchSources: this.config.watchSources.length,
      });

      return Result.ok(this.config);
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ENOENT') {
        return Result.ko(
          new Error(
            `Configuration file not found: ${this.configFilePath}. Run with --init to create default config.`,
          ),
        );
      }
      return Result.ko(new Error(`Failed to load configuration: ${(error as Error).message}`));
    }
  }

  getWatchSources(): WatchSourceConfig[] {
    return this.config?.watchSources ?? [];
  }

  getChunkingConfig(): ChunkingConfig {
    return this.config?.chunking ?? DEFAULT_CONFIG.chunking;
  }

  getEnrichmentConfig(): EnrichmentConfig {
    return this.config?.enrichment ?? DEFAULT_CONFIG.enrichment;
  }

  getMcpConfig(): McpConfig {
    return this.config?.mcp ?? DEFAULT_CONFIG.mcp;
  }

  getTelemetryConfig(): TelemetryConfig {
    return this.config?.telemetry ?? DEFAULT_CONFIG.telemetry;
  }

  async initializeDefaultConfig(): Promise<Result<void>> {
    try {
      const dir = path.dirname(this.configFilePath);
      await fs.mkdir(dir, { recursive: true });

      const yamlContent = yaml.dump(DEFAULT_CONFIG, {
        indent: 2,
        noRefs: true,
        lineWidth: 120,
      });

      const header = `# ~/.config/rag-content-chunker.yaml
# Default configuration file - copy and customize as needed
#
# Documentation: https://github.com/olho/rag-content-chunker

`;

      await fs.writeFile(this.configFilePath, header + yamlContent);

      this.logger.info('Default configuration created', {
        path: this.configFilePath,
      });

      return Result.ok(undefined);
    } catch (error) {
      return Result.ko(new Error(`Failed to create default configuration: ${(error as Error).message}`));
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    // Load configuration
    const loadResult = await this.load();

    if (loadResult.isKo()) {
      this.logger.warn(`Configuration load failed: ${loadResult.getError().message}. Using defaults.`);
      this.config = DEFAULT_CONFIG;
    }

    // Watch config file for changes (hot-reload)
    this.startConfigWatcher();
  }

  private startConfigWatcher(): void {
    try {
      if (!fsSync.existsSync(this.configFilePath)) {
        this.logger.debug('Config file does not exist, skipping watcher setup');
        return;
      }

      this.watcher = chokidar.watch(this.configFilePath, {
        ignoreInitial: true,
      });

      let reloadTimeout: NodeJS.Timeout | null = null;

      this.watcher.on('change', () => {
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }

        reloadTimeout = setTimeout(async () => {
          this.logger.debug('Config file changed, reloading...');
          const result = await this.load();

          if (result.isKo()) {
            this.logger.error(`Config reload failed: ${result.getError().message}. Keeping current config.`);
          } else {
            this.logger.info('Configuration reloaded successfully');
          }
        }, 2000);
      });

      this.watcher.on('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Config watcher error', { error: message });
      });
    } catch (error) {
      this.logger.warn(`Failed to start config watcher: ${(error as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
