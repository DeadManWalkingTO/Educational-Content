// eslint.config.js (ESLint v9 flat config)
import eslint from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  // Βασικοί προτεινόμενοι κανόνες ESLint
  eslint.configs.recommended,

  // Δικές σου ρυθμίσεις για browser ESM
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // === Μεταφορά των κανόνων σου (.eslintrc.json) ===
      'no-unexpected-multiline': 'error',
      'operator-linebreak': [
        'error',
        'before',
        { overrides: { '&&': 'none', '||': 'none', '?': 'none' } },
      ],
      'no-mixed-operators': [
        'warn',
        { groups: [['&&', '||']], allowSamePrecedence: true },
      ],
      'prefer-nullish-coalescing': 'warn',
      'no-constant-binary-expression': 'error',
    },
  },

  // Τελευταίο: απενεργοποιεί κανόνες που συγκρούονται με Prettier
  eslintConfigPrettier,
];
