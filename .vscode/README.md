# VS Code Configuration for Bun Development

This directory contains VS Code configurations optimized for developing rad-parser with Bun.

## Files

- `settings.json` - Editor settings optimized for Bun, TypeScript, and WASM development
- `extensions.json` - Recommended extensions for the best development experience
- `launch.json` - Debug configurations for CLI, tests, and benchmarks using Bun
- `tasks.json` - Build and development tasks using Bun runtime

## Key Features

- **Bun Runtime**: All tasks and debugging use Bun as the primary runtime
- **TypeScript**: Full TypeScript support with auto-imports and formatting
- **Testing**: Vitest integration for running and debugging tests
- **Performance**: Optimized file watching and search exclusions

## AI agents

Rules for every coding agent: [`AGENTS.md`](../AGENTS.md).

## Getting Started

1. Install recommended extensions when prompted
2. Use `Ctrl+Shift+P` → "Tasks: Run Task" to access Bun-powered build tasks
3. Use `F5` or debug panel to run debug configurations
4. All scripts in package.json work with Bun automatically

## Customization

You can override these settings in your user settings or workspace settings. The configurations here are optimized for this specific project.

