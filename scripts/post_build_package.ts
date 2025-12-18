import { existsSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const CJS_DIR = resolve("dist/package/cjs");

function main() {
    if (!existsSync(CJS_DIR)) {
        console.error("CJS directory does not exist. Run build:package first.");
        process.exit(1);
    }

    const pkgJson = join(CJS_DIR, "package.json");
    writeFileSync(pkgJson, JSON.stringify({ type: "commonjs" }, null, 2));
    console.log(
        "Written package.json to dist/package/cjs to enforce CommonJS."
    );
}

main();
