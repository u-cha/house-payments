#!/usr/bin/env node
/**
 * svg-to-png.mjs — rasterise an SVG file to PNG using the Chrome that
 * @mermaid-js/mermaid-cli already depends on (no extra installs).
 *
 * Usage: node scripts/svg-to-png.mjs <input.svg> <output.png> [scale]
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve puppeteer from pnpm's content-addressable store: mermaid-cli depends
// on it, so no extra direct dependency is needed.
const pnpmDir = 'node_modules/.pnpm';
const puppeteerDir = readdirSync(pnpmDir).find((d) => d.startsWith('puppeteer@'));
if (!puppeteerDir) {
  console.error('puppeteer not found; run `pnpm install` first');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(pnpmDir, puppeteerDir, 'node_modules/puppeteer'));

const [, , inSvg, outPng, scaleArg] = process.argv;
if (!inSvg || !outPng) {
  console.error('usage: svg-to-png.mjs <in.svg> <out.png> [scale]');
  process.exit(2);
}

const config = JSON.parse(readFileSync('.tools/puppeteer-config.json', 'utf8'));
const scale = Number(scaleArg ?? 2);

const svg = readFileSync(resolve(inSvg), 'utf8');
// Prefer the intrinsic viewBox (mermaid emits width="100%"; graphviz emits pt
// units). Fall back to width/height attributes, converting pt -> px.
function intrinsicSize(text) {
  const vb = text.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  if (vb) return { width: Number(vb[3]), height: Number(vb[4]) };
  const w = text.match(/<svg[^>]*\swidth="([\d.]+)(pt)?"/);
  const h = text.match(/<svg[^>]*\sheight="([\d.]+)(pt)?"/);
  const ptToPx = (n, unit) => (unit === 'pt' ? (n * 4) / 3 : n);
  return {
    width: ptToPx(Number(w?.[1] ?? 1600), w?.[2]),
    height: ptToPx(Number(h?.[1] ?? 1000), h?.[2]),
  };
}
const { width, height } = intrinsicSize(svg);

const browser = await puppeteer.launch(config);
try {
  const page = await browser.newPage();
  await page.setViewport({
    width: Math.ceil(width * scale),
    height: Math.ceil(height * scale),
    deviceScaleFactor: 1,
  });
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  await page.screenshot({ path: outPng, type: 'png' });
  console.log(`png: ${outPng} (${Math.ceil(width * scale)}x${Math.ceil(height * scale)})`);
} finally {
  await browser.close();
}
