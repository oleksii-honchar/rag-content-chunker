---
type: index
title: "Atomic Memories"
createdAt: "2026-07-31T07:30:00Z"
updatedAt: "2026-08-07T19:01:00Z"
tags: []
---

# Atomic Memories

Durable facts, gotchas, and operational learnings for RAG Content Chunker.

## Nodes

### Mnemosyne MCP

- [[0001-mnemosyne-sse-deprecated]] — SSE transport is legacy; prefer Streamable HTTP
- [[0002-mnemosyne-schema-versioning]] — Stale DB causes "no such column: timestamp"
- [[0003-mnemosyne-dedup-inmemory-reset]] — In-memory dedup resets on restart
- [[0004-mcp-proxy-transport-switch]] — Proxy solution for stdio→HTTP bridge in e2e tests
- [[0005-mnemosyne-client-streamable-http]] — MnemosyneClient transport switch to Streamable HTTP via mcp-proxy

### File Update Flow

- [[0006-change-handler-per-id-forget-memory]] — handleChange uses per-ID forgetMemories (not deleteByFilePath) to preserve new tracker entries
- [[0007-chokidar-macos-dual-events]] — macOS chokidar fires duplicate events; processing Set deduplicates

### Hash Deduplication

- [[0008-sha256-collision-negligible]] — SHA-256 collision probability is 2^-128, negligible for any practical workload
