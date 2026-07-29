import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StrategyFactory } from '../application/strategies/strategy-factory.service';
import { Chunk } from '../domain/chunk.entity';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { BaseUseCase } from '../utils/base-use-case';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';

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
    this.logger = this.logger.child({ component: 'ChunkContentUseCase' });
  }

  protected validateParams(params: ChunkContentParams): Result<ChunkContentParams> {
    const parsed = chunkContentParamsSchema.safeParse(params);
    if (!parsed.success) {
      return Result.ko(
        new ErrorWithDetails(
          'Invalid chunk content params: ' + parsed.error.message,
          'InvalidChunkContentParams',
        ),
      );
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: ChunkContentParams): Promise<Result<Chunk[]>> {
    this.logger.debug(`Chunking content; path="${params.filePath}", length=${params.content.length}`);

    const strategy = this.strategyFactory.determineStrategy(params.filePath);
    this.logger.debug(`Using chunking strategy; strategy="${strategy}", path="${params.filePath}"`);

    const chunkerResult = this.strategyFactory.createChunker(strategy);
    if (chunkerResult.isKo()) {
      this.logger.error(
        `Failed to create chunker: strategy="${strategy}", error="${chunkerResult.getError().message}"`,
      );
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
      this.logger.error(
        `Chunking failed: path="${params.filePath}", error="${chunksResult.getError().message}"`,
      );
      return chunksResult;
    }

    const chunks = chunksResult.getValue();
    this.logger.info(
      `Content chunked: path="${params.filePath}", strategy="${strategy}", chunks=${chunks.length}`,
    );

    return Result.ok(chunks);
  }
}
