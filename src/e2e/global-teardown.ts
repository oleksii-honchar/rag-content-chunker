module.exports = async (): Promise<void> => {
  const stopMnemosyne = (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__ as
    | (() => Promise<void>)
    | undefined;
  if (stopMnemosyne != null) {
    await stopMnemosyne();
  }
  delete (globalThis as unknown as Record<string, unknown>).__MNEMOSYNE_STOP__;
};
