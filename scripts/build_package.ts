import { spawnSync } from "child_process";

function run(command: string, args: string[]) {
    console.log(`Running: ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, { stdio: "inherit", shell: true });
    // TSC returns 1 even if files are emitted when there are type errors.
    // We log but don't exit if files were likely emitted.
    if (result.status !== 0) {
        console.error(`Command failed with exit code ${result.status}.`);
        process.exit(1);
    }
}

async function main() {
    console.log("Building Package...");

    // ESM Build
    console.log("Building ESM...");
    run("bun", [
        "run",
        "tsc",
        "--project",
        "tsconfig.build.json",
        "--outDir",
        "dist/package/esm",
    ]);

    // CJS Build
    console.log("Building CJS...");
    run("bun", [
        "run",
        "tsc",
        "--project",
        "tsconfig.build.json",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--outDir",
        "dist/package/cjs",
        "--declaration",
        "false",
        "--declarationMap",
        "false",
    ]);

    // Post Build
    console.log("Running Post-Build...");
    run("bun", ["run", "scripts/post_build_package.ts"]);

    console.log("Package build finished.");
}

main();
