import { Injectable } from '@nestjs/common';
import { Result } from '../../utils/result';
import { Chunker } from './chunker.interface';
import { CHUNKING_STRATEGIES, ChunkingStrategy } from './chunking-strategies';
import { CodeChunker } from './code-chunker.service';
import { ConfigChunker } from './config-chunker.service';
import { MarkdownChunker } from './markdown-chunker.service';
import { TextChunker } from './text-chunker.service';

@Injectable()
export class StrategyFactory {
  private readonly strategyMap: Record<ChunkingStrategy, () => Chunker>;

  constructor(
    private readonly markdownChunker: MarkdownChunker,
    private readonly codeChunker: CodeChunker,
    private readonly textChunker: TextChunker,
    private readonly configChunker: ConfigChunker,
  ) {
    this.strategyMap = {
      [CHUNKING_STRATEGIES.MARKDOWN]: () => this.markdownChunker,
      [CHUNKING_STRATEGIES.RECURSIVE]: () => this.codeChunker,
      [CHUNKING_STRATEGIES.SENTENCE]: () => this.textChunker,
      [CHUNKING_STRATEGIES.FALLBACK]: () => this.textChunker,
      [CHUNKING_STRATEGIES.CONFIG]: () => this.configChunker,
      [CHUNKING_STRATEGIES.SINGLE]: () => this.configChunker,
    };
  }

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
    const factory = this.strategyMap[strategy];
    if (!factory) {
      return Result.ko(new Error(`Unknown chunking strategy: ${strategy}`));
    }
    return Result.ok(factory());
  }

  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }
}
