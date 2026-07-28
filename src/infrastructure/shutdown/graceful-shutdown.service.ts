import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { MnemosyneClient } from '../mcp/mnemosyne-client.service';
import { FileProcessingQueue } from '../queue/file-processing-queue.service';
import { FileWatcherService } from '../watcher/file-watcher.service';

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger: BasePinoLogger;

  constructor(
    private readonly fileWatcherService: FileWatcherService,
    private readonly processingQueue: FileProcessingQueue,
    private readonly mnemosyneClient: MnemosyneClient,
    logger: BasePinoLogger,
  ) {
    this.logger = logger.child({ service: 'GracefulShutdownService' });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.info('Initiating graceful shutdown', { signal });

    try {
      // 1. Stop file watchers first
      this.logger.info('Stopping file watchers');
      await this.fileWatcherService.stop();
      this.logger.info('File watchers stopped');

      // 2. Drain processing queue
      this.logger.info('Draining processing queue');
      // Wait for queue to empty (with timeout)
      await this.waitForQueue();
      this.logger.info('Processing queue drained');

      // 3. Close MCP client
      this.logger.info('Closing MCP client');
      // MCP uses HTTP, no explicit close needed but log it
      this.logger.info('MCP client closed');

      this.logger.info('Graceful shutdown completed');
    } catch (error) {
      this.logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async waitForQueue(): Promise<void> {
    const timeout = 30000; // 30 second timeout
    const startTime = Date.now();

    while (this.processingQueue.length > 0 || this.processingQueue.isProcessing()) {
      if (Date.now() - startTime > timeout) {
        this.logger.warn('Queue drain timeout reached', {
          remaining: this.processingQueue.length,
        });
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
