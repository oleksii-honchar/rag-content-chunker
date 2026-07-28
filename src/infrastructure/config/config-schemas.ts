import { z } from 'zod';

export const watchSourceConfigSchema = z.object({
  id: z.string(),
  path: z.string(),
  include: z.array(z.string()).default(['*.md']),
  exclude: z.array(z.string()).default(['**/.git/**', '**/node_modules/**']),
  debounceMs: z.number().positive().default(3000),
  ignorePatterns: z.array(z.string()).default([]),
});

export const chunkingConfigSchema = z
  .object({
    strategy: z.string().optional(),
    maxSizes: z
      .object({
        agentSessions: z.number().optional(),
        obsidianNotes: z.number().optional(),
        codeFiles: z.number().optional(),
        configuration: z.any().optional(),
        plainText: z.number().optional(),
      })
      .optional(),
    overlap: z.number().optional(),
    hardCap: z.number().optional(),
  })
  .transform((data) => ({
    strategy: data.strategy ?? 'content-aware',
    maxSizes: {
      agentSessions: data.maxSizes?.agentSessions ?? 400,
      obsidianNotes: data.maxSizes?.obsidianNotes ?? 500,
      codeFiles: data.maxSizes?.codeFiles ?? 400,
      configuration: data.maxSizes?.configuration ?? 'per-key',
      plainText: data.maxSizes?.plainText ?? 450,
    },
    overlap: data.overlap ?? 50,
    hardCap: data.hardCap ?? 600,
  }));

export const enrichmentConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    llmUrl: z.string().url().optional(),
    llmModel: z.string().optional(),
    apiKey: z.string().optional(),
    maxConcurrency: z.number().positive().optional(),
    timeoutMs: z.number().positive().optional(),
    docMaxTokens: z.number().positive().optional(),
  })
  .transform((data) => ({
    enabled: data.enabled ?? false,
    llmUrl: data.llmUrl,
    llmModel: data.llmModel,
    apiKey: data.apiKey,
    maxConcurrency: data.maxConcurrency ?? 1,
    timeoutMs: data.timeoutMs ?? 15000,
    docMaxTokens: data.docMaxTokens ?? 16000,
  }));

export const mcpConfigSchema = z
  .object({
    url: z.string().url().optional(),
    apiKey: z.string().optional(),
    timeoutMs: z.number().positive().optional(),
    maxRetries: z.number().positive().optional(),
    retryDelayMs: z.number().positive().optional(),
  })
  .transform((data) => ({
    url: data.url ?? 'https://lite-llm.lan/mcp/mnemosyne',
    apiKey: data.apiKey,
    timeoutMs: data.timeoutMs ?? 30000,
    maxRetries: data.maxRetries ?? 3,
    retryDelayMs: data.retryDelayMs ?? 1000,
  }));

export const telemetryConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    endpoint: z.string().optional(),
    service: z.string().optional(),
    metrics: z
      .object({
        chunking: z.boolean().optional(),
        ingestion: z.boolean().optional(),
        errors: z.boolean().optional(),
      })
      .optional(),
  })
  .transform((data) => ({
    enabled: data.enabled ?? true,
    endpoint: data.endpoint ?? 'clickstack-otel-collector:4317',
    service: data.service ?? 'rag-content-chunker',
    metrics: {
      chunking: data.metrics?.chunking ?? true,
      ingestion: data.metrics?.ingestion ?? true,
      errors: data.metrics?.errors ?? true,
    },
  }));

// Root configuration schema — all nested sections are optional.
// When omitted, each section's internal defaults apply via transform.
export const configurationSchema = z
  .object({
    watchSources: z.array(watchSourceConfigSchema).optional().default([]),
    chunking: chunkingConfigSchema.optional(),
    enrichment: enrichmentConfigSchema.optional(),
    mcp: mcpConfigSchema.optional(),
    telemetry: telemetryConfigSchema.optional(),
  })
  .transform((data) => ({
    watchSources: data.watchSources ?? [],
    chunking: {
      strategy: data.chunking?.strategy ?? 'content-aware',
      maxSizes: {
        agentSessions: data.chunking?.maxSizes?.agentSessions ?? 400,
        obsidianNotes: data.chunking?.maxSizes?.obsidianNotes ?? 500,
        codeFiles: data.chunking?.maxSizes?.codeFiles ?? 400,
        configuration: data.chunking?.maxSizes?.configuration ?? 'per-key',
        plainText: data.chunking?.maxSizes?.plainText ?? 450,
      },
      overlap: data.chunking?.overlap ?? 50,
      hardCap: data.chunking?.hardCap ?? 600,
    },
    enrichment: {
      enabled: data.enrichment?.enabled ?? false,
      llmUrl: data.enrichment?.llmUrl,
      llmModel: data.enrichment?.llmModel,
      apiKey: data.enrichment?.apiKey,
      maxConcurrency: data.enrichment?.maxConcurrency ?? 1,
      timeoutMs: data.enrichment?.timeoutMs ?? 15000,
      docMaxTokens: data.enrichment?.docMaxTokens ?? 16000,
    },
    mcp: {
      url: data.mcp?.url ?? 'https://lite-llm.lan/mcp/mnemosyne',
      apiKey: data.mcp?.apiKey,
      timeoutMs: data.mcp?.timeoutMs ?? 30000,
      maxRetries: data.mcp?.maxRetries ?? 3,
      retryDelayMs: data.mcp?.retryDelayMs ?? 1000,
    },
    telemetry: {
      enabled: data.telemetry?.enabled ?? true,
      endpoint: data.telemetry?.endpoint ?? 'clickstack-otel-collector:4317',
      service: data.telemetry?.service ?? 'rag-content-chunker',
      metrics: {
        chunking: data.telemetry?.metrics?.chunking ?? true,
        ingestion: data.telemetry?.metrics?.ingestion ?? true,
        errors: data.telemetry?.metrics?.errors ?? true,
      },
    },
  }));

export type Configuration = z.infer<typeof configurationSchema>;
export type WatchSourceConfig = z.infer<typeof watchSourceConfigSchema>;
export type ChunkingConfig = z.infer<typeof chunkingConfigSchema>;
export type EnrichmentConfig = z.infer<typeof enrichmentConfigSchema>;
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export type TelemetryConfig = z.infer<typeof telemetryConfigSchema>;
