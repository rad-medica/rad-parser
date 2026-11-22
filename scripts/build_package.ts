import { spawnSync } from "child_process";
import { build } from "esbuild";
import { readdirSync } from "fs";

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
    // tsc rejects import.meta under --module commonjs (TS1343) and would turn the
    // loaders' import() of the ESM wasm-bindgen glue into require(). esbuild keeps
    // import() and lets import.meta.url be mapped onto __filename.
    const sources = (readdirSync("src", { recursive: true }) as string[])
        .map(file => "src/" + file.split("\\").join("/"))
        .filter(file => file.endsWith(".ts") && !file.endsWith(".d.ts"));
    await build({
        entryPoints: sources,
        outdir: "dist/package/cjs",
        outbase: "src",
        format: "cjs",
        platform: "node",
        target: "es2022",
        sourcemap: true,
        define: { "import.meta.url": "__radImportMetaUrl" },
        banner: {
            js: 'const __radImportMetaUrl = require("url").pathToFileURL(__filename).href;',
        },
    });

    // Post Build
    console.log("Running Post-Build...");
    run("bun", ["run", "scripts/post_build_package.ts"]);

    console.log("Package build finished.");
}

main();
