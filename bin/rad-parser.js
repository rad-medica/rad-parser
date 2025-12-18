#!/usr/bin/env node

import { spawnSync } from "child_process";
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distPath = join(__dirname, "../dist/package/cjs/cli.js");
const srcPath = join(__dirname, "../src/cli.ts");

// Detect Runtime
const isBun = typeof Bun !== "undefined";
// @ts-ignore
const isDeno = typeof Deno !== "undefined";
const isNode = !isBun && !isDeno;

function run() {
    // 1. Production / Dist mode
    if (fs.existsSync(distPath)) {
        // In dist mode, we prefer running the compiled JS.
        // For Node/Bun/Deno, we can try to rely on their standard execution capabilities.

        if (isBun) {
            const result = spawnSync(
                "bun",
                ["run", distPath, ...process.argv.slice(2)],
                {
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 0);
        } else if (isDeno) {
            // Deno compat check
            const result = spawnSync(
                "deno",
                ["run", "--allow-all", distPath, ...process.argv.slice(2)],
                {
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 0);
        } else {
            // Node
            const result = spawnSync(
                "node",
                [distPath, ...process.argv.slice(2)],
                {
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 0);
        }
        return;
    }

    // 2. Development / Src mode
    // We need to run TypeScript directly.
    if (isBun) {
        const result = spawnSync(
            "bun",
            ["run", srcPath, ...process.argv.slice(2)],
            {
                stdio: "inherit",
            }
        );
        process.exit(result.status ?? 0);
    } else if (isDeno) {
        // Deno might need specific perms or config to run TS from src if it has imports
        // Assuming srcPath is compatible or Deno can handle it
        const result = spawnSync(
            "deno",
            ["run", "--allow-all", srcPath, ...process.argv.slice(2)],
            {
                stdio: "inherit",
            }
        );
        process.exit(result.status ?? 0);
    } else {
        // Node - assume 'npx tsx' is available
        const result = spawnSync(
            "npx",
            ["tsx", srcPath, ...process.argv.slice(2)],
            {
                stdio: "inherit",
                shell: true,
            }
        );
        process.exit(result.status ?? 0);
    }
}

run();
