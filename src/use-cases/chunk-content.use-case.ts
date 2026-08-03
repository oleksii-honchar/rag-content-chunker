import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EnhancementPipelineService } from '../application/services/enhancement-pipeline.service';
import { MastraChunkingService } from '../application/strategies/mastra-chunking.service';
import { Chunk } from '../domain/content-chunk.entity';
import { ConfigurationService } from '../infrastructure/config/configuration.service';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { BaseUseCase } from '../utils/base-use-case';
import { Result } from '../utils/result';

const chunkContentParamsSchema = z.object({
  content: z.string().min(1),
  filePath: z.string().min(1),
  sourceId: z.string().min(1),
  namespace: z.string().min(1),
  maxTokens: z.number().positive().optional(),
  overlapTokens: z.number().nonnegative().optional(),
  hardCapTokens: z.number().positive().optional(),
});

export type ChunkContentParams = z.infer<typeof chunkContentParamsSchema>;

@Injectable()
export class ChunkContentUseCase extends BaseUseCase<ChunkContentParams, Chunk[]> {
  constructor(
    private readonly mastraChunkingService: MastraChunkingService,
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
      return Result.ko(new Error('Invalid chunk content params: ' + parsed.error.message));
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: ChunkContentParams): Promise<Result<Chunk[]>> {
    this.logger.debug(
      `Chunking content; path="${params.filePath}", length=${params.content.length}, namespace="${params.namespace}"`,
    );

    const chunksResult = await this.mastraChunkingService.chunkFile(
      params.content,
      params.filePath,
      params.sourceId,
    );

    if (chunksResult.isKo()) {
      this.logger.error(
        `Mastra chunking failed: path="${params.filePath}", error="${chunksResult.getError().message}"`,
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
      params.namespace,
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
      `Enhancement pipeline failed, returning raw chunks: path="${params.filePath}", error="${enhancementResult.getError().message}"`,
    );
    return Result.ok(chunks);
  }
}
