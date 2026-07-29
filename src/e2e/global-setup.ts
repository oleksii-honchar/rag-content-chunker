import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { startMnemosyneDocker } from './env-setup/mnemosyne-docker-setup';

let stopMnemosyne: () => Promise<void> | undefined;

module.exports = async (): Promise<void> => {
  // Create a shared temp root for all e2e artifacts (config + watch dir).
  // This avoids writing generated files into the source tree.
  const e2eRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-e2e-'));
  console.log(`[E2E-GlobalSetup] E2E temp root created: ${e2eRoot}`);

  // Create watch directory inside temp root.
  const watchDir = path.join(e2eRoot, 'watch');
  await fs.mkdir(watchDir, { recursive: true });
  console.log(`[E2E-GlobalSetup] Watch directory created: ${watchDir}`);

  // Write dynamic test config that watches the temp directory.
  // This must happen here because Jest caches required modules, and
  // ConfigurationModule reads APP_CONFIG_PATH at bootstrap time.
  const dynamicConfigPath = path.join(e2eRoot, 'test-config.yaml');
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
  process.env.APP_CONFIG_PATH = dynamicConfigPath;
  process.env.E2E_TEMP_ROOT = e2eRoot;
  process.env.E2E_WATCH_DIR = watchDir;
  process.env.NODE_ENV = 'test';

  stopMnemosyne = await startMnemosyneDocker();
  // Store cleanup reference in global state for teardown
  (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ = stopMnemosyne;
};
