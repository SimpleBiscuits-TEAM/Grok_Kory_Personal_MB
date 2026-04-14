/**
 * Renders docs/flash-gm-e41-procedure.md to docs/flash-gm-e41-procedure.pdf
 * using jspdf (no Puppeteer). Run: node scripts/render-flash-doc-pdf.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jsPDF } from 'jspdf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mdPath = join(root, 'docs', 'flash-gm-e41-procedure.md');
const outPath = join(root, 'docs', 'flash-gm-e41-procedure.pdf');

const md = readFileSync(mdPath, 'utf8');
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const pageW = doc.internal.pageSize.getWidth();
const margin = 14;
const maxW = pageW - margin * 2;
let y = margin;
const foot = 285;

function newPage() {
  doc.addPage();
  y = margin;
}

function emitParagraph(text, fontSize, lineH) {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y > foot) newPage();
    doc.text(line, margin, y);
    y += lineH;
  }
}

const rawLines = md.split(/\r?\n/);
for (const raw of rawLines) {
  const line = raw.trimEnd();
  if (line.trim() === '---') {
    y += 2;
    continue;
  }
  if (line.startsWith('|')) {
    // Table row: flatten for PDF
    const t = line.replace(/^\|/, '').replace(/\|$/, '').replace(/\|/g, ' — ');
    emitParagraph(t, 9, 4.2);
    continue;
  }
  if (line.startsWith('# ')) {
    y += 4;
    emitParagraph(line.slice(2), 16, 7);
    y += 2;
    continue;
  }
  if (line.startsWith('## ')) {
    y += 3;
    emitParagraph(line.slice(3), 13, 5.5);
    y += 1;
    continue;
  }
  if (line.startsWith('### ')) {
    y += 2;
    emitParagraph(line.slice(4), 11, 5);
    continue;
  }
  if (line.startsWith('- ')) {
    emitParagraph('• ' + line.slice(2), 10, 4.8);
    continue;
  }
  if (/^\d+\.\s/.test(line)) {
    emitParagraph(line, 10, 4.8);
    continue;
  }
  if (line === '') {
    y += 2;
    continue;
  }
  emitParagraph(line, 10, 4.8);
}

const buf = doc.output('arraybuffer');
writeFileSync(outPath, Buffer.from(buf));
console.log('Wrote', outPath);
