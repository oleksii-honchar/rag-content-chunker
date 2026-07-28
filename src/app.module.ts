import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AppBootstrapService } from './app-bootstrap.service';
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
import { LoggingModule } from './infrastructure/logging/logger.module';
import { pinoLoggerConfigFactory } from './infrastructure/logging/pino-logger-config.factory';
import { MnemosyneClient } from './infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from './use-cases/chunk-content.use-case';
import { IngestChunkUseCase } from './use-cases/ingest-chunk.use-case';
import { ProcessFileUseCase } from './use-cases/process-file.use-case';

const configLoader = (): Record<string, unknown> => {
  const configPath = process.env.RAG_CONTENT_CHUNKER_CONFIG || '~/.config/rag-content-chunker.yaml';
  const resolvedPath = configPath.startsWith('~')
    ? require('path').join(require('os').homedir(), configPath.slice(1))
    : configPath;

  try {
    const yaml = require('js-yaml');
    const fs = require('fs');
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return yaml.load(content) as Record<string, unknown>;
    }
  } catch (error) {
    // Config will be created by ConfigurationService
  }
  return {};
};

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configLoader],
      isGlobal: true,
      envFilePath: process.env.ENV_FILE || '.env',
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: pinoLoggerConfigFactory,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    LoggingModule,
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
export class AppModule {}
