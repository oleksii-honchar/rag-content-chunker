import {
  chunkingConfigSchema,
  configurationSchema,
  enrichmentConfigSchema,
  mcpConfigSchema,
  telemetryConfigSchema,
  watchSourceConfigSchema,
} from './config-schemas';

describe('config-schemas', () => {
  describe('watchSourceConfigSchema', () => {
    it('parses valid watch source config', () => {
      const input = {
        id: 'test-source',
        path: '/some/path',
        include: ['*.md'],
        exclude: ['**/.git/**'],
        debounceMs: 5000,
        ignorePatterns: ['**/.DS_Store'],
      };

      const result = watchSourceConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('test-source');
        expect(result.data.path).toBe('/some/path');
        expect(result.data.include).toEqual(['*.md']);
      }
    });

    it('applies defaults for optional fields', () => {
      const input = {
        id: 'minimal',
        path: '/path',
      };

      const result = watchSourceConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include).toEqual(['*.md']);
        expect(result.data.exclude).toEqual(['**/.git/**', '**/node_modules/**']);
        expect(result.data.debounceMs).toBe(3000);
        expect(result.data.ignorePatterns).toEqual([]);
      }
    });

    it('rejects missing id', () => {
      const input = { path: '/path' };
      const result = watchSourceConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing path', () => {
      const input = { id: 'test' };
      const result = watchSourceConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects negative debounceMs', () => {
      const input = { id: 'test', path: '/path', debounceMs: -100 };
      const result = watchSourceConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('chunkingConfigSchema', () => {
    it('parses valid chunking config', () => {
      const input = {
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
      };

      const result = chunkingConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('applies defaults for empty object', () => {
      const result = chunkingConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe('content-aware');
        expect(result.data.maxSizes?.agentSessions).toBe(400);
        expect(result.data.overlap).toBe(50);
        expect(result.data.hardCap).toBe(600);
      }
    });

    it('accepts configuration as number', () => {
      const input = {
        maxSizes: { configuration: 500 },
      };

      const result = chunkingConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('enrichmentConfigSchema', () => {
    it('parses valid enrichment config', () => {
      const input = {
        enabled: true,
        llmUrl: 'http://localhost:8000/v1',
        llmModel: 'qwen3.5-27b',
        apiKey: 'test-key',
        maxConcurrency: 3,
        timeoutMs: 15000,
        docMaxTokens: 16000,
      };

      const result = enrichmentConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('applies defaults for empty object', () => {
      const result = enrichmentConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
        expect(result.data.maxConcurrency).toBe(1);
        expect(result.data.timeoutMs).toBe(15000);
        expect(result.data.docMaxTokens).toBe(16000);
      }
    });

    it('rejects invalid URL', () => {
      const input = { llmUrl: 'not-a-url' };
      const result = enrichmentConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('mcpConfigSchema', () => {
    it('parses valid MCP config', () => {
      const input = {
        url: 'https://lite-llm.lan/mcp/mnemosyne',
        apiKey: 'test-key',
        timeoutMs: 30000,
        maxRetries: 3,
        retryDelayMs: 1000,
      };

      const result = mcpConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('applies defaults for empty object', () => {
      const result = mcpConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
        expect(result.data.timeoutMs).toBe(30000);
        expect(result.data.maxRetries).toBe(3);
        expect(result.data.retryDelayMs).toBe(1000);
      }
    });

    it('rejects invalid URL', () => {
      const input = { url: 'not-a-url' };
      const result = mcpConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('telemetryConfigSchema', () => {
    it('parses valid telemetry config', () => {
      const input = {
        enabled: true,
        endpoint: 'clickstack-otel-collector:4317',
        service: 'rag-content-chunker',
        metrics: {
          chunking: true,
          ingestion: true,
          errors: true,
        },
      };

      const result = telemetryConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('applies defaults for empty object', () => {
      const result = telemetryConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.endpoint).toBe('clickstack-otel-collector:4317');
        expect(result.data.service).toBe('rag-content-chunker');
        expect(result.data.metrics?.chunking).toBe(true);
      }
    });
  });

  describe('configurationSchema', () => {
    it('parses full valid configuration', () => {
      const input = {
        watchSources: [
          {
            id: 'obsidian-vault',
            path: '~/vault',
            include: ['*.md', '*.txt'],
            exclude: ['**/.git/**', '**/node_modules/**'],
            debounceMs: 3000,
            ignorePatterns: ['**/.DS_Store'],
          },
          {
            id: 'agent-sessions',
            path: '~/.agent-sessions',
            include: ['*.md'],
            exclude: ['**/archive/**'],
            debounceMs: 5000,
          },
          {
            id: 'codebase',
            path: '~/www/project',
            include: ['*.ts', '*.js', '*.py'],
            exclude: ['**/node_modules/**', '**/dist/**'],
            debounceMs: 2000,
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
        enrichment: { enabled: false },
        mcp: {
          url: 'https://lite-llm.lan/mcp/mnemosyne',
          timeoutMs: 30000,
          maxRetries: 3,
          retryDelayMs: 1000,
        },
        telemetry: {
          enabled: true,
          endpoint: 'clickstack-otel-collector:4317',
          service: 'rag-content-chunker',
          metrics: {
            chunking: true,
            ingestion: true,
            errors: true,
          },
        },
      };

      const result = configurationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.watchSources).toHaveLength(3);
        expect(result.data.chunking.strategy).toBe('content-aware');
        expect(result.data.mcp.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
      }
    });

    it('applies defaults for empty object', () => {
      const result = configurationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.watchSources).toEqual([]);
        expect(result.data.chunking.strategy).toBe('content-aware');
        expect(result.data.enrichment.enabled).toBe(false);
        expect(result.data.mcp.url).toBe('https://lite-llm.lan/mcp/mnemosyne');
        expect(result.data.telemetry.enabled).toBe(true);
      }
    });

    it('rejects config with invalid watch source', () => {
      const input = {
        watchSources: [{ id: 'bad', path: 123 }], // path must be string
      };

      const result = configurationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
