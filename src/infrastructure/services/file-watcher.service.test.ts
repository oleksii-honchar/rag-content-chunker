import { aWatchSource } from '@/domain/watch-source.entity.test-utils';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import * as chokidar from 'chokidar';
import * as os from 'os';
import * as path from 'path';
import { Result } from '../../utils/result';
import { AppEventEmitter } from '../app-event-emitter';
import { ConfigurationService } from '../config/configuration.service';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { FileWatcherService } from './file-watcher.service';
import { MnemosyneClient } from './mnemosyne-client.service';

jest.mock('chokidar', () => ({
  watch: jest.fn(),
}));

describe('FileWatcherService', () => {
  let service: FileWatcherService;
  let configService: jest.Mocked<ConfigurationService>;
  let eventEmitter: jest.Mocked<AppEventEmitter>;
  let mockLogger: jest.Mocked<BasePinoLogger>;
  let mockMnemosyneClient: jest.Mocked<MnemosyneClient>;
  let mockWatcher: jest.Mocked<chokidar.FSWatcher>;
  const mockWatchFn = jest.mocked(chokidar.watch);

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

    mockMnemosyneClient = {
      registerBank: jest.fn(),
      remember: jest.fn(),
      recall: jest.fn(),
      healthCheck: jest.fn(),
      close: jest.fn(),
      initialize: jest.fn().mockResolvedValue(Result.ok(undefined as unknown as void)),
      onApplicationBootstrap: jest.fn(),
    } as unknown as jest.Mocked<MnemosyneClient>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileWatcherService,
        { provide: ConfigurationService, useValue: configService },
        { provide: AppEventEmitter, useValue: eventEmitter },
        { provide: BasePinoLogger, useValue: mockLogger },
        { provide: MnemosyneClient, useValue: mockMnemosyneClient },
        EventEmitter2,
      ],
    }).compile();

    service = module.get(FileWatcherService);
  });

  describe('start()', () => {
    it('creates watchers for all configured sources', async () => {
      const sources = [
        aWatchSource({ id: 'vault', path: '~/vault' }),
        aWatchSource({ id: 'sessions', path: '~/.agent-sessions' }),
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
        aWatchSource({ id: 'source-1', path: '/valid' }),
        aWatchSource({ id: 'source-2', path: '/valid' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);

      // Simulate failure on second watch call
      mockWatchFn.mockImplementationOnce(() => mockWatcher);
      mockWatchFn.mockImplementationOnce(() => {
        throw new Error('ENOENT');
      });

      const result = await service.start();

      expect(result.isOk()).toBe(true);
    });
  });

  describe('stop()', () => {
    it('closes all watchers', async () => {
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
      await service.start();

      const result = await service.stop();

      expect(result.isOk()).toBe(true);
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('handles errors when closing a watcher without failing', async () => {
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
      await service.start();

      mockWatcher.close.mockRejectedValueOnce(new Error('watcher error'));

      const result = await service.stop();

      expect(result.isOk()).toBe(true);
    });
  });

  describe('file added event', () => {
    it('emits FileAddedEvent when file is added', async () => {
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
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
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
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
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
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
      const source = aWatchSource({
        exclude: ['**/node_modules/**', '**/temp/**'],
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
      const source = aWatchSource({ debounceMs: 5000 });
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
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
      mockWatchFn.mockImplementation(() => {
        throw new Error('start failed');
      });

      await service.onApplicationBootstrap();
    });
  });

  describe('onApplicationShutdown', () => {
    it('calls stop', async () => {
      configService.getWatchSources.mockReturnValue([aWatchSource()]);
      await service.start();

      await service.onApplicationShutdown();

      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe('memory bank registration', () => {
    it('calls registerBank for sources with description', async () => {
      const sources = [
        aWatchSource({ id: 'vault', memoryBank: 'vault', description: 'Personal vault notes' }),
        aWatchSource({ id: 'sessions', memoryBank: 'sessions', description: 'Agent sessions' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);
      mockMnemosyneClient.registerBank.mockResolvedValue(Result.ok(undefined as unknown as void));

      await service.onApplicationBootstrap();

      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledWith('vault', 'Personal vault notes');
      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledWith('sessions', 'Agent sessions');
    });

    it('skips sources without description', async () => {
      const sources = [
        aWatchSource({ id: 'vault', memoryBank: 'vault', description: 'Personal vault notes' }),
        aWatchSource({ id: 'no-desc', memoryBank: 'no-desc' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);
      mockMnemosyneClient.registerBank.mockResolvedValue(Result.ok(undefined as unknown as void));

      await service.onApplicationBootstrap();

      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledTimes(1);
      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledWith('vault', 'Personal vault notes');
    });

    it('logs warning on registration failure and continues with other memory banks', async () => {
      const sources = [
        aWatchSource({ id: 'vault', memoryBank: 'vault', description: 'Vault' }),
        aWatchSource({ id: 'sessions', memoryBank: 'sessions', description: 'Sessions' }),
      ];
      configService.getWatchSources.mockReturnValue(sources);

      // First call succeeds, second fails
      mockMnemosyneClient.registerBank
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko([new Error('connection refused')]));

      await service.onApplicationBootstrap();

      expect(mockMnemosyneClient.registerBank).toHaveBeenCalledTimes(2);
    });

    it('registers memory banks before starting watchers', async () => {
      const callOrder: string[] = [];

      mockWatchFn.mockImplementation(() => {
        callOrder.push('watch');
        return mockWatcher;
      });

      mockMnemosyneClient.registerBank.mockImplementation(async () => {
        callOrder.push('registerBank');
        return Result.ok(undefined as unknown as void);
      });

      const sources = [aWatchSource({ id: 'vault', memoryBank: 'vault', description: 'Vault' })];
      configService.getWatchSources.mockReturnValue(sources);

      await service.onApplicationBootstrap();

      // registerBank must be called before chokidar.watch
      const registerIndex = callOrder.indexOf('registerBank');
      const watchIndex = callOrder.indexOf('watch');
      expect(registerIndex).toBeGreaterThanOrEqual(0);
      expect(watchIndex).toBeGreaterThanOrEqual(0);
      expect(registerIndex).toBeLessThan(watchIndex);
    });

    it('does not block startup when all registrations fail', async () => {
      const sources = [aWatchSource({ id: 'vault', memoryBank: 'vault', description: 'Vault' })];
      configService.getWatchSources.mockReturnValue(sources);
      mockMnemosyneClient.registerBank.mockResolvedValue(Result.ko([new Error('MCP error')]));

      await service.onApplicationBootstrap();

      // Watchers still started despite registration failure
      expect(mockWatchFn).toHaveBeenCalled();
    });

    it('does not register when no sources have descriptions', async () => {
      const sources = [aWatchSource({ id: 'no-desc', memoryBank: 'no-desc' })];
      configService.getWatchSources.mockReturnValue(sources);

      await service.onApplicationBootstrap();

      expect(mockMnemosyneClient.registerBank).not.toHaveBeenCalled();
    });
  });
});
