import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as os from 'os';
import { Result } from '../../utils/result';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { ConfigurationService } from '../config/configuration.service';
import { AppEventEmitter } from '../events/app-event-emitter';
import { FileChange } from '../../domains/chunking/aggregates/file-change.aggregate';
import { WatchSourceConfig } from '../config/config-schemas';

@Injectable()
export class FileWatcherService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger: BasePinoLogger;
  private watchers: Map<string, chokidar.FSWatcher> = new Map();

  constructor(
    private readonly configService: ConfigurationService,
    private readonly eventEmitter: AppEventEmitter,
    logger: BasePinoLogger,
  ) {
    this.logger = logger.child({ service: 'FileWatcherService' });
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.info('Starting file watcher service');
    const result = await this.start();
    if (result.isKo()) {
      this.logger.error('Failed to start file watcher', { error: result.getError().message });
    }
  }

  async start(): Promise<Result<void>> {
    const sources = this.configService.getWatchSources();
    this.logger.info('Loading watch sources', { count: sources.length });

    for (const source of sources) {
      const startResult = await this.startWatchingSource(source);
      if (startResult.isKo()) {
        this.logger.error('Failed to start watching source', {
          sourceId: source.id,
          error: startResult.getError().message,
        });
      }
    }

    this.logger.info('File watcher started');
    return Result.ok(undefined as unknown as void);
  }

  async stop(): Promise<Result<void>> {
    for (const entry of Array.from(this.watchers.entries())) {
      const [sourceId, watcher] = entry;
      try {
        await watcher.close();
        this.logger.info('Stopped watching source', { sourceId });
      } catch (error) {
        this.logger.error('Error stopping watcher', {
          sourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.watchers.clear();
    return Result.ok(undefined as unknown as void);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  private async startWatchingSource(source: WatchSourceConfig): Promise<Result<void>> {
    try {
      const resolvedPath = this.resolvePath(source.path);
      this.logger.info('Watching source', { sourceId: source.id, path: resolvedPath });

      const watcher = chokidar.watch(resolvedPath, {
        ignored: this.buildIgnorePatterns(source),
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: source.debounceMs,
          pollInterval: 100,
        },
      });

      const emitter = watcher as unknown as EventEmitter;
      emitter.on('add', (filePath: string) => this.handleFileAdded(filePath, source.id));
      emitter.on('change', (filePath: string) => this.handleFileChanged(filePath, source.id));
      emitter.on('unlink', (filePath: string) => this.handleFileDeleted(filePath, source.id));
      emitter.on('error', (error: unknown) => {
        this.logger.error('Watcher error', {
          sourceId: source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      this.watchers.set(source.id, watcher);
      return Result.ok(undefined as unknown as void);
    } catch (error) {
      return Result.ko(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleFileAdded(filePath: string, sourceId: string): void {
    this.logger.debug('File added', { filePath, sourceId });
    const result = FileChange.add(filePath);
    if (result.isOk()) {
      this.eventEmitter.publishMany(result.getValue().events);
    }
  }

  private handleFileChanged(filePath: string, sourceId: string): void {
    this.logger.debug('File changed', { filePath, sourceId });
    const result = FileChange.change(filePath);
    if (result.isOk()) {
      this.eventEmitter.publishMany(result.getValue().events);
    }
  }

  private handleFileDeleted(filePath: string, sourceId: string): void {
    this.logger.debug('File deleted', { filePath, sourceId });
    const result = FileChange.delete(filePath);
    if (result.isOk()) {
      this.eventEmitter.publishMany(result.getValue().events);
    }
  }

  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(filePath);
  }

  private buildIgnorePatterns(source: WatchSourceConfig): Array<string | RegExp> {
    const patterns = [
      ...source.exclude,
      ...source.ignorePatterns,
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/.env*',
    ];
    return patterns;
  }
}
