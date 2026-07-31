import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppBootstrapService } from './app-bootstrap.service';
import { AppConfig } from './app.config';
import { validateAppEnv } from './app.env.validation';
import { ForceReprocessService } from './application/force-reprocess.service';
import { EnhancementPipelineService } from './application/services/enhancement-pipeline.service';
import { ImportanceScoringService } from './application/services/importance-scoring.service';
import { TagExtractionService } from './application/services/tag-extraction.service';
import { MastraChunkingService } from './application/strategies/mastra-chunking.service';
import { DomainModule } from './domain/domain.module';
import { AppEventEmitter } from './infrastructure/app-event-emitter';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { FileProcessingQueue } from './infrastructure/file-processing-queue.service';
import { FileWatcherService } from './infrastructure/file-watcher.service';
import { GracefulShutdownService } from './infrastructure/graceful-shutdown.service';
import { LoggerModule } from './infrastructure/logging/logger.module';
import { MnemosyneClient } from './infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from './use-cases/chunk-content.use-case';
import { IngestChunkUseCase } from './use-cases/ingest-chunk.use-case';
import { ProcessFileUseCase } from './use-cases/process-file.use-case';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [AppConfig],
      isGlobal: true,
      validate: validateAppEnv,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    LoggerModule.forRootAsync(),
    ConfigurationModule,
    DomainModule,
  ],
  controllers: [],
  providers: [
    AppEventEmitter,
    AppBootstrapService,
    FileWatcherService,
    GracefulShutdownService,
    // Use cases
    ChunkContentUseCase,
    ProcessFileUseCase,
    IngestChunkUseCase,
    // Chunking
    MastraChunkingService,
    // Enhancement pipeline
    EnhancementPipelineService,
    ImportanceScoringService,
    TagExtractionService,
    // Application services
    ForceReprocessService,
    // Infrastructure
    FileProcessingQueue,
    MnemosyneClient,
  ],
})
export class AppModule {}
