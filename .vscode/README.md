# VS Code Configuration for Bun Development

This directory contains VS Code configurations optimized for developing rad-parser with Bun.

## Files

- `settings.json` - Editor settings optimized for Bun, TypeScript, Zig, and WASM development
- `extensions.json` - Recommended extensions for the best development experience
- `launch.json` - Debug configurations for CLI, tests, and benchmarks using Bun
- `tasks.json` - Build and development tasks using Bun runtime

## Key Features

- **Bun Runtime**: All tasks and debugging use Bun as the primary runtime
- **TypeScript**: Full TypeScript support with auto-imports and formatting
- **Zig Support**: Configurations for Zig language (used for WASM codecs)
- **Testing**: Vitest integration for running and debugging tests
- **Performance**: Optimized file watching and search exclusions

## AI Agent Integration

This project includes comprehensive rules and configurations for AI coding assistants:

### Cursor

- **File**: `.cursorrules` (project root)
- **Features**: Detailed project context, coding standards, architecture guidelines
- **Integration**: Automatic context awareness for Cursor AI editor

### GitHub Copilot

- **File**: `.github/copilot-instructions.md`
- **Features**: Project overview, code standards, development workflow
- **Integration**: GitHub Copilot reads these instructions for better code suggestions

### Antigravity

- **Files**: `.antigravity/rules.md` and `.antigravity/config.json`
- **Features**: Comprehensive coding guidelines, architecture patterns, quality gates
- **Integration**: Antigravity AI assistant uses these for context-aware code generation

**[📖 Complete AI Agents Documentation](../../AGENTS.md)** - Comprehensive guide to all AI agent configurations and usage guidelines.

## Getting Started

1. Install recommended extensions when prompted
2. Use `Ctrl+Shift+P` → "Tasks: Run Task" to access Bun-powered build tasks
3. Use `F5` or debug panel to run debug configurations
4. All scripts in package.json work with Bun automatically

## Customization

You can override these settings in your user settings or workspace settings. The configurations here are optimized for this specific project.

## AI Assistant Guidelines

When using AI coding assistants with this project:

1. **Follow the established patterns** in the rules files
2. **Maintain code standards** (double quotes, LF endings, TypeScript strict mode)
3. **Consider performance implications** for medical imaging code
4. **Ensure cross-platform compatibility** (Node.js, Bun, Deno, browsers)
5. **Add appropriate tests** when modifying functionality
6. **Follow the architecture** (core parser, codec system, utilities)

The AI agent configurations ensure consistent, high-quality code generation that matches the project's standards and architecture.
