// E2E test worker setup — runs in each worker process BEFORE test files are loaded.
// Sets environment variables needed by NestJS modules (ConfigurationModule reads
// RAG_CONTENT_CHUNKER_CONFIG at module evaluation time).
import * as path from 'path';

process.env.RAG_CONTENT_CHUNKER_CONFIG = path.resolve(__dirname, 'test-config.yaml');
process.env.NODE_ENV = 'test';
