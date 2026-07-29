import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'path';
import { AppModule } from '../app.module';

export interface TestApplicationOptions {
  overrides?: ReadonlyArray<{ provide: unknown; useValue: unknown }>;
}

export const createTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<INestApplication> => {
  process.env.RAG_CONTENT_CHUNKER_CONFIG = path.resolve(__dirname, 'test-config.yaml');
  process.env.NODE_ENV = 'test';

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.overrides != null && options.overrides.length > 0) {
    for (const override of options.overrides) {
      moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
    }
  }

  const moduleRef = await moduleBuilder.compile();
  return moduleRef.createNestApplication();
};
