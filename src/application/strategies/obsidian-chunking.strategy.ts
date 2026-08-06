import * as yaml from 'js-yaml';
import { ContentChunk, FILE_ROLES } from '../../domain/content-chunk.entity';
import { NoteMetadata } from '../../domain/note-metadata.type';
import { WatchSourceConfig } from '../../infrastructure/config/config-schemas';
import { BasePinoLogger } from '../../infrastructure/logging/base-pino-logger';
import { generateId } from '../../utils/big-endian-id';
import { Result } from '../../utils/result';
import { splitFrontmatter } from '../../utils/strategy-utils';
import { BaseChunkingStrategy } from './base-chunking-strategy';
import { MastraChunkingService } from './mastra-chunking.service';

/**
 * Parses YAML frontmatter string into NoteMetadata.
 * All fields default to empty string / empty array on parse failure or missing values.
 */
export function extractNoteMetadata(frontmatter: string): NoteMetadata {
  try {
    const parsed = yaml.load(frontmatter) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return emptyNoteMetadata();
    }

    return {
      aliases: parseStringArray(parsed.aliases),
      tags: parseStringArray(parsed.tags),
      created: typeof parsed.created === 'string' ? parsed.created : '',
      modified: typeof parsed.modified === 'string' ? parsed.modified : '',
      source: typeof parsed.source === 'string' ? parsed.source : '',
      status: typeof parsed.status === 'string' ? parsed.status : '',
      type: typeof parsed.type === 'string' ? parsed.type : '',
    };
  } catch {
    return emptyNoteMetadata();
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

function emptyNoteMetadata(): NoteMetadata {
  return {
    aliases: [],
    tags: [],
    created: '',
    modified: '',
    source: '',
    status: '',
    type: '',
  };
}

function formatNoteMetadata(metadata: NoteMetadata): Record<string, string> {
  return {
    'note.aliases': JSON.stringify(metadata.aliases),
    'note.tags': JSON.stringify(metadata.tags),
    'note.created': metadata.created,
    'note.modified': metadata.modified,
    'note.source': metadata.source,
    'note.status': metadata.status,
    'note.type': metadata.type,
  };
}

/**
 * Obsidian-aware chunking strategy that:
 * 1. Splits frontmatter from body using shared splitFrontmatter
 * 2. Extracts note metadata (aliases, tags, etc.) from frontmatter via js-yaml
 * 3. Creates frontmatter chunk with high importance (0.9) and obsidian-note tags
 * 4. Chunks body via MastraChunkingService
 * 5. Enriches all chunks with note metadata and merges note tags into chunk tags
 */
export class ObsidianChunkingStrategy implements BaseChunkingStrategy {
  constructor(
    private readonly mastraChunkingService: MastraChunkingService,
    private readonly logger: BasePinoLogger,
  ) {}

  async chunkFile(
    content: string,
    filePath: string,
    sourceId: string,
    _sourceConfig: WatchSourceConfig,
  ): Promise<Result<ContentChunk[]>> {
    // 1. Split frontmatter from body
    const { frontmatter, body } = splitFrontmatter(content);

    // 2. Extract note metadata if frontmatter exists
    const noteMetadata = frontmatter ? extractNoteMetadata(frontmatter) : null;

    // 3. Create frontmatter chunk if present
    const chunks: ContentChunk[] = [];
    if (frontmatter !== null) {
      // noteMetadata is non-null here because frontmatter exists
      chunks.push(this.createFrontmatterChunk(frontmatter, filePath, sourceId, noteMetadata!));
    }

    // 4. Chunk body with Mastra
    const bodyChunksResult = await this.mastraChunkingService.chunkFile(body, filePath, sourceId);
    const bodyChunks = bodyChunksResult.isOk() ? bodyChunksResult.getValue() : [];

    // 5. Enrich all chunks with note metadata and merge tags
    const allChunks = [...chunks, ...bodyChunks];
    const enriched = noteMetadata
      ? allChunks.map(chunk => this.enrichWithNoteMetadata(chunk, noteMetadata))
      : allChunks;

    return Result.ok(enriched);
  }

  private createFrontmatterChunk(
    frontmatter: string,
    filePath: string,
    sourceId: string,
    noteMetadata: NoteMetadata,
  ): ContentChunk {
    return ContentChunk.of({
      id: generateId(),
      text: `---\n${frontmatter}\n---`,
      chunkIndex: 0,
      totalChunks: 1,
      sectionHeader: 'Frontmatter',
      breadcrumb: filePath,
      fileRole: FILE_ROLES.DOCS,
      oversized: false,
      metadata: {
        filePath,
        sourceId,
        ...formatNoteMetadata(noteMetadata),
      },
      importance: 0.9,
      tags: ['frontmatter', 'metadata', 'obsidian-note', ...noteMetadata.tags],
      memoryBank: 'default',
    }).getValue();
  }

  private enrichWithNoteMetadata(chunk: ContentChunk, noteMetadata: NoteMetadata): ContentChunk {
    const existingMeta = chunk.metadata ?? {};
    const enrichedMeta = {
      ...existingMeta,
      ...formatNoteMetadata(noteMetadata),
    };

    // Merge note tags into chunk tags, avoiding duplicates
    const existingTags = chunk.tags ?? [];
    const mergedTags = [...new Set([...existingTags, ...noteMetadata.tags])];

    return ContentChunk.of({
      ...chunk.toJson(),
      metadata: enrichedMeta,
      tags: mergedTags,
    }).getValue();
  }
}
