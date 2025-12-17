# RAD-Parser GitHub Wiki Content

This file represents the narrative content that should appear on the GitHub wiki (`https://github.com/AjRoAs/rad-parse/wiki`). Copy these sections into wiki pages or link back to this file from the wiki so the documentation is easier to browse.

## Overview

RAD-Parser is a zero-dependency DICOM parser that works in browsers and Node.js. The wiki should highlight:

- The parser's goals (safety, performance, zero dependencies).
- The supported transfer syntaxes and VR types.
- How to integrate the parser into downstream projects (CDN, bun, or as a git dependency).

## Release Checklist

1. Update the `version` field in `package.json`.
2. Run `bun run release` to regenerate `dist/`, `rad-parser.js`, and `rad-parser.min.js`.
3. Create or update release notes.
4. Tag the main branch (e.g., `git tag v1.0.1`) and push the tag.
5. The GitHub `Release` workflow publishes to npm and creates release assets automatically.

## Contribution Guide

- Follow the existing coding style (TypeScript modules under `src/`, no external runtime dependencies).
- Add tests in `tests/`; the suite already includes unit, utility, and integration tests using Vitest.
- Update `docs/api.md` when adding or changing exports, then sync the related wiki page.

## Troubleshooting

- If you hit unknown tag names, verify the dictionary entry exists under `src/dictionary.ts`.
- To debug VR detection, inspect `tests/vrDetection.test.ts` for expected heuristics.
- For pixel data issues, the `SafeDataView` wrapper and `extractPixelData` logic guard against out-of-bounds reads.
