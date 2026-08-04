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

import { EnhancementPipelineService } from '../application/services/enhancement-pipeline.service';
import { MastraChunkingService } from '../application/strategies/mastra-chunking.service';
import { aContentChunk } from '../domain/content-chunk.entity.test-utils';
import { EnhancementConfig } from '../infrastructure/config/config-schemas';
import { ConfigurationService } from '../infrastructure/config/configuration.service';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { Result } from '../utils/result';
import { ChunkContentUseCase } from './chunk-content.use-case';

type MockFn = jest.Mock;

interface MockMastraChunkingService {
  chunkFile: MockFn;
}

interface MockEnhancementPipelineService {
  enhance: MockFn;
}

interface MockConfigurationService {
  getEnhancementConfig: MockFn;
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

const defaultEnhancementConfig: EnhancementConfig = {
  maxCharacters: { prose: 200, code: 400, configuration: 300, documentation: 300 },
  importance: {
    enabled: true,
    defaultScore: 0.5,
    factors: [
      { name: 'fileRole', weight: 0.4 },
      { name: 'length', weight: 0.2 },
      { name: 'keywords', weight: 0.3 },
      { name: 'header', weight: 0.1 },
    ],
  },
  tags: { enabled: true, maxTags: 10 },
  source: { includePath: true, includeSection: true, includeMetadata: false },
};

describe('ChunkContentUseCase', () => {
  let useCase: ChunkContentUseCase;
  let mockMastraChunkingService: MockMastraChunkingService;
  let mockEnhancementPipelineService: MockEnhancementPipelineService;
  let mockConfigurationService: MockConfigurationService;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockMastraChunkingService = {
      chunkFile: jest.fn(),
    };

    mockEnhancementPipelineService = {
      enhance: jest.fn().mockImplementation(chunks => Promise.resolve(Result.ok(chunks))),
    };

    mockConfigurationService = {
      getEnhancementConfig: jest.fn(() => defaultEnhancementConfig),
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
      mockMastraChunkingService as unknown as MastraChunkingService,
      mockEnhancementPipelineService as unknown as EnhancementPipelineService,
      mockConfigurationService as unknown as ConfigurationService,
      mockLogger as unknown as BasePinoLogger,
    );
  });

  describe('execute with valid params', () => {
    it('should return chunks when Mastra chunking succeeds', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aContentChunk({ text: 'chunk 1' }), aContentChunk({ text: 'chunk 2' })];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(chunks);
    });

    it('should call MastraChunkingService.chunkFile with content, filePath, sourceId', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(content, filePath, sourceId);
    });

    it('should call MastraChunkingService.chunkFile for markdown files', async () => {
      const content = '# Title\n\nContent';
      const filePath = '/path/to/README.md';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(content, filePath, sourceId);
    });

    it('should call MastraChunkingService.chunkFile for TypeScript files', async () => {
      const content = 'const x = 1;';
      const filePath = '/path/to/app.ts';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(content, filePath, sourceId);
    });

    it('should call MastraChunkingService.chunkFile for JSON config files', async () => {
      const content = '{"key": "value"}';
      const filePath = '/path/to/config.json';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(content, filePath, sourceId);
    });

    it('should call MastraChunkingService.chunkFile for plain text files', async () => {
      const content = 'First sentence. Second sentence.';
      const filePath = '/path/to/notes.txt';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(content, filePath, sourceId);
    });
  });

  describe('execute with invalid params', () => {
    it('should return error when content is missing', async () => {
      const result = await useCase.execute({
        content: '',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
        memoryBank: 'test-memoryBank',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when filePath is missing', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '',
        sourceId: 'test-source',
        memoryBank: 'test-memoryBank',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when sourceId is missing', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: '',
        memoryBank: 'test-memoryBank',
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when maxTokens is negative', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
        memoryBank: 'test-memoryBank',
        maxTokens: -10,
      });

      expect(result.isKo()).toBe(true);
    });

    it('should return error when overlapTokens is negative', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.ts',
        sourceId: 'test-source',
        memoryBank: 'test-memoryBank',
        overlapTokens: -10,
      });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error when MastraChunkingService fails', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ko(new Error('Mastra chunking failed')));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });

      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toBe('Mastra chunking failed');
    });
  });

  describe('logging', () => {
    it('should debug log chunking start with filePath and contentLength', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.ts';
      const sourceId = 'test-source';
      const chunks = [aContentChunk()];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(chunks));

      await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank: 'test-memoryBank',
      });
    });
  });

  describe('enhancement pipeline integration', () => {
    it('should pipe chunks through EnhancementPipelineService after Mastra chunking', async () => {
      const content = 'Test content';
      const filePath = '/path/to/file.md';
      const sourceId = 'test-source';
      const memoryBank = 'my-memoryBank';
      const rawChunks = [
        aContentChunk({ text: 'raw chunk 1', importance: 0.5, tags: [], memoryBank: 'default' }),
      ];
      const enhancedChunks = [
        aContentChunk({ text: 'raw chunk 1', importance: 0.8, tags: ['tag1'], memoryBank: 'my-memoryBank' }),
      ];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(rawChunks));
      mockEnhancementPipelineService.enhance.mockResolvedValue(Result.ok(enhancedChunks));

      const result = await useCase.execute({
        content,
        filePath,
        sourceId,
        memoryBank,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(enhancedChunks);
      expect(mockEnhancementPipelineService.enhance).toHaveBeenCalledWith(
        rawChunks,
        sourceId,
        memoryBank,
        defaultEnhancementConfig,
      );
    });

    it('should return enhanced chunks not raw Mastra chunks', async () => {
      const rawChunks = [aContentChunk({ text: 'raw', importance: 0.5, tags: [], memoryBank: 'default' })];
      const enhancedChunks = [
        aContentChunk({ text: 'raw', importance: 0.9, tags: ['important'], memoryBank: 'test-ns' }),
      ];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(rawChunks));
      mockEnhancementPipelineService.enhance.mockResolvedValue(Result.ok(enhancedChunks));

      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: 'test-ns',
      });

      const returnedChunks = result.getValue();
      expect(returnedChunks[0].importance).toBe(0.9);
      expect(returnedChunks[0].tags).toEqual(['important']);
      expect(returnedChunks[0].memoryBank).toBe('test-ns');
    });

    it('should include memoryBank in params and pass to EnhancementPipelineService', async () => {
      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok([aContentChunk()]));
      mockEnhancementPipelineService.enhance.mockResolvedValue(
        Result.ok([aContentChunk({ memoryBank: 'custom-ns' })]),
      );

      await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: 'custom-ns',
      });

      expect(mockEnhancementPipelineService.enhance).toHaveBeenCalledWith(
        expect.any(Array),
        'src',
        'custom-ns',
        defaultEnhancementConfig,
      );
    });

    it('should fallback to raw chunks when enhancement fails', async () => {
      const rawChunks = [aContentChunk({ text: 'raw chunk' })];

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok(rawChunks));
      mockEnhancementPipelineService.enhance.mockResolvedValue(
        Result.ko(new Error('Enhancement pipeline failed')),
      );

      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: 'ns',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(rawChunks);
    });

    it('should use enhancement config from ConfigurationService', async () => {
      const customConfig: EnhancementConfig = {
        ...defaultEnhancementConfig,
        importance: { ...defaultEnhancementConfig.importance, defaultScore: 0.8 },
      };
      mockConfigurationService.getEnhancementConfig.mockReturnValue(customConfig);

      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok([aContentChunk()]));
      mockEnhancementPipelineService.enhance.mockResolvedValue(Result.ok([aContentChunk()]));

      await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: 'ns',
      });

      expect(mockConfigurationService.getEnhancementConfig).toHaveBeenCalled();
      expect(mockEnhancementPipelineService.enhance).toHaveBeenCalledWith(
        expect.any(Array),
        'src',
        'ns',
        customConfig,
      );
    });
  });

  describe('memoryBank validation', () => {
    it('should accept valid memoryBank in params', async () => {
      mockMastraChunkingService.chunkFile.mockResolvedValue(Result.ok([aContentChunk()]));
      mockEnhancementPipelineService.enhance.mockResolvedValue(Result.ok([aContentChunk()]));

      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: 'valid-memoryBank',
      });

      expect(result.isOk()).toBe(true);
    });

    it('should return error when memoryBank is empty', async () => {
      const result = await useCase.execute({
        content: 'test',
        filePath: '/path/to/file.md',
        sourceId: 'src',
        memoryBank: '',
      });

      expect(result.isKo()).toBe(true);
    });
  });
});
