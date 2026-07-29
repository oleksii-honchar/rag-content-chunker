import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import * as chokidar from 'chokidar';
import * as os from 'os';
import * as path from 'path';
import { AppEventEmitter } from './app-event-emitter';
import { WatchSourceConfig } from './config/config-schemas';
import { ConfigurationService } from './config/configuration.service';
import { FileWatcherService } from './file-watcher.service';
import { BasePinoLogger } from './logging/base-pino-logger';

jest.mock('chokidar', () => ({
  watch: jest.fn(),
}));

describe('FileWatcherService', () => {
  let service: FileWatcherService;
  let configService: jest.Mocked<ConfigurationService>;
  let eventEmitter: jest.Mocked<AppEventEmitter>;
  let mockLogger: jest.Mocked<BasePinoLogger>;
  let mockWatcher: jest.Mocked<chokidar.FSWatcher>;
  const mockWatchFn = jest.mocked(chokidar.watch);

  const createSource = (overrides?: Partial<WatchSourceConfig>): WatchSourceConfig => ({
    id: 'test-source',
    path: '/test/path',
    include: ['*.md'],
    exclude: ['**/.git/**'],
    debounceMs: 3000,
    ignorePatterns: [],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockOnFn = jest.fn((_event, _handler) => mockWatcher);
    mockWatcher = {
      on: mockOnFn,
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<chokidar.FSWatcher>;
    mockWatchFn.mockReturnValue(mockWatcher);

    configService = {
      getWatchSources: jest.fn(),
      getChunkingConfig: jest.fn(),
      getEnrichmentConfig: jest.fn(),
      getMcpConfig: jest.fn(),
      getTelemetryConfig: jest.fn(),
      load: jest.fn(),
      initializeDefaultConfig: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<ConfigurationService>;

    eventEmitter = {
      publish: jest.fn(),
      publishMany: jest.fn(),
    } as unknown as jest.Mocked<AppEventEmitter>;

    mockLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<BasePinoLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileWatcherService,
        { provide: ConfigurationService, useValue: configService },
        { provide: AppEventEmitter, useValue: eventEmitter },
        { provide: BasePinoLogger, useValue: mockLogger },
        EventEmitter2,
      ],
    }).compile();

    service = module.get(FileWatcherService);
  });

  describe('start()', () => {
    it('creates watchers for all configured sources', async () => {
      const sources = [
        createSource({ id: 'vault', path: '~/vault' }),
        createSource({ id: 'sessions', path: '~/.agent-sessions' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);

      const result = await service.start();

      expect(result.isOk()).toBe(true);
      expect(mockWatchFn).toHaveBeenCalledTimes(2);
      expect(mockWatchFn).toHaveBeenCalledWith(
        path.join(os.homedir(), 'vault'),
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: expect.objectContaining({
            stabilityThreshold: 3000,
            pollInterval: 100,
          }),
        }),
      );
      expect(mockWatchFn).toHaveBeenCalledWith(
        path.join(os.homedir(), '.agent-sessions'),
        expect.any(Object),
      );
    });

    it('logs errors when a source fails to start but continues with others', async () => {
      const sources = [
        createSource({ id: 'source-1', path: '/valid' }),
        createSource({ id: 'source-2', path: '/valid' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);

      // Simulate failure on second watch call
      mockWatchFn.mockImplementationOnce(() => mockWatcher);
      mockWatchFn.mockImplementationOnce(() => {
        throw new Error('ENOENT');
      });

      const result = await service.start();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start watching source',
        expect.objectContaining({
          sourceId: 'source-2',
          error: 'ENOENT',
        }),
      );
    });
  });

  describe('stop()', () => {
    it('closes all watchers', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      const result = await service.stop();

      expect(result.isOk()).toBe(true);
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('handles errors when closing a watcher without failing', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      mockWatcher.close.mockRejectedValueOnce(new Error('watcher error'));

      const result = await service.stop();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error stopping watcher',
        expect.objectContaining({
          error: 'watcher error',
        }),
      );
    });
  });

  describe('file added event', () => {
    it('emits FileAddedEvent when file is added', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      const addHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'add')?.[1] as
        ((filePath: string) => void) | undefined;

      addHandler?.('/test/new-file.md');

      expect(eventEmitter.publishMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file.added',
            path: '/test/new-file.md',
          }),
        ]),
      );
    });
  });

  describe('file changed event', () => {
    it('emits FileChangedEvent when file is changed', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      const changeHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'change')?.[1] as
        ((filePath: string) => void) | undefined;

      changeHandler?.('/test/changed-file.md');

      expect(eventEmitter.publishMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file.changed',
            path: '/test/changed-file.md',
          }),
        ]),
      );
    });
  });

  describe('file deleted event', () => {
    it('emits FileDeletedEvent when file is deleted', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      const unlinkHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'unlink')?.[1] as
        ((filePath: string) => void) | undefined;

      unlinkHandler?.('/test/deleted-file.md');

      expect(eventEmitter.publishMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file.deleted',
            path: '/test/deleted-file.md',
          }),
        ]),
      );
    });
  });

  describe('ignore patterns', () => {
    it('applies ignore patterns correctly including defaults', async () => {
      const source = createSource({
        exclude: ['**/node_modules/**'],
        ignorePatterns: ['**/temp/**'],
      });
      configService.getWatchSources.mockReturnValue([source]);

      await service.start();

      const watchCall = mockWatchFn.mock.calls[0];
      const options = watchCall?.[1] as Record<string, unknown>;
      const ignored = options.ignored as (string | RegExp)[];

      expect(Array.isArray(ignored)).toBe(true);
      expect(ignored).toContain('**/node_modules/**');
      expect(ignored).toContain('**/temp/**');
      expect(ignored).toContain('**/.DS_Store');
      expect(ignored).toContain('**/Thumbs.db');
      expect(ignored).toContain('**/.env*');
    });
  });

  describe('debounce behavior', () => {
    it('uses awaitWriteFinish with source debounceMs', async () => {
      const source = createSource({ debounceMs: 5000 });
      configService.getWatchSources.mockReturnValue([source]);

      await service.start();

      const watchCall = mockWatchFn.mock.calls[0];
      const options = watchCall?.[1] as Record<string, unknown>;

      expect(options.awaitWriteFinish).toEqual(
        expect.objectContaining({
          stabilityThreshold: 5000,
          pollInterval: 100,
        }),
      );
    });
  });

  describe('onApplicationBootstrap', () => {
    it('calls start and logs error if a source fails to start', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      mockWatchFn.mockImplementation(() => {
        throw new Error('start failed');
      });

      await service.onApplicationBootstrap();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start watching source',
        expect.objectContaining({
          error: 'start failed',
          sourceId: 'test-source',
        }),
      );
    });
  });

  describe('onApplicationShutdown', () => {
    it('calls stop', async () => {
      configService.getWatchSources.mockReturnValue([createSource()]);
      await service.start();

      await service.onApplicationShutdown();

      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });
});
