#!/usr/bin/env node
// Build script for the developer documentation.
//
// Reads docs/plugin-development.md and produces:
//   - docs/plugin-development.txt   (plain-text export)
//   - docs/plugin-development.pdf   (Puppeteer-rendered)
//
// Usage:
//   node tools/build-docs.mjs
//
// Dependencies: marked + puppeteer (already pulled in by the OpenFormulare
// backend for PDF generation).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const mdPath = resolve(repoRoot, 'docs/plugin-development.md');
const txtPath = resolve(repoRoot, 'docs/plugin-development.txt');
const pdfPath = resolve(repoRoot, 'docs/plugin-development.pdf');

const md = readFileSync(mdPath, 'utf8');

// ---------------------------------------------------------------------------
// TXT: very lightweight markdown stripper. Keeps headings, paragraphs,
// lists and table rows readable in plain text.
// ---------------------------------------------------------------------------
function mdToText(input) {
  let txt = input;
  // Code fences → keep contents, drop the fences.
  txt = txt.replace(/```[a-z]*\n([\s\S]*?)```/g, (_m, body) => body.trim());
  // Inline code: drop backticks.
  txt = txt.replace(/`([^`]+)`/g, '$1');
  // Bold / italic.
  txt = txt.replace(/\*\*([^*]+)\*\*/g, '$1');
  txt = txt.replace(/\*([^*]+)\*/g, '$1');
  txt = txt.replace(/_([^_]+)_/g, '$1');
  // Links: `[text](url)` → `text (url)`
  txt = txt.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  // Headings: keep the text, drop the leading #s, underline level-1/2.
  const lines = txt.split('\n');
  const out = [];
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      out.push(text);
      if (level === 1) out.push('='.repeat(text.length));
      else if (level === 2) out.push('-'.repeat(text.length));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

const txt = mdToText(md);
writeFileSync(txtPath, txt, 'utf8');
console.log(`✓ wrote ${txtPath}`);

// ---------------------------------------------------------------------------
// PDF: marked → HTML → Puppeteer
// ---------------------------------------------------------------------------
const html = marked.parse(md);

const wrapper = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>OpenFormulare – Plugin-Entwicklung</title>
    <style>
      @page { size: A4; margin: 22mm 18mm; }
      body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1f2937; }
      h1 { font-size: 22pt; margin: 0 0 0.4em; color: #111827; }
      h2 { font-size: 15pt; margin: 1.6em 0 0.4em; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
      h3 { font-size: 12.5pt; margin: 1.2em 0 0.3em; color: #1f2937; }
      h4 { font-size: 11pt; margin: 1em 0 0.3em; color: #374151; }
      p { margin: 0.4em 0 0.8em; }
      code { background: #f3f4f6; padding: 0 0.25em; border-radius: 3px; font-family: "JetBrains Mono", Consolas, monospace; font-size: 9.5pt; }
      pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.6em 0.8em; overflow-x: auto; font-size: 9pt; }
      pre code { background: transparent; padding: 0; }
      table { border-collapse: collapse; margin: 0.6em 0; font-size: 9.5pt; width: 100%; }
      th, td { border: 1px solid #e5e7eb; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
      th { background: #f9fafb; font-weight: 600; }
      blockquote { margin: 0.6em 0; padding: 0.4em 0.8em; border-left: 3px solid #94a3b8; background: #f8fafc; color: #334155; }
      ul, ol { margin: 0.4em 0 0.6em 1.4em; padding: 0; }
      li { margin: 0.15em 0; }
      a { color: #2563eb; text-decoration: none; }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.6em 0; }
      .footer { position: fixed; bottom: 8mm; left: 18mm; right: 18mm; font-size: 8pt; color: #6b7280; display: flex; justify-content: space-between; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`;

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setContent(wrapper, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="font-size:8pt;color:#6b7280;width:100%;display:flex;justify-content:space-between;padding:0 18mm;">' +
      '<span>OpenFormulare – Plugin-Entwicklung</span>' +
      '<span>Seite <span class="pageNumber"></span> / <span class="totalPages"></span></span>' +
      '</div>',
    margin: { top: '22mm', bottom: '20mm', left: '18mm', right: '18mm' },
  });
  console.log(`✓ wrote ${pdfPath}`);
} finally {
  await browser.close();
}
