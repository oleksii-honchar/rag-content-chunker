/**
 * E2E integration test for chunking pipeline.
 *
 * Tests the full flow: file on disk → ProcessFileUseCase → chunking → ingestion.
 * Mnemosyne MCP ingestion tests are skipped if MCP is unavailable.
 */

import { INestApplication } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileProcessingQueue } from '../../infrastructure/file-processing-queue.service';
import { FileWatcherService } from '../../infrastructure/file-watcher.service';
import { MnemosyneClient } from '../../infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from '../../use-cases/chunk-content.use-case';
import { IngestChunkUseCase } from '../../use-cases/ingest-chunk.use-case';
import { ProcessFileUseCase } from '../../use-cases/process-file.use-case';
import { cleanupTempDir, createTempDir, readFixture } from '../e2e-utils';
import { createTestApplication } from '../main.test-application';

describe('[E2E] Chunking and Mnemosyne Ingestion Flow', () => {
  let app: INestApplication;
  let fileWatcherService: FileWatcherService;
  let processFileUseCase: ProcessFileUseCase;
  let chunkContentUseCase: ChunkContentUseCase;
  let ingestChunkUseCase: IngestChunkUseCase;
  let mnemosyneClient: MnemosyneClient;
  let processingQueue: FileProcessingQueue;
  let tempDir: string;

  const TEST_SOURCE_ID = 'e2e-test-source';

  beforeAll(async () => {
    app = await createTestApplication();
    await app.init();

    fileWatcherService = app.get(FileWatcherService);
    processFileUseCase = app.get(ProcessFileUseCase);
    chunkContentUseCase = app.get(ChunkContentUseCase);
    ingestChunkUseCase = app.get(IngestChunkUseCase);
    mnemosyneClient = app.get(MnemosyneClient);
    processingQueue = app.get(FileProcessingQueue);
    tempDir = await createTempDir('rag-e2e-');
  }, 30000);

  afterAll(async () => {
    await app.close();
    await cleanupTempDir(tempDir);
  });

  it('should chunk markdown file via ProcessFileUseCase full pipeline', async () => {
    const content = await readFixture('sample.md');
    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await processFileUseCase.execute({
      filePath,
      eventType: 'add',
      sourceId: TEST_SOURCE_ID,
    });

    expect(result.isOk()).toBe(true);
    await processingQueue.waitForEmpty();
  });

  it('should chunk TypeScript code file via ProcessFileUseCase full pipeline', async () => {
    const content = await readFixture('sample.ts');
    const filePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await processFileUseCase.execute({
      filePath,
      eventType: 'add',
      sourceId: TEST_SOURCE_ID,
    });

    expect(result.isOk()).toBe(true);
    await processingQueue.waitForEmpty();
  });

  it('should chunk JSON config file via ProcessFileUseCase full pipeline', async () => {
    const content = await readFixture('sample.json');
    const filePath = path.join(tempDir, 'config.json');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await processFileUseCase.execute({
      filePath,
      eventType: 'add',
      sourceId: TEST_SOURCE_ID,
    });

    expect(result.isOk()).toBe(true);
    await processingQueue.waitForEmpty();
  });

  it('should verify chunk structure from ChunkContentUseCase', async () => {
    const content = await readFixture('sample.md');
    const filePath = path.join(tempDir, 'chunk-structure-test.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await chunkContentUseCase.execute({
      content,
      filePath,
      sourceId: TEST_SOURCE_ID,
      maxTokens: 500,
      overlapTokens: 50,
      hardCapTokens: 600,
    });

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.id).toBeDefined();
      expect(chunk.text).toBeDefined();
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.chunkIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.totalChunks).toBeGreaterThan(0);
      expect(chunk.sectionHeader).toBeDefined();
      expect(chunk.breadcrumb).toBeDefined();
      expect(chunk.metadata?.filePath).toBe(filePath);
    }

    const combinedText = chunks.map((chunk) => chunk.text).join('');
    expect(combinedText.length).toBeGreaterThan(content.length * 0.5);
  });

  it('should verify code chunks have correct fileRole', async () => {
    const content = await readFixture('sample.ts');
    const filePath = path.join(tempDir, 'code-role-test.ts');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await chunkContentUseCase.execute({
      content,
      filePath,
      sourceId: TEST_SOURCE_ID,
    });

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.fileRole).toBe('code');
      expect(chunk.language).toBeDefined();
    }
  });

  it('should verify config chunks have correct fileRole', async () => {
    const content = await readFixture('sample.json');
    const filePath = path.join(tempDir, 'config-role-test.json');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await chunkContentUseCase.execute({
      content,
      filePath,
      sourceId: TEST_SOURCE_ID,
    });

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.fileRole).toBe('config');
    }
  });

  it('should verify Mnemosyne MCP connectivity and ingestion when available', async () => {
    const healthResult = await mnemosyneClient.healthCheck();

    if (healthResult.isKo()) {
      console.warn(
        '[E2E] Mnemosyne MCP health check failed. Skipping ingestion tests.',
        healthResult.getError().message,
      );
      return;
    }

    const isHealthy = healthResult.getValue();
    if (!isHealthy) {
      console.warn('[E2E] Mnemosyne MCP reported unhealthy. Skipping ingestion tests.');
      return;
    }

    const content = await readFixture('sample.md');
    const filePath = path.join(tempDir, 'ingest-test.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const chunkResult = await chunkContentUseCase.execute({
      content,
      filePath,
      sourceId: TEST_SOURCE_ID,
    });

    expect(chunkResult.isOk()).toBe(true);
    const chunks = chunkResult.getValue();

    const ingestResult = await ingestChunkUseCase.execute({
      chunks,
      sourceId: TEST_SOURCE_ID,
      metadata: { filePath },
    });

    expect(ingestResult.isOk()).toBe(true);
    console.log(`[E2E] Successfully ingested ${chunks.length} chunks to Mnemosyne MCP`);
  });
});
