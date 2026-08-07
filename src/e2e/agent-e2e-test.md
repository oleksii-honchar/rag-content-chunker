# Agent e2e test

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

