import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'path';
import { AppModule } from '../app.module';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';
import { createE2ePinoLogger } from './e2e-pino-logger';

export interface TestApplicationOptions {
  /**
   * Override providers for the test module.
   */
  overrides?: ReadonlyArray<{ provide: unknown; useValue: unknown }>;
}

/**
 * Creates a NestJS test application instance for e2e tests.
 * Uses the real AppModule with e2e test configuration.
 * BasePinoLogger is overridden with E2ePinoLogger (real pino, quiet JSON output).
 * MnemosyneClient is REAL — connects to local Mnemosyne MCP started by mnemosyne-setup.ts.
 */
export const createTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<INestApplication> => {
  // Point to e2e test config before module compilation
  process.env.RAG_CONTENT_CHUNKER_CONFIG = path.resolve(__dirname, 'test-config.yaml');
  process.env.NODE_ENV = 'test';

  const e2eLogger = createE2ePinoLogger();

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(BasePinoLogger)
    .useValue(e2eLogger);

  if (options.overrides != null && options.overrides.length > 0) {
    for (const override of options.overrides) {
      moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
    }
  }

  const moduleRef = await moduleBuilder.compile();
  return moduleRef.createNestApplication();
};
