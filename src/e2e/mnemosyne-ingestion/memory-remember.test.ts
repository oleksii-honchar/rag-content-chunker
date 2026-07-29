import { INestApplication } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MnemosyneClient } from '../../infrastructure/mnemosyne-client.service';
import { ProcessFileUseCase } from '../../use-cases/process-file.use-case';
import { cleanupTempDir, createTempDir, readFixture } from '../e2e-utils';
import { createTestApplication } from '../main.test-application';

describe('[E2E] Chunking and Mnemosyne Ingestion Flow', () => {
  let app: INestApplication;
  let processFileUseCase: ProcessFileUseCase;
  let mnemosyneClient: MnemosyneClient;
  let tempDir: string;

  const TEST_SOURCE_ID = 'e2e-test-source';

  beforeAll(async () => {
    app = await createTestApplication();
    await app.init();

    processFileUseCase = app.get(ProcessFileUseCase);
    mnemosyneClient = app.get(MnemosyneClient);
    tempDir = await createTempDir('rag-e2e-');
  }, 60000);

  afterAll(async () => {
    await cleanupTempDir(tempDir);
    // Graceful close with 30s timeout; force exit if it hangs
    const closePromise = app.close().catch(() => {});
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 30000));
    await Promise.race([closePromise, timeoutPromise]);
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

    // Verify ingestion succeeded
    expect(result.isOk()).toBe(true);

    // Verify chunks are actually stored by recalling via Mnemosyne
    // Use a distinctive phrase from sample.md that should appear in stored chunks
    const recallResult = await mnemosyneClient.recall('chunking strategies');
    expect(recallResult.isOk()).toBe(true);
    const results = recallResult.getValue();
    expect(results.length).toBeGreaterThan(0);
    // At least one result should contain content related to our source
    const hasRelevantResult = results.some(
      r => r.toLowerCase().includes('chunking') || r.toLowerCase().includes('strategy'),
    );
    expect(hasRelevantResult).toBe(true);
  }, 60000);

  it('should process TypeScript code file and ingest chunks', async () => {
    const content = await readFixture('sample.ts');
    const filePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await processFileUseCase.execute({
      filePath,
      eventType: 'add',
      sourceId: TEST_SOURCE_ID,
    });

    // Verify ingestion succeeded
    expect(result.isOk()).toBe(true);

    // Verify chunks stored — recall using distinctive code term
    const recallResult = await mnemosyneClient.recall('ContentChunkerService');
    expect(recallResult.isOk()).toBe(true);
    const results = recallResult.getValue();
    expect(results.length).toBeGreaterThan(0);
    const hasRelevantResult = results.some(
      r => r.includes('ContentChunkerService') || r.includes('chunkContent'),
    );
    expect(hasRelevantResult).toBe(true);
  }, 60000);

  it('should process JSON config file and ingest chunks', async () => {
    const content = await readFixture('sample.json');
    const filePath = path.join(tempDir, 'config.json');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await processFileUseCase.execute({
      filePath,
      eventType: 'add',
      sourceId: TEST_SOURCE_ID,
    });

    // Verify ingestion succeeded
    expect(result.isOk()).toBe(true);

    // Verify chunks stored — recall using distinctive config term
    const recallResult = await mnemosyneClient.recall('watchSources');
    expect(recallResult.isOk()).toBe(true);
    const results = recallResult.getValue();
    expect(results.length).toBeGreaterThan(0);
    const hasRelevantResult = results.some(r => r.includes('watchSources'));
    expect(hasRelevantResult).toBe(true);
  }, 60000);
});
