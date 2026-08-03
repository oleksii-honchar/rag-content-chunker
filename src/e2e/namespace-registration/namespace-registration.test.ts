import { INestApplication } from '@nestjs/common';
import { initializeMcpSession, listNamespaces } from '../../utils/mcp-e2e-client';
import { createTestApplication } from '../main.test-application';

const BOOTSTRAP_WAIT_MS = 5000; // Time for FileWatcherService.registerNamespaces() to complete

describe('[E2E] Namespace Registration — RAG Content Chunker registers namespaces on bootstrap', () => {
  let app: INestApplication | null = null;
  let mcpSessionId: string | null = null;

  // Step 1: BEFORE RAG Content Chunker starts — verify default namespace only
  beforeAll(async () => {
    console.log('[E2E-NamespaceRegistration] Initializing MCP session before app bootstrap...');
    mcpSessionId = await initializeMcpSession();

    // List namespaces BEFORE RAG Content Chunker starts
    console.log('[E2E-NamespaceRegistration] Listing namespaces BEFORE app bootstrap...');
    const namespacesBefore = await listNamespaces(mcpSessionId);
    console.log(
      `[E2E-NamespaceRegistration] Namespaces before bootstrap: ${JSON.stringify(namespacesBefore)}`,
    );

    // Verify default namespace exists with hardcoded description
    const defaultNsBefore = namespacesBefore.find(ns => ns.name === 'default');
    expect(defaultNsBefore).toBeDefined();
    expect(defaultNsBefore!.description).toBe(
      'Default personal memory — general conversation context, preferences, and facts',
    );
    console.log('[E2E-NamespaceRegistration] Default namespace confirmed before bootstrap');

    // Verify NO "e2e-test-ns" namespace exists before bootstrap
    const testNsBefore = namespacesBefore.find(ns => ns.name === 'e2e-test-ns');
    expect(testNsBefore).toBeUndefined();
    console.log('[E2E-NamespaceRegistration] Test namespace confirmed absent before bootstrap');

    // Now start RAG Content Chunker
    console.log('[E2E-NamespaceRegistration] Starting RAG Content Chunker app...');
    app = await createTestApplication();
    await app.init();

    // Wait for FileWatcherService.onApplicationBootstrap to complete namespace registration
    await new Promise(resolve => setTimeout(resolve, BOOTSTRAP_WAIT_MS));
    console.log('[E2E-NamespaceRegistration] App bootstrapped, namespace registration should be complete');
  }, 90000);

  afterAll(async () => {
    if (app) {
      const closePromise = app.close();
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 30000));
      await Promise.race([closePromise, timeoutPromise]);
    }
  });

  // Step 2: AFTER bootstrap — verify watch source namespace appears with description
  it('should have registered the e2e-test-ns namespace with description after bootstrap', async () => {
    console.log('[E2E-NamespaceRegistration] Listing namespaces AFTER app bootstrap...');
    const namespacesAfter = await listNamespaces(mcpSessionId);
    console.log(`[E2E-NamespaceRegistration] Namespaces after bootstrap: ${JSON.stringify(namespacesAfter)}`);

    // Verify the test namespace from config appears
    const testNs = namespacesAfter.find(ns => ns.name === 'e2e-test-ns');
    expect(testNs).toBeDefined();
    expect(testNs!.description).toBe('E2E test namespace for namespace registration verification');
    console.log('[E2E-NamespaceRegistration] Test namespace confirmed with correct description');

    // Verify default namespace still present with hardcoded description
    const defaultNs = namespacesAfter.find(ns => ns.name === 'default');
    expect(defaultNs).toBeDefined();
    expect(defaultNs!.description).toBe(
      'Default personal memory — general conversation context, preferences, and facts',
    );
    console.log('[E2E-NamespaceRegistration] Default namespace still present with correct description');
  }, 30000);
});
