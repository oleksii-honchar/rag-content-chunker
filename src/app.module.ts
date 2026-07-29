import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppBootstrapService } from './app-bootstrap.service';
import { AppConfig } from './app.config';
import { validateAppEnv } from './app.env.validation';
import { ForceReprocessService } from './application/force-reprocess.service';
import { CodeChunker } from './application/strategies/code-chunker.service';
import { ConfigChunker } from './application/strategies/config-chunker.service';
import { MarkdownChunker } from './application/strategies/markdown-chunker.service';
import { StrategyFactory } from './application/strategies/strategy-factory.service';
import { TextChunker } from './application/strategies/text-chunker.service';
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
    // Strategies
    StrategyFactory,
    MarkdownChunker,
    CodeChunker,
    TextChunker,
    ConfigChunker,
    // Application services
    ForceReprocessService,
    // Infrastructure
    FileProcessingQueue,
    MnemosyneClient,
  ],
})
export class AppModule { }
