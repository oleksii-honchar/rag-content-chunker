import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

export interface TestApplicationOptions {
  overrides?: ReadonlyArray<{ provide: unknown; useValue: unknown }>;
}

export const createTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<INestApplication> => {
  // Env vars (RAG_CONTENT_CHUNKER_CONFIG, NODE_ENV) are set in global-setup.ts
  // before any modules are loaded, so they're available here.

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
