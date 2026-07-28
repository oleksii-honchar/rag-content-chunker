import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

export interface TestApplicationOptions {
  /**
   * Override providers for the test module.
   */
  overrides?: ReadonlyArray<{ provide: unknown; useValue: unknown }>;
}

/**
 * Creates a NestJS test application instance for e2e tests.
 * Uses the real AppModule with test configuration.
 */
export const createTestApplication = async (
  options: TestApplicationOptions = {},
): Promise<INestApplication> => {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.overrides != null && options.overrides.length > 0) {
    for (const override of options.overrides) {
      moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
    }
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  return app;
};
