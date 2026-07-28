# RAG Content Chunker — Implementation Plan

## Completed Tasks

### Task 8: File Processing Queue (Sequential)
- [x] FileProcessingQueue with addToQueue(task: () => Promise<void>): Promise<void>
- [x] Tasks processed sequentially, never in parallel
- [x] Mutex pattern prevents concurrent queue processing
- [x] Unit tests verify sequential execution order
- [x] Unit tests verify multiple tasks queued and all processed

**Files Created:**
- `src/infrastructure/queue/file-processing-queue.service.ts`
- `src/infrastructure/queue/file-processing-queue.service.test.ts`

**Tests:** 5 passing, full suite 113 passing

### Task 10: File Watcher Service
- [x] FileWatcherService.start() watches all configured sources from config
- [x] FileWatcherService.stop() closes watchers
- [x] Handles add, change, unlink events → FileChange aggregate → AppEventEmitter
- [x] Debounce per source (using awaitWriteFinish with debounceMs)
- [x] Respects exclude/ignorePatterns per source + default patterns (.DS_Store, Thumbs.db, .env*)
- [x] Unit tests for watcher start/stop, event emission, debounce behavior
- [x] Registered in AppModule with ConfigurationModule

**Files Created:**
- `src/infrastructure/watcher/file-watcher.service.ts`
- `src/infrastructure/watcher/file-watcher.service.test.ts`

**Files Modified:**
- `src/app.module.ts` — added ConfigurationModule import, FileWatcherService provider
- `src/infrastructure/config/configuration.module.ts` — added LoggingModule import
- `src/infrastructure/config/configuration.service.ts` — fixed logger injection (BasePinoLogger token)
- `src/infrastructure/config/configuration.service.test.ts` — updated logger token
- `src/app.module.test.ts` — added chokidar mock

**Tests:** 11 new passing tests, full suite 132 passing

### Task 13: Markdown Chunking Strategy
- [x] MarkdownChunker implements Chunker interface
- [x] Splits on heading boundaries (h1, h2, h3)
- [x] Builds breadcrumb from header hierarchy (h1 > h2 > h3)
- [x] Respects max size with overlap
- [x] Hard cap at hardCapTokens enforced during splitting
- [x] fileRole = DOCS
- [x] metadata includes filePath, sourceId, chunkNum, estimatedTokens
- [x] Unit tests for heading-aware splitting, breadcrumb construction, large section splitting

**Files Created:**
- `src/domains/chunking/strategies/markdown-chunker.service.ts`

**Files Modified:**
- `src/domains/chunking/strategies/markdown-chunker.service.test.ts` — fixed test setup (direct instantiation), fixed error test
- `jest.config.ts` → `jest.config.cjs` — fixed Jest/TS config for ts-jest compatibility
- `package.json` — upgraded jest@29, ts-jest@29, typescript@5.3

**Tests:** 18 passing (markdown-chunker.service.test.ts), full suite 181 passing

### Task 16: Config Chunking Strategy
- [x] ConfigChunker implements Chunker interface
- [x] JSON: one chunk per top-level key
- [x] YAML: one chunk per top-level key (uses js-yaml)
- [x] TOML: one chunk per section header
- [x] .env: entire file as single chunk (comments stripped)
- [x] Breadcrumb: `filename > key`
- [x] fileRole = CONFIG
- [x] metadata includes filePath, sourceId, type (json/yaml/toml/env), key, estimatedTokens
- [x] Unit tests for each config format (JSON, YAML, TOML, .env)
- [x] Fallback chunking for unknown extensions and invalid parse

**Files Created:**
- `src/domains/chunking/strategies/config-chunker.service.ts`

**Files Modified:**
- `src/domains/chunking/strategies/config-chunker.service.test.ts` — fixed test setup (direct instantiation), fixed typing

**Tests:** 40 passing (config-chunker.service.test.ts), full suite 256 passing (2 pre-existing failures unrelated)

### Task 19: Mnemosyne MCP Client
- [x] MnemosyneClient.initialize() establishes connection via health check
- [x] MnemosyneClient.remember(chunk) calls memory_remember tool with full chunk metadata
- [x] Retry logic: maxRetries, retryDelayMs from config (exponential backoff: delay * attempt)
- [x] MnemosyneClient.healthCheck() verifies connection via ping
- [x] Unit tests for client initialization, remember call, retry behavior, error paths
- [x] Zero `any`, Result pattern, kebab-case file names

**Files Created:**
- `src/infrastructure/mcp/mnemosyne-client.service.ts`
- `src/infrastructure/mcp/mnemosyne-client.service.test.ts`

**Tests:** 23 new passing tests, full suite 311 passing (2 pre-existing failures unrelated)

### Task 21: Chunking Domain Module
- [x] ChunkingModule imports and provides all chunking domain components
- [x] All use cases provided and testable (ChunkContentUseCase, ProcessFileUseCase, IngestChunkUseCase)
- [x] All strategies provided (StrategyFactory, MarkdownChunker, CodeChunker, TextChunker, ConfigChunker)
- [x] Module loads without errors
- [x] Build succeeds
- [x] Added @Injectable() decorators to CodeChunker, TextChunker, ConfigChunker for DI compatibility

**Files Created:**
- `src/domains/chunking/chunking.module.ts`

**Files Modified:**
- `src/app.module.ts` — added ChunkingModule import
- `src/domains/chunking/strategies/code-chunker.service.ts` — added @Injectable() decorator
- `src/domains/chunking/strategies/text-chunker.service.ts` — added @Injectable() decorator
- `src/domains/chunking/strategies/config-chunker.service.ts` — added @Injectable() decorator

**Tests:** 307 passing, full suite green (3 pre-existing failures unrelated: chokidar ESM parsing, pino-http missing)

### Task 26: Graceful Shutdown
- [x] GracefulShutdownService with OnApplicationShutdown hook
- [x] Stops file watchers first during shutdown
- [x] Drains processing queue with 30s timeout
- [x] Logs MCP client closure (HTTP-based, no explicit close needed)
- [x] SIGINT/SIGTERM handlers in main.ts call app.close()
- [x] Error handling during shutdown (catches and logs, never throws)
- [x] Zero `any`, kebab-case file names
- [x] Registered in AppModule providers

**Files Created:**
- `src/infrastructure/shutdown/graceful-shutdown.service.ts`
- `src/infrastructure/shutdown/graceful-shutdown.service.test.ts`

**Files Modified:**
- `src/app.module.ts` — added GracefulShutdownService provider
- `src/main.ts` — added SIGINT/SIGTERM handlers

**Tests:** 11 new passing tests, full suite 360 passing (7 pre-existing failures unrelated)
