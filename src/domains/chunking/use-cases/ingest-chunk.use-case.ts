import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result } from '../../../utils/result';
import { BaseUseCase } from '../../../utils/base-use-case';
import { BasePinoLogger } from '../../../infrastructure/logging/base-pino-logger';
import { Chunk } from '../entities/chunk.entity';
import { MnemosyneClient } from '../../../infrastructure/mcp/mnemosyne-client.service';

const ingestChunkParamsSchema = z.object({
  chunks: z.array(z.custom<Chunk>()),
  sourceId: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type IngestChunkParams = z.infer<typeof ingestChunkParamsSchema>;

@Injectable()
export class IngestChunkUseCase extends BaseUseCase<IngestChunkParams, void> {
  constructor(
    private readonly mnemosyneClient: MnemosyneClient,
    logger: BasePinoLogger,
  ) {
    super(logger);
  }

  protected validateParams(params: IngestChunkParams): Result<IngestChunkParams> {
    const parsed = ingestChunkParamsSchema.safeParse(params);
    if (!parsed.success) {
      return Result.ko(new Error('Invalid ingest chunk params: ' + parsed.error.message));
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: IngestChunkParams): Promise<Result<void>> {
    this.logger.debug('Ingesting chunks', {
      chunkCount: params.chunks.length,
      sourceId: params.sourceId,
    });

    if (params.chunks.length === 0) {
      this.logger.debug('No chunks to ingest');
      return Result.ok(undefined as unknown as void);
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ chunkId: string; error: string }> = [];

    for (const chunk of params.chunks) {
      try {
        const result = await this.mnemosyneClient.remember(chunk);
        if (result.isOk()) {
          successCount++;
          this.logger.debug('Chunk ingested', {
            chunkId: chunk.id,
            chunkIndex: chunk.chunkIndex,
          });
        } else {
          failureCount++;
          errors.push({
            chunkId: chunk.id,
            error: result.getError().message,
          });
          this.logger.error('Chunk ingestion failed', {
            chunkId: chunk.id,
            error: result.getError().message,
          });
        }
      } catch (error) {
        failureCount++;
        errors.push({
          chunkId: chunk.id,
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.error('Chunk ingestion threw', {
          chunkId: chunk.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Chunk ingestion completed', {
      sourceId: params.sourceId,
      totalChunks: params.chunks.length,
      successCount,
      failureCount,
    });

    if (failureCount > 0 && successCount === 0) {
      return Result.ko(new Error(
        `Failed to ingest all ${failureCount} chunks: ${errors.map(e => e.error).join('; ')}`
      ));
    }

    if (failureCount > 0) {
      this.logger.warn('Partial chunk ingestion failure', {
        errors,
      });
    }

    return Result.ok(undefined as unknown as void);
  }
}
