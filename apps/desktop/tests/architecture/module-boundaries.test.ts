import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Конфиг и CLI те же, что в `pnpm arch`: тест проверяет реальную проверку,
// а не пересказ правил (core-modules §1, §10; ADR-0010).
const ROOT = path.resolve(import.meta.dirname, '../..');
const CONFIG = path.join(ROOT, '.dependency-cruiser.cjs');
const CLI = path.join(ROOT, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');

function depcruise(): { status: number; output: string } {
  const args = [CLI, 'src', '--config', CONFIG, '--output-type', 'err-long'];
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }),
    };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

describe('границы модулей (dependency-cruiser)', () => {
  it('исходный код проходит правила: циклы, renderer→main, внутренности модулей', () => {
    const { status, output } = depcruise();
    expect(output).not.toContain('dependency violations (');
    expect(status).toBe(0);
  });

  it('ловит нарушение: renderer импортирует main', () => {
    const violation = path.join(ROOT, 'src/renderer/arch-violation.ts');
    writeFileSync(violation, "import { systemClock } from '../main/shared/clock';\n");
    try {
      const { status, output } = depcruise();
      expect(status).not.toBe(0);
      expect(output).toContain('renderer-no-main');
    } finally {
      rmSync(violation, { force: true });
    }
  });
});
