#!/usr/bin/env bash
# render-diagrams.sh — один вход, все диаграммы.
#
# Источники (текст, в git):            Результат (производное):
#   docs/**/*.mmd  (mermaid)       ->   тот же путь с .svg и .png
#   docs/**/*.dbml (модель данных) ->   тот же путь с .svg и .png
#
# Требуется: node + pnpm install (mermaid-cli, @dbml/cli, dbml-renderer),
# локальный Chrome (путь в .tools/puppeteer-config.json).
set -euo pipefail
cd "$(dirname "$0")/.."

MMDC=node_modules/.bin/mmdc
DBML=node_modules/.bin/dbml-renderer
PUPPETEER_CONFIG=.tools/puppeteer-config.json

mkdir -p docs/design/diagrams

render() {
  local src="$1" svg="${1%.*}.svg" png="${1%.*}.png"
  case "$src" in
    *.mmd)
      "$MMDC" -i "$src" -o "$svg" -p "$PUPPETEER_CONFIG" -b white -w 1400 >/dev/null
      ;;
    *.dbml)
      "$DBML" -i "$src" -o "$svg" >/dev/null
      ;;
  esac
  node scripts/svg-to-png.mjs "$svg" "$png" "${SCALE:-2}" >/dev/null
  echo "  ok  $src -> ${svg##*/}, ${png##*/}"
}

shopt -s nullglob
found=0
extra=""
if [[ "${1:-}" == "--with-examples" ]]; then
  extra="--with-examples"
fi

# Список источников даёт Node-скрипт: bash 3.2 (macOS) не поддерживает globstar,
# поэтому `docs/**/*.mmd` не раскрывается рекурсивно.
sources="$(node scripts/diagram-sources.mjs $extra)"
while IFS= read -r src; do
  [[ -n "$src" ]] || continue
  render "$src"
  found=1
done <<< "$sources"

[[ "$found" == 1 ]] || echo "no diagram sources yet"
echo "done."
