import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export default tseslint.config(
    ...tseslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "byte_code_check.js",
            "**/*.d.ts",
            "**/*.config.*",
            "zig-out/**",
            "zig-cache/**",
            ".zig-cache/**",
        ],
    },
    {
        rules: {
            // TypeScript specific rules
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/ban-ts-comment": "warn",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-var-requires": "off",

            // General code quality
            "no-console": "warn",
            "no-debugger": "error",
            "prefer-const": "error",
            "no-unused-expressions": "error",

            // Import/export rules
            "no-duplicate-imports": "error",

            // Disable conflicting prettier rules
            "prettier/prettier": "error",
        },
    },
    {
        files: ["**/*.test.ts", "**/*.spec.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "no-console": "off",
        },
    }
);
