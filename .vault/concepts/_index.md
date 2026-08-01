---
type: index
title: "Domain Concepts"
createdAt: "2026-07-31T07:30:00Z"
updatedAt: "2026-07-31T07:30:00Z"
tags: []
---

# Domain Concepts

Core domain terminology and mental models for RAG Content Chunker.

## Nodes

### Chunking & Processing

- [[0001-chunk-concept]] — Chunk entity representing a semantically coherent content fragment
- [[0002-file-role]] — File classification (docs, code, config, agent-output) driving chunking strategy
- [[0005-processing-model]] — File watching → chunking → ingestion flow with bounded queue and dedup

### Enhancement

- [[0003-enhancement-pipeline]] — Post-chunking enhancement stages (importance, tags, namespace)
- [[0006-mastra-chunking-strategies]] — Mastra RAG strategy selection per file type

### Mnemosyne Integration

- [[0004-namespace-routing]] — Server-side namespace → database mapping for source segregation
