import { Injectable } from '@nestjs/common';
import { Chunk, FILE_ROLES } from '../../domain/entities/chunk.entity';
import { Result } from '../../utils/result';
import { ChunkContentConfig, Chunker } from './chunker.interface';

/**
 * Language detection mapping from file extensions.
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.css': 'css',
  '.html': 'html',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.md': 'markdown',
};

/**
 * Semantic separators for recursive code chunking, ordered by priority.
 * Higher priority separators are tried first to create meaningful chunks.
 */
const SEMANTIC_SEPARATORS: string[] = [
  // Class boundaries
  '\nclass ',
  '\nexport class ',
  '\nabstract class ',
  '\npublic class ',
  '\nprivate class ',
  '\nprotected class ',
  // Interface/type boundaries
  '\ninterface ',
  '\nexport interface ',
  '\ntype ',
  '\nexport type ',
  // Function boundaries
  '\nfunction ',
  '\nexport function ',
  '\nconst ',
  '\nexport const ',
  '\nlet ',
  '\nexport let ',
  // Module boundaries
  '\nimport ',
  '\nexport ',
  '\nrequire(',
  // Paragraph and line breaks
  '\n\n',
  '\n',
  ' ',
  '',
];

/**
 * Estimates token count from text.
 * Rough approximation: ~4 characters per token for code.
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
 * Detects programming language from file extension.
 */
function detectLanguage(filePath: string): string | undefined {
  const parts = filePath.split('.');
  const ext = parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : undefined;
  return ext ? LANGUAGE_MAP[ext] : undefined;
}

/**
 * Finds the best split position near the target index using semantic separators.
 * Searches both forward and backward from the target.
 */
function findSemanticSplit(text: string, targetIndex: number, maxSearchDistance: number): number {
  // If target is already at a good boundary, return it
  if (targetIndex >= text.length) return text.length;

  // Search backward for a separator
  const searchStart = Math.max(0, targetIndex - maxSearchDistance);
  const searchEnd = Math.min(text.length, targetIndex + maxSearchDistance);

  // Try each separator type
  for (const separator of SEMANTIC_SEPARATORS) {
    if (separator === '') continue;

    // Search forward from target
    let idx = targetIndex;
    while (idx < searchEnd) {
      const pos = text.indexOf(separator, idx);
      if (pos === -1 || pos > searchEnd) break;
      return pos;
      idx = pos + 1;
    }

    // Search backward from target
    idx = targetIndex;
    while (idx > searchStart) {
      const pos = text.lastIndexOf(separator, idx);
      if (pos === -1 || pos < searchStart) break;
      return pos;
      idx = pos - 1;
    }
  }

  // Fallback: split at target index
  return targetIndex;
}

/**
 * Counts the line number for a given character index in text.
 */
function countLinesUpTo(text: string, index: number): number {
  let lines = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') lines++;
  }
  return lines;
}

/**
 * Recursive code chunking strategy.
 *
 * Uses semantic separators to split code at meaningful boundaries:
 * - Class boundaries
 * - Function boundaries
 * - Export/import boundaries
 * - Interface/type boundaries
 * Falls back to paragraph, line, and character splitting if needed.
 */
@Injectable()
export class CodeChunker implements Chunker {
  async chunk(content: string, config: ChunkContentConfig): Promise<Result<Chunk[]>> {
    if (!content || content.trim().length === 0) {
      return Result.ok([]);
    }

    const chunks = this.recursiveChunk(content, config);

    if (chunks.length === 0) {
      return Result.ok([]);
    }

    const language = detectLanguage(config.filePath);
    const fileBase = basename(config.filePath);
    const totalChunks = chunks.length;

    const chunkResults: Chunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i].text;
      const startLine = chunks[i].startLine;
      const endLine = chunks[i].endLine;
      const estimatedTokens = estimateTokens(chunkText);
      const oversized = estimatedTokens > config.hardCapTokens;

      // Build breadcrumb: basename(filePath):startLine
      const breadcrumb = `${fileBase}:${startLine}`;

      const chunkResult = Chunk.create(
        chunkText,
        i,
        totalChunks,
        fileBase,
        breadcrumb,
        language,
        FILE_ROLES.CODE,
        oversized,
        startLine,
        endLine,
        {
          filePath: config.filePath,
          sourceId: config.sourceId,
          language: language ?? 'unknown',
          estimatedTokens: String(estimatedTokens),
        },
      );

      if (!chunkResult.isOk()) {
        return Result.ko(chunkResult.getError());
      }

      chunkResults.push(chunkResult.getValue());
    }

    return Result.ok(chunkResults);
  }

  /**
   * Recursively chunks text using semantic separators.
   */
  private recursiveChunk(
    text: string,
    config: ChunkContentConfig,
    baseStartLine = 1,
  ): { text: string; startLine: number; endLine: number }[] {
    const tokenCount = estimateTokens(text);

    // If text fits within maxTokens, return as single chunk
    if (tokenCount <= config.maxTokens) {
      const endLine = baseStartLine + text.split('\n').length - 1;
      return [{ text: text.trim(), startLine: baseStartLine, endLine }];
    }

    // If text exceeds hard cap, try to split anyway and mark as oversized
    if (tokenCount > config.hardCapTokens * 2) {
      // Force split at midpoint
      const midIndex = text.length / 2;
      const splitIndex = findSemanticSplit(text, midIndex, 500);

      const firstPart = text.slice(0, splitIndex);
      const secondPart = text.slice(splitIndex);

      const firstEndLine = baseStartLine + firstPart.split('\n').length - 1;

      const firstChunks = this.recursiveChunk(firstPart, config, baseStartLine);
      const secondChunks = this.recursiveChunk(secondPart, config, firstEndLine + 1);

      return [...firstChunks, ...secondChunks];
    }

    // Try each separator in priority order
    for (const separator of SEMANTIC_SEPARATORS) {
      const chunks = this.trySplitBySeparator(text, separator, config, baseStartLine);
      if (chunks.length > 1) {
        return chunks;
      }
    }

    // Last resort: split at character level
    const midIndex = text.length / 2;
    const splitIndex = findSemanticSplit(text, midIndex, 200);

    const firstPart = text.slice(0, splitIndex);
    const secondPart = text.slice(splitIndex);

    const firstEndLine = baseStartLine + firstPart.split('\n').length - 1;

    return [
      { text: firstPart.trim(), startLine: baseStartLine, endLine: firstEndLine },
      {
        text: secondPart.trim(),
        startLine: firstEndLine + 1,
        endLine: firstEndLine + secondPart.split('\n').length,
      },
    ];
  }

  /**
   * Attempts to split text by a given separator and chunk the results.
   */
  private trySplitBySeparator(
    text: string,
    separator: string,
    config: ChunkContentConfig,
    baseStartLine: number,
  ): { text: string; startLine: number; endLine: number }[] {
    if (separator === '' || !text.includes(separator)) {
      return [
        { text: text.trim(), startLine: baseStartLine, endLine: baseStartLine + text.split('\n').length - 1 },
      ];
    }

    const parts = text.split(separator);
    if (parts.length <= 1) {
      return [
        { text: text.trim(), startLine: baseStartLine, endLine: baseStartLine + text.split('\n').length - 1 },
      ];
    }

    // Reconstruct parts with separator for non-first parts
    let currentLine = baseStartLine;
    const chunks: { text: string; startLine: number; endLine: number }[] = [];
    let currentChunkText = '';
    let currentChunkStartLine = baseStartLine;

    for (let i = 0; i < parts.length; i++) {
      const part = i === 0 ? parts[i] : separator + parts[i];
      const partTokens = estimateTokens(part);
      const combinedTokens = estimateTokens(currentChunkText + part);

      // If adding this part would exceed maxTokens significantly, flush current chunk
      if (
        currentChunkText &&
        combinedTokens > config.maxTokens &&
        estimateTokens(currentChunkText) > config.maxTokens / 2
      ) {
        const endLine = currentLine + currentChunkText.split('\n').length - 1;
        chunks.push({
          text: currentChunkText.trim(),
          startLine: currentChunkStartLine,
          endLine,
        });
        currentChunkText = '';
        currentChunkStartLine = currentLine;
      }

      currentChunkText += part;
      currentLine += part.split('\n').length;
    }

    // Add remaining content as final chunk
    if (currentChunkText.trim()) {
      const endLine = currentChunkStartLine + currentChunkText.split('\n').length - 1;
      chunks.push({
        text: currentChunkText.trim(),
        startLine: currentChunkStartLine,
        endLine,
      });
    }

    // If we got multiple chunks and all are within limits, return them
    if (chunks.length > 1) {
      const allWithinLimits = chunks.every(c => estimateTokens(c.text) <= config.hardCapTokens);
      if (allWithinLimits) {
        return chunks;
      }
    }

    // Otherwise, don't use this separator
    return [
      { text: text.trim(), startLine: baseStartLine, endLine: baseStartLine + text.split('\n').length - 1 },
    ];
  }
}
