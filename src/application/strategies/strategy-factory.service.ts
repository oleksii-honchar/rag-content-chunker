import { Injectable } from '@nestjs/common';
import { ErrorWithDetails } from '../../utils/error-with-details';
import { Result } from '../../utils/result';
import { Chunker } from './chunker.interface';
import { CHUNKING_STRATEGIES, ChunkingStrategy } from './chunking-strategies';
import { CodeChunker } from './code-chunker.service';
import { ConfigChunker } from './config-chunker.service';
import { MarkdownChunker } from './markdown-chunker.service';
import { TextChunker } from './text-chunker.service';

@Injectable()
export class StrategyFactory {
  constructor(
    private readonly markdownChunker: MarkdownChunker,
    private readonly codeChunker: CodeChunker,
    private readonly textChunker: TextChunker,
    private readonly configChunker: ConfigChunker,
  ) {}

  /**
   * Determine chunking strategy based on file path and extension.
   */
  determineStrategy(filePath: string): ChunkingStrategy {
    const ext = this.getExtension(filePath).toLowerCase();

    // Markdown
    if (ext === '.md' || ext === '.mdx') {
      return CHUNKING_STRATEGIES.MARKDOWN;
    }

    // Code files - recursive chunking
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.cs', '.php'].includes(ext)) {
      return CHUNKING_STRATEGIES.RECURSIVE;
    }

    // Config files - structure-aware
    if (['.json', '.yml', '.yaml', '.toml'].includes(ext)) {
      return CHUNKING_STRATEGIES.CONFIG;
    }

    // Single chunk files (env files including .env.local, .env.production, etc.)
    const basename = filePath.split('/').pop() ?? '';
    if (basename === '.env' || basename.startsWith('.env.')) {
      return CHUNKING_STRATEGIES.SINGLE;
    }

    // Plain text - sentence-based
    if (ext === '.txt') {
      return CHUNKING_STRATEGIES.SENTENCE;
    }

    // Fallback for everything else
    return CHUNKING_STRATEGIES.FALLBACK;
  }

  /**
   * Get chunker instance for the given strategy.
   */
  createChunker(strategy: ChunkingStrategy): Result<Chunker> {
    switch (strategy) {
      case CHUNKING_STRATEGIES.MARKDOWN:
        return Result.ok(this.markdownChunker);
      case CHUNKING_STRATEGIES.RECURSIVE:
        return Result.ok(this.codeChunker);
      case CHUNKING_STRATEGIES.SENTENCE:
      case CHUNKING_STRATEGIES.FALLBACK:
        return Result.ok(this.textChunker);
      case CHUNKING_STRATEGIES.CONFIG:
      case CHUNKING_STRATEGIES.SINGLE:
        return Result.ok(this.configChunker);
      default:
        return Result.ko(new ErrorWithDetails(`Unknown chunking strategy: ${strategy}`, 'UnknownStrategy'));
    }
  }

  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }
}
