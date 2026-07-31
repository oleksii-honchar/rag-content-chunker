import { Chunk } from '../domain/chunk.entity';
import { aChunk } from '../domain/chunk.entity.test-utils';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { Result } from '../utils/result';
import { IngestChunkUseCase } from './ingest-chunk.use-case';

// Mock MnemosyneClient module to avoid chokidar ESM import chain
jest.mock('../infrastructure/mnemosyne-client.service', () => ({
  MnemosyneClient: class MnemosyneClientMock {},
}));

const _mockMnemosyne = jest.requireMock('../infrastructure/mnemosyne-client.service') as {
  MnemosyneClient: unknown;
};

interface MockMnemosyneClient {
  remember: jest.Mock<Promise<Result<void>>, [chunk: Chunk]>;
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

describe('IngestChunkUseCase', () => {
  let useCase: IngestChunkUseCase;
  let mockMnemosyneClient: MockMnemosyneClient;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMnemosyneClient = {
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

    useCase = new IngestChunkUseCase(mockMnemosyneClient as never, mockLogger as unknown as BasePinoLogger);
  });

  describe('execute', () => {
    it('should ingest all valid chunks via MnemosyneClient.remember()', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 }), aChunk({ chunkIndex: 1 })];
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

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
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void));

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

    it('should log success count per chunk', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 })];
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

      await useCase.execute({ chunks, sourceId: 'test-source' });

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('ingested'));
    });

    it('should log failure count per chunk', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk], sourceId: 'test-source' });

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ingestion'));
    });

    it('should log completion summary with success/failure counts', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ingestion'));
    });

    it('should warn on partial ingestion failure', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ingestion'));
    });

    it('should handle MnemosyneClient.remember throwing an exception', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClient.remember.mockRejectedValue(new Error('Network timeout'));

      const result = await useCase.execute({ chunks: [chunk], sourceId: 'test-source' });

      expect(result.isKo()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ingestion'));
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
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.namespace).toBe('agent-sessions');
      expect(passedChunk.importance).toBe(0.85);
      expect(passedChunk.tags).toEqual(['meeting-notes', 'architecture']);
    });

    it('should pass enhanced chunk with importance to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ importance: 0.95 });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.importance).toBe(0.95);
    });

    it('should pass enhanced chunk with tags to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ tags: ['typescript', 'api', 'critical'] });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClient.remember.mock.calls[0][0];
      expect(passedChunk.tags).toEqual(['typescript', 'api', 'critical']);
    });

    it('should ingest multiple enhanced chunks preserving their fields', async () => {
      const chunk1 = aChunk({ namespace: 'ns1', importance: 0.7, tags: ['a'] });
      const chunk2 = aChunk({ namespace: 'ns2', importance: 0.9, tags: ['b', 'c'] });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ok(undefined as unknown as void));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockMnemosyneClient.remember).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClient.remember.mock.calls[0][0].namespace).toBe('ns1');
      expect(mockMnemosyneClient.remember.mock.calls[1][0].namespace).toBe('ns2');
    });
  });
});
