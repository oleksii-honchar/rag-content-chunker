import { Chunk } from '../domain/content-chunk.entity';
import { aChunk } from '../domain/content-chunk.entity.test-utils';
import { aFileMemoryTrackerService } from '../infrastructure/file-memory-tracker.service.test-utils';
import { aLogger } from '../infrastructure/logging/logger.test-utils';
import { aMnemosyneClientService } from '../infrastructure/mnemosyne-client.test-utils';
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

describe('IngestChunkUseCase', () => {
  let useCase: IngestChunkUseCase;
  let mockMnemosyneClientService: ReturnType<typeof aMnemosyneClientService>;
  let mockFileMemoryTrackerService: ReturnType<typeof aFileMemoryTrackerService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMnemosyneClientService = aMnemosyneClientService();
    mockFileMemoryTrackerService = aFileMemoryTrackerService();
    const mockLogger = aLogger();

    useCase = new IngestChunkUseCase(
      mockMnemosyneClientService as never,
      mockFileMemoryTrackerService as never,
      mockLogger as never,
    );
  });

  describe('execute', () => {
    it('should ingest all valid chunks via MnemosyneClient.remember()', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 }), aChunk({ chunkIndex: 1 })];
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-1', status: 'stored' }),
      );

      const result = await useCase.execute({ chunks, sourceId: 'test-source' });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClientService.remember).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClientService.remember).toHaveBeenCalledWith(chunks[0]);
      expect(mockMnemosyneClientService.remember).toHaveBeenCalledWith(chunks[1]);
    });

    it('should return ok when chunks array is empty', async () => {
      const result = await useCase.execute({ chunks: [], sourceId: 'test-source' });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClientService.remember).not.toHaveBeenCalled();
    });

    it('should handle partial failures without stopping all chunks', async () => {
      const chunk1 = aChunk({ chunkIndex: 0 });
      const chunk2 = aChunk({ chunkIndex: 1 });
      const chunk3 = aChunk({ chunkIndex: 2 });

      mockMnemosyneClientService.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-3', status: 'stored' }));

      const result = await useCase.execute({
        chunks: [chunk1, chunk2, chunk3],
        sourceId: 'test-source',
      });

      expect(result.isOk()).toBe(true);
      expect(mockMnemosyneClientService.remember).toHaveBeenCalledTimes(3);
    });

    it('should return error when all chunks fail', async () => {
      const chunks: Chunk[] = [aChunk({ chunkIndex: 0 }), aChunk({ chunkIndex: 1 })];
      mockMnemosyneClientService.remember.mockResolvedValue(Result.ko(new Error('Connection refused')));

      const result = await useCase.execute({ chunks, sourceId: 'test-source' });

      expect(result.isKo()).toBe(true);
      const error = result.getError();
      expect(error.message).toContain('Failed to ingest all 2 chunks');
    });

    it('should handle MnemosyneClient.remember throwing an exception', async () => {
      const chunk = aChunk({ chunkIndex: 0 });
      mockMnemosyneClientService.remember.mockRejectedValue(new Error('Network timeout'));

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
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-1', status: 'stored' }),
      );

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClientService.remember.mock.calls[0][0];
      expect(passedChunk.namespace).toBe('agent-sessions');
      expect(passedChunk.importance).toBe(0.85);
      expect(passedChunk.tags).toEqual(['meeting-notes', 'architecture']);
    });

    it('should pass enhanced chunk with importance to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ importance: 0.95 });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-1', status: 'stored' }),
      );

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClientService.remember.mock.calls[0][0];
      expect(passedChunk.importance).toBe(0.95);
    });

    it('should pass enhanced chunk with tags to MnemosyneClient.remember()', async () => {
      const enhancedChunk = aChunk({ tags: ['typescript', 'api', 'critical'] });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-1', status: 'stored' }),
      );

      await useCase.execute({ chunks: [enhancedChunk], sourceId: 'test-source' });

      const passedChunk = mockMnemosyneClientService.remember.mock.calls[0][0];
      expect(passedChunk.tags).toEqual(['typescript', 'api', 'critical']);
    });

    it('should ingest multiple enhanced chunks preserving their fields', async () => {
      const chunk1 = aChunk({ namespace: 'ns1', importance: 0.7, tags: ['a'] });
      const chunk2 = aChunk({ namespace: 'ns2', importance: 0.9, tags: ['b', 'c'] });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-1', status: 'stored' }),
      );

      await useCase.execute({ chunks: [chunk1, chunk2], sourceId: 'test-source' });

      expect(mockMnemosyneClientService.remember).toHaveBeenCalledTimes(2);
      expect(mockMnemosyneClientService.remember.mock.calls[0][0].namespace).toBe('ns1');
      expect(mockMnemosyneClientService.remember.mock.calls[1][0].namespace).toBe('ns2');
    });
  });

  describe('FileMemoryTracker integration', () => {
    it('should call trackMemory after successful MnemosyneClient.remember with correct args', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'agent-sessions' });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-abc', status: 'stored' }),
      );
      mockFileMemoryTrackerService.trackMemory.mockResolvedValue(undefined);

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenCalledTimes(1);
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenCalledWith(
        '/home/user/docs/notes.md',
        'mem-abc',
        'watch-1',
        'agent-sessions',
      );
    });

    it('should call trackMemory for each successfully ingested chunk', async () => {
      const chunk1 = aChunk({ chunkIndex: 0, namespace: 'vault' });
      const chunk2 = aChunk({ chunkIndex: 1, namespace: 'vault' });
      mockMnemosyneClientService.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-2', status: 'stored' }));
      mockFileMemoryTrackerService.trackMemory.mockResolvedValue(undefined);

      await useCase.execute({
        chunks: [chunk1, chunk2],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenCalledTimes(2);
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenNthCalledWith(
        1,
        '/home/user/docs/notes.md',
        'mem-1',
        'watch-1',
        'vault',
      );
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenNthCalledWith(
        2,
        '/home/user/docs/notes.md',
        'mem-2',
        'watch-1',
        'vault',
      );
    });

    it('should NOT call trackMemory when MnemosyneClient.remember fails', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockResolvedValue(Result.ko(new Error('MCP error')));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockFileMemoryTrackerService.trackMemory).not.toHaveBeenCalled();
    });

    it('should NOT call trackMemory when MnemosyneClient.remember throws', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockRejectedValue(new Error('Network timeout'));

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockFileMemoryTrackerService.trackMemory).not.toHaveBeenCalled();
    });

    it('should track only successful chunks when some fail', async () => {
      const chunk1 = aChunk({ chunkIndex: 0, namespace: 'vault' });
      const chunk2 = aChunk({ chunkIndex: 1, namespace: 'vault' });
      const chunk3 = aChunk({ chunkIndex: 2, namespace: 'vault' });

      mockMnemosyneClientService.remember
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-1', status: 'stored' }))
        .mockResolvedValueOnce(Result.ko(new Error('MCP error')))
        .mockResolvedValueOnce(Result.ok({ memory_id: 'mem-3', status: 'stored' }));
      mockFileMemoryTrackerService.trackMemory.mockResolvedValue(undefined);

      await useCase.execute({
        chunks: [chunk1, chunk2, chunk3],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenCalledTimes(2);
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenNthCalledWith(
        1,
        '/home/user/docs/notes.md',
        'mem-1',
        'watch-1',
        'vault',
      );
      expect(mockFileMemoryTrackerService.trackMemory).toHaveBeenNthCalledWith(
        2,
        '/home/user/docs/notes.md',
        'mem-3',
        'watch-1',
        'vault',
      );
    });

    it('should not fail ingestion when trackMemory fails', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-abc', status: 'stored' }),
      );
      mockFileMemoryTrackerService.trackMemory.mockRejectedValue(new Error('DB connection error'));

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
    });

    it('should not fail ingestion when trackMemory throws', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-abc', status: 'stored' }),
      );
      mockFileMemoryTrackerService.trackMemory.mockRejectedValue(new Error('SQLite locked'));

      const result = await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: { filePath: '/home/user/docs/notes.md' },
      });

      expect(result.isOk()).toBe(true);
    });

    it('should skip tracking when filePath is not present in metadata', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-abc', status: 'stored' }),
      );

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
        metadata: {},
      });

      expect(mockFileMemoryTrackerService.trackMemory).not.toHaveBeenCalled();
    });

    it('should skip tracking when metadata is undefined', async () => {
      const chunk = aChunk({ chunkIndex: 0, namespace: 'vault' });
      mockMnemosyneClientService.remember.mockResolvedValue(
        Result.ok({ memory_id: 'mem-abc', status: 'stored' }),
      );

      await useCase.execute({
        chunks: [chunk],
        sourceId: 'watch-1',
      });

      expect(mockFileMemoryTrackerService.trackMemory).not.toHaveBeenCalled();
    });
  });
});
