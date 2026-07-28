import { Injectable } from '@nestjs/common';
import { Result } from '../../../utils/result';
import { CHUNKING_STRATEGIES, ChunkingStrategy } from './chunking-strategies';
import { Chunker } from './chunker.interface';

@Injectable()
export class StrategyFactory {
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
   * Create chunker instance for the given strategy.
   * TODO: Implement once strategy classes exist.
   */
  createChunker(strategy: ChunkingStrategy): Result<Chunker> {
    // Placeholder - will be implemented when strategies are added
    return Result.ko(new Error(`Chunker not yet implemented for strategy: ${strategy}`));
  }

  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }
}
