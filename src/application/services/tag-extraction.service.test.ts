import { Test, TestingModule } from '@nestjs/testing';
import { Chunk, FILE_ROLES } from '../../domain/chunk.entity';
import { EnhancementConfig } from '../../infrastructure/config/config-schemas';
import { TagExtractionService } from './tag-extraction.service';

describe('TagExtractionService', () => {
  let service: TagExtractionService;

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
      text: string;
      namespace: string;
      metadata?: Record<string, string>;
      language?: string;
    }>,
  ) => {
    const props = {
      id: crypto.randomUUID(),
      text: 'Test chunk content with some meaningful words for extraction',
      chunkIndex: 0,
      totalChunks: 1,
      sectionHeader: '',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagExtractionService],
    }).compile();

    service = module.get<TagExtractionService>(TagExtractionService);
  });

  describe('extract', () => {
    describe('disabled tags', () => {
      it('should return empty array when tags are disabled', () => {
        const chunk = createChunk();
        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: false, maxTags: 10 },
        };

        const tags = service.extract(chunk, config);

        expect(tags).toEqual([]);
      });
    });

    describe('file-type tag', () => {
      it('should add file-type:typescript from language', () => {
        const chunk = createChunk({ language: 'typescript', text: 'const x = 1;' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:typescript');
      });

      it('should add file-type:markdown from language', () => {
        const chunk = createChunk({ language: 'markdown', text: '# Hello World' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:markdown');
      });

      it('should add file-type from metadata extension when language is not set', () => {
        const chunk = createChunk({
          metadata: { extension: 'json' },
          text: '{"key": "value"}',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:json');
      });

      it('should prefer language over metadata extension', () => {
        const chunk = createChunk({
          language: 'typescript',
          metadata: { extension: 'json' },
          text: 'const x = 1;',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:typescript');
        expect(tags).not.toContain('file-type:json');
      });

      it('should not add file-type tag when neither language nor extension is available', () => {
        const chunk = createChunk({ text: 'some plain text content here' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).not.toContainEqual(expect.stringMatching(/^file-type:/));
      });
    });

    describe('location tag', () => {
      it('should add location tag from chunk namespace', () => {
        const chunk = createChunk({ namespace: 'vault-docs' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('location:vault-docs');
      });

      it('should add location tag with default namespace', () => {
        const chunk = createChunk({ namespace: 'default' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('location:default');
      });

      it('should add location tag with complex namespace', () => {
        const chunk = createChunk({ namespace: 'agent-sessions/26/07/28' });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('location:agent-sessions/26/07/28');
      });
    });

    describe('keyword extraction', () => {
      it('should extract significant words from text', () => {
        const chunk = createChunk({
          text: 'This implementation provides authentication middleware for the application',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('implementation');
        expect(tags).toContain('provides');
        expect(tags).toContain('authentication');
        expect(tags).toContain('middleware');
        expect(tags).toContain('application');
      });

      it('should filter out stopwords', () => {
        const chunk = createChunk({
          text: 'the a an is it in on at to for of and or but not this that was are',
        });

        const tags = service.extract(chunk, defaultConfig);

        // None of these should appear as keyword tags
        const stopwords = [
          'the',
          'a',
          'an',
          'is',
          'it',
          'in',
          'on',
          'at',
          'to',
          'for',
          'of',
          'and',
          'or',
          'but',
          'not',
          'this',
          'that',
          'was',
          'are',
        ];
        for (const word of stopwords) {
          expect(tags).not.toContain(word);
        }
      });

      it('should filter out words shorter than 4 characters', () => {
        const chunk = createChunk({
          text: 'the big red dog ran fast but the cat sat on the mat now',
        });

        const tags = service.extract(chunk, defaultConfig);

        // 'big', 'red', 'dog', 'ran', 'but', 'cat', 'sat', 'mat', 'now' are all < 4 chars
        expect(tags).not.toContain('big');
        expect(tags).not.toContain('red');
        expect(tags).not.toContain('dog');
        expect(tags).not.toContain('ran');
        expect(tags).not.toContain('cat');
        expect(tags).not.toContain('sat');
        expect(tags).not.toContain('mat');
        expect(tags).not.toContain('now');
        // 'fast' is exactly 4 chars — should be included
        expect(tags).toContain('fast');
      });

      it('should limit extracted keywords to 5', () => {
        const chunk = createChunk({
          text: 'This implementation provides authentication middleware configuration validation parsing serialization',
        });

        const tags = service.extract(chunk, defaultConfig);

        // Count only keyword tags (not prefixed with file-type: or location:)
        const keywordTags = tags.filter((t: string) => !t.includes(':'));
        expect(keywordTags.length).toBeLessThanOrEqual(5);
      });

      it('should take first 5 unique significant words in order', () => {
        const chunk = createChunk({
          text: 'authentication authorization middleware configuration validation parsing serialization deserialization',
        });

        const tags = service.extract(chunk, defaultConfig);

        const keywordTags = tags.filter((t: string) => !t.includes(':'));
        expect(keywordTags[0]).toBe('authentication');
        expect(keywordTags[1]).toBe('authorization');
        expect(keywordTags[2]).toBe('middleware');
        expect(keywordTags[3]).toBe('configuration');
        expect(keywordTags[4]).toBe('validation');
        expect(keywordTags.length).toBe(5);
      });

      it('should lowercase extracted keywords', () => {
        const chunk = createChunk({
          text: 'Authentication Middleware CONFIGURATION',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('authentication');
        expect(tags).toContain('middleware');
        expect(tags).toContain('configuration');
        expect(tags).not.toContain('Authentication');
        expect(tags).not.toContain('CONFIGURATION');
      });

      it('should deduplicate keywords', () => {
        const chunk = createChunk({
          text: 'authentication authentication authentication middleware middleware configuration',
        });

        const tags = service.extract(chunk, defaultConfig);

        const authCount = tags.filter((t: string) => t === 'authentication').length;
        expect(authCount).toBe(1);
      });

      it('should handle text with punctuation and special characters', () => {
        const chunk = createChunk({
          text: 'The implementation (v2.0) provides authentication, middleware; configuration! validation...',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('implementation');
        expect(tags).toContain('provides');
        expect(tags).toContain('authentication');
        expect(tags).toContain('middleware');
        expect(tags).toContain('configuration');
      });

      it('should return no keyword tags when text has only stopwords and short words', () => {
        const chunk = createChunk({
          text: 'the a an is it in on at to',
        });

        const tags = service.extract(chunk, defaultConfig);

        const keywordTags = tags.filter((t: string) => !t.includes(':'));
        expect(keywordTags).toEqual([]);
      });
    });

    describe('metadata tags', () => {
      it('should extract tags from Mastra keywords metadata', () => {
        const chunk = createChunk({
          metadata: { keywords: 'billing, payroll, compensation' },
          text: 'This is some content about billing',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('billing');
        expect(tags).toContain('payroll');
        expect(tags).toContain('compensation');
      });

      it('should extract tags from Mastra keywords with different separators', () => {
        const chunk = createChunk({
          metadata: { keywords: 'billing; payroll | compensation' },
          text: 'content',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('billing');
        expect(tags).toContain('payroll');
        expect(tags).toContain('compensation');
      });

      it('should not add metadata tags when keywords metadata is not present', () => {
        const chunk = createChunk({
          metadata: { extension: 'ts' },
          text: 'xyz',
        });

        const tags = service.extract(chunk, defaultConfig);

        // Should only have file-type and location tags (no keywords from "xyz" — too short)
        expect(tags).toContain('file-type:ts');
        expect(tags).toContain('location:default');
        expect(tags.length).toBe(2);
      });

      it('should handle empty keywords metadata', () => {
        const chunk = createChunk({
          metadata: { keywords: '' },
          text: 'content',
        });

        const tags = service.extract(chunk, defaultConfig);

        // Should only have location tag
        expect(tags).not.toContain('');
      });
    });

    describe('maxTags enforcement', () => {
      it('should enforce maxTags default of 10', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'my-namespace',
          metadata: { keywords: 'meta1, meta2, meta3, meta4, meta5, meta6, meta7, meta8' },
          text: 'one two three four five six seven eight nine ten eleven twelve thirteen',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags.length).toBeLessThanOrEqual(10);
      });

      it('should enforce custom maxTags limit', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'my-namespace',
          metadata: { keywords: 'meta1, meta2, meta3, meta4, meta5, meta6' },
          text: 'keyword1 keyword2 keyword3 keyword4 keyword5',
        });

        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: true, maxTags: 5 },
        };

        const tags = service.extract(chunk, config);

        expect(tags.length).toBeLessThanOrEqual(5);
      });

      it('should prioritize file-type and location tags over keywords when truncating', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'my-namespace',
          text: 'keyword1 keyword2 keyword3 keyword4 keyword5 keyword6 keyword7 keyword8 keyword9 keyword10',
        });

        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: true, maxTags: 3 },
        };

        const tags = service.extract(chunk, config);

        // file-type and location tags have highest priority — preserved
        // keywords are dropped first when exceeding maxTags
        expect(tags).toContain('file-type:typescript');
        expect(tags).toContain('location:my-namespace');
        expect(tags.length).toBeLessThanOrEqual(3);
      });

      it('should prioritize location and file-type tags when at maxTags', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'my-namespace',
          text: 'keyword1 keyword2 keyword3 keyword4 keyword5 keyword6 keyword7 keyword8 keyword9 keyword10',
        });

        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: true, maxTags: 2 },
        };

        const tags = service.extract(chunk, config);

        // file-type and location have highest priority — both preserved
        expect(tags).toContain('file-type:typescript');
        expect(tags).toContain('location:my-namespace');
        expect(tags.length).toBe(2);
      });

      it('should drop keywords before dropping location/file-type tags', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'my-namespace',
          text: 'keyword1 keyword2 keyword3 keyword4 keyword5 keyword6 keyword7 keyword8 keyword9 keyword10',
        });

        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: true, maxTags: 4 },
        };

        const tags = service.extract(chunk, config);

        // file-type and location preserved, plus some keywords
        expect(tags).toContain('file-type:typescript');
        expect(tags).toContain('location:my-namespace');
        expect(tags).toContain('keyword1');
        expect(tags).toContain('keyword2');
        expect(tags.length).toBeLessThanOrEqual(4);
      });
    });

    describe('deduplication', () => {
      it('should deduplicate tags across all sources', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'typescript',
          metadata: { keywords: 'typescript' },
          text: 'typescript typescript typescript',
        });

        const tags = service.extract(chunk, defaultConfig);

        // 'typescript' should appear only once as keyword
        const keywordTypeScript = tags.filter((t: string) => t === 'typescript');
        expect(keywordTypeScript.length).toBe(1);

        // file-type:typescript and location:typescript are different tags
        expect(tags).toContain('file-type:typescript');
        expect(tags).toContain('location:typescript');
      });

      it('should deduplicate metadata keywords with extracted keywords', () => {
        const chunk = createChunk({
          metadata: { keywords: 'billing, payroll' },
          text: 'billing payroll accounting finance',
        });

        const tags = service.extract(chunk, defaultConfig);

        const billingCount = tags.filter((t: string) => t === 'billing').length;
        const payrollCount = tags.filter((t: string) => t === 'payroll').length;
        expect(billingCount).toBe(1);
        expect(payrollCount).toBe(1);
      });
    });

    describe('return type and safety', () => {
      it('should return string[] (not Result)', () => {
        const chunk = createChunk();
        const tags = service.extract(chunk, defaultConfig);

        expect(Array.isArray(tags)).toBe(true);
        expect(typeof tags[0]).toBe('string');
      });

      it('should never throw — always returns valid string[]', () => {
        const chunk = createChunk({
          text: '',
          metadata: undefined,
        });

        expect(() => service.extract(chunk, defaultConfig)).not.toThrow();
      });

      it('should handle empty text gracefully', () => {
        const chunk = createChunk({ text: '' });

        const tags = service.extract(chunk, defaultConfig);

        expect(Array.isArray(tags)).toBe(true);
        // Should still have location tag at minimum
        expect(tags).toContain('location:default');
      });

      it('should handle undefined metadata gracefully', () => {
        const chunk = createChunk({ metadata: undefined });

        const tags = service.extract(chunk, defaultConfig);

        expect(Array.isArray(tags)).toBe(true);
      });

      it('should handle chunk with no language and no extension', () => {
        const chunk = createChunk({
          language: undefined,
          metadata: {},
          text: 'some content here',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(Array.isArray(tags)).toBe(true);
        expect(tags).not.toContainEqual(expect.stringMatching(/^file-type:/));
      });
    });

    describe('integration scenarios', () => {
      it('should extract all tag types from a realistic code chunk', () => {
        const chunk = createChunk({
          language: 'typescript',
          namespace: 'voqaria/backend',
          metadata: { keywords: 'api, rest, controller' },
          text: 'This controller handles authentication requests and provides JWT token validation middleware',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:typescript');
        expect(tags).toContain('location:voqaria/backend');
        expect(tags).toContain('api');
        expect(tags).toContain('rest');
        expect(tags).toContain('controller');
        expect(tags).toContain('handles');
        expect(tags).toContain('authentication');
        expect(tags).toContain('requests');
      });

      it('should extract all tag types from a markdown docs chunk', () => {
        const chunk = createChunk({
          language: 'markdown',
          namespace: 'vault-docs',
          text: 'Deployment guide for production environment with Kubernetes cluster configuration',
        });

        const tags = service.extract(chunk, defaultConfig);

        expect(tags).toContain('file-type:markdown');
        expect(tags).toContain('location:vault-docs');
        expect(tags).toContain('deployment');
        expect(tags).toContain('guide');
        expect(tags).toContain('production');
        expect(tags).toContain('environment');
        expect(tags).toContain('kubernetes');
      });

      it('should respect maxTags while preserving high-priority tags', () => {
        const chunk = createChunk({
          language: 'python',
          namespace: 'ml-pipeline',
          metadata: { keywords: 'training, inference, model, dataset, features, pipeline, batch, streaming' },
          text: 'This module implements neural network training with gradient descent optimization',
        });

        const config: EnhancementConfig = {
          ...defaultConfig,
          tags: { enabled: true, maxTags: 6 },
        };

        const tags = service.extract(chunk, config);

        expect(tags.length).toBeLessThanOrEqual(6);
        // file-type and location have highest priority
        expect(tags).toContain('file-type:python');
        expect(tags).toContain('location:ml-pipeline');
      });
    });
  });
});
