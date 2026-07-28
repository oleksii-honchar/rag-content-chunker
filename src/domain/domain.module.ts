import { Module } from '@nestjs/common';
import { ForceReprocessService } from '../application/services/force-reprocess.service';
import { CodeChunker } from '../application/strategies/code-chunker.service';
import { ConfigChunker } from '../application/strategies/config-chunker.service';
import { MarkdownChunker } from '../application/strategies/markdown-chunker.service';
import { StrategyFactory } from '../application/strategies/strategy-factory.service';
import { TextChunker } from '../application/strategies/text-chunker.service';
import { ChunkContentUseCase } from '../chunk-content.use-case';
import { ConfigurationModule } from '../infrastructure/config/configuration.module';
import { MnemosyneClient } from '../infrastructure/mcp/mnemosyne-client.service';
import { FileProcessingQueue } from '../infrastructure/queue/file-processing-queue.service';
import { IngestChunkUseCase } from '../ingest-chunk.use-case';
import { ProcessFileUseCase } from '../process-file.use-case';

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
