import { INestApplication } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessFileUseCase } from '../../use-cases/process-file.use-case';
import { MnemosyneClient } from '../../infrastructure/mnemosyne-client.service';
import { cleanupTempDir, createTempDir, readFixture } from '../e2e-utils';
import { createTestApplication } from '../main.test-application';
import { startMnemosyne } from '../mnemosyne-setup';

describe('[E2E] Chunking and Mnemosyne Ingestion Flow', () => {
  let app: INestApplication;
  let processFileUseCase: ProcessFileUseCase;
  let mnemosyneClient: MnemosyneClient;
  let tempDir: string;
  let stopMnemosyne: () => Promise<void>;

  const TEST_SOURCE_ID = 'e2e-test-source';

  beforeAll(async () => {
    stopMnemosyne = await startMnemosyne();

    app = await createTestApplication();
    await app.init();

    processFileUseCase = app.get(ProcessFileUseCase);
    mnemosyneClient = app.get(MnemosyneClient);
    tempDir = await createTempDir('rag-e2e-');
  }, 90000);

  afterAll(async () => {
    await app.close();
    await stopMnemosyne();
    await cleanupTempDir(tempDir);
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
  }, 30000);

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
  }, 30000);

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
  }, 30000);
});
