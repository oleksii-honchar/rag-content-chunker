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

  // Clean up temp root (contains config + watch dir) — set by global-setup.ts
  const e2eRoot = process.env.E2E_TEMP_ROOT;
  if (e2eRoot != null) {
    try {
      await fs.rm(e2eRoot, { recursive: true, force: true });
      console.log(`[E2E-GlobalTeardown] Temp root cleaned up: ${e2eRoot}`);
    } catch {
      // Ignore cleanup errors
    }
  }
  delete process.env.E2E_TEMP_ROOT;
  delete process.env.E2E_WATCH_DIR;
};
