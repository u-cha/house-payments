import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Границы слоёв (core-modules §3) проверяются архитектурными тестами M0-12,
// здесь — только базовые правила JS/TS и отключение пересечений с Prettier.
export default tseslint.config(
  { ignores: ['dist/', 'release/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Sandboxed preload обязан быть CommonJS — require-импорт здесь уместен.
  { files: ['**/*.cts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  // Конфиг dependency-cruiser — CommonJS-файл для внешнего инструмента.
  {
    files: ['*.cjs'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
