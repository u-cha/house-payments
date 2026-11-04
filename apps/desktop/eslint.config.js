import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Границы слоёв (core-modules §3) проверяются архитектурными тестами M0-12,
// здесь — только базовые правила JS/TS и отключение пересечений с Prettier.
export default tseslint.config(
  { ignores: ['dist/', 'release/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
