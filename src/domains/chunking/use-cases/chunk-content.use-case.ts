import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result } from '../../../utils/result';
import { BaseUseCase } from '../../../utils/base-use-case';
import { BasePinoLogger } from '../../../infrastructure/logging/base-pino-logger';
import { Chunk } from '../entities/chunk.entity';
import { StrategyFactory } from '../strategies/strategy-factory.service';

const chunkContentParamsSchema = z.object({
  content: z.string().min(1),
  filePath: z.string().min(1),
  sourceId: z.string().min(1),
  maxTokens: z.number().positive().optional(),
  overlapTokens: z.number().nonnegative().optional(),
  hardCapTokens: z.number().positive().optional(),
});

export type ChunkContentParams = z.infer<typeof chunkContentParamsSchema>;

@Injectable()
export class ChunkContentUseCase extends BaseUseCase<ChunkContentParams, Chunk[]> {
  constructor(
    private readonly strategyFactory: StrategyFactory,
    logger: BasePinoLogger,
  ) {
    super(logger);
  }

  protected validateParams(params: ChunkContentParams): Result<ChunkContentParams> {
    const parsed = chunkContentParamsSchema.safeParse(params);
    if (!parsed.success) {
      return Result.ko(new Error('Invalid chunk content params: ' + parsed.error.message));
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: ChunkContentParams): Promise<Result<Chunk[]>> {
    this.logger.debug('Chunking content', {
      filePath: params.filePath,
      contentLength: params.content.length,
    });

    const strategy = this.strategyFactory.determineStrategy(params.filePath);
    this.logger.debug('Using chunking strategy', { strategy, filePath: params.filePath });

    const chunkerResult = this.strategyFactory.createChunker(strategy);
    if (chunkerResult.isKo()) {
      this.logger.error('Failed to create chunker', {
        error: chunkerResult.getError().message,
        strategy,
      });
      return chunkerResult as unknown as Result<Chunk[]>;
    }

    const chunker = chunkerResult.getValue();

    const chunkConfig = {
      maxTokens: params.maxTokens || 500,
      overlapTokens: params.overlapTokens || 50,
      hardCapTokens: params.hardCapTokens || 600,
      filePath: params.filePath,
      sourceId: params.sourceId,
    };

    const chunksResult = await chunker.chunk(params.content, chunkConfig);
    if (chunksResult.isKo()) {
      this.logger.error('Chunking failed', {
        error: chunksResult.getError().message,
        filePath: params.filePath,
      });
      return chunksResult;
    }

    const chunks = chunksResult.getValue();
    this.logger.info('Content chunked', {
      filePath: params.filePath,
      chunkCount: chunks.length,
    });

    return Result.ok(chunks);
  }
}
