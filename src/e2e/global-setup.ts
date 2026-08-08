import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { SOURCE_STRATEGIES } from '../infrastructure/config/source-strategies';
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

  // Create obsidian watch directory for obsidian-chunking E2E test.
  const obsidianWatchDir = path.join(e2eRoot, 'obsidian');
  await fs.mkdir(obsidianWatchDir, { recursive: true });
  console.log(`[E2E-GlobalSetup] Obsidian watch directory created: ${obsidianWatchDir}`);

  // Create a fresh Mnemosyne data dir per run inside the temp root.
  // The docker-compose volume binds to this dir (${E2E_DATA_DIR}), so every e2e
  // run starts with a clean mnemosyne.db + banks/ — no cross-run state pollution.
  // A changing volume path also forces docker compose to recreate the container,
  // resetting the server's in-memory memory-bank registry.
  const e2eDataDir = path.join(e2eRoot, 'mnemosyne-data');
  await fs.mkdir(e2eDataDir, { recursive: true });
  console.log(`[E2E-GlobalSetup] Mnemosyne data directory created: ${e2eDataDir}`);

  // Write dynamic test config that watches the temp directory.
  // This must happen here because Jest caches required modules, and
  // ConfigurationModule reads APP_CONFIG_PATH at bootstrap time.
  const dynamicConfigPath = path.join(e2eRoot, 'test-config.yaml');
  const dynamicConfig = {
    mcp: {
      url: 'http://localhost:3001',
      apiKey: 'e2e-test-token',
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    watchSources: [
      {
        id: 'e2e-test-source',
        path: watchDir,
        exclude: [],
        debounceMs: 500,
        memoryBank: 'e2e-test-ns',
        description: 'E2E test memory bank for memory bank registration verification',
      },
      {
        id: 'e2e-obsidian-source',
        path: obsidianWatchDir,
        strategy: SOURCE_STRATEGIES.OBSIDIAN,
        exclude: [],
        debounceMs: 1000,
        memoryBank: 'tmp-obsidian',
        description: 'E2E obsidian watch source for obsidian-chunking strategy verification',
      },
    ],
    chunking: {
      strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
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
    enhancement: {
      maxCharacters: {
        prose: 2000,
        code: 3000,
        configuration: 1000,
        documentation: 2000,
      },
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
  process.env.E2E_OBSIDIAN_WATCH_DIR = obsidianWatchDir;
  process.env.E2E_DATA_DIR = e2eDataDir;
  process.env.NODE_ENV = 'test';

  stopMnemosyne = await startMnemosyneDocker();
  // Store cleanup reference in global state for teardown
  (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ = stopMnemosyne;
};
