import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'fs/promises';
import { z } from 'zod';
import {
  FILE_EVENTS,
  FileAddedEvent,
  FileChangedEvent,
  FileDeletedEvent,
} from '../domain/events/file-events';
import { FileProcessingQueue } from '../infrastructure/file-processing-queue.service';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { BaseUseCase } from '../utils/base-use-case';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { ChunkContentUseCase } from './chunk-content.use-case';
import { IngestChunkUseCase } from './ingest-chunk.use-case';

const processFileParamsSchema = z.object({
  filePath: z.string().min(1),
  eventType: z.enum(['add', 'change', 'delete']),
  sourceId: z.string().min(1),
});

export type ProcessFileParams = z.infer<typeof processFileParamsSchema>;

@Injectable()
export class ProcessFileUseCase extends BaseUseCase<ProcessFileParams, void> {
  constructor(
    private readonly chunkContentUseCase: ChunkContentUseCase,
    private readonly ingestChunkUseCase: IngestChunkUseCase,
    private readonly processingQueue: FileProcessingQueue,
    logger: BasePinoLogger,
  ) {
    super(logger);
    this.logger = this.logger.child({ component: '[ProcessFileUseCase]' });
  }

  protected validateParams(params: ProcessFileParams): Result<ProcessFileParams> {
    const parsed = processFileParamsSchema.safeParse(params);
    if (!parsed.success) {
      return Result.ko(
        new ErrorWithDetails(
          'Invalid process file params: ' + parsed.error.message,
          'InvalidProcessFileParams',
        ),
      );
    }
    return Result.ok(parsed.data);
  }

  protected async executeInternal(params: ProcessFileParams): Promise<Result<void>> {
    this.logger.debug('Processing file', {
      filePath: params.filePath,
      eventType: params.eventType,
      sourceId: params.sourceId,
    });

    // Queue the processing
    await this.processingQueue.addToQueue(async () => {
      let result: Result<void>;

      switch (params.eventType) {
        case 'add':
        case 'change':
          result = await this.handleAddOrChange(params);
          break;
        case 'delete':
          result = await this.handleDelete(params);
          break;
        default:
          result = Result.ko(
            new ErrorWithDetails(`Unknown event type: ${params.eventType}`, 'UnknownEventType'),
          );
      }

      if (result.isKo()) {
        this.logger.error('File processing failed', {
          filePath: params.filePath,
          eventType: params.eventType,
          error: result.getError().message,
        });
      }
    });

    return Result.ok(undefined as unknown as void);
  }

  private async handleAddOrChange(params: ProcessFileParams): Promise<Result<void>> {
    // Read file content
    let content: string;
    try {
      content = await fs.readFile(params.filePath, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to read file', {
        filePath: params.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'FileReadError', {
          filePath: params.filePath,
        }),
      );
    }

    // Chunk content
    const chunksResult = await this.chunkContentUseCase.execute({
      content,
      filePath: params.filePath,
      sourceId: params.sourceId,
    });

    if (chunksResult.isKo()) {
      this.logger.error('Failed to chunk content', {
        filePath: params.filePath,
        error: chunksResult.getError().message,
      });
      return chunksResult as unknown as Result<void>;
    }

    const chunks = chunksResult.getValue();
    if (chunks.length === 0) {
      this.logger.debug('No chunks generated', { filePath: params.filePath });
      return Result.ok(undefined as unknown as void);
    }

    this.logger.info('Chunks created', { filePath: params.filePath, chunkCount: chunks.length });

    // Ingest chunks
    const ingestResult = await this.ingestChunkUseCase.execute({
      chunks,
      sourceId: params.sourceId,
      metadata: {
        filePath: params.filePath,
        eventType: params.eventType,
      },
    });

    if (ingestResult.isKo()) {
      this.logger.error('Failed to ingest chunks', {
        filePath: params.filePath,
        error: ingestResult.getError().message,
      });
      return ingestResult as unknown as Result<void>;
    }

    this.logger.info('File processed successfully', {
      filePath: params.filePath,
      eventType: params.eventType,
      chunkCount: chunks.length,
    });

    return Result.ok(undefined as unknown as void);
  }

  private async handleDelete(params: ProcessFileParams): Promise<Result<void>> {
    this.logger.info('File deleted', {
      filePath: params.filePath,
      sourceId: params.sourceId,
    });
    // MCP deletion handled separately
    return Result.ok(undefined as unknown as void);
  }

  @OnEvent(FILE_EVENTS.ADDED)
  async handleFileAdded(event: FileAddedEvent): Promise<void> {
    await this.execute({
      filePath: event.path,
      eventType: 'add',
      sourceId: 'default',
    });
  }

  @OnEvent(FILE_EVENTS.CHANGED)
  async handleFileChanged(event: FileChangedEvent): Promise<void> {
    await this.execute({
      filePath: event.path,
      eventType: 'change',
      sourceId: 'default',
    });
  }

  @OnEvent(FILE_EVENTS.DELETED)
  async handleFileDeleted(event: FileDeletedEvent): Promise<void> {
    await this.execute({
      filePath: event.path,
      eventType: 'delete',
      sourceId: 'default',
    });
  }
}
