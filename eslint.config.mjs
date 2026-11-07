import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.angular/**',
      '**/release/**',
      '**/coverage/**',
      'apps/desktop/electron/**',
      'apps/desktop/scripts/**',
      'odd/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // NestJS relies on runtime imports for DI metadata, so type-only import conversion is unsafe.
    files: ['apps/api/**/*.ts', 'apps/workers/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    files: ['apps/desktop/**/*.ts'],
    rules: {
      // Angular uses inject() and decorators with runtime imports.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Pre-existing debt in the moved app: reported, not fixed in the restructure (see README roadmap).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);
