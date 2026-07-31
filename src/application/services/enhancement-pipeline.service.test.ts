import { Test, TestingModule } from '@nestjs/testing';
import { Chunk, FILE_ROLES, FileRole } from '../../domain/chunk.entity';
import { EnhancementConfig } from '../../infrastructure/config/config-schemas';
import { BasePinoLogger } from '../../infrastructure/logging/base-pino-logger';
import { EnhancementPipelineService } from './enhancement-pipeline.service';
import { ImportanceScoringService } from './importance-scoring.service';
import { TagExtractionService } from './tag-extraction.service';

describe('EnhancementPipelineService', () => {
  let service: EnhancementPipelineService;
  let importanceScoringService: jest.Mocked<ImportanceScoringService>;
  let tagExtractionService: jest.Mocked<TagExtractionService>;
  let logger: jest.Mocked<BasePinoLogger>;

  const defaultConfig: EnhancementConfig = {
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

  const createChunk = (
    overrides?: Partial<{
      id: string;
      text: string;
      fileRole: FileRole;
      sectionHeader: string;
      namespace: string;
      importance: number;
      tags: string[];
      language?: string;
    }>,
  ) => {
    const props = {
      id: crypto.randomUUID(),
      text: 'Test chunk content',
      chunkIndex: 0,
      totalChunks: 1,
      sectionHeader: 'Test Section',
      breadcrumb: 'root > test',
      fileRole: FILE_ROLES.DOCS,
      oversized: false,
      metadata: {},
      importance: 0.5,
      tags: [],
      namespace: 'default',
      ...overrides,
    };
    return Chunk.of(props).getValue();
  };

  const mockLogger: jest.Mocked<BasePinoLogger> = {
    setContext: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    importanceScoringService = {
      score: jest.fn().mockReturnValue(0.75),
    } as unknown as jest.Mocked<ImportanceScoringService>;

    tagExtractionService = {
      extract: jest.fn().mockReturnValue(['tag1', 'tag2']),
    } as unknown as jest.Mocked<TagExtractionService>;

    logger = mockLogger as jest.Mocked<BasePinoLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancementPipelineService,
        { provide: ImportanceScoringService, useValue: importanceScoringService },
        { provide: TagExtractionService, useValue: tagExtractionService },
        { provide: BasePinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get<EnhancementPipelineService>(EnhancementPipelineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enhance', () => {
    describe('happy path', () => {
      it('should return Result.ok with enhanced chunks', async () => {
        const chunks = [createChunk(), createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks).toHaveLength(2);
      });

      it('should apply importance scoring to each chunk', async () => {
        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(importanceScoringService.score).toHaveBeenCalledWith(chunks[0], defaultConfig);
        expect(importanceScoringService.score).toHaveBeenCalledTimes(1);

        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].importance).toBe(0.75);
      });

      it('should apply tag extraction to each chunk', async () => {
        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(tagExtractionService.extract).toHaveBeenCalledWith(chunks[0], defaultConfig);
        expect(tagExtractionService.extract).toHaveBeenCalledTimes(1);

        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].tags).toEqual(['tag1', 'tag2']);
      });

      it('should set namespace from provided parameter', async () => {
        const chunks = [createChunk({ namespace: 'original' })];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].namespace).toBe('my-namespace');
      });

      it('should preserve original chunk properties', async () => {
        const original = createChunk({
          text: 'Original text',
          fileRole: FILE_ROLES.CODE,
          sectionHeader: '## Code Section',
          language: 'typescript',
        });
        const chunks = [original];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        const enhancedChunks = result.getValue();
        const enhanced = enhancedChunks[0];
        expect(enhanced.id).toBe(original.id);
        expect(enhanced.text).toBe('Original text');
        expect(enhanced.chunkIndex).toBe(original.chunkIndex);
        expect(enhanced.totalChunks).toBe(original.totalChunks);
        expect(enhanced.sectionHeader).toBe('## Code Section');
        expect(enhanced.breadcrumb).toBe(original.breadcrumb);
        expect(enhanced.fileRole).toBe(FILE_ROLES.CODE);
        expect(enhanced.language).toBe('typescript');
        expect(enhanced.oversized).toBe(original.oversized);
        expect(enhanced.startLine).toBe(original.startLine);
        expect(enhanced.endLine).toBe(original.endLine);
        expect(enhanced.metadata).toEqual(original.metadata);
      });

      it('should create new Chunk entities with enhanced properties', async () => {
        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        const enhancedChunks = result.getValue();
        // Verify enhanced properties are applied
        expect(enhancedChunks[0].importance).toBe(0.75);
        expect(enhancedChunks[0].tags).toEqual(['tag1', 'tag2']);
        expect(enhancedChunks[0].namespace).toBe('my-namespace');
      });

      it('should process multiple chunks independently', async () => {
        const chunk1 = createChunk({ text: 'First chunk' });
        const chunk2 = createChunk({ text: 'Second chunk' });
        const chunk3 = createChunk({ text: 'Third chunk' });

        importanceScoringService.score
          .mockReturnValueOnce(0.6)
          .mockReturnValueOnce(0.8)
          .mockReturnValueOnce(0.9);
        tagExtractionService.extract
          .mockReturnValueOnce(['a'])
          .mockReturnValueOnce(['b'])
          .mockReturnValueOnce(['c']);

        const chunks = [chunk1, chunk2, chunk3];
        const result = await service.enhance(chunks, 'test-source', 'ns', defaultConfig);

        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].importance).toBe(0.6);
        expect(enhancedChunks[0].tags).toEqual(['a']);
        expect(enhancedChunks[1].importance).toBe(0.8);
        expect(enhancedChunks[1].tags).toEqual(['b']);
        expect(enhancedChunks[2].importance).toBe(0.9);
        expect(enhancedChunks[2].tags).toEqual(['c']);
      });
    });

    describe('empty input', () => {
      it('should return Result.ok with empty array when input is empty', async () => {
        const result = await service.enhance([], 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        expect(result.getValue()).toEqual([]);
        expect(importanceScoringService.score).not.toHaveBeenCalled();
        expect(tagExtractionService.extract).not.toHaveBeenCalled();
      });
    });

    describe('resilience — partial stage failures', () => {
      it('should continue with default importance when scoring fails', async () => {
        importanceScoringService.score.mockImplementation(() => {
          throw new Error('Scoring service error');
        });

        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].importance).toBe(0.5);
        // Verify error handling didn't break the flow — tags still extracted
        expect(tagExtractionService.extract).toHaveBeenCalled();
      });

      it('should continue with empty tags when extraction fails', async () => {
        tagExtractionService.extract.mockImplementation(() => {
          throw new Error('Tag extraction service error');
        });

        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].tags).toEqual([]);
        // Verify error handling didn't break the flow — importance still scored
        expect(importanceScoringService.score).toHaveBeenCalled();
      });

      it('should continue processing remaining chunks when one chunk fails scoring', async () => {
        importanceScoringService.score
          .mockImplementationOnce(() => {
            throw new Error('Scoring failed for chunk 1');
          })
          .mockReturnValueOnce(0.8);

        const chunks = [createChunk(), createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks).toHaveLength(2);
        expect(enhancedChunks[0].importance).toBe(0.5);
        expect(enhancedChunks[1].importance).toBe(0.8);
      });

      it('should continue processing remaining chunks when one chunk fails tagging', async () => {
        tagExtractionService.extract
          .mockReturnValueOnce(['tag1'])
          .mockImplementationOnce(() => {
            throw new Error('Tag extraction failed for chunk 2');
          })
          .mockReturnValueOnce(['tag3']);

        const chunks = [createChunk(), createChunk(), createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks).toHaveLength(3);
        expect(enhancedChunks[0].tags).toEqual(['tag1']);
        expect(enhancedChunks[1].tags).toEqual([]);
        expect(enhancedChunks[2].tags).toEqual(['tag3']);
      });

      it('should not throw when a stage fails', async () => {
        importanceScoringService.score.mockImplementation(() => {
          throw new Error('Specific scoring error');
        });

        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].importance).toBe(0.5);
      });

      it('should handle both stages failing for same chunk', async () => {
        importanceScoringService.score.mockImplementation(() => {
          throw new Error('Scoring failed');
        });
        tagExtractionService.extract.mockImplementation(() => {
          throw new Error('Tagging failed');
        });

        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'test-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].importance).toBe(0.5);
        expect(enhancedChunks[0].tags).toEqual([]);
        expect(enhancedChunks[0].namespace).toBe('my-namespace');
      });
    });

    describe('no character limit logic', () => {
      it('should not truncate or modify chunk text based on character limits', async () => {
        const longText = 'a'.repeat(1000);
        const chunk = createChunk({ text: longText });
        const result = await service.enhance([chunk], 'test-source', 'my-namespace', defaultConfig);

        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].text).toBe(longText);
        expect(enhancedChunks[0].text.length).toBe(1000);
      });
    });

    describe('sourceId usage', () => {
      it('should apply namespace from sourceId context even when scoring fails', async () => {
        importanceScoringService.score.mockImplementation(() => {
          throw new Error('Scoring error');
        });

        const chunks = [createChunk()];
        const result = await service.enhance(chunks, 'my-watch-source', 'my-namespace', defaultConfig);

        expect(result.isOk()).toBe(true);
        const enhancedChunks = result.getValue();
        expect(enhancedChunks[0].namespace).toBe('my-namespace');
      });
    });
  });
});
