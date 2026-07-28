import { GracefulShutdownService } from './graceful-shutdown.service';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { FileWatcherService } from '../watcher/file-watcher.service';
import { FileProcessingQueue } from '../queue/file-processing-queue.service';
import { MnemosyneClient } from '../mcp/mnemosyne-client.service';
import { Result } from '../../utils/result';

class MockBasePinoLogger extends BasePinoLogger {
  logCalls: Array<{ message: string | Record<string, unknown>; meta?: Record<string, unknown> }> = [];
  infoCalls: Array<{ message: string | Record<string, unknown>; meta?: Record<string, unknown> }> = [];
  errorCalls: Array<{ message: string | Record<string, unknown>; meta?: Record<string, unknown> }> = [];
  warnCalls: Array<{ message: string | Record<string, unknown>; meta?: Record<string, unknown> }> = [];
  debugCalls: Array<{ message: string | Record<string, unknown>; meta?: Record<string, unknown> }> = [];

  setContext(_context: string): void {}
  log(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void { this.logCalls.push({ message, meta }); }
  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void { this.infoCalls.push({ message, meta }); }
  error(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void { this.errorCalls.push({ message, meta }); }
  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void { this.warnCalls.push({ message, meta }); }
  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void { this.debugCalls.push({ message, meta }); }
  child(_bindings: Record<string, unknown>): BasePinoLogger {
    return this;
  }
}

class MockFileWatcherService {
  stopCalled = false;
  async stop(): Promise<Result<void>> {
    this.stopCalled = true;
    return Result.ok(undefined as unknown as void);
  }
}

class MockFileProcessingQueue {
  private _length = 0;
  private _processing = false;

  setLength(value: number) { this._length = value; }
  setProcessing(value: boolean) { this._processing = value; }

  get length(): number { return this._length; }
  isProcessing(): boolean { return this._processing; }
}

class MockMnemosyneClient {
  // HTTP-based client, no explicit close needed
}

describe('GracefulShutdownService', () => {
  let service: GracefulShutdownService;
  let logger: MockBasePinoLogger;
  let fileWatcherService: MockFileWatcherService;
  let processingQueue: MockFileProcessingQueue;
  let mnemosyneClient: MockMnemosyneClient;

  beforeEach(() => {
    logger = new MockBasePinoLogger();
    fileWatcherService = new MockFileWatcherService();
    processingQueue = new MockFileProcessingQueue();
    mnemosyneClient = new MockMnemosyneClient();

    service = new GracefulShutdownService(
      fileWatcherService as unknown as FileWatcherService,
      processingQueue as unknown as FileProcessingQueue,
      mnemosyneClient as unknown as MnemosyneClient,
      logger,
    );
  });

  describe('onApplicationShutdown', () => {
    it('should stop file watchers when shutdown is initiated', async () => {
      await service.onApplicationShutdown('SIGTERM');

      expect(fileWatcherService.stopCalled).toBe(true);
    });

    it('should log shutdown initiation with signal', async () => {
      await service.onApplicationShutdown('SIGTERM');

      expect(logger.infoCalls.some(call => call.message === 'Initiating graceful shutdown' && (call.meta as { signal?: string })?.signal === 'SIGTERM')).toBe(true);
    });

    it('should log shutdown initiation without signal', async () => {
      await service.onApplicationShutdown();

      expect(logger.infoCalls.some(call => call.message === 'Initiating graceful shutdown')).toBe(true);
    });

    it('should drain processing queue before shutdown completes', async () => {
      processingQueue.setLength(0);
      processingQueue.setProcessing(false);

      await service.onApplicationShutdown('SIGINT');

      expect(logger.infoCalls.some(call => call.message === 'Draining processing queue')).toBe(true);
      expect(logger.infoCalls.some(call => call.message === 'Processing queue drained')).toBe(true);
    });

    it('should log MCP client closure', async () => {
      processingQueue.setLength(0);
      processingQueue.setProcessing(false);

      await service.onApplicationShutdown('SIGTERM');

      expect(logger.infoCalls.some(call => call.message === 'Closing MCP client')).toBe(true);
      expect(logger.infoCalls.some(call => call.message === 'MCP client closed')).toBe(true);
    });

    it('should log graceful shutdown completion', async () => {
      processingQueue.setLength(0);
      processingQueue.setProcessing(false);

      await service.onApplicationShutdown('SIGTERM');

      expect(logger.infoCalls.some(call => call.message === 'Graceful shutdown completed')).toBe(true);
    });

    it('should handle errors during shutdown without throwing', async () => {
      fileWatcherService.stop = async () => {
        throw new Error('Watcher stop failed');
      };

      await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();
      expect(logger.errorCalls.some(call => call.message === 'Error during graceful shutdown')).toBe(true);
    });

    it('should call operations in correct order: watchers → queue → MCP', async () => {
      processingQueue.setLength(0);
      processingQueue.setProcessing(false);

      await service.onApplicationShutdown('SIGTERM');

      const stopWatchersIndex = logger.infoCalls.findIndex(call => call.message === 'Stopping file watchers');
      const drainQueueIndex = logger.infoCalls.findIndex(call => call.message === 'Draining processing queue');
      const closeMcpIndex = logger.infoCalls.findIndex(call => call.message === 'Closing MCP client');

      expect(stopWatchersIndex).toBeGreaterThan(-1);
      expect(drainQueueIndex).toBeGreaterThan(stopWatchersIndex);
      expect(closeMcpIndex).toBeGreaterThan(drainQueueIndex);
    });
  });

  describe('waitForQueue', () => {
    it('should return immediately when queue is empty and not processing', async () => {
      processingQueue.setLength(0);
      processingQueue.setProcessing(false);

      const startTime = Date.now();
      await service.onApplicationShutdown('SIGTERM');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500);
    });

    it('should wait for queue to drain with timeout', async () => {
      let iterations = 0;
      const originalQueue = processingQueue;

      processingQueue.setLength(1);
      processingQueue.setProcessing(true);

      const drainSpy = jest.spyOn(processingQueue, 'length', 'get').mockImplementation(() => {
        iterations++;
        if (iterations < 5) {
          return 1;
        }
        return 0;
      });

      const processingSpy = jest.spyOn(processingQueue, 'isProcessing').mockImplementation(() => {
        if (iterations < 5) {
          return true;
        }
        return false;
      });

      await service.onApplicationShutdown('SIGTERM');

      expect(iterations).toBeGreaterThanOrEqual(5);
      expect(logger.infoCalls.some(call => call.message === 'Processing queue drained')).toBe(true);

      drainSpy.mockRestore();
      processingSpy.mockRestore();
    });

    it('should warn when queue drain timeout is reached', async () => {
      processingQueue.setLength(5);
      processingQueue.setProcessing(true);

      // Mock Date.now to simulate timeout expiration immediately
      const originalDateNow = Date.now;
      let callCount = 0;
      global.Date.now = jest.fn(() => {
        callCount++;
        // First call: start time, subsequent calls: past timeout
        return callCount === 1 ? 0 : 40000;
      });

      await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();

      expect(logger.warnCalls.some(call => call.message === 'Queue drain timeout reached')).toBe(true);
      global.Date.now = originalDateNow;
    });
  });
});
