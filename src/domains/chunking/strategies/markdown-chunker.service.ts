import { Injectable } from '@nestjs/common';
import { Result } from '../../../utils/result';
import { Chunk, FILE_ROLES } from '../entities/chunk.entity';
import { BasePinoLogger } from '../../../infrastructure/logging/base-pino-logger';
import { ChunkContentConfig, Chunker } from './chunker.interface';

interface HeadingSection {
  level: number;
  text: string;
  contentStart: number;
  contentEnd: number;
}

interface RawChunkData {
  text: string;
  sectionHeader: string;
  breadcrumb: string;
  estimatedTokens: number;
  startLine: number;
  endLine: number;
  chunkNum: number;
}

@Injectable()
export class MarkdownChunker implements Chunker {
  constructor(private readonly logger: BasePinoLogger) {
    this.logger.setContext(MarkdownChunker.name);
  }

  async chunk(content: string, config: ChunkContentConfig): Promise<Result<Chunk[]>> {
    try {
      if (!content.trim()) {
        return Result.ok([]);
      }

      const sections = this.extractSections(content);
      const rawChunks = this.buildRawChunks(sections, content, config);
      const chunks = this.finalizeChunks(rawChunks, config);

      return Result.ok(chunks);
    } catch (error) {
      this.logger.error('Markdown chunking failed', { error, filePath: config.filePath });
      return Result.ko(error as Error);
    }
  }

  private extractSections(content: string): HeadingSection[] {
    const lines = content.split('\n');
    const sections: HeadingSection[] = [];
    let currentSection: HeadingSection | null = null;
    const headingRegex = /^(#{1,3})\s+(.+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(headingRegex);

      if (match) {
        const level = match[1].length;
        const text = match[2].trim();

        if (currentSection) {
          currentSection.contentEnd = this.getLinePosition(lines, i);
          sections.push(currentSection);
        }

        currentSection = {
          level,
          text,
          contentStart: this.getLinePosition(lines, i + 1),
          contentEnd: 0,
        };
      }
    }

    if (currentSection) {
      currentSection.contentEnd = content.length;
      sections.push(currentSection);
    }

    if (sections.length === 0) {
      return [{
        level: 0,
        text: '',
        contentStart: 0,
        contentEnd: content.length,
      }];
    }

    return sections;
  }

  private getLinePosition(lines: string[], lineIndex: number): number {
    if (lineIndex >= lines.length) {
      return lines.join('\n').length;
    }
    let pos = 0;
    for (let i = 0; i < lineIndex; i++) {
      pos += lines[i].length + 1;
    }
    return pos;
  }

  private buildBreadcrumb(sections: HeadingSection[], currentIndex: number): string {
    const path: string[] = [];
    let lastLevel = 0;

    for (let i = 0; i <= currentIndex; i++) {
      const section = sections[i];
      if (section.level === 0) continue;
      if (section.level <= lastLevel) {
        path.length = section.level - 1;
      }
      path.push(section.text);
      lastLevel = section.level;
    }

    return path.join(' > ');
  }

  private buildRawChunks(
    sections: HeadingSection[],
    content: string,
    config: ChunkContentConfig,
  ): RawChunkData[] {
    const rawChunks: RawChunkData[] = [];
    let chunkNum = 1;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionContent = content.slice(section.contentStart, section.contentEnd);
      const breadcrumb = this.buildBreadcrumb(sections, i);
      const sectionHeader = section.level > 0 ? section.text : 'Untitled';

      const subChunks = this.splitLargeSection(
        sectionContent,
        sectionHeader,
        breadcrumb,
        config,
        section.contentStart,
        chunkNum,
      );

      rawChunks.push(...subChunks);
      chunkNum += subChunks.length;
    }

    return rawChunks;
  }

  private splitLargeSection(
    sectionContent: string,
    sectionHeader: string,
    breadcrumb: string,
    config: ChunkContentConfig,
    contentStartPosition: number,
    startChunkNum: number,
  ): RawChunkData[] {
    const estimatedTokens = this.estimateTokens(sectionContent);

    if (estimatedTokens <= config.maxTokens) {
      const [startLine, endLine] = this.getLineRange(sectionContent);
      return [{
        text: sectionContent,
        sectionHeader,
        breadcrumb: breadcrumb || config.filePath,
        estimatedTokens,
        startLine,
        endLine,
        chunkNum: startChunkNum,
      }];
    }

    return this.splitBySize(
      sectionContent,
      sectionHeader,
      breadcrumb,
      config,
      contentStartPosition,
      startChunkNum,
    );
  }

  private splitBySize(
    sectionContent: string,
    sectionHeader: string,
    breadcrumb: string,
    config: ChunkContentConfig,
    _contentStartPosition: number,
    startChunkNum: number,
  ): RawChunkData[] {
    const chunks: RawChunkData[] = [];
    const words = sectionContent.split(/\s+/).filter(Boolean);
    let currentWords: string[] = [];
    let currentTokens = 0;
    let chunkNum = startChunkNum;
    let wordIndex = 0;

    while (wordIndex < words.length) {
      const word = words[wordIndex];
      // Estimate tokens for adding this word (word + space separator)
      const additionalChars = currentWords.length > 0 ? word.length + 1 : word.length;
      const additionalTokens = this.estimateTokens(word + (currentWords.length > 0 ? ' ' : ''));

      const projectedTokens = currentTokens + additionalTokens;

      const shouldFlush =
        (projectedTokens > config.maxTokens && currentWords.length > 0) ||
        currentTokens >= config.hardCapTokens;

      if (shouldFlush) {
        const chunkContent = currentWords.join(' ');
        const [startLine, endLine] = this.getLineRange(chunkContent);

        chunks.push({
          text: chunkContent,
          sectionHeader,
          breadcrumb: breadcrumb || config.filePath,
          estimatedTokens: this.estimateTokens(chunkContent),
          startLine,
          endLine,
          chunkNum,
        });
        chunkNum++;

        const overlapWords = this.getOverlapWords(words, wordIndex, config.overlapTokens);
        currentWords = overlapWords;
        currentTokens = this.estimateTokens(currentWords.join(' '));

        // Ensure overlap doesn't exceed hardCap
        if (currentTokens > config.hardCapTokens) {
          currentWords = [];
          currentTokens = 0;
        }
      } else if (projectedTokens > config.hardCapTokens) {
        // Word alone exceeds hardCap when added — flush current, start fresh with this word
        const chunkContent = currentWords.join(' ');
        if (chunkContent) {
          const [startLine, endLine] = this.getLineRange(chunkContent);
          chunks.push({
            text: chunkContent,
            sectionHeader,
            breadcrumb: breadcrumb || config.filePath,
            estimatedTokens: this.estimateTokens(chunkContent),
            startLine,
            endLine,
            chunkNum,
          });
          chunkNum++;
        }
        currentWords = [word];
        currentTokens = this.estimateTokens(word);
      } else {
        currentWords.push(word);
        currentTokens = projectedTokens;
      }

      wordIndex++;
    }

    if (currentWords.length > 0) {
      const chunkContent = currentWords.join(' ');
      const [startLine, endLine] = this.getLineRange(chunkContent);

      chunks.push({
        text: chunkContent,
        sectionHeader,
        breadcrumb: breadcrumb || config.filePath,
        estimatedTokens: this.estimateTokens(chunkContent),
        startLine,
        endLine,
        chunkNum,
      });
    }

    return chunks;
  }

  private getOverlapWords(words: string[], startIndex: number, overlapTokens: number): string[] {
    const overlapWords: string[] = [];
    let tokens = 0;

    for (let i = startIndex - 1; i >= 0 && tokens < overlapTokens; i--) {
      overlapWords.unshift(words[i]);
      tokens += this.estimateTokens(words[i]);
    }

    return overlapWords;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private getLineRange(content: string): [number, number] {
    const startLine = 1;
    const lines = content.split('\n');
    const endLine = lines.length;
    return [startLine, endLine];
  }

  private finalizeChunks(rawChunks: RawChunkData[], config: ChunkContentConfig): Chunk[] {
    const totalChunks = rawChunks.length;
    const chunks: Chunk[] = [];

    for (let i = 0; i < rawChunks.length; i++) {
      const raw = rawChunks[i];
      const oversized = raw.estimatedTokens > config.hardCapTokens;

      const metadata: Record<string, string> = {
        filePath: config.filePath,
        sourceId: config.sourceId,
        chunkNum: raw.chunkNum.toString(),
        estimatedTokens: raw.estimatedTokens.toString(),
      };

      const chunkResult = Chunk.create(
        raw.text,
        i + 1,
        totalChunks,
        raw.sectionHeader,
        raw.breadcrumb,
        undefined,
        FILE_ROLES.DOCS,
        oversized,
        raw.startLine,
        raw.endLine,
        metadata,
      );

      if (chunkResult.isOk()) {
        chunks.push(chunkResult.getValue());
      }
    }

    return chunks;
  }
}
