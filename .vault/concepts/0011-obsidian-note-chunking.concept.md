---
type: concept
title: "Obsidian Note Chunking"
createdAt: "2026-08-06T12:00:00Z"
updatedAt: "2026-08-06T12:00:00Z"
tags: [chunking, obsidian, metadata]
see_also: ["concepts/0009-chunking-strategy-pattern.concept.md", "adrs/0017-obsidian-note-chunking-strategy.adr.md"]
---

# Concept: Obsidian Note Chunking

## What

A chunking strategy specific to Obsidian notes that extracts YAML frontmatter as a separate chunk and enriches all body chunks with note-specific metadata (aliases, tags, created, modified, source, status, type). Tags from Obsidian frontmatter are merged into each body chunk's tags array.

## Why

Obsidian notes carry rich metadata in frontmatter that improves retrieval quality. Without extraction, frontmatter is treated as body text — the metadata is lost as structured information. With tag merging, Obsidian tags become searchable attributes on all chunks from the note.

## Key Details

**Flow (verified in `src/application/strategies/obsidian-chunking.strategy.ts`):**

1. **Split frontmatter from body** — same regex as agent-session strategy
2. **Extract note metadata** — parses YAML frontmatter via `yaml.load()`
3. **Create frontmatter chunk** — `importance: 0.9`, tags `['frontmatter', 'metadata', 'obsidian-note']`
4. **Chunk body with Mastra** — delegates to `MastraChunkingService`
5. **Enrich all chunks** — injects note metadata as `note.*` keys; merges Obsidian tags into chunk tags

**Note metadata format (verified in `src/domain/note-metadata.type.ts`):**

| Field | Type | Example |
|-------|------|---------|
| `aliases` | `string[]` | `["billing-cycle", "billing-period"]` |
| `tags` | `string[]` | `["#billing", "#finance", "#adr"]` |
| `created` | `string` | `2026-07-15` |
| `modified` | `string` | `2026-08-05` |
| `source` | `string` | `https://example.com` |
| `status` | `string` | `draft` |
| `type` | `string` | `note` |

**Injected metadata keys:**

| Key | Value |
|-----|-------|
| `note.aliases` | JSON.stringify(metadata.aliases) |
| `note.tags` | JSON.stringify(metadata.tags) |
| `note.created` | metadata.created |
| `note.modified` | metadata.modified |
| `note.source` | metadata.source |
| `note.status` | metadata.status |
| `note.type` | metadata.type |

**Key difference from agent sessions:**
- Obsidian: metadata comes from same-file frontmatter; no parent file lookup; tags are merged into chunk tags
- Agent sessions: metadata comes from parent `session.md`; no tag merging; metadata is session-scoped

**Config example:**

```yaml
watchSources:
  - id: obsidian-vault
    path: ~/obsidian
    strategy: obsidian
    memoryBank: obsidian
    description: "Obsidian vault notes — personal knowledge base"
    exclude:
      - '.git/**'
      - 'node_modules/**'
    debounceMs: 5000
```
