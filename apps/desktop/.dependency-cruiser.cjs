// Архитектурные границы (core-modules §1, §10; ADR-0010).
// Конфиг генерирует правила по фактическим каталогам модулей, чтобы новый
// модуль автоматически попадал под запрет без правки файла.
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const modulesDir = join(__dirname, 'src/main/modules');
const modules = readdirSync(modulesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const moduleBoundaries = modules.map((module) => ({
  name: `module-${module}-internals`,
  severity: 'error',
  comment: `Снаружи ${module} виден только api.ts: domain/application/adapters закрыты`,
  from: { path: `^src/main/(?!modules/${module}/)` },
  to: { path: `^src/main/modules/${module}/(?!api\\.ts$)` },
}));

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'renderer-no-main',
      severity: 'error',
      comment: 'renderer общается с ядром только через preload-мост (core-modules §3)',
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
    },
    ...moduleBoundaries,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^dist/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.node.json' },
  },
};
