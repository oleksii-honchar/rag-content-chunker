import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BasePinoLogger } from '../../../infrastructure/logging/base-pino-logger';
import { FileProcessingQueue } from '../../../infrastructure/queue/file-processing-queue.service';
import { ProcessFileUseCase } from '../use-cases/process-file.use-case';
import { WatchSourceConfig } from '../../../infrastructure/config/config-schemas';

@Injectable()
export class ForceReprocessService {
  private readonly logger: BasePinoLogger;

  constructor(
    private readonly processFileUseCase: ProcessFileUseCase,
    private readonly processingQueue: FileProcessingQueue,
    logger: BasePinoLogger,
  ) {
    this.logger = logger.child({ service: 'ForceReprocessService' });
  }

  async forceReprocessAll(sources: WatchSourceConfig[]): Promise<void> {
    this.logger.info('Force reprocessing all sources', { sourceCount: sources.length });

    for (const source of sources) {
      await this.processSource(source);
    }
  }

  async forceReprocessSource(sourceId: string, sources: WatchSourceConfig[]): Promise<void> {
    this.logger.info('Force reprocessing source', { sourceId });

    const source = sources.find(s => s.id === sourceId);
    if (!source) {
      this.logger.error('Source not found', { sourceId });
      return;
    }

    await this.processSource(source);
  }

  private async processSource(source: WatchSourceConfig): Promise<void> {
    try {
      const files = await this.getFiles(source);
      this.logger.info('Files found for reprocessing', {
        sourceId: source.id,
        path: source.path,
        fileCount: files.length,
      });

      // Add each file to processing queue (sequential)
      for (const file of files) {
        this.processingQueue.addToQueue(async () => {
          const result = await this.processFileUseCase.execute({
            filePath: file,
            eventType: 'add',
            sourceId: source.id,
          });

          if (result.isKo()) {
            this.logger.error('File reprocessing failed', {
              filePath: file,
              error: result.getError().message,
            });
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to process source', {
        sourceId: source.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getFiles(source: WatchSourceConfig): Promise<string[]> {
    const resolvedPath = this.resolvePath(source.path);

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        this.logger.warn('Source path is not a directory', { path: resolvedPath });
        return [];
      }

      return this.scanDirectory(resolvedPath, source);
    } catch (error) {
      this.logger.error('Failed to stat source path', {
        path: resolvedPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async scanDirectory(
    dirPath: string,
    source: WatchSourceConfig,
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories - check both relative path and directory name
          const relPath = path.relative(this.resolvePath(source.path), dirPath);
          if (this.isExcluded(relPath, source.exclude) || this.isExcluded(entry.name, source.exclude)) {
            continue;
          }
          const subFiles = await this.scanDirectory(fullPath, source);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check include patterns
          if (this.matchesInclude(entry.name, source.include)) {
            // Check exclude patterns
            const relPath = path.relative(this.resolvePath(source.path), fullPath);
            if (!this.isExcluded(relPath, source.exclude)) {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to read directory', {
        dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return files;
  }

  private matchesInclude(filename: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(filename, pattern)) {
        return true;
      }
    }
    return false;
  }

  private isExcluded(relPath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(relPath, pattern) || this.matchGlob(path.basename(relPath), pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchGlob(filename: string, pattern: string): boolean {
    // Simple glob matching for common patterns
    if (pattern === '*') return true;
    if (pattern.startsWith('*.') && filename.endsWith(pattern.slice(1))) return true;
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
      // Pattern like **/node_modules/** matches any path containing node_modules
      const middle = pattern.slice(3, -3);
      return filename.includes(middle);
    }
    if (pattern.startsWith('**/') && filename.includes(pattern.slice(3))) return true;
    if (pattern.startsWith('**/') && filename === pattern.slice(3)) return true;
    return filename === pattern;
  }

  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(filePath);
  }
}
