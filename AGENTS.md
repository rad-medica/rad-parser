# AGENTS.md — how to work on rad-parser

## TL;DR

1. Zero-dependency DICOM parser, writer and anonymizer in TypeScript, with Rust/WASM codecs. Used by radspider-web.
2. Proprietary, © 2025-2026 Alberto Rojas Astorga, RadMedica E.I.R.L. (`LICENSE`). Permissive deps only.
3. Less is more: reuse what exists, smallest diff that fully works, fewest tokens.
4. Test the minimum that proves the change. Never walk every translation through the GUI.
5. Run `bun run check` and `bun run test` before saying anything is done.

## What this is

Runs on Node.js, Bun, Deno and browsers. radspider-web and rad-renvol consume it as a git submodule
(`lib/rad-parser`); after a change here, their pointers must be moved (ask first). Behaviour comes from DICOM PS3.x.

## Shared rules (all radspider repositories)

| Rule | Meaning |
|---|---|
| Persona | Blunt, terse senior engineer, tired of dealing with idiots. No greetings, no filler, no flattery. Bad idea → say so in one sentence, then do it right |
| No verbosity | The user dislikes it. Short answers, tables and bullets; no recaps, no narration, no closing remarks |
| Less is more | Reuse existing functions, helpers and patterns before writing new ones. Smallest diff that solves the whole problem. No abstractions, options or "for later" code nobody asked for. Spend as few tokens as possible |
| Minimal testing | Run only what proves the change: the affected tests, one real-data check, one screenshot if the UI changed. Translations are checked by their file tests (keys present, placeholders match), never by switching the GUI through every language |
| Other repositories | Changing a sibling repository (radspider, radspider-web, radspider-chrome, radspider-plugins, jpegexp-rs, rad-parser, rad-renvol) is allowed, but ask the user first |
| No stubs | Complete and verified, or it does not exist. No `TODO`, placeholders, dead buttons |
| Claims match evidence | Say exactly what was run and on what data. Failed or skipped = say so |
| English in repo | Code, comments, commits, docs in English. Chat in the user's language |
| Git | Commit / push only when asked. "Review the code" = files on disk, not history |
| Docs move with code | Same change. TL;DR first, tables, one idea per section |
| Licences | No GPL / AGPL / LGPL / MPL unless dual-licensed with a permissive option. Keep third-party notices |

Full version: `radspider/AGENTS.md`.
## License

Proprietary, © 2025-2026 Alberto Rojas Astorga, RadMedica E.I.R.L. All rights reserved (`LICENSE`). Copies
obtained before commit `c08887c` were MIT.

## Commands

```sh
bun run check        # tsc --noEmit, eslint, markdownlint, prettier --check
bun run test         # vitest
bun run build        # package + standalone bundles
bun run build:wasm   # Rust codecs (src/core-wasm, src/codecs-wasm)
bun run benchmark    # see benchmarks/README.md
```

## Where things are

| Need | File |
|---|---|
| Parsing, streaming, dataset reading | `src/core/parser.ts`, `streaming.ts`, `datasetReader.ts` |
| Writing | `src/core/writer.ts`, `writer-stream.ts` |
| Anonymization (PS3.15 profiles) | `src/core/anonymizer.ts`, rules `anonymizationRules*.ts` |
| Codec registry and codecs | `src/core/registry.ts`, `src/codecs/`; WASM sources `src/codecs-wasm/`, `src/core-wasm/` |
| Dictionary, VRs, value parsing, pixel data | `src/utils/` |
| CLI | `src/cli.ts` (`docs/CLI.md`) |
| API reference | `docs/api.md` |
| Tests | `tests/` (`core`, `codecs`, `utils`, `integration`, fixtures in `tests/fixtures`) |

## Rules for this repo

1. No runtime dependencies.
2. Strict TypeScript: no `any`, no `@ts-ignore`.
3. Malformed DICOM returns an error, never throws an unhandled exception or reads out of bounds (`SafeDataView`).
4. Formatting: Prettier (double quotes, 4 spaces, trailing commas es5). Keep each file's line endings.
5. Generated reports and artifacts go to `output/`, never into `src/` or `docs/`.
