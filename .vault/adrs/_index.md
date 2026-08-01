---
type: index
title: "Architecture Decision Records"
createdAt: "2026-07-31T07:30:00Z"
updatedAt: "2026-07-31T07:30:00Z"
tags: []
---

# Architecture Decision Records

Curated list of architectural decisions for RAG Content Chunker.

## Nodes

### Enhancement Architecture

- [[0001-content-aware-enhancement-architecture]] — Integrated enhancement features (limits, scoring, tags) directly into chunking engine
- [[0002-content-aware-character-limits]] — Per-content-type character limits with selective summarization
- [[0003-selective-summarization-strategy]] — Rule-based summarization only for prose/documentation
- [[0004-importance-scoring-algorithm]] — Rule-based importance scoring with configurable factors
- [[0005-hybrid-tag-generation]] — Hybrid tag generation combining content extraction with LLM assistance
- [[0006-source-information-formatting]] — Comprehensive source information extraction from namespace

### Infrastructure

- [[0007-configuration-management]] — Extended existing Zod config schema with enhancement settings
- [[0008-remote-database-segregation]] — Server-side namespace routing to separate SQLite databases per source
- [[0009-mastra-rag-integration]] — Use @mastra/rag library instead of custom chunkers
