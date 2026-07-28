import { Chunk } from './domain/entities/chunk.entity';
import { aChunk } from './domain/entities/chunk.test-utils';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';
import { IngestChunkUseCase } from './ingest-chunk.use-case';
import { Result } from './utils/result';

// Mock MnemosyneClient module to avoid chokidar ESM import chain
jest.mock('./infrastructure/mcp/mnemosyne-client.service', () => ({
  MnemosyneClient: class MnemosyneClientMock {},
}));

const { MnemosyneClient } = jest.requireMock('./infrastructure/mcp/mnemosyne-client.service') as {
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

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Chunk ingested',
        expect.objectContaining({
          chunkId: chunks[0].id,
          chunkIndex: 0,
        }),
      );
    });

    it('should log failure count per chunk', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClient.remember.mockResolvedValue(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk], sourceId: 'test-source' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chunk ingestion failed',
        expect.objectContaining({
          chunkId: chunk.id,
          error: 'MCP error',
        }),
      );
    });

    it('should log completion summary with success/failure counts', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chunk ingestion completed',
        expect.objectContaining({
          sourceId: 'test-source',
          totalChunks: 2,
          successCount: 1,
          failureCount: 1,
        }),
      );
    });

    it('should warn on partial ingestion failure', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });

      mockMnemosyneClient.remember
        .mockResolvedValueOnce(Result.ok(undefined as unknown as void))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')));

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockLogger.warn).toHaveBeenCalledWith('Partial chunk ingestion failure', expect.any(Object));
    });

    it('should handle MnemosyneClient.remember throwing an exception', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClient.remember.mockRejectedValue(new Error('Network timeout'));

      const result = await useCase.execute({ chunks: [chunk], sourceId: 'test-source' });

      expect(result.isKo()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('Chunk ingestion threw', expect.any(Object));
    });

    it('should return error when params are invalid', async () => {
      const result = await useCase.execute({ chunks: [], sourceId: '' });

      expect(result.isKo()).toBe(true);
    });
  });
});
