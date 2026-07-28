import { ProcessFileUseCase } from './process-file.use-case';
import { ChunkContentUseCase } from './chunk-content.use-case';
import { IngestChunkUseCase } from './ingest-chunk.use-case';
import { FileProcessingQueue } from '../../../infrastructure/queue/file-processing-queue.service';
import { Result } from '../../../utils/result';
import { BasePinoLogger } from '../../../infrastructure/logging/base-pino-logger';
import { aChunk } from '../entities/chunk.test-utils';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from '../events/file-events';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

type MockFn = jest.Mock;

interface MockChunkContentUseCase {
  execute: MockFn;
}

interface MockIngestChunkUseCase {
  execute: MockFn;
}

interface MockProcessingQueue {
  addToQueue: MockFn;
}

interface MockLogger {
  info: MockFn;
  error: MockFn;
  debug: MockFn;
  warn: MockFn;
  child: MockFn;
  setContext: MockFn;
  log: MockFn;
}

describe('ProcessFileUseCase', () => {
  let useCase: ProcessFileUseCase;
  let mockChunkContentUseCase: MockChunkContentUseCase;
  let mockIngestChunkUseCase: MockIngestChunkUseCase;
  let mockProcessingQueue: MockProcessingQueue;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChunkContentUseCase = {
      execute: jest.fn(),
    };

    mockIngestChunkUseCase = {
      execute: jest.fn(),
    };

    mockProcessingQueue = {
      addToQueue: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      child: jest.fn(),
      setContext: jest.fn(),
      log: jest.fn(),
    };

    mockLogger.child.mockReturnValue(mockLogger);
  });

  describe('execute with ADD event', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('should queue processing and chunk + ingest on success', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Test file content';
      const chunks = [aChunk({ text: 'chunk 1' }), aChunk({ text: 'chunk 2' })];

      (fs.readFile as MockFn).mockResolvedValue(fileContent);

      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));

      mockProcessingQueue.addToQueue.mockImplementation((task) => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(mockChunkContentUseCase.execute).toHaveBeenCalledWith({
        content: fileContent,
        filePath,
        sourceId,
      });
      expect(mockIngestChunkUseCase.execute).toHaveBeenCalledWith({
        chunks,
        sourceId,
        metadata: {
          filePath,
          eventType: 'add',
        },
      });
    });

    it('should return error when file read fails', async () => {
      const filePath = '/path/to/missing.md';
      const sourceId = 'test-source';

      (fs.readFile as MockFn).mockRejectedValue(new Error('ENOENT'));

      mockProcessingQueue.addToQueue.mockImplementation(async (task) => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to read file', expect.any(Object));
    });

    it('should return error when chunking fails', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Test content';

      (fs.readFile as MockFn).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ko(new Error('Chunking failed')));

      mockProcessingQueue.addToQueue.mockImplementation(async (task) => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to chunk content', expect.any(Object));
    });

    it('should return error when ingestion fails', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Test content';
      const chunks = [aChunk()];

      (fs.readFile as MockFn).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ko(new Error('Ingestion failed')));

      mockProcessingQueue.addToQueue.mockImplementation(async (task) => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to ingest chunks', expect.any(Object));
    });

    it('should skip ingestion when no chunks generated', async () => {
      const filePath = '/path/to/empty.md';
      const sourceId = 'test-source';
      const fileContent = '';

      (fs.readFile as MockFn).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok([]));

      mockProcessingQueue.addToQueue.mockImplementation(async (task) => {
        await task();
      });

      await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(mockIngestChunkUseCase.execute).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('No chunks generated', { filePath });
    });
  });

  describe('execute with CHANGE event', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('should re-chunk and re-ingest on change', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Updated content';
      const chunks = [aChunk({ text: 'updated chunk' })];

      (fs.readFile as MockFn).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));

      mockProcessingQueue.addToQueue.mockImplementation((task) => task());

      await useCase.execute({
        filePath,
        eventType: 'change',
        sourceId,
      });

      expect(mockChunkContentUseCase.execute).toHaveBeenCalledWith({
        content: fileContent,
        filePath,
        sourceId,
      });
      expect(mockIngestChunkUseCase.execute).toHaveBeenCalledWith({
        chunks,
        sourceId,
        metadata: {
          filePath,
          eventType: 'change',
        },
      });
    });
  });

  describe('execute with DELETE event', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('should log only without chunking or ingestion', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';

      mockProcessingQueue.addToQueue.mockImplementation((task) => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('File deleted', {
        filePath,
        sourceId,
      });
      expect(mockChunkContentUseCase.execute).not.toHaveBeenCalled();
      expect(mockIngestChunkUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('queue processing', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('should queue processing via FileProcessingQueue', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';

      mockProcessingQueue.addToQueue.mockResolvedValue(undefined);

      await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
      });

      expect(mockProcessingQueue.addToQueue).toHaveBeenCalledTimes(1);
      expect(typeof mockProcessingQueue.addToQueue.mock.calls[0][0]).toBe('function');
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('should return error when filePath is missing', async () => {
      const result = await useCase.execute({
        filePath: '',
        eventType: 'add',
        sourceId: 'test-source',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });

    it('should return error when sourceId is missing', async () => {
      const result = await useCase.execute({
        filePath: '/path/to/file.md',
        eventType: 'add',
        sourceId: '',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });

    it('should return error when eventType is invalid', async () => {
      const result = await useCase.execute({
        filePath: '/path/to/file.md',
        eventType: 'invalid' as 'add',
        sourceId: 'test-source',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });
  });

  describe('OnEvent handlers', () => {
    beforeEach(() => {
      useCase = new ProcessFileUseCase(
        mockChunkContentUseCase as unknown as ChunkContentUseCase,
        mockIngestChunkUseCase as unknown as IngestChunkUseCase,
        mockProcessingQueue as unknown as FileProcessingQueue,
        mockLogger as unknown as BasePinoLogger,
      );
    });

    it('handleFileAdded should trigger execute with add event type', async () => {
      const filePath = '/path/to/file.md';
      const event = FileAddedEvent.of(filePath).getValue();

      mockProcessingQueue.addToQueue.mockResolvedValue(undefined);

      await useCase.handleFileAdded(event);

      expect(mockProcessingQueue.addToQueue).toHaveBeenCalledTimes(1);
    });

    it('handleFileChanged should trigger execute with change event type', async () => {
      const filePath = '/path/to/file.md';
      const event = FileChangedEvent.of(filePath).getValue();

      mockProcessingQueue.addToQueue.mockResolvedValue(undefined);

      await useCase.handleFileChanged(event);

      expect(mockProcessingQueue.addToQueue).toHaveBeenCalledTimes(1);
    });

    it('handleFileDeleted should trigger execute with delete event type', async () => {
      const filePath = '/path/to/file.md';
      const event = FileDeletedEvent.of(filePath).getValue();

      mockProcessingQueue.addToQueue.mockResolvedValue(undefined);

      await useCase.handleFileDeleted(event);

      expect(mockProcessingQueue.addToQueue).toHaveBeenCalledTimes(1);
    });
  });
});
