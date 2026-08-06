import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EnhancementPipelineService } from '../application/services/enhancement-pipeline.service';
import { BaseChunkingStrategy } from '../application/strategies/base-chunking-strategy';
import { StrategyRouter } from '../application/strategies/strategy-router.service';
import { ContentChunk } from '../domain/content-chunk.entity';
import { watchSourceConfigSchema } from '../infrastructure/config/config-schemas';
import { ConfigurationService } from '../infrastructure/config/configuration.service';
import { SOURCE_STRATEGIES } from '../infrastructure/config/source-strategies';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { BaseUseCase } from '../utils/base-use-case';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';

const chunkContentParamsSchema = z.object({
  content: z.string().min(1),
  filePath: z.string().min(1),
  sourceId: z.string().min(1),
  memoryBank: z.string().min(1),
  maxTokens: z.number().positive().optional(),
  overlapTokens: z.number().nonnegative().optional(),
  hardCapTokens: z.number().positive().optional(),
  sourceConfig: watchSourceConfigSchema.optional(),
});

export type ChunkContentParams = z.infer<typeof chunkContentParamsSchema>;

@Injectable()
export class ChunkContentUseCase extends BaseUseCase<ChunkContentParams, ContentChunk[]> {
  constructor(
    private readonly strategyRouter: StrategyRouter,
    private readonly enhancementPipelineService: EnhancementPipelineService,
    private readonly configurationService: ConfigurationService,
    logger: BasePinoLogger,
  ) {
    super(logger);
    this.logger = this.logger.child({ component: 'ChunkContentUseCase' });
  }

  protected validateParams(params: ChunkContentParams): Result<ChunkContentParams> {
    const parsed = chunkContentParamsSchema.safeParse(params);
    if (!parsed.success) {
      return Result.ko([
        new ErrorWithDetails(
          'Invalid chunk content params: ' + parsed.error.message,
          'InvalidChunkContentParams',
        ),
      ]);
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: ChunkContentParams): Promise<Result<ContentChunk[]>> {
    this.logger.debug(
      `Chunking content; path="${params.filePath}", length=${params.content.length}, memoryBank="${params.memoryBank}"`,
    );

    // Select chunking strategy based on sourceConfig (defaults to content-aware/Mastra)
    const strategy: BaseChunkingStrategy = params.sourceConfig
      ? this.strategyRouter.selectStrategy(params.sourceConfig)
      : this.strategyRouter.selectStrategy({
          id: params.sourceId,
          path: params.filePath,
          memoryBank: params.memoryBank,
          exclude: [],
          debounceMs: 3000,
          strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
        });

    const effectiveSourceConfig = params.sourceConfig ?? {
      id: params.sourceId,
      path: params.filePath,
      memoryBank: params.memoryBank,
      exclude: [],
      debounceMs: 3000,
      strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
    };

    const chunksResult = await strategy.chunkFile(
      params.content,
      params.filePath,
      params.sourceId,
      effectiveSourceConfig,
    );

    if (chunksResult.isKo()) {
      this.logger.error(
        `Chunking failed: path="${params.filePath}", error="${chunksResult.getFormattedErrors()}"`,
      );
      return chunksResult;
    }

    const chunks = chunksResult.getValue();
    this.logger.info(`Content chunked: path="${params.filePath}", chunks=${chunks.length}`);

    // Pipe chunks through enhancement pipeline
    const enhancementConfig = this.configurationService.getEnhancementConfig();
    const enhancementResult = await this.enhancementPipelineService.enhance(
      chunks,
      params.sourceId,
      params.memoryBank,
      enhancementConfig,
    );

    if (enhancementResult.isOk()) {
      this.logger.info(
        `Chunks enhanced: path="${params.filePath}", enhanced=${enhancementResult.getValue().length}`,
      );
      return enhancementResult;
    }

    // Fallback: log error and return raw chunks (resilient)
    this.logger.error(
      `Enhancement pipeline failed, returning raw chunks: path="${params.filePath}", error="${enhancementResult.getFormattedErrors()}"`,
    );
    return Result.ok(chunks);
  }
}
