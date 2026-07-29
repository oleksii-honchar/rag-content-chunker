import { startMnemosyneDocker } from './env-setup/mnemosyne-docker-setup';

let stopMnemosyne: () => Promise<void> | undefined;

module.exports = async (): Promise<void> => {
  stopMnemosyne = await startMnemosyneDocker();
  // Store cleanup reference in global state for teardown
  (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ = stopMnemosyne;
};
