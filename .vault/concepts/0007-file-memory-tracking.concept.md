---
type: concept
title: "File→Memory Tracking"
createdAt: "2026-08-01T12:00:00Z"
updatedAt: "2026-08-01T12:00:00Z"
tags: [file-tracking, mnemosyne, prisma]
see_also: ["adrs/0010-file-memory-tracking-prisma-sqlite.adr.md", "concepts/0005-processing-model.concept.md"]
---

# Concept: File→Memory Tracking

## What

File→Memory tracking maintains a local Prisma SQLite database mapping watched file paths to Mnemosyne memory IDs. This enables reliable memory cleanup when files are deleted or updated.

## Why

Without tracking, memories persist indefinitely even after source files are deleted. Semantic recall-based cleanup is unreliable — it may miss memories or delete wrong ones. Direct memory ID lookup guarantees correct cleanup.

## Key Details

**Schema:**
- `FileTracker` — One row per file (filePath unique)
- `FileMemoryTracker` — One row per memory ID linked to a file (FK to FileTracker)

**Flow on file creation/update:**
1. `IngestChunkUseCase` calls `MnemosyneClient.remember(chunk)` → returns `{memory_id}`
2. `FileMemoryTrackerService.trackMemory(filePath, memoryId)` creates/updates tracker

**Flow on file deletion:**
1. `ProcessFileUseCase.handleDelete()` calls `tracker.getMemoryIds(filePath)`
2. For each memory ID, calls `MnemosyneClient.forget(memoryId, namespace)`
3. Removes tracker entry

**Storage:** Local SQLite at `data/file_memory.db`, managed via Prisma.
