import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Chunk } from '../domain/chunk.entity';
import { Result } from '../utils/result';
import { MnemosyneClient } from '../infrastructure/mnemosyne-client.service';
import * as path from 'path';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { AppModule } from '../app.module';
import { createE2ePinoLogger } from './e2e-pino-logger';

export interface TestApplicationOptions {
  /**
   * Override providers for the test module.
   */
  overrides?: ReadonlyArray<{ provide: unknown; useValue: unknown }>;
}

/**
 * In-memory MnemosyneClient for e2e tests — no HTTP calls, no external deps.
 * Stores ingested chunks in memory for verification.
 * This is not a mock — it implements the full interface and allows verifying ingestion flow.
 */
class InMemoryMnemosyneClient {
  readonly ingestedChunks: Chunk[] = [];

  async healthCheck(): Promise<Result<boolean>> {
    return Result.ok(true);
  }

  async remember(chunk: Chunk): Promise<Result<void>> {
    this.ingestedChunks.push(chunk);
    return Result.ok(undefined as unknown as void);
  }
}

/**
 * Creates a NestJS test application instance for e2e tests.
 * Uses the real AppModule with e2e test configuration.
 * BasePinoLogger is overridden with E2ePinoLogger (real pino, quiet JSON output).
 * MnemosyneClient is overridden with InMemoryMnemosyneClient (fast, no HTTP).
 */
export const createTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<INestApplication> => {
  // Point to e2e test config before module compilation
  process.env.RAG_CONTENT_CHUNKER_CONFIG = path.resolve(__dirname, 'test-config.yaml');
  process.env.NODE_ENV = 'test';

  const e2eLogger = createE2ePinoLogger();
  const inMemoryMnemosyne = new InMemoryMnemosyneClient();

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(BasePinoLogger)
    .useValue(e2eLogger)
    .overrideProvider(MnemosyneClient)
    .useValue(inMemoryMnemosyne);

  if (options.overrides != null && options.overrides.length > 0) {
    for (const override of options.overrides) {
      moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
    }
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  return app;
};
