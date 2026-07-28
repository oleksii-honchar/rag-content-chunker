import { Injectable } from '@nestjs/common';
import * as jsYaml from 'js-yaml';
import { Chunk, FILE_ROLES } from '../../domain/chunk.entity';
import { ErrorWithDetails } from '../../utils/error-with-details';
import { Result } from '../../utils/result';
import { ChunkContentConfig, Chunker } from './chunker.interface';

/**
 * Estimates token count from text.
 * Rough approximation: ~4 characters per token for config content.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extracts the basename from a file path.
 */
function basename(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] ?? filePath;
}

/**
 * Detects config type from file extension.
 */
function detectConfigType(filePath: string): 'json' | 'yaml' | 'toml' | 'env' | 'unknown' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower === '.env' || lower.endsWith('.env.')) return 'env';
  return 'unknown';
}

/**
 * Creates a Chunk for a config key/section.
 */
function createConfigChunk(
  text: string,
  key: string,
  filePath: string,
  sourceId: string,
  configType: string,
  chunkIndex: number,
  totalChunks: number,
): Result<Chunk> {
  const fileBase = basename(filePath);
  const breadcrumb = `${fileBase} > ${key}`;
  const estimatedTokens = estimateTokens(text);

  return Chunk.create(
    text,
    chunkIndex,
    totalChunks,
    key,
    breadcrumb,
    undefined,
    FILE_ROLES.CONFIG,
    false,
    undefined,
    undefined,
    {
      filePath,
      sourceId,
      type: configType,
      key,
      estimatedTokens: String(estimatedTokens),
    },
  );
}

/**
 * Creates a fallback single chunk for the entire content.
 */
function createFallbackChunk(
  content: string,
  filePath: string,
  sourceId: string,
  configType: string,
): Result<Chunk> {
  const fileBase = basename(filePath);
  const estimatedTokens = estimateTokens(content);

  return Chunk.create(
    content,
    0,
    1,
    fileBase,
    fileBase,
    undefined,
    FILE_ROLES.CONFIG,
    false,
    undefined,
    undefined,
    {
      filePath,
      sourceId,
      type: configType,
      estimatedTokens: String(estimatedTokens),
    },
  );
}

/**
 * Converts a value to a pretty-printed string for chunk text.
 */
function valueToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return String(value);
  return JSON.stringify(value, null, 2);
}

/**
 * Simple TOML parser that extracts sections.
 * Handles [section] and [[array.section]] syntax.
 * Falls back to treating entire content as one chunk if no sections found.
 */
function parseTomlSections(content: string): { key: string; text: string }[] {
  const lines = content.split('\n');
  const sections: { key: string; text: string }[] = [];
  let currentKey = '';
  let currentText: string[] = [];

  const sectionHeaderRegex = /^\[\[?([\w.]+)\]\]?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(sectionHeaderRegex);

    if (match) {
      // Flush previous section if exists
      if (currentKey && currentText.length > 0) {
        sections.push({ key: currentKey, text: currentText.join('\n').trim() });
      }
      currentKey = match[1];
      currentText = [];
    } else {
      currentText.push(line);
    }
  }

  // Flush last section
  if (currentKey && currentText.length > 0) {
    sections.push({ key: currentKey, text: currentText.join('\n').trim() });
  }

  // If no sections found, treat entire content as one chunk with key "root"
  if (sections.length === 0) {
    sections.push({ key: 'root', text: content.trim() });
  }

  return sections;
}

/**
 * Structure-aware config chunking strategy.
 *
 * - JSON: one chunk per top-level key
 * - YAML: one chunk per top-level key (uses js-yaml)
 * - TOML: one chunk per section header
 * - .env: entire file as single chunk (comments stripped)
 * - Unknown: fallback single chunk
 */
@Injectable()
export class ConfigChunker implements Chunker {
  async chunk(content: string, config: ChunkContentConfig): Promise<Result<Chunk[]>> {
    if (!content || content.trim().length === 0) {
      return Result.ok([]);
    }

    const configType = detectConfigType(config.filePath);

    try {
      switch (configType) {
        case 'json':
          return this.chunkJson(content, config);
        case 'yaml':
          return this.chunkYaml(content, config);
        case 'toml':
          return this.chunkToml(content, config);
        case 'env':
          return this.chunkEnv(content, config);
        default:
          return this.chunkFallback(content, config);
      }
    } catch (error) {
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'ConfigChunkError'),
      );
    }
  }

  /**
   * JSON: one chunk per top-level key.
   */
  private chunkJson(content: string, config: ChunkContentConfig): Result<Chunk[]> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON — fallback to single chunk
      const fallback = createFallbackChunk(content, config.filePath, config.sourceId, 'json');
      return fallback.isOk() ? Result.ok([fallback.getValue()]) : Result.ko(fallback.getError());
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      const fallback = createFallbackChunk(content, config.filePath, config.sourceId, 'json');
      return fallback.isOk() ? Result.ok([fallback.getValue()]) : Result.ko(fallback.getError());
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      return Result.ok([]);
    }

    const chunks: Chunk[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      const text = valueToString(value);

      const chunkResult = createConfigChunk(
        text,
        key,
        config.filePath,
        config.sourceId,
        'json',
        i,
        entries.length,
      );

      if (!chunkResult.isOk()) {
        return Result.ko(chunkResult.getError());
      }

      chunks.push(chunkResult.getValue());
    }

    return Result.ok(chunks);
  }

  /**
   * YAML: one chunk per top-level key (uses js-yaml).
   */
  private chunkYaml(content: string, config: ChunkContentConfig): Result<Chunk[]> {
    let parsed: Record<string, unknown>;
    try {
      parsed = jsYaml.load(content) as Record<string, unknown>;
    } catch {
      // Invalid YAML — fallback to single chunk
      const fallback = createFallbackChunk(content, config.filePath, config.sourceId, 'yaml');
      return fallback.isOk() ? Result.ok([fallback.getValue()]) : Result.ko(fallback.getError());
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      const fallback = createFallbackChunk(content, config.filePath, config.sourceId, 'yaml');
      return fallback.isOk() ? Result.ok([fallback.getValue()]) : Result.ko(fallback.getError());
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      return Result.ok([]);
    }

    const chunks: Chunk[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      const text = valueToString(value);

      const chunkResult = createConfigChunk(
        text,
        key,
        config.filePath,
        config.sourceId,
        'yaml',
        i,
        entries.length,
      );

      if (!chunkResult.isOk()) {
        return Result.ko(chunkResult.getError());
      }

      chunks.push(chunkResult.getValue());
    }

    return Result.ok(chunks);
  }

  /**
   * TOML: one chunk per section header.
   */
  private chunkToml(content: string, config: ChunkContentConfig): Result<Chunk[]> {
    const sections = parseTomlSections(content);
    if (sections.length === 0) {
      return Result.ok([]);
    }

    const chunks: Chunk[] = [];

    for (let i = 0; i < sections.length; i++) {
      const { key, text } = sections[i];

      const chunkResult = createConfigChunk(
        text,
        key,
        config.filePath,
        config.sourceId,
        'toml',
        i,
        sections.length,
      );

      if (!chunkResult.isOk()) {
        return Result.ko(chunkResult.getError());
      }

      chunks.push(chunkResult.getValue());
    }

    return Result.ok(chunks);
  }

  /**
   * .env: entire file as single chunk, comments stripped.
   */
  private chunkEnv(content: string, config: ChunkContentConfig): Result<Chunk[]> {
    // Strip comments and empty lines
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    if (lines.length === 0) {
      return Result.ok([]);
    }

    const text = lines.join('\n');
    const fileBase = basename(config.filePath);
    const estimatedTokens = estimateTokens(text);

    const chunkResult = Chunk.create(
      text,
      0,
      1,
      fileBase,
      fileBase,
      undefined,
      FILE_ROLES.CONFIG,
      false,
      undefined,
      undefined,
      {
        filePath: config.filePath,
        sourceId: config.sourceId,
        type: 'env',
        estimatedTokens: String(estimatedTokens),
      },
    );

    return chunkResult.isOk() ? Result.ok([chunkResult.getValue()]) : Result.ko(chunkResult.getError());
  }

  /**
   * Fallback: unknown config type — single chunk with original content.
   */
  private chunkFallback(content: string, config: ChunkContentConfig): Result<Chunk[]> {
    const chunkResult = createFallbackChunk(content, config.filePath, config.sourceId, 'unknown');
    return chunkResult.isOk() ? Result.ok([chunkResult.getValue()]) : Result.ko(chunkResult.getError());
  }
}
