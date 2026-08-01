---
type: concept
title: "Processing Model"
createdAt: "2026-07-31T07:30:00Z"
updatedAt: "2026-07-31T07:30:00Z"
tags: [domain, processing]
see_also: ["concepts/0001-chunk-concept.concept.md"]
---

# Concept: Processing Model

## What

The Processing Model defines how file changes flow from detection through chunking and ingestion to Mnemosyne — including concurrency, ordering, and fault handling.

## Why

File systems generate events in bursts; Mnemosyne has rate limits. The model ensures controlled, ordered, fault-tolerant processing.

## Key Details

**Flow (verified in src/):**

```
FileWatcherService (chokidar)
    │
    ▼ file:add/change/unlink
AppEventEmitter (@nestjs/event-emitter)
    │
    ▼ @OnEvent FILE_ADDED/CHANGED/DELETED
ProcessFileUseCase
    │
    ▼ queued via
FileProcessingQueue (bounded async queue)
    │
    ├─► read file content (fs.readFile)
    │
    ├─► ChunkContentUseCase → MastraChunkingService → EnhancementPipelineService
    │
    └─► IngestChunkUseCase → MnemosyneClient.remember()
```

**Key properties:**
- **Sequential:** FileProcessingQueue processes files one at a time (no parallel file processing)
- **Debounce:** Configurable per watch source (default 3000ms) — waits for last modification before processing
- **Dedup:** In-memory hash tracking prevents duplicate processing (resets on restart — see memory 0003)
- **Error handling:** Result pattern throughout — errors logged, processing continues for next file
- **Graceful shutdown:** On SIGTERM/SIGINT — stop watchers → drain queue → close Mnemosyne client (30s timeout)
- **Delete handling:** FileDeleted events are logged but not yet propagated to Mnemosyne (TODO)
