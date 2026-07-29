import * as fs from 'fs/promises';

module.exports = async (): Promise<void> => {
  // Stop Mnemosyne
  const stopMnemosyne = (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ as
    | (() => Promise<void>)
    | undefined;
  if (stopMnemosyne != null) {
    await stopMnemosyne();
  }
  delete (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__;

  // Clean up watch directory
  const watchDir = (globalThis as unknown as Record<string, unknown>).__E2E_WATCH_DIR__ as string | undefined;
  if (watchDir != null) {
    try {
      await fs.rm(watchDir, { recursive: true, force: true });
      console.log(`[E2E-GlobalTeardown] Watch directory cleaned up: ${watchDir}`);
    } catch {
      // Ignore cleanup errors
    }
  }
  delete (globalThis as unknown as Record<string, unknown>).__E2E_WATCH_DIR__;
};
