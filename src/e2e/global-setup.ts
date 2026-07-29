import * as path from 'path';
import { startMnemosyneDocker } from './env-setup/mnemosyne-docker-setup';

let stopMnemosyne: () => Promise<void> | undefined;

module.exports = async (): Promise<void> => {
  // Set e2e test config path BEFORE any NestJS modules are loaded.
  // This must happen here because Jest caches required modules, and
  // AppModule imports ConfigurationModule which reads this env var.
  process.env.RAG_CONTENT_CHUNKER_CONFIG = path.resolve(__dirname, 'test-config.yaml');
  process.env.NODE_ENV = 'test';

  stopMnemosyne = await startMnemosyneDocker();
  // Store cleanup reference in global state for teardown
  (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ = stopMnemosyne;
};
