# Agent e2e test

## General scenario

So I need you to test manually all the better-mnemosyne and rag-context-chuncker functionality - use mcp tools, do not try to call server via curl. When waiting for debounce - wait 2 sec, no more.

- First check what memory do you have in general and what banks you have. 
- Then copy fixture files from this folder(/Users/oleksii.honchar/www/olho/racochu/src/e2e/fixtures) to this folder(/Users/oleksii.honchar/www/olho/racochu/watch-folder-dev).
- Then recall (use mcp tool meta-search first) "what default terminal in vscode"
- Then update file obsidian-vscode-note.md in /Users/oleksii.honchar/www/olho/racochu/watch-folder-dev: set default terminal to bash; then recall again to check if change was applied. Also check if old memory was removed.
- Then create 2 folders in racochu/watch-folder-dev, f1 and f2
- create new test file in f1/test.md with sample content
- test recall
- copy this file to f2/test.md with the same content
- check logs and confirm no duplicated memory created

Then delete all files from /Users/oleksii.honchar/www/olho/racochu/watch-folder-dev and recall again.

## Enrichment Scenario

### Test Objective

Verify end-to-end enrichment feature in racochu:
1. Does the enrichment code path actually execute?
2. Does the LLM endpoint respond?
3. Are enriched chunks actually being stored with metadata (title, keywords)?

### Prerequisites

- racochu running with enrichment enabled in config
- LLM endpoint at `https://lite-llm.lan/v1` reachable
- bensyne-dev MCP tools available

### Test Steps

#### Step 1: Check Current State

- List existing memory banks
- Get memory stats to see current memory count

#### Step 2: Create Test File with Enrichable Content

- Create a file with clear semantic content that should be enriched
- File should have a title-worthy topic and identifiable keywords

#### Step 3: Wait for Processing

- Wait 3 seconds for debounce + chunking + enrichment

#### Step 4: Verify Enrichment

- Recall the content using the test file's unique identifier
- Check if returned chunks have enriched metadata (title, keywords)
- Compare with expected enrichment

#### Step 5: Cleanup

- Delete the test file
- Verify memory was cleaned up
