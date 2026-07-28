import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import * as os from 'os';
import * as path from 'path';
import { FileChange } from '../domain/file-change.aggregate';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { AppEventEmitter } from './app-event-emitter';
import { WatchSourceConfig } from './config/config-schemas';
import { ConfigurationService } from './config/configuration.service';
import { BasePinoLogger } from './logging/base-pino-logger';

@Injectable()
export class FileWatcherService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger: BasePinoLogger;
  private watchers = new Map<string, chokidar.FSWatcher>();

  constructor(
    private readonly configService: ConfigurationService,
    private readonly eventEmitter: AppEventEmitter,
    logger: BasePinoLogger,
  ) {
    this.logger = logger.child({ component: '[FileWatcherService]' });
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.info('Starting file watcher service', {
      sourceCount: this.configService.getWatchSources().length,
    });
    const result = await this.start();
    if (result.isKo()) {
      this.logger.error('Failed to start file watcher', { error: result.getError().message });
    }
  }

  async start(): Promise<Result<void>> {
    const sources = this.configService.getWatchSources();
    this.logger.info('Loading watch sources', { sourceCount: sources.length });

    for (const source of sources) {
      const startResult = await this.startWatchingSource(source);
      if (startResult.isKo()) {
        this.logger.error('Failed to start watching source', {
          sourceId: source.id,
          error: startResult.getError().message,
        });
      }
    }

    this.logger.info('File watcher started', { activeWatchers: this.watchers.size });
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
      this.logger.info('Watching source', {
        sourceId: source.id,
        path: resolvedPath,
        includePatterns: source.include,
      });

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
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'WatcherStartError'),
      );
    }
  }

  private handleFileAdded(filePath: string, sourceId: string): void {
    this.logger.debug('File added', { filePath, sourceId, eventType: 'add' });
    const result = FileChange.add(filePath);
    if (result.isOk()) {
      this.eventEmitter.publishMany(result.getValue().events);
    }
  }

  private handleFileChanged(filePath: string, sourceId: string): void {
    this.logger.debug('File changed', { filePath, sourceId, eventType: 'change' });
    const result = FileChange.change(filePath);
    if (result.isOk()) {
      this.eventEmitter.publishMany(result.getValue().events);
    }
  }

  private handleFileDeleted(filePath: string, sourceId: string): void {
    this.logger.debug('File deleted', { filePath, sourceId, eventType: 'delete' });
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

  private buildIgnorePatterns(source: WatchSourceConfig): (string | RegExp)[] {
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
