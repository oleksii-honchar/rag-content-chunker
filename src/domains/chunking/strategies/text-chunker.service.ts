import { Injectable } from '@nestjs/common';
import { Chunk, FILE_ROLES } from '../entities/chunk.entity';
import { ChunkContentConfig, Chunker } from './chunker.interface';
import { Result } from '../../../utils/result';

/**
 * Estimates token count from text.
 * Rough approximation: ~4 characters per token for plain text.
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
 * Splits text into sentences using sentence boundary detection.
 * Handles common terminators: . ! ?
 * Preserves whitespace around terminators for clean joins.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence terminators, keeping the terminator with the sentence
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.filter(s => s.trim().length > 0);
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
 * Sentence-based text chunking strategy.
 *
 * Splits plain text at sentence boundaries (. ! ?), grouping sentences
 * until maxTokens is reached. Designed for .txt files and plain prose.
 *
 * Config: maxTokens=450, overlap=1 sentence, hardCap=540.
 */
@Injectable()
export class TextChunker implements Chunker {
  async chunk(content: string, config: ChunkContentConfig): Promise<Result<Chunk[]>> {
    if (!content || content.trim().length === 0) {
      return Result.ok([]);
    }

    const sentences = splitIntoSentences(content);

    if (sentences.length === 0) {
      return Result.ok([]);
    }

    // If all sentences fit in one chunk, return single chunk
    const totalTokens = estimateTokens(content);
    if (totalTokens <= config.maxTokens) {
      return this.createChunksFromSentences(sentences, content, config, [sentences]);
    }

    // Group sentences into chunks respecting maxTokens
    const groups = this.groupSentences(sentences, config);
    return this.createChunksFromSentences(sentences, content, config, groups);
  }

  /**
   * Groups sentences into chunks, respecting maxTokens.
   * Uses overlap of 1 sentence between chunks.
   */
  private groupSentences(
    sentences: string[],
    config: ChunkContentConfig,
  ): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = estimateTokens(sentence);

      // If a single sentence exceeds hard cap, it becomes its own oversized chunk
      if (sentenceTokens > config.hardCapTokens) {
        // Flush current group if not empty
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup = [];
          currentTokens = 0;
        }
        groups.push([sentence]);
        continue;
      }

      // If adding this sentence would exceed hard cap, flush current group
      if (currentTokens + sentenceTokens > config.hardCapTokens && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
        currentTokens = 0;
      }

      // If we've reached maxTokens and current group has content, flush
      if (currentTokens > config.maxTokens && currentGroup.length > 0) {
        groups.push([...currentGroup]);

        // Overlap: keep last sentence for next chunk
        const overlapSentence = currentGroup[currentGroup.length - 1];
        currentGroup = [overlapSentence];
        currentTokens = estimateTokens(overlapSentence);
      }

      currentGroup.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Push remaining sentences
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Creates Chunk entities from sentence groups, tracking line numbers.
   */
  private createChunksFromSentences(
    _allSentences: string[],
    originalContent: string,
    config: ChunkContentConfig,
    groups: string[][],
  ): Result<Chunk[]> {
    if (groups.length === 0) {
      return Result.ok([]);
    }

    const fileBase = basename(config.filePath);
    const chunks: Chunk[] = [];
    let charOffset = 0;

    for (let i = 0; i < groups.length; i++) {
      const sentences = groups[i];
      const chunkText = sentences.join(' ').trim();
      const estimatedTokens = estimateTokens(chunkText);
      const oversized = estimatedTokens > config.hardCapTokens;

      // Find start position in original content to track line numbers
      const firstSentence = sentences[0];
      const startPos = originalContent.indexOf(firstSentence, charOffset);
      const startLine = countLinesUpTo(originalContent, startPos);

      const chunkEndPos = startPos + chunkText.length;
      const endLine = countLinesUpTo(originalContent, chunkEndPos);

      // Update offset for next chunk
      charOffset = chunkEndPos;

      // Build breadcrumb: basename(filePath):startLine
      const breadcrumb = `${fileBase}:${startLine}`;

      const chunkResult = Chunk.create(
        chunkText,
        i,
        groups.length,
        fileBase,
        breadcrumb,
        undefined,
        FILE_ROLES.DOCS,
        oversized,
        startLine,
        endLine,
        {
          filePath: config.filePath,
          sourceId: config.sourceId,
          estimatedTokens: String(estimatedTokens),
        },
      );

      if (!chunkResult.isOk()) {
        return Result.ko(chunkResult.getError());
      }

      chunks.push(chunkResult.getValue());
    }

    return Result.ok(chunks);
  }
}
