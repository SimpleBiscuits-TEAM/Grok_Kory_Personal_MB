/**
 * Multi-sheet Excel export: Recommendations (first) + CAN/UDS log.
 * Uses Excel 2003 XML Spreadsheet (.xls) — no npm dependency; opens in Excel with multiple tabs.
 */
import type { FlashPlan, SimulatorLogEntry } from '@shared/pcanFlashOrchestrator';
import type { FlashRecoAnalysis } from '@shared/flashLogRecommendations';

export interface FlashXlsxSessionMeta {
  connectionMode: string;
  sessionUuid: string;
  result: 'SUCCESS' | 'FAILED' | 'ABORTED' | null;
  dryRun: boolean;
  elapsedMs: number;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'Sheet';
}

function cell(value: string | number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  const str = value === '' || value == null ? '' : String(value);
  return `<Cell><Data ss:Type="String">${xmlEscape(str)}</Data></Cell>`;
}

function row(values: (string | number)[]): string {
  return `<Row>${values.map(cell).join('')}</Row>`;
}

function worksheet(name: string, aoa: (string | number)[][]): string {
  const n = safeSheetName(name);
  return `<Worksheet ss:Name="${xmlEscape(n)}"><Table>${aoa.map((r) => row(r)).join('')}</Table></Worksheet>`;
}

function buildSpreadsheetMlWorkbook(sheetXmlChunks: string[]): string {
  return (
    '\ufeff<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
    sheetXmlChunks.join('\n') +
    '\n</Workbook>'
  );
}

function recommendationsSheetAoA(analysis: FlashRecoAnalysis): (string | number)[][] {
  const lines: (string | number)[][] = analysis.disclaimerLines.map((d) => [d]);
  lines.push(['']);
  lines.push(['category', 'timestamp_ms', 'phase', 'summary', 'suggested_fix', 'pattern_key']);
  for (const r of analysis.rows) {
    lines.push([
      r.category,
      r.whenMs,
      r.phase,
      r.summary,
      r.suggestedFix,
      r.patternKey,
    ]);
  }
  return lines;
}

function canLogSheetAoA(
  log: SimulatorLogEntry[],
  plan: FlashPlan,
  meta: FlashXlsxSessionMeta,
): (string | number)[][] {
  const header: (string | number)[][] = [
    ['ECU', plan.ecuName],
    ['ECU type', plan.ecuType],
    ['Mode', plan.flashMode],
    ['Connection', meta.connectionMode],
    ['Session', meta.sessionUuid],
    ['Result', meta.result ?? 'in_progress'],
    ['Dry run', meta.dryRun],
    ['Elapsed ms', Math.round(meta.elapsedMs)],
    ['Entries', log.length],
    [''],
    ['timestamp_ms', 'phase', 'type', 'message', 'block_id', 'nrc_code'],
  ];
  const data = log.map((e) => [
    Math.round(e.timestamp),
    e.phase,
    e.type,
    e.message,
    e.blockId != null ? e.blockId : '',
    e.nrcCode != null ? e.nrcCode : '',
  ]);
  return [...header, ...data];
}

/** Downloads a multi-sheet workbook as .xls (Excel XML Spreadsheet). */
export function downloadFlashSessionXlsx(opts: {
  filenameBase: string;
  log: SimulatorLogEntry[];
  plan: FlashPlan;
  meta: FlashXlsxSessionMeta;
  analysis: FlashRecoAnalysis;
}): void {
  const xml = buildSpreadsheetMlWorkbook([
    worksheet('Recommendations', recommendationsSheetAoA(opts.analysis)),
    worksheet('CAN_log', canLogSheetAoA(opts.log, opts.plan, opts.meta)),
  ]);
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.filenameBase}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
