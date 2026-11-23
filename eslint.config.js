import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '_archive/**',
    'data/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    ignores: ['packages/web/src/**', 'packages/web/public/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/web/src/**/*.{ts,tsx}', 'packages/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['packages/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // BRAND.md + CLAUDE.md rules 6 and 7, enforced in components.
    files: ['packages/web/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-zÀ-ÿ]/]',
          message: 'User-facing text goes through t() and i18n/pt-PT.json (CLAUDE.md rule 7).',
        },
        {
          selector: 'JSXAttribute[name.name=/^(aria-label|title|alt|placeholder)$/] > Literal',
          message: 'User-facing attribute text goes through t() (CLAUDE.md rule 7).',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]',
          message: 'No raw colours in components; use BRAND.md tokens (CLAUDE.md rule 6).',
        },
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'No raw HTML (CLAUDE.md rule 5).',
        },
      ],
    },
  },
]);
