#!/usr/bin/env node

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { spawnSync } from "child_process";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to use the built version first, otherwise fallback to TS via ts-node if dev
const distPath = join(__dirname, "../dist/index.cjs");
const srcPath = join(__dirname, "../src/cli.ts");

if (fs.existsSync(distPath)) {
    // Check if we can run the src directly via tsx (Development / Repo mode)
    // If dist exists, we might be in a package environment, but if src exists we prefer src for dev testing?
    // Actually, properly we should run the built CLI if it exists.
    // BUT I haven't built a CLI bundle. Only `index.cjs`.
    // My CLI implementation is in `src/cli.ts`.
    // So distinct CLI build IS needed for production usage, OR `ts-node`.

    // For this context (dev), we assume `tsx` is available via npx.
    const result = spawnSync(
        "npx",
        ["tsx", srcPath, ...process.argv.slice(2)],
        { stdio: "inherit", shell: true },
    );
    process.exit(result.status ?? 0);
} else {
    // If no dist, definitely dev.
    const result = spawnSync(
        "npx",
        ["tsx", srcPath, ...process.argv.slice(2)],
        { stdio: "inherit", shell: true },
    );
    process.exit(result.status ?? 0);
}
