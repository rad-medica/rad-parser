# VS Code configuration

TL;DR: open the folder, accept the recommended extensions, `Ctrl+Shift+P` → *Tasks: Run Task*. Everything runs on
Node.js 22+ and npm.

| File | Holds |
|---|---|
| `settings.json` | Editor, Prettier, ESLint, markdownlint and Vitest settings |
| `extensions.json` | Prettier, ESLint, Vitest, markdownlint, rust-analyzer (WASM codecs) |
| `launch.json` | Debug the CLI (`src/cli.ts` via `tsx`, asks for a file), the tests, the benchmarks; attach on port 9229 |
| `tasks.json` | The `package.json` scripts: install, build, test, lint, format, benchmarks |

## AI agents

Rules for every coding agent: [`AGENTS.md`](../AGENTS.md).
