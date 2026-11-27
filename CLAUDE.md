## graphify

This project can use an optional graphify knowledge graph at graphify-out/ (god nodes, community structure, cross-file relationships). graphify-out/ is gitignored, so it only exists on machines where someone ran `/graphify`.

**If graphify-out/ does not exist, ignore this whole section and read, grep and search files normally.** Do not build the graph or ask for it unless the user requests it.

Rules (only when graphify-out/graph.json exists):
- Run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).