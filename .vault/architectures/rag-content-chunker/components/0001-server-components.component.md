---
type: component
title: "RAG Content Chunker — Server Components"
c4_level: component
system: rag-content-chunker
createdAt: "2026-07-31T07:30:00Z"
updatedAt: "2026-07-31T07:30:00Z"
tags: [architecture, component]
see_also: ["concepts/0005-processing-model.concept.md"]
linked_elements: []
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Component: RAG Content Chunker — Server Components

## Diagram

```mermaid
C4Component
  title RAG Content Chunker — Component Level

  Container(server, "RAG Content Chunker Server", "Node.js + NestJS", "CLI server")

  Boundary(server, "Server Components", "Boundary") {
    Component(fileWatcher, "FileWatcherService", "TypeScript + Chokidar", "Monitors configured directories for add/change/unlink")
    Component(eventBus, "AppEventEmitter", "TypeScript + @nestjs/event-emitter", "Pub/sub for file change events")
    Component(processFile, "ProcessFileUseCase", "TypeScript", "Orchestrates: read file → chunk → enhance → ingest")
    Component(fileQueue, "FileProcessingQueue", "TypeScript", "Bounded async queue for sequential processing")
    Component(chunkContent, "ChunkContentUseCase", "TypeScript", "Delegates to MastraChunkingService")
    Component(mastraChunking, "MastraChunkingService", "TypeScript + @mastra/rag", "MDocument-based chunking with strategy selection")
    Component(enhancement, "EnhancementPipelineService", "TypeScript", "Post-chunking: importance scoring + tag extraction")
    Component(ingestChunk, "IngestChunkUseCase", "TypeScript", "Batches chunks to MnemosyneClient")
    Component(mnemosyneClient, "MnemosyneClient", "TypeScript + native http", "Streamable HTTP MCP client (remember/recall)")
    Component(config, "ConfigurationService", "TypeScript + Zod", "Loads and validates config schemas")
    Component(shutdown, "GracefulShutdownService", "TypeScript", "SIGTERM/SIGINT handler: drain queue, close clients")
  }

  Component_Ext(filesystem, "File System", "OS", "Watched directories")
  Component_Ext(mnemosyne, "better-mnemosyne MCP", "Python", "Remote MCP server")

  Rel(filesystem, fileWatcher, "Triggers events")
  Rel(fileWatcher, eventBus, "Emits FILE_ADDED/CHANGED/DELETED")
  Rel(eventBus, processFile, "Subscribes to events")
  Rel(processFile, fileQueue, "Queues processing tasks")
  Rel(processFile, chunkContent, "Delegates chunking")
  Rel(chunkContent, mastraChunking, "Uses for MDocument chunking")
  Rel(mastraChunking, enhancement, "Passes chunks for enhancement")
  Rel(processFile, ingestChunk, "Delegates ingestion")
  Rel(ingestChunk, mnemosyneClient, "Calls remember() per chunk")
  Rel(mnemosyneClient, mnemosyne, "Streamable HTTP POST /mcp")
  Rel(server, config, "Reads configuration")
  Rel(server, shutdown, "Registers shutdown hooks")
```

## Elements

| ID | Name | Type | Technology | Description |
|----|------|------|-----------|-------------|
| `fileWatcher` | FileWatcherService | Component | Chokidar | Watches multiple configured directories with debounce per source |
| `eventBus` | AppEventEmitter | Component | @nestjs/event-emitter | Pub/sub event bus decoupling FileWatcher from ProcessFileUseCase |
| `processFile` | ProcessFileUseCase | Component | DDD UseCase | Main orchestration: read → chunk → enhance → ingest (via event handlers @OnEvent) |
| `fileQueue` | FileProcessingQueue | Component | Native TS | Bounded async queue — sequential processing, graceful drain on shutdown |
| `chunkContent` | ChunkContentUseCase | Component | DDD UseCase | Delegates to MastraChunkingService, applies enhancement pipeline |
| `mastraChunking` | MastraChunkingService | Component | @mastra/rag | Core chunking logic: MDocument factory → strategy selection → chunk → map to domain Chunk entities |
| `enhancement` | EnhancementPipelineService | Component | DDD Service | Post-chunking: ImportanceScoringService → TagExtractionService → namespace assignment |
| `ingestChunk` | IngestChunkUseCase | Component | DDD UseCase | Batches enhanced chunks to MnemosyneClient.remember() |
| `mnemosyneClient` | MnemosyneClient | Component | Native http | Streamable HTTP MCP client: initialize handshake, remember/recall, retry with backoff |
| `config` | ConfigurationService | Component | Zod | Parses YAML config, validates against Zod schemas, provides typed getters |
| `shutdown` | GracefulShutdownService | Component | Node.js signals | Handles SIGTERM/SIGINT: stops watchers, drains queue (30s), closes MnemosyneClient |

## Notes

- **DDD layers:** domain/ (entities/aggregates), application/ (services), use-cases/ (orchestration), infrastructure/ (external integration)
- **Result pattern:** All operations return `Result<T>` — zero exceptions for control flow
- **No Effect library:** Pure NestJS with Result pattern; domain events via @nestjs/event-emitter
