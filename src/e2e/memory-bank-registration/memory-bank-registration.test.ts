import { INestApplication } from '@nestjs/common';
import { initializeMcpSession, listBanks } from '../../utils/mcp-e2e-client';
import { createTestApplication } from '../main.test-application';

const BOOTSTRAP_WAIT_MS = 5000; // Time for FileWatcherService.registerBanks() to complete

describe('[E2E] Memory Bank Registration — RAG Content Chunker registers memory banks on bootstrap', () => {
  let app: INestApplication | null = null;
  let mcpSessionId: string | null = null;

  // Step 1: BEFORE RAG Content Chunker starts — verify default memory bank only
  beforeAll(async () => {
    console.log('[E2E-MemoryBankRegistration] Initializing MCP session before app bootstrap...');
    mcpSessionId = await initializeMcpSession();

    // List memory banks BEFORE RAG Content Chunker starts
    console.log('[E2E-MemoryBankRegistration] Listing memory banks BEFORE app bootstrap...');
    const banksBefore = await listBanks(mcpSessionId);
    console.log(`[E2E-MemoryBankRegistration] Memory banks before bootstrap: ${JSON.stringify(banksBefore)}`);

    // Verify default memory bank exists with hardcoded description
    const defaultBankBefore = banksBefore.find(bank => bank.name === 'default');
    expect(defaultBankBefore).toBeDefined();
    expect(defaultBankBefore!.description).toBe(
      'Default personal memory — general conversation context, preferences, and facts',
    );
    console.log('[E2E-MemoryBankRegistration] Default memory bank confirmed before bootstrap');

    // Verify NO "e2e-test-ns" memory bank exists before bootstrap
    const testBankBefore = banksBefore.find(bank => bank.name === 'e2e-test-ns');
    expect(testBankBefore).toBeUndefined();
    console.log('[E2E-MemoryBankRegistration] Test memory bank confirmed absent before bootstrap');

    // Now start RAG Content Chunker
    console.log('[E2E-MemoryBankRegistration] Starting RAG Content Chunker app...');
    app = await createTestApplication();
    await app.init();

    // Wait for FileWatcherService.onApplicationBootstrap to complete memory bank registration
    await new Promise(resolve => setTimeout(resolve, BOOTSTRAP_WAIT_MS));
    console.log('[E2E-MemoryBankRegistration] App bootstrapped, memory bank registration should be complete');
  }, 90000);

  afterAll(async () => {
    if (app) {
      const closePromise = app.close();
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 30000));
      await Promise.race([closePromise, timeoutPromise]);
    }
  });

  // Step 2: AFTER bootstrap — verify watch source memory bank appears with description
  it('should have registered the e2e-test-ns memory bank with description after bootstrap', async () => {
    console.log('[E2E-MemoryBankRegistration] Listing memory banks AFTER app bootstrap...');
    const banksAfter = await listBanks(mcpSessionId);
    console.log(`[E2E-MemoryBankRegistration] Memory banks after bootstrap: ${JSON.stringify(banksAfter)}`);

    // Verify the test memory bank from config appears
    const testBank = banksAfter.find(bank => bank.name === 'e2e-test-ns');
    expect(testBank).toBeDefined();
    expect(testBank!.description).toBe('E2E test memory bank for memory bank registration verification');
    console.log('[E2E-MemoryBankRegistration] Test memory bank confirmed with correct description');

    // Verify default memory bank still present with hardcoded description
    const defaultBank = banksAfter.find(bank => bank.name === 'default');
    expect(defaultBank).toBeDefined();
    expect(defaultBank!.description).toBe(
      'Default personal memory — general conversation context, preferences, and facts',
    );
    console.log('[E2E-MemoryBankRegistration] Default memory bank still present with correct description');
  }, 30000);
});
