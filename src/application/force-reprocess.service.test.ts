import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { WatchSourceConfig } from '../infrastructure/config/config-schemas';
import { FileProcessingQueue } from '../infrastructure/file-processing-queue.service';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { ProcessFileUseCase } from '../use-cases/process-file.use-case';
import { Result } from '../utils/result';
import { ForceReprocessService } from './force-reprocess.service';

jest.mock('fs/promises');
const fsMock = fsPromises as jest.Mocked<typeof fsPromises>;

// Helper to create mock Dirent compatible with fs/promises readdir
const mockDirent = (name: string, isDir: boolean) =>
  ({ name, isDirectory: () => isDir, isFile: () => !isDir }) as unknown as fs.Dirent;

const mockStats = { isDirectory: () => true } as fs.Stats;

describe('ForceReprocessService', () => {
  let service: ForceReprocessService;
  let processFileUseCase: jest.Mocked<ProcessFileUseCase>;
  let processingQueue: jest.Mocked<FileProcessingQueue>;
  let logger: jest.Mocked<BasePinoLogger>;

  const createSource = (overrides?: Partial<WatchSourceConfig>): WatchSourceConfig => ({
    id: 'test-source',
    path: '/tmp/test-source',
    include: ['*.md'],
    exclude: ['**/.git/**'],
    debounceMs: 3000,
    ignorePatterns: [],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    fsMock.stat.mockReset();
    fsMock.readdir.mockReset();

    processFileUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ProcessFileUseCase>;

    processingQueue = {
      addToQueue: jest.fn(),
    } as unknown as jest.Mocked<FileProcessingQueue>;

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      setContext: jest.fn(),
      child: jest.fn().mockReturnValue(logger),
    } as unknown as jest.Mocked<BasePinoLogger>;

    // Ensure child logger uses the same mock methods
    jest.spyOn(logger, 'child').mockReturnValue(logger);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForceReprocessService,
        { provide: ProcessFileUseCase, useValue: processFileUseCase },
        { provide: FileProcessingQueue, useValue: processingQueue },
        { provide: BasePinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get<ForceReprocessService>(ForceReprocessService);
  });

  describe('forceReprocessAll', () => {
    it('should process files from all sources', async () => {
      const sources = [createSource({ id: 'source-1' }), createSource({ id: 'source-2' })];

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false)]);

      await service.forceReprocessAll(sources);

      expect(logger.info).toHaveBeenCalledWith('Force reprocessing all sources', {
        sourceCount: 2,
      });
    });

    it('should log file count for each source', async () => {
      const sources = [createSource({ id: 'source-1', path: '/tmp/source-1' })];

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false), mockDirent('file2.md', false)]);

      await service.forceReprocessAll(sources);

      expect(logger.info).toHaveBeenCalledWith('Files found for reprocessing', {
        sourceId: 'source-1',
        path: '/tmp/source-1',
        fileCount: 2,
      });
    });
  });

  describe('forceReprocessSource', () => {
    it('should process files from specific source by id', async () => {
      const sources = [
        createSource({ id: 'source-1', path: '/tmp/source-1' }),
        createSource({ id: 'source-2', path: '/tmp/source-2' }),
      ];

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false)]);

      await service.forceReprocessSource('source-1', sources);

      expect(logger.info).toHaveBeenCalledWith('Force reprocessing source', {
        sourceId: 'source-1',
      });
    });

    it('should log error when source not found', async () => {
      const sources = [createSource({ id: 'source-1' })];

      await service.forceReprocessSource('non-existent', sources);

      expect(logger.error).toHaveBeenCalledWith('Source not found', {
        sourceId: 'non-existent',
      });
    });
  });

  describe('directory scanning', () => {
    it('should scan directory recursively', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test' });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir
        .mockResolvedValueOnce([mockDirent('file1.md', false), mockDirent('subdir', true)])
        .mockResolvedValueOnce([mockDirent('file2.md', false)]);

      await service.forceReprocessAll([source]);

      expect(fsMock.readdir).toHaveBeenCalledTimes(2);
      expect(fsMock.readdir).toHaveBeenCalledWith('/tmp/test', { withFileTypes: true });
      expect(fsMock.readdir).toHaveBeenCalledWith('/tmp/test/subdir', { withFileTypes: true });
    });

    it('should return empty array when path is not a directory', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test' });

      fsMock.stat.mockResolvedValue({ isDirectory: () => false } as fs.Stats);

      await service.forceReprocessAll([source]);

      expect(logger.warn).toHaveBeenCalledWith('Source path is not a directory', {
        path: expect.stringContaining('test'),
      });
    });

    it('should return empty array when stat fails', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test' });

      fsMock.stat.mockRejectedValue(new Error('ENOENT'));

      await service.forceReprocessAll([source]);

      expect(logger.error).toHaveBeenCalledWith('Failed to stat source path', {
        path: expect.stringContaining('test'),
        error: expect.stringContaining('ENOENT'),
      });
    });
  });

  describe('include/exclude patterns', () => {
    it('should include only files matching include patterns', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test', include: ['*.md'] });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([
        mockDirent('file1.md', false),
        mockDirent('file2.txt', false),
        mockDirent('file3.js', false),
      ]);

      await service.forceReprocessAll([source]);

      expect(logger.info).toHaveBeenCalledWith('Files found for reprocessing', {
        sourceId: 'test',
        path: '/tmp/test',
        fileCount: 1,
      });
    });

    it('should exclude files matching exclude patterns', async () => {
      const source = createSource({
        id: 'test',
        path: '/tmp/test',
        include: ['*'],
        exclude: ['**/node_modules/**'],
      });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir
        .mockResolvedValueOnce([mockDirent('file1.md', false), mockDirent('node_modules', true)])
        .mockResolvedValueOnce([mockDirent('dep.js', false)]);

      await service.forceReprocessAll([source]);

      // Only file1.md included, node_modules directory excluded
      expect(logger.info).toHaveBeenCalledWith('Files found for reprocessing', {
        sourceId: 'test',
        path: '/tmp/test',
        fileCount: 1,
      });
    });

    it('should handle wildcard include pattern', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test', include: ['*'] });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false), mockDirent('file2.txt', false)]);

      await service.forceReprocessAll([source]);

      expect(logger.info).toHaveBeenCalledWith('Files found for reprocessing', {
        sourceId: 'test',
        path: '/tmp/test',
        fileCount: 2,
      });
    });
  });

  describe('queue population', () => {
    it('should add each file to processing queue', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test' });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false), mockDirent('file2.md', false)]);

      await service.forceReprocessAll([source]);

      expect(processingQueue.addToQueue).toHaveBeenCalledTimes(2);
    });

    it('should call processFileUseCase for each queued file', async () => {
      const source = createSource({ id: 'my-source', path: '/tmp/test' });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false)]);

      processFileUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));

      await service.forceReprocessAll([source]);

      // Extract the task function and execute it
      const task = processingQueue.addToQueue.mock.calls[0][0] as () => Promise<void>;
      await task();

      expect(processFileUseCase.execute).toHaveBeenCalledWith({
        filePath: '/tmp/test/file1.md',
        eventType: 'add',
        sourceId: 'my-source',
      });
    });

    it('should log error when file reprocessing fails', async () => {
      const source = createSource({ id: 'test', path: '/tmp/test' });

      fsMock.stat.mockResolvedValue(mockStats);
      fsMock.readdir.mockResolvedValue([mockDirent('file1.md', false)]);

      processFileUseCase.execute.mockResolvedValue(Result.ko(new Error('Processing failed')));

      await service.forceReprocessAll([source]);

      const task = processingQueue.addToQueue.mock.calls[0][0] as () => Promise<void>;
      await task();

      expect(logger.error).toHaveBeenCalledWith('File reprocessing failed', {
        filePath: '/tmp/test/file1.md',
        error: 'Processing failed',
      });
    });
  });

  describe('path resolution', () => {
    it('should resolve tilde paths to home directory', async () => {
      const source = createSource({ id: 'test', path: '~/documents' });

      fsMock.stat.mockResolvedValue({ isDirectory: () => false } as fs.Stats);

      await service.forceReprocessAll([source]);

      expect(fsMock.stat).toHaveBeenCalledWith(path.join(process.env.HOME || '/home/user', 'documents'));
    });

    it('should resolve relative paths', async () => {
      const source = createSource({ id: 'test', path: './relative' });

      fsMock.stat.mockResolvedValue({ isDirectory: () => false } as fs.Stats);

      await service.forceReprocessAll([source]);

      expect(fsMock.stat).toHaveBeenCalledWith(path.resolve('./relative'));
    });
  });
});
