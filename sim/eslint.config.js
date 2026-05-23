import js from '@eslint/js';
import globals from 'globals';

export default [
  // Base recommended rules for all JS files
  js.configs.recommended,

  // Allow _-prefixed names as intentionally unused
  {
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // Browser source files
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Node.js scripts
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
