# Agent e2e test

Test manually all the bensyne and racochu functionality - use mcp tools, do not try to call server via curl.

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
