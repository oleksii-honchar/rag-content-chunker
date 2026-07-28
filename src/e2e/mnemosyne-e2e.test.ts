/**
 * E2E integration test for Mnemosyne MCP chunking pipeline.
 *
 * NOTE: This test assumes a Mnemosyne MCP instance is running at the URL
 * configured in src/e2e/test-config.yaml (default: http://localhost:8080/mcp).
 *
 * To run with a real Mnemosyne instance:
 *   1. Start Mnemosyne MCP on localhost:8080 (or update test-config.yaml)
 *   2. Run: npm run test:e2e
 *
 * TODO: If Mnemosyne MCP supports CLI startup, add beforeAll hook to spawn it:
 *   const mnemosyneProc = spawn('mnemosyne', ['--data-dir', './e2e-data', '--storage', 'sqlite', '--port', '8080']);
 *   await new Promise(resolve => mnemosyneProc.on('ready', resolve));
 *   afterAll(() => mnemosyneProc.kill());
 */

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { PinoLogger } from 'nestjs-pino';
import { DomainModule } from '../domain/domain.module';
import { ConfigurationModule } from '../infrastructure/config/configuration.module';
import { FileProcessingQueue } from '../infrastructure/file-processing-queue.service';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { MnemosyneClient } from '../infrastructure/mnemosyne-client.service';
import { ChunkContentUseCase } from '../use-cases/chunk-content.use-case';
import { IngestChunkUseCase } from '../use-cases/ingest-chunk.use-case';
import {
  cleanupTempDir,
  createSampleFile,
  createTempDir,
  sampleCodeContent,
  sampleConfigContent,
  sampleMarkdownContent,
  sampleTextContent,
} from './e2e-utils';

/**
 * Simple no-op logger for e2e tests to avoid Pino initialization complexity.
 */
class NoOpLogger implements BasePinoLogger {
  setContext(): void {}
  log(): void {}
  info(): void {}
  error(): void {}
  warn(): void {}
  debug(): void {}
  child(): BasePinoLogger {
    return this;
  }
}

/**
 * Mock PinoLogger for e2e tests.
 */
class MockPinoLogger {
  logger = { child: () => this } as unknown as PinoLogger['logger'];
  context = '';
  contextName = '';
  errorKey = '';
  setContext(): void {}
  fatal(): void {}
  error(): void {}
  warn(): void {}
  info(): void {}
  debug(): void {}
  trace(): void {}
  assign(): void {}
  call(): void {}
}

describe('Mnemosyne E2E Pipeline', () => {
  let tempDir: string;
  let chunkContentUseCase: ChunkContentUseCase;
  let ingestChunkUseCase: IngestChunkUseCase;
  let mnemosyneClient: MnemosyneClient;

  const TEST_SOURCE_ID = 'e2e-test-source';

  beforeAll(async () => {
    // Create temp directory for test files
    tempDir = await createTempDir('rag-e2e-mnemosyne-');

    // Set test config path via env before module compilation
    process.env.RAG_CONTENT_CHUNKER_CONFIG = './src/e2e/test-config.yaml';
    process.env.NODE_ENV = 'test';
    process.env.HOME = process.env.HOME || '/tmp';

    // Build test module with real services, using no-op logger to avoid Pino init complexity
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        ConfigurationModule,
        DomainModule,
      ],
      providers: [FileProcessingQueue, ChunkContentUseCase, IngestChunkUseCase, MnemosyneClient],
    })
      .overrideProvider(PinoLogger)
      .useClass(MockPinoLogger as unknown as typeof PinoLogger)
      .overrideProvider(BasePinoLogger)
      .useClass(NoOpLogger)
      .compile();

    chunkContentUseCase = moduleRef.get(ChunkContentUseCase);
    ingestChunkUseCase = moduleRef.get(IngestChunkUseCase);
    mnemosyneClient = moduleRef.get(MnemosyneClient);
  }, 30000);

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Chunking Pipeline', () => {
    it('should chunk markdown content and create valid chunks', async () => {
      const filePath = await createSampleFile(tempDir, 'test.md', sampleMarkdownContent());
      const content = await fs.readFile(filePath, 'utf-8');

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

      // Verify chunk structure
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

      // Verify all chunk text combined covers original content
      const combinedText = chunks.map(c => c.text).join('');
      expect(combinedText.length).toBeGreaterThan(content.length * 0.5); // Allow for overlap and whitespace trimming
    });

    it('should chunk TypeScript code content', async () => {
      const filePath = await createSampleFile(tempDir, 'test.ts', sampleCodeContent());
      const content = await fs.readFile(filePath, 'utf-8');

      const result = await chunkContentUseCase.execute({
        content,
        filePath,
        sourceId: TEST_SOURCE_ID,
      });

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(0);

      // Verify code chunks have correct fileRole
      for (const chunk of chunks) {
        expect(chunk.fileRole).toBe('code');
        expect(chunk.language).toBeDefined();
      }
    });

    it('should chunk JSON config content', async () => {
      const filePath = await createSampleFile(tempDir, 'config.json', sampleConfigContent());
      const content = await fs.readFile(filePath, 'utf-8');

      const result = await chunkContentUseCase.execute({
        content,
        filePath,
        sourceId: TEST_SOURCE_ID,
      });

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(0);

      // Verify config chunks have correct fileRole
      for (const chunk of chunks) {
        expect(chunk.fileRole).toBe('config');
      }
    });

    it('should chunk plain text content', async () => {
      const filePath = await createSampleFile(tempDir, 'test.txt', sampleTextContent());
      const content = await fs.readFile(filePath, 'utf-8');

      const result = await chunkContentUseCase.execute({
        content,
        filePath,
        sourceId: TEST_SOURCE_ID,
      });

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        expect(chunk.fileRole).toBe('docs');
      }
    });
  });

  describe('Mnemosyne Ingestion', () => {
    // These tests require a running Mnemosyne MCP instance
    // They will be skipped if the MCP server is not available

    it('should verify Mnemosyne MCP connectivity', async () => {
      const healthResult = await mnemosyneClient.healthCheck();

      if (healthResult.isKo()) {
        // MCP not available — skip ingestion tests
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

      // MCP is available — run ingestion tests
      const filePath = await createSampleFile(tempDir, 'ingest-test.md', sampleMarkdownContent());
      const content = await fs.readFile(filePath, 'utf-8');

      const chunkResult = await chunkContentUseCase.execute({
        content,
        filePath,
        sourceId: TEST_SOURCE_ID,
      });

      expect(chunkResult.isOk()).toBe(true);
      const chunks = chunkResult.getValue();

      // Ingest chunks via use case
      const ingestResult = await ingestChunkUseCase.execute({
        chunks,
        sourceId: TEST_SOURCE_ID,
        metadata: { filePath },
      });

      expect(ingestResult.isOk()).toBe(true);

      // Verify chunks were remembered by checking the client directly
      // Note: Mnemosyne MCP doesn't expose a query API in the current spec,
      // so we verify by checking that ingestion completed without errors
      console.log(`[E2E] Successfully ingested ${chunks.length} chunks to Mnemosyne MCP`);
    });
  });
});
