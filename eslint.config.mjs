import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Shared rules: the same block in radspider-web, rad-parser and rad-renvol. Formatting is Prettier's
// job (`npm run format:check`), not ESLint's.
const sharedRules = {
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/ban-ts-comment': 'error',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'no-var': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '**/pkg/**', '**/*.d.ts', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      'tests/**',
      'benchmarks/**',
      'scripts/**',
      'bin/**',
      'src/cli.ts',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
  {
    // Dev tooling, not shipped: probes of optional globals and quick experiments.
    files: ['tests/**', 'benchmarks/**', 'scripts/**', 'bin/**'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': 'off',
      'no-case-declarations': 'off',
      'no-control-regex': 'off',
    },
  }
);
