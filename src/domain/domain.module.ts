import { Module } from '@nestjs/common';
import { ForceReprocessService } from '../application/force-reprocess.service';
import { CodeChunker } from '../application/strategies/code-chunker.service';
import { ConfigChunker } from '../application/strategies/config-chunker.service';
import { MarkdownChunker } from '../application/strategies/markdown-chunker.service';
import { StrategyFactory } from '../application/strategies/strategy-factory.service';
import { TextChunker } from '../application/strategies/text-chunker.service';
import { ConfigurationModule } from '../infrastructure/config/configuration.module';
import { FileProcessingQueue } from '../infrastructure/file-processing-queue.service';
import { MnemosyneClient } from '../infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from '../use-cases/chunk-content.use-case';
import { IngestChunkUseCase } from '../use-cases/ingest-chunk.use-case';
import { ProcessFileUseCase } from '../use-cases/process-file.use-case';

@Module({
  imports: [ConfigurationModule],
  providers: [
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
    // Services
    ForceReprocessService,
    // Infrastructure (injected into use cases)
    FileProcessingQueue,
    MnemosyneClient,
  ],
  exports: [
    ChunkContentUseCase,
    ProcessFileUseCase,
    IngestChunkUseCase,
    StrategyFactory,
    ForceReprocessService,
    FileProcessingQueue,
    MnemosyneClient,
  ],
})
export class DomainModule {}
