import { Chunk } from '../domain/chunk.entity';
import { aChunk } from '../domain/chunk.entity.test-utils';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { Result } from '../utils/result';
import { IngestChunkUseCase } from './ingest-chunk.use-case';

// Mock MnemosyneClient module to avoid chokidar ESM import chain
jest.mock('../infrastructure/mnemosyne-client.service', () => ({
  MnemosyneClient: class MnemosyneClientMock {},
}));

// Mock FileMemoryTrackerService
jest.mock('../infrastructure/file-memory-tracker.service', () => ({
  FileMemoryTrackerService: class FileMemoryTrackerServiceMock {},
}));

// MnemosyneClient is mocked via jest.mock in app.module.test.ts pattern

interface RememberResult {
  memory_id: string;
  status: string;
}

interface MockMnemosyneClient {
  remember: jest.Mock<Promise<Result<RememberResult>>, [chunk: Chunk]>;
}

interface MockLogger {
  info: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  warn: jest.Mock;
  child: jest.Mock;
  setContext: jest.Mock;
  log: jest.Mock;
}

interface MockFileMemoryTrackerService {
  remember: jest.Mock<
    Promise<void>,
    [filePath: string, memoryId: string, sourceId: string, namespace: string]
  >;
}

describe('IngestChunkUseCase', () => {
  let useCase: IngestChunkUseCase;
  let mockMnemosyneClient: MockMnemosyneClient;
  let mockTracker: MockFileMemoryTrackerService;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMnemosyneClient = {
      remember: jest.fn(),
    };

    mockTracker = {
      remember: jest.fn(),
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

    useCase = new IngestChunkUseCase(
      mockMnemosyneClient as never,
      mockTracker as never,
      mockLogger as unknown as BasePinoLogger,
    );
  });

  describe('execute', () => {
    it('should ingest all valid chunks via MnemosyneClient.remember()', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 }), aChunk({ chunkIndex: 1 })];
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-1', status: 'stored' }));

      const result = await useCase.execute({ chunks, sourceId: 'test-source' });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.remember).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClient.remember).toHaveBeenCalledWith(chunks[0]);
      expect(mockMnemosyneClient.remember).toHaveBeenCalledWith(chunks[1]);
    });

    it('should return ok when chunks array is empty', async () => {
      const result = await useCase.execute({ chunks: [], sourceId: 'test-source' });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.remember).not.toHaveBeenCalled();
    });

    it('should handle partial failures without stopping all chunks', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });
      const chunk3 = aChunk({ chunkIndex: 2 });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-3', status: 'stored' }));

      const result = await useCase.execute({
        chunks: [chunk1, chunk2, chunk3],
        sourceId: 'test-source',
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClient.remember).toHaveBeenCalledTimes(3);
    });

    it('should return error when all chunks fail', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 }), aChunk({ chunkIndex: 1 })];
      mockMnemosyneClient.remember.mockResolvedValue(Result.ko(new Error('Connection refused')));

      const result = await useCase.execute({ chunks, sourceId: 'test-source' });

      expect(result.isKo()).toBe(true);
      const error = result.getError();
      expect(error.message).toContain('Failed to ingest all 2 chunks');
    });

    it('should handle MnemosyneClient.remember throwing an exception', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClient.remember.mockRejectedValue(new Error('Network timeout'));

      const result = await useCase.execute({ chunks: [chunk], sourceId: 'test-source' });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when params are invalid', async () => {
      const result = await useCase.execute({ chunks: [], sourceId: '' });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('enhanced chunk fields', () => {
    it('should pass enhanced chunk with namespace to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({
        namespace: 'agent-sessions',
        importance: 0.85,
        tags: ['meeting-notes', 'architecture'],
      });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-1', status: 'stored' }));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.namespace).toBe('agent-sessions');
      expect(passedChunk.importance).toBe(0.85);
      expect(passedChunk.tags).toEqual(['meeting-notes', 'architecture']);
    });

    it('should pass enhanced chunk with importance to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ importance: 0.95 });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-1', status: 'stored' }));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.importance).toBe(0.95);
    });

    it('should pass enhanced chunk with tags to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ tags: ['typescript', 'api', 'critical'] });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-1', status: 'stored' }));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.tags).toEqual(['typescript', 'api', 'critical']);
    });

    it('should ingest multiple enhanced chunks preserving their fields', async () => {
      const chunk1 = aChunk({ namespace: 'ns1', importance: 0.7, tags: ['a'] });
      const chunk2 = aChunk({ namespace: 'ns2', importance: 0.9, tags: ['b', 'c'] });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-1', status: 'stored' }));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockMnemosyneClient.remember).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClient.remember.mock.calls[0][0].namespace).toBe('ns1');
      expect(mockMnemosyneClient.remember.mock.calls[1][0].namespace).toBe('ns2');
    });
  });

  describe('FileMemoryTracker integration', () => {
    it('should call remember after successful remember with correct args', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'agent-sessions' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-abc', status: 'stored' }));
      mockTracker.remember.mockResolvedValue(undefined);

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
      expect(mockTracker.remember).toHaveBeenCalledTimes(1);
      expect(mockTracker.remember).toHaveBeenCalledWith(
        '/home/user/docs/notes.md',
        'mem-abc',
        'watch-1',
        'agent-sessions',
      );
    });

    it('should call remember for each successfully ingested chunk', async () => {
      const chunk1 = aChunk({ chunkIndex: 0, namespace: 'vault' });
      const chunk2 = aChunk({ chunkIndex: 1, namespace: 'vault' });
      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-2', status: 'stored' }));
      mockTracker.remember.mockResolvedValue(undefined);

      await useCase.execute({
        chunks: [chunk1, chunk2],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockTracker.remember).toHaveBeenCalledTimes(2);
      expect(mockTracker.remember).toHaveBeenNthCalledWith(
        1,
        '/home/user/docs/notes.md',
        'mem-1',
        'watch-1',
        'vault',
      );
      expect(mockTracker.remember).toHaveBeenNthCalledWith(
        2,
        '/home/user/docs/notes.md',
        'mem-2',
        'watch-1',
        'vault',
      );
    });

    it('should NOT call remember when remember fails', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ko(new Error('MCP error')));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockTracker.remember).not.toHaveBeenCalled();
    });

    it('should NOT call remember when remember throws', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockRejectedValue(new Error('Network timeout'));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockTracker.remember).not.toHaveBeenCalled();
    });

    it('should track only successful chunks when some fail', async () => {
      const chunk1 = aChunk({ chunkIndex: 0, namespace: 'vault' });
      const chunk2 = aChunk({ chunkIndex: 1, namespace: 'vault' });
      const chunk3 = aChunk({ chunkIndex: 2, namespace: 'vault' });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-3', status: 'stored' }));
      mockTracker.remember.mockResolvedValue(undefined);

      await useCase.execute({
        chunks: [chunk1, chunk2, chunk3],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockTracker.remember).toHaveBeenCalledTimes(2);
      expect(mockTracker.remember).toHaveBeenNthCalledWith(
        1,
        '/home/user/docs/notes.md',
        'mem-1',
        'watch-1',
        'vault',
      );
      expect(mockTracker.remember).toHaveBeenNthCalledWith(
        2,
        '/home/user/docs/notes.md',
        'mem-3',
        'watch-1',
        'vault',
      );
    });

    it('should not fail ingestion when remember fails', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-abc', status: 'stored' }));
      mockTracker.remember.mockRejectedValue(new Error('DB connection error'));

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
    });

    it('should not fail ingestion when remember throws', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-abc', status: 'stored' }));
      mockTracker.remember.mockRejectedValue(new Error('SQLite locked'));

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
    });

    it('should skip tracking when filePath is not present in metadata', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-abc', status: 'stored' }));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: {},
      });

      expect(mockTracker.remember).not.toHaveBeenCalled();
    });

    it('should skip tracking when metadata is undefined', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok({ memory_id: 'mem-abc', status: 'stored' }));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
      });

      expect(mockTracker.remember).not.toHaveBeenCalled();
    });
  });
});
