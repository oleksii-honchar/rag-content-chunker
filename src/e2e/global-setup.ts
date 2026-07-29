import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { startMnemosyneDocker } from './env-setup/mnemosyne-docker-setup';

let stopMnemosyne: () => Promise<void> | undefined;

module.exports = async (): Promise<void> => {
  // Create temp watch directory BEFORE any NestJS modules are loaded.
  // This directory will be configured as a watch source for FileWatcher e2e tests.
  const watchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-e2e-watch'));
  console.log(`[E2E-GlobalSetup] Watch directory created: ${watchDir}`);

  // Write dynamic test config that watches the temp directory.
  // This must happen here because Jest caches required modules, and
  // AppModule imports ConfigurationModule which reads this env var.
  const dynamicConfigPath = path.resolve(__dirname, 'test-config.yaml');
  const dynamicConfig = {
    mcp: {
      url: 'http://localhost:8765',
      apiKey: 'e2e-test-token',
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    watchSources: [
      {
        id: 'e2e-test-source',
        path: watchDir,
        include: ['*.md', '*.ts', '*.json'],
        exclude: [],
        debounceMs: 500,
      },
    ],
    chunking: {
      strategy: 'content-aware',
      maxSizes: {
        agentSessions: 400,
        obsidianNotes: 500,
        codeFiles: 400,
        configuration: 'per-key',
        plainText: 450,
      },
      overlap: 50,
      hardCap: 600,
    },
    telemetry: {
      enabled: false,
    },
  };

  await fs.writeFile(dynamicConfigPath, yaml.dump(dynamicConfig), 'utf-8');
  console.log(`[E2E-GlobalSetup] Dynamic config written: ${dynamicConfigPath}`);

  // Set env vars BEFORE any modules load
  process.env.RAG_CONTENT_CHUNKER_CONFIG = dynamicConfigPath;
  process.env.NODE_ENV = 'test';

  // Store watch dir path as env var — shared across Jest workers (unlike globalThis)
  process.env.E2E_WATCH_DIR = watchDir;

  stopMnemosyne = await startMnemosyneDocker();
  // Store cleanup reference in global state for teardown
  (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ = stopMnemosyne;
};
