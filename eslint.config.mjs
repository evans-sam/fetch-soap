import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginCompat from 'eslint-plugin-compat';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['lib/', 'node_modules/', 'test/'],
  },
  {
    plugins: {
      compat: pluginCompat,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Warn about browser compatibility issues
      'compat/compat': 'warn',
    },
    settings: {
      // Target environments for compatibility checking
      browsers: [
        'last 2 Chrome versions',
        'last 2 Firefox versions',
        'last 2 Safari versions',
        'last 2 Edge versions',
      ],
      polyfills: [],
    },
  }
);
