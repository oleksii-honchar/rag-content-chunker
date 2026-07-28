import { StrategyFactory } from './application/strategies/strategy-factory.service';
import { ChunkContentUseCase } from './chunk-content.use-case';
import { aChunk } from './domain/entities/chunk.test-utils';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';
import { Result } from './utils/result';

type MockFn = jest.Mock;

interface MockStrategyFactory {
  determineStrategy: MockFn;
  createChunker: MockFn;
}

interface MockChunker {
  chunk: MockFn;
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

describe('ChunkContentUseCase', () => {
  let useCase: ChunkContentUseCase;
  let mockStrategyFactory: MockStrategyFactory;
  let mockChunker: MockChunker;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockChunker = {
      chunk: jest.fn(),
    };

    mockStrategyFactory = {
      determineStrategy: jest.fn(),
      createChunker: jest.fn(),
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

    // child must return itself so BaseUseCase can chain calls
    mockLogger.child.mockReturnValue(mockLogger);

    useCase = new ChunkContentUseCase(
      mockStrategyFactory as unknown as StrategyFactory,
      mockLogger as unknown as BasePinoLogger,
    );
  });

  describe('execute with valid params', () => {
    it('should return chunks when chunking succeeds', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk({ text: 'chunk 1' }), aChunk({ text: 'chunk 2' })];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(chunks);
    });

    it('should use default token values when not provided', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('markdown');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockChunker.chunk).toHaveBeenCalledWith(content, {
        maxTokens: 500,
        overlapTokens: 50,
        hardCapTokens: 600,
        filePath,
        sourceId,
      });
    });

    it('should use custom token values when provided', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        maxTokens: 1000,
        overlapTokens: 100,
        hardCapTokens: 1200,
      });

      expect(mockChunker.chunk).toHaveBeenCalledWith(content, {
        maxTokens: 1000,
        overlapTokens: 100,
        hardCapTokens: 1200,
        filePath,
        sourceId,
      });
    });
  });

  describe('execute with invalid params', () => {
    it('should return error when content is missing', async () => {
      const result = await useCase.execute({
        content: '',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when filePath is missing', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '',
        sourceId: 'test-source',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when sourceId is missing', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: '',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when maxTokens is negative', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
        maxTokens: -10,
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when overlapTokens is negative', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
        overlapTokens: -10,
      });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('strategy delegation', () => {
    it('should delegate to correct strategy based on file extension', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('markdown');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockStrategyFactory.determineStrategy).toHaveBeenCalledWith(filePath);
      expect(mockStrategyFactory.createChunker).toHaveBeenCalledWith('markdown');
    });

    it('should use recursive strategy for TypeScript files', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockStrategyFactory.createChunker).toHaveBeenCalledWith('recursive');
    });

    it('should use config strategy for JSON files', async () => {
      const content = '{"key": "value"}';
      const filePath = '/path/to/config.json';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('config');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockStrategyFactory.createChunker).toHaveBeenCalledWith('config');
    });
  });

  describe('error handling', () => {
    it('should return error when chunker fails', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ko(new Error('Chunking failed')));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toBe('Chunking failed');
    });

    it('should return error when createChunker fails', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ko(new Error('No chunker available')));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toBe('No chunker available');
    });
  });

  describe('logging', () => {
    it('should debug log chunking start with filePath and contentLength', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Chunking content', {
        filePath,
        contentLength: content.length,
      });
    });

    it('should debug log strategy selection', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk()];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Using chunking strategy', {
        strategy: 'recursive',
        filePath,
      });
    });

    it('should info log successful chunking with chunkCount', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aChunk({ text: 'chunk 1' }), aChunk({ text: 'chunk 2' })];

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Content chunked', {
        filePath,
        chunkCount: 2,
      });
    });

    it('should error log when chunking fails', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ok(mockChunker));
      mockChunker.chunk.mockResolvedValue(Result.ko(new Error('Chunking failed')));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Chunking failed', {
        error: 'Chunking failed',
        filePath,
      });
    });

    it('should error log when createChunker fails', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';

      mockStrategyFactory.determineStrategy.mockReturnValue('recursive');
      mockStrategyFactory.createChunker.mockReturnValue(Result.ko(new Error('No chunker available')));

      await useCase.execute({
        content,
        filePath,
        sourceId,
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create chunker', {
        error: 'No chunker available',
        strategy: 'recursive',
      });
    });
  });
});
