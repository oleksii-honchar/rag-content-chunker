// E2E test worker setup — runs in each worker process BEFORE test files are loaded.
// Environment variables (RAG_CONTENT_CHUNKER_CONFIG, NODE_ENV) are now set by
// global-setup.ts which creates the dynamic config with the watch directory.
// This file kept for backward compatibility — env vars are already set.
process.env.NODE_ENV = 'test';
