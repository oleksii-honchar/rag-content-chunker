---
type: concept
title: "LLM Enrichment"
createdAt: "2026-08-08T10:50:00Z"
updatedAt: "2026-08-08T10:50:00Z"
tags: [enrichment, llm, mastra, metadata]
see_also: [
  "adrs/0024-custom-llm-provider-mastra-llm-parameter.adr.md",
  "adrs/0025-non-fatal-enrichment-graceful-degradation.adr.md",
  "concepts/0006-mastra-chunking-strategies.concept.md",
  "specifications/0002-enrichment-pipeline.spec.md"
]
---

# Concept: LLM Enrichment

## What

LLM Enrichment extracts semantic metadata (title, keywords) from document content before chunking, using Mastra's `extractMetadata()` with a custom LLM provider pointing to a self-hosted litellm instance.

## Why

Without LLM enrichment, chunks lack semantic metadata — making retrieval dependent solely on embedding similarity. Enriched metadata (title, keywords) provides additional retrieval signals and improves search quality for RAG pipelines.

## Key Details

- **Implementation:** `LlmClientFactory.createCustomLlm()` creates a custom LLM via `@ai-sdk/openai` with `baseURL` pointing to litellm
- **Integration:** Custom LLM passed to `extractMetadata({ title: { llm }, keywords: { llm } })` — single call per document, metadata attached to all chunks
- **Configuration:** `enrichment.enabled`, `enrichment.llmUrl`, `enrichment.llmModel`, `enrichment.apiKey` — all three must be set (AND guard)
- **Output:** `mastraDocTitle` and `mastraDocKeywords` metadata keys on every chunk
- **Error handling:** Non-fatal — LLM failure logs warning, chunks proceed without metadata
- **Superseded approach:** Original custom LiteLLMHttpClient + EnrichmentGatewayService removed; Mastra's built-in `extractMetadata()` with custom LLM is the current approach
