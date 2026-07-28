import { Module } from '@nestjs/common';
import { ChunkContentUseCase } from './use-cases/chunk-content.use-case';
import { ProcessFileUseCase } from './use-cases/process-file.use-case';
import { IngestChunkUseCase } from './use-cases/ingest-chunk.use-case';
import { StrategyFactory } from './strategies/strategy-factory.service';
import { MarkdownChunker } from './strategies/markdown-chunker.service';
import { CodeChunker } from './strategies/code-chunker.service';
import { TextChunker } from './strategies/text-chunker.service';
import { ConfigChunker } from './strategies/config-chunker.service';
import { ForceReprocessService } from './services/force-reprocess.service';
import { FileProcessingQueue } from '../../infrastructure/queue/file-processing-queue.service';
import { MnemosyneClient } from '../../infrastructure/mcp/mnemosyne-client.service';
import { ConfigurationModule } from '../../infrastructure/config/configuration.module';

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
export class ChunkingModule {}
