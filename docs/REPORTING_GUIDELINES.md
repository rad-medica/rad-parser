# Reporting Guidelines for AI Agents

All AI agents working on `rad-parser` must follow these guidelines for generating reports, logs, and artifacts.

## 1. Designated Output Locations

**NEVER** write generated files to the root directory or source folders unless explicitly instructed (e.g., creating a new source file).

Use the `output/` directory for all generated content:

- **Benchmarks**: `output/benchmarks/`
    - Format: `benchmark_{name}_{timestamp}.json` or `_report.md`
- **Logs**: `output/logs/`
    - Debug logs, error dumps.
- **Test Artifacts**: `output/tests/`
    - Temporary files generated during tests (DICOM files, images).
- **General Reports**: `docs/reports/`
    - Permanent, human-readable reports (e.g., performance analysis, architecture reviews).

## 2. Naming Conventions

### File Naming

- **UPPERCASE**: Meta-documentation, standards, and root project files.
    - Examples: `README.md`, `AGENTS.md`, `REPORTING_GUIDELINES.md`, `LICENSE`
- **kebab-case**: General documentation, guides, reports, and tutorials.
    - Examples: `api.md`, `codec-tutorial.md`, `benchmark-results.md`
- **Timestamps**: Use ISO 8601 format (YYYY-MM-DD) or compact (YYYYMMDD) for file suffixes.
- **Descriptive names**: `benchmark_wasm_vs_js_20231025.md` is better than `report.md`.

## 3. Report Format

Markdown is preferred for human-readable reports.

```markdown
# Report Title

**Date:** YYYY-MM-DD
**Agent:** [Agent Name]

## Executive Summary

Brief overview of findings.

## Details

...
```

## 4. Markdown Standards

All Markdown files created by agents must adhere to the following standards to ensure consistency and readability.

### Headers

- **Title**: Use a single H1 (`# Title`) at the top of the file.
- **Sections**: Use H2 (`## Section`) for main sections.
- **Subsections**: Use H3 (`### Subsection`) for subsections.
- **Avoid**: H4 and deeper unless absolutely necessary.

### Lists

- **Unordered**: Use hyphens (`-`) for unordered lists.
- **Ordered**: Use numbers (`1.`) for ordered lists.
- **Spacing**: Add a newline before and after lists.

### Code Blocks

- **Language**: Always specify the language for syntax highlighting (e.g., ````typescript`).
- **Filenames**: When applicable, include the filename in a comment at the top of the block or in the preceding text.

```typescript
// src/example.ts
console.log("Hello");
```

### Alerts & Callouts

Use GitHub-flavored markdown alerts for emphasis:

> [!NOTE]
> Useful information that users should know.

> [!IMPORTANT]
> Crucial information necessary for correct usage.

> [!WARNING]
> Critical warnings about potential risks.

### Links

- **Relative Links**: Use relative paths for internal links: `[Link text](../path/to/file.md)`.
- **Absolute Links**: Avoid absolute system paths in shared documentation.

## 5. Updates to Existing Files

If updating a tracking file (like `docs/reports/tests_results.md`), append the new run data with a date header, rather than overwriting previous history, unless specifically checking for regression.
