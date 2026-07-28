/**
 * E2E integration tests for chunking and Mnemosyne ingestion flow.
 *
 * Tests the full flow: file on disk → ProcessFileUseCase → chunking → Mnemosyne ingestion.
 * Uses a local HTTP mock server that implements the Mnemosyne MCP memory_remember tool.
 */

import { INestApplication } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileProcessingQueue } from '../../infrastructure/file-processing-queue.service';
import { MnemosyneClient } from '../../infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from '../../use-cases/chunk-content.use-case';
import { ProcessFileUseCase } from '../../use-cases/process-file.use-case';
import { cleanupTempDir, createTempDir, readFixture } from '../e2e-utils';
import { createTestApplication } from '../main.test-application';
import {
  clearIngestedChunks,
  getIngestedChunks,
  stopMnemosyne,
} from '../mnemosyne-setup';

describe('[E2E] Chunking and Mnemosyne Ingestion Flow', () => {
  let app: INestApplication;
  let processFileUseCase: ProcessFileUseCase;
  let chunkContentUseCase: ChunkContentUseCase;
  let mnemosyneClient: MnemosyneClient;
  let processingQueue: FileProcessingQueue;
  let tempDir: string;

  const TEST_SOURCE_ID = 'e2e-test-source';

  beforeAll(async () => {
    app = await createTestApplication();
    await app.init();

    processFileUseCase = app.get(ProcessFileUseCase);
    chunkContentUseCase = app.get(ChunkContentUseCase);
    mnemosyneClient = app.get(MnemosyneClient);
    processingQueue = app.get(FileProcessingQueue);
    tempDir = await createTempDir('rag-e2e-');
  }, 10000);

  afterAll(async () => {
    await app.close();
    await stopMnemosyne();
    await cleanupTempDir(tempDir);
  }, 5000);

  beforeEach(() => {
    clearIngestedChunks();
  });

  it('should process markdown file and ingest chunks to Mnemosyne', async () => {
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

    const chunks = getIngestedChunks();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text.length).toBeGreaterThan(0);
  }, 10000);

  it('should process TypeScript code file and ingest chunks', async () => {
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

    const chunks = getIngestedChunks();
    expect(chunks.length).toBeGreaterThan(0);
  }, 10000);

  it('should process JSON config file and ingest chunks', async () => {
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

    const chunks = getIngestedChunks();
    expect(chunks.length).toBeGreaterThan(0);
  }, 10000);

  it('should verify Mnemosyne MCP connectivity via health check', async () => {
    const healthResult = await mnemosyneClient.healthCheck();
    expect(healthResult.isOk()).toBe(true);
    expect(healthResult.getValue()).toBe(true);
  }, 5000);
});
