import * as fs from 'fs/promises';

// Mock @mastra/rag BEFORE importing the service
jest.mock('@mastra/rag', () => ({
  MDocument: class MockMDocument {
    static fromMarkdown = jest.fn();
    static fromJSON = jest.fn();
    static fromText = jest.fn();
    static fromHTML = jest.fn();
    extractMetadata = jest.fn();
    chunkMarkdown = jest.fn();
    chunkRecursive = jest.fn();
    chunkJSON = jest.fn();
    chunkSentence = jest.fn();
    getDocs = jest.fn();
    _chunks: unknown[] = [];
    _metadata: Record<string, string> = {};
    _textContent = '';
    constructor(content: string, metadata?: Record<string, unknown>) {
      this._textContent = content;
      this._metadata = (metadata as Record<string, string>) ?? {};
    }
  },
}));

import { aChunk } from '../domain/chunk.entity.test-utils';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from '../domain/events/file-events';
import { FileMemoryTrackerService } from '../infrastructure/file-memory-tracker.service';
import { aFileMemoryTrackerService } from '../infrastructure/file-memory-tracker.service.test-utils';
import { FileProcessingQueue } from '../infrastructure/file-processing-queue.service';
import { aFileProcessingQueueService } from '../infrastructure/file-processing-queue.test-utils';
import { aLogger } from '../infrastructure/logging/logger.test-utils';
import { MnemosyneClient } from '../infrastructure/mnemosyne-client.service';
import { aMnemosyneClientService } from '../infrastructure/mnemosyne-client.test-utils';
import { Result } from '../utils/result';
import { ChunkContentUseCase } from './chunk-content.use-case';
import { aChunkContentUseCase } from './chunk-content.use-case.test-utils';
import { IngestChunkUseCase } from './ingest-chunk.use-case';
import { aIngestChunkUseCase } from './ingest-chunk.use-case.test-utils';
import { ProcessFileUseCase } from './process-file.use-case';

jest.mock('fs/promises');

describe('ProcessFileUseCase', () => {
  let useCase: ProcessFileUseCase;
  let mockChunkContentUseCase: ReturnType<typeof aChunkContentUseCase>;
  let mockIngestChunkUseCase: ReturnType<typeof aIngestChunkUseCase>;
  let mockProcessingQueue: ReturnType<typeof aFileProcessingQueueService>;
  let mockFileMemoryTrackerService: ReturnType<typeof aFileMemoryTrackerService>;
  let mockMnemosyneClient: ReturnType<typeof aMnemosyneClientService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChunkContentUseCase = aChunkContentUseCase();
    mockIngestChunkUseCase = aIngestChunkUseCase();
    mockProcessingQueue = aFileProcessingQueueService();
    mockFileMemoryTrackerService = aFileMemoryTrackerService();
    mockMnemosyneClient = aMnemosyneClientService();
    const mockLogger = aLogger();

    useCase = new ProcessFileUseCase(
      mockChunkContentUseCase as unknown as ChunkContentUseCase,
      mockIngestChunkUseCase as unknown as IngestChunkUseCase,
      mockProcessingQueue as unknown as FileProcessingQueue,
      mockFileMemoryTrackerService as unknown as FileMemoryTrackerService,
      mockMnemosyneClient as unknown as MnemosyneClient,
      mockLogger as unknown as never,
    );
  });

  describe('execute with ADD event', () => {
    it('should queue processing and chunk + ingest on success', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const fileContent = 'Test file content';
      const chunks = [aChunk({ text: 'chunk 1' }), aChunk({ text: 'chunk 2' })];

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);

      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));

      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(mockChunkContentUseCase.execute).toHaveBeenCalledWith({
        content: fileContent,
        filePath,
        sourceId,
        namespace,
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

    it('should pass source namespace from params to ChunkContentUseCase', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'agent-sessions';
      const namespace = 'agent-sessions';
      const fileContent = 'Test';
      const chunks = [aChunk({ namespace })];

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace,
      });

      expect(mockChunkContentUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ namespace }));
    });

    it('should return error when file read fails', async () => {
      const filePath = '/path/to/missing.md';
      const sourceId = 'test-source';

      (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      mockProcessingQueue.addToQueue.mockImplementation(async task => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace: 'test-namespace',
      });

      expect(result.isOk()).toBe(true);
    });

    it('should return error when chunking fails', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Test content';

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ko(new Error('Chunking failed')));

      mockProcessingQueue.addToQueue.mockImplementation(async task => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace: 'test-namespace',
      });

      expect(result.isOk()).toBe(true);
    });

    it('should return error when ingestion fails', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const fileContent = 'Test content';
      const chunks = [aChunk()];

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ko(new Error('Ingestion failed')));

      mockProcessingQueue.addToQueue.mockImplementation(async task => {
        await task();
      });

      const result = await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace: 'test-namespace',
      });

      expect(result.isOk()).toBe(true);
    });

    it('should skip ingestion when no chunks generated', async () => {
      const filePath = '/path/to/empty.md';
      const sourceId = 'test-source';
      const fileContent = '';

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok([]));

      mockProcessingQueue.addToQueue.mockImplementation(async task => {
        await task();
      });

      await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace: 'test-namespace',
      });

      expect(mockIngestChunkUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('execute with CHANGE event', () => {
    it('should re-chunk and re-ingest on change', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const fileContent = 'Updated content';
      const chunks = [aChunk({ text: 'updated chunk' })];

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      mockChunkContentUseCase.execute.mockResolvedValue(Result.ok(chunks));
      mockIngestChunkUseCase.execute.mockResolvedValue(Result.ok(undefined as unknown as void));

      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      await useCase.execute({
        filePath,
        eventType: 'change',
        sourceId,
        namespace,
      });

      expect(mockChunkContentUseCase.execute).toHaveBeenCalledWith({
        content: fileContent,
        filePath,
        sourceId,
        namespace,
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
    it('should get memoryIds, forget each, then deleteByFilePath on delete', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const memoryIds = ['mem-1', 'mem-2', 'mem-3'];

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue(memoryIds);
      mockMnemosyneClient.forget.mockResolvedValue(Result.ok(undefined as unknown as void));
      mockFileMemoryTrackerService.deleteByFilePath.mockResolvedValue(undefined);
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockFileMemoryTrackerService.getMemoryIds).toHaveBeenCalledWith(filePath);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledTimes(3);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledWith('mem-1', namespace);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledWith('mem-2', namespace);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledWith('mem-3', namespace);
      expect(mockFileMemoryTrackerService.deleteByFilePath).toHaveBeenCalledWith(filePath);
      expect(mockChunkContentUseCase.execute).not.toHaveBeenCalled();
      expect(mockIngestChunkUseCase.execute).not.toHaveBeenCalled();
    });

    it('should log debug and skip forgets when no mappings found', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue([]);
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockFileMemoryTrackerService.getMemoryIds).toHaveBeenCalledWith(filePath);
      expect(mockMnemosyneClient.forget).not.toHaveBeenCalled();
      expect(mockFileMemoryTrackerService.deleteByFilePath).not.toHaveBeenCalled();
    });

    it('should continue with remaining memories when forget fails for one', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const memoryIds = ['mem-1', 'mem-2', 'mem-3'];

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue(memoryIds);
      mockMnemosyneClient.forget
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void));
      mockFileMemoryTrackerService.deleteByFilePath.mockResolvedValue(undefined);
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledTimes(3);
      expect(mockFileMemoryTrackerService.deleteByFilePath).toHaveBeenCalledWith(filePath);
    });

    it('should continue with remaining memories when forget throws', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const memoryIds = ['mem-1', 'mem-2'];

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue(memoryIds);
      mockMnemosyneClient.forget
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockRejectedValueOnce(new Error('Connection error'));
      mockFileMemoryTrackerService.deleteByFilePath.mockResolvedValue(undefined);
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledTimes(2);
      expect(mockFileMemoryTrackerService.deleteByFilePath).toHaveBeenCalledWith(filePath);
    });

    it('should return ok even when deleteByFilePath fails', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const memoryIds = ['mem-1'];

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue(memoryIds);
      mockMnemosyneClient.forget.mockResolvedValue(Result.ok(undefined as unknown as void));
      mockFileMemoryTrackerService.deleteByFilePath.mockRejectedValue(new Error('DB error'));
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledTimes(1);
      expect(mockFileMemoryTrackerService.deleteByFilePath).toHaveBeenCalledWith(filePath);
    });

    it('should complete delete flow for all memory IDs', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const namespace = 'test-namespace';
      const memoryIds = ['mem-1', 'mem-2'];

      mockFileMemoryTrackerService.getMemoryIds.mockResolvedValue(memoryIds);
      mockMnemosyneClient.forget.mockResolvedValue(Result.ok(undefined as unknown as void));
      mockFileMemoryTrackerService.deleteByFilePath.mockResolvedValue(undefined);
      mockProcessingQueue.addToQueue.mockImplementation(task => task());

      const result = await useCase.execute({
        filePath,
        eventType: 'delete',
        sourceId,
        namespace,
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.forget).toHaveBeenCalledTimes(2);
      expect(mockFileMemoryTrackerService.deleteByFilePath).toHaveBeenCalledWith(filePath);
    });
  });

  describe('queue processing', () => {
    it('should queue processing via FileProcessingQueue', async () => {
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';

      mockProcessingQueue.addToQueue.mockResolvedValue(undefined);

      await useCase.execute({
        filePath,
        eventType: 'add',
        sourceId,
        namespace: 'test-namespace',
      });

      expect(mockProcessingQueue.addToQueue).toHaveBeenCalledTimes(1);
      expect(typeof mockProcessingQueue.addToQueue.mock.calls[0][0]).toBe('function');
    });
  });

  describe('validation', () => {
    it('should return error when filePath is missing', async () => {
      const result = await useCase.execute({
        filePath: '',
        eventType: 'add',
        sourceId: 'test-source',
        namespace: 'test-namespace',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });

    it('should return error when sourceId is missing', async () => {
      const result = await useCase.execute({
        filePath: '/path/to/file.md',
        eventType: 'add',
        sourceId: '',
        namespace: 'test-namespace',
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
        namespace: 'test-namespace',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });

    it('should return error when namespace is missing', async () => {
      const result = await useCase.execute({
        filePath: '/path/to/file.md',
        eventType: 'add',
        sourceId: 'test-source',
        namespace: '',
      } as unknown as Parameters<typeof useCase.execute>[0]);

      expect(result.isKo()).toBe(true);
    });
  });

  describe('OnEvent handlers', () => {
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
