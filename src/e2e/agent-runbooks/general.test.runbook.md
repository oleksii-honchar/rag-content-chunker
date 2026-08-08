# Agent e2e test

## General scenario

Test manually all the bensyne and racochu functionality - use mcp tools, do not try to call server via curl. When waiting for debounce - wait 2 sec, no more.

- First check what memory do you have in general and what banks you have. 
- Then copy fixture files from `src/e2e/fixtures` to `tmp/general` (relative to project root).
- Then recall (use mcp tool meta-search first) "what default terminal in vscode"
- Then update file obsidian-vscode-note.md in `tmp/general`: set default terminal to bash; then recall again to check if change was applied. Also check if old memory was removed.
- Then create 2 folders in `tmp/general`, f1 and f2
- create new test file in f1/test.md with sample content
- test recall
- copy this file to f2/test.md with the same content
- check logs and confirm no duplicated memory created

Then delete all files from `tmp/general` and recall again.
