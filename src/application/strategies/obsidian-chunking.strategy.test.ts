import { FILE_ROLES } from '@/domain/content-chunk.entity';
import { aBodyChunk } from '@/domain/content-chunk.entity.test-utils';
import { NoteMetadata } from '@/domain/note-metadata.type';
import { aWatchSourceConfig } from '@/domain/watch-source.entity.test-utils';
import { BasePinoLogger } from '@/infrastructure/logging/base-pino-logger';
import { aLogger } from '@/infrastructure/logging/logger.test-utils';
import { splitFrontmatter } from '@/utils/strategy-utils';
import * as fsSync from 'fs';
import * as path from 'path';
import { MastraChunkingService } from './mastra-chunking.service';
import { aMastraChunkingService } from './mastra-chunking.service.test-utils';
import { ObsidianChunkingStrategy, extractNoteMetadata } from './obsidian-chunking.strategy';

// --- Test fixtures (loaded from shared fixtures) ---

const WITH_FRONTMATTER = fsSync.readFileSync(
  path.resolve(__dirname, '../../e2e/fixtures/obsidian-with-frontmatter.md'),
  'utf-8',
);

const WITHOUT_FRONTMATTER = fsSync.readFileSync(
  path.resolve(__dirname, '../../e2e/fixtures/obsidian-without-frontmatter.md'),
  'utf-8',
);

const EMPTY_FRONTMATTER = fsSync.readFileSync(
  path.resolve(__dirname, '../../e2e/fixtures/obsidian-empty-frontmatter.md'),
  'utf-8',
);

const TEST_NOTE_META: NoteMetadata = {
  aliases: [],
  tags: ['notes'],
  created: '',
  modified: '',
  source: '',
  status: '',
  type: '',
};

// --- Tests ---

describe('extractNoteMetadata', () => {
  it('extracts all fields from valid frontmatter', () => {
    const { frontmatter } = splitFrontmatter(WITH_FRONTMATTER);
    const result = extractNoteMetadata(frontmatter!);

    expect(result.aliases).toEqual([]);
    expect(result.tags).toEqual(['notes']);
    expect(result.created).toBe('');
    expect(result.modified).toBe('');
    expect(result.source).toBe('');
    expect(result.status).toBe('');
    expect(result.type).toBe('');
  });

  it('returns defaults for missing fields', () => {
    const partialFrontmatter = `created: 2026-01-01
status: draft`;
    const result = extractNoteMetadata(partialFrontmatter);

    expect(result.aliases).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.created).toBe('2026-01-01');
    expect(result.modified).toBe('');
    expect(result.source).toBe('');
    expect(result.status).toBe('draft');
    expect(result.type).toBe('');
  });

  it('returns all defaults for empty frontmatter', () => {
    const result = extractNoteMetadata('');

    expect(result.aliases).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.created).toBe('');
    expect(result.modified).toBe('');
    expect(result.source).toBe('');
    expect(result.status).toBe('');
    expect(result.type).toBe('');
  });

  it('handles invalid YAML gracefully', () => {
    const result = extractNoteMetadata('::: invalid yaml {{{');

    expect(result.aliases).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.created).toBe('');
    expect(result.modified).toBe('');
    expect(result.source).toBe('');
    expect(result.status).toBe('');
    expect(result.type).toBe('');
  });

  it('handles aliases as a single string (not array)', () => {
    const frontmatter = `aliases: Single Alias
tags: single-tag`;
    const result = extractNoteMetadata(frontmatter);

    expect(result.aliases).toEqual(['Single Alias']);
    expect(result.tags).toEqual(['single-tag']);
  });

  it('handles tags as a single string (not array)', () => {
    const frontmatter = `tags: single-tag`;
    const result = extractNoteMetadata(frontmatter);

    expect(result.tags).toEqual(['single-tag']);
  });
});

describe('ObsidianChunkingStrategy', () => {
  let strategy: ObsidianChunkingStrategy;
  let mockMastraChunkingService: ReturnType<typeof aMastraChunkingService>;
  let mockLogger: BasePinoLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMastraChunkingService = aMastraChunkingService();
    mockLogger = aLogger();
    strategy = new ObsidianChunkingStrategy(
      mockMastraChunkingService as unknown as MastraChunkingService,
      mockLogger,
    );
  });

  describe('implements ChunkingStrategy', () => {
    it('has chunkFile method with correct signature', () => {
      expect(typeof strategy.chunkFile).toBe('function');
    });
  });

  describe('chunkFile with frontmatter', () => {
    it('creates frontmatter chunk with importance 0.9, correct tags and sectionHeader', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(2);

      const fmChunk = chunks[0];
      expect(fmChunk.importance).toBe(0.9);
      expect(fmChunk.tags).toContain('frontmatter');
      expect(fmChunk.tags).toContain('metadata');
      expect(fmChunk.tags).toContain('obsidian-note');
      expect(fmChunk.sectionHeader).toBe('Frontmatter');
      expect(fmChunk.text).toContain('---');
      expect(fmChunk.text).toContain('---');
      expect(fmChunk.fileRole).toBe(FILE_ROLES.DOCS);
    });

    it('wraps frontmatter chunk text in --- delimiters', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      const fmChunk = result.getValue()[0];
      expect(fmChunk.text).toMatch(/^---\n[\s\S]*\n---$/);
    });

    it('passes body content (not full content) to MastraChunkingService', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      const expectedBody = splitFrontmatter(WITH_FRONTMATTER).body;
      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(
        expectedBody,
        '/test/path/note.md',
        'test-source',
      );
    });

    it('enriches all chunks with note metadata', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      const chunks = result.getValue();

      // Frontmatter chunk metadata (from real fixture)
      const fmMeta = chunks[0].metadata;
      expect(fmMeta?.['note.aliases']).toBe(JSON.stringify(TEST_NOTE_META.aliases));
      expect(fmMeta?.['note.tags']).toBe(JSON.stringify(TEST_NOTE_META.tags));
      expect(fmMeta?.['note.created']).toBe('');
      expect(fmMeta?.['note.modified']).toBe('');
      expect(fmMeta?.['note.source']).toBe('');
      expect(fmMeta?.['note.status']).toBe('');
      expect(fmMeta?.['note.type']).toBe('');

      // Body chunk metadata (from real fixture)
      const bodyMeta = chunks[1].metadata;
      expect(bodyMeta?.['note.aliases']).toBe(JSON.stringify(TEST_NOTE_META.aliases));
      expect(bodyMeta?.['note.tags']).toBe(JSON.stringify(TEST_NOTE_META.tags));
      expect(bodyMeta?.['note.created']).toBe('');
      expect(bodyMeta?.['note.modified']).toBe('');
      expect(bodyMeta?.['note.source']).toBe('');
      expect(bodyMeta?.['note.status']).toBe('');
      expect(bodyMeta?.['note.type']).toBe('');
    });

    it('merges note tags into chunk tags', async () => {
      const bodyChunk = aBodyChunk({ tags: ['existing-tag'] });
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      const chunks = result.getValue();

      // Frontmatter chunk should have note tags (from real fixture: only 'notes')
      const fmTags = chunks[0].tags;
      expect(fmTags).toContain('notes');

      // Body chunk should have both existing and note tags (from real fixture: only 'notes')
      const bodyTags = chunks[1].tags;
      expect(bodyTags).toContain('existing-tag');
      expect(bodyTags).toContain('notes');
    });

    it('returns multiple body chunks from Mastra with enrichment', async () => {
      const chunk1 = aBodyChunk({ chunkIndex: 0 });
      const chunk2 = aBodyChunk({ chunkIndex: 1 });
      mockMastraChunkingService = aMastraChunkingService([chunk1, chunk2]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      // 1 frontmatter + 2 body chunks
      expect(chunks.length).toBe(3);

      // All body chunks should be enriched (real fixture has no 'created' field)
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].metadata?.['note.created']).toBe('');
        expect(chunks[i].tags).toContain('notes');
      }
    });
  });

  describe('chunkFile without frontmatter', () => {
    it('skips frontmatter chunk and returns only body chunks', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITHOUT_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].sectionHeader).not.toBe('Frontmatter');
    });

    it('passes full content to Mastra when no frontmatter', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      await strategy.chunkFile(
        WITHOUT_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledWith(
        WITHOUT_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
      );
    });

    it('does not enrich chunks with note metadata when no frontmatter', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        WITHOUT_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      const chunks = result.getValue();
      expect(chunks[0].metadata?.['note.aliases']).toBeUndefined();
      expect(chunks[0].metadata?.['note.tags']).toBeUndefined();
      expect(chunks[0].metadata?.['note.created']).toBeUndefined();
    });
  });

  describe('chunkFile with empty frontmatter', () => {
    it('treats ---\\n--- as no frontmatter (regex requires content between delimiters)', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        EMPTY_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      // Empty frontmatter (---\n---) is not matched by the regex, so treated as no frontmatter
      expect(chunks.length).toBe(1);
      expect(chunks[0].sectionHeader).not.toBe('Frontmatter');
    });
  });

  describe('body chunking via Mastra', () => {
    it('delegates body chunking to MastraChunkingService', async () => {
      const bodyChunk = aBodyChunk();
      mockMastraChunkingService = aMastraChunkingService([bodyChunk]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      await strategy.chunkFile(
        WITH_FRONTMATTER,
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(mockMastraChunkingService.chunkFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty content', () => {
    it('returns empty array for empty content', async () => {
      mockMastraChunkingService = aMastraChunkingService([]);
      strategy = new ObsidianChunkingStrategy(
        mockMastraChunkingService as unknown as MastraChunkingService,
        mockLogger,
      );

      const result = await strategy.chunkFile(
        '',
        '/test/path/note.md',
        'test-source',
        aWatchSourceConfig({
          id: 'test-source',
          path: '/test/path',
          memoryBank: 'test-source',
          exclude: ['**/node_modules/**'],
          strategy: 'obsidian',
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
    });
  });
});
