import jsPDF from 'jspdf';
// @ts-ignore — dom-to-image-more has no @types package; supports OKLCH unlike html2canvas
import domtoimage from 'dom-to-image-more';
import { ProcessedMetrics } from './dataProcessor';
import { DiagnosticReport } from './diagnostics';
import { HealthReportData } from './healthReport';
import { PdfExportRefs } from '@/hooks/usePdfExport';
import { APP_VERSION } from './version';

/**
 * Convert a DOM element to a base64 PNG image.
 * Uses dom-to-image-more which supports OKLCH colors (Tailwind CSS 4).
 */
export async function elementToImage(element: HTMLElement, darkBg = false): Promise<string> {
  const dataUrl = await domtoimage.toPng(element, {
    scale: 2,
    bgcolor: darkBg ? '#0d0f14' : '#ffffff',
    style: {
      // Force a concrete background so oklch vars on parent don't bleed in
      background: darkBg ? '#0d0f14' : '#ffffff',
    },
  });
  return dataUrl;
}

export async function renderChartToImage(element: HTMLElement): Promise<string> {
  return elementToImage(element);
}

/**
 * Generate a comprehensive PDF report with all charts, diagnostics, and health data
 */
export async function generatePerformanceReport(
  data: ProcessedMetrics,
  fileName: string,
  diagnostics: DiagnosticReport | null,
  healthReport: HealthReportData | null,
  refs: PdfExportRefs
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const addText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' = 'normal',
    color: [number, number, number] = [30, 30, 30]
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont('helvetica', weight);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += (lines.length * size) / 2.8 + 2;
  };

  const checkBreak = (space: number) => {
    if (y + space > pageHeight - margin) {
      doc.addPage();
      y = margin + 5;
    }
  };

  const addImg = async (el: HTMLElement | null, label: string, isDark = false) => {
    if (!el) return;
    try {
      checkBreak(85);
      addText(label, 11, 'bold', [30, 58, 138]);
      const img = await elementToImage(el, isDark);
      const imgHeight = (el.offsetHeight / el.offsetWidth) * contentWidth;
      const h = Math.min(imgHeight, 90);
      checkBreak(h + 5);
      doc.addImage(img, 'PNG', margin, y, contentWidth, h);
      y += h + 6;
    } catch (e) {
      addText(`[Chart could not be rendered: ${label}]`, 9, 'normal', [180, 0, 0]);
    }
  };

  // ── COVER ──────────────────────────────────────────────────────────────────
  // Dark header band
  doc.setFillColor(13, 15, 20);
  doc.rect(0, 0, pageWidth, 62, 'F');
  // Animated-style rainbow accent bar (static in PDF)
  const barColors: Array<[number, number, number]> = [
    [220, 38, 38],   // red
    [234, 88, 12],   // orange
    [202, 138, 4],   // amber
    [22, 163, 74],   // green
    [6, 182, 212],   // cyan
  ];
  const barSegW = pageWidth / barColors.length;
  barColors.forEach((c, i) => {
    doc.setFillColor(...c);
    doc.rect(i * barSegW, 62, barSegW, 2.5, 'F');
  });

  // PPEI logo text (white bold)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('PPEI', margin, 20);

  // Vertical divider
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.8);
  doc.line(margin + 22, 10, margin + 22, 56);

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('V-OP BY PPEI', margin + 27, 22);

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('Vehicle Optimizer — Datalog Analysis Report', margin + 27, 31);

  // File + date
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`File: ${fileName}`, margin + 27, 41);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 27, 48);

  // V-OP BETA badge — top right corner
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(pageWidth - margin - 42, 8, 42, 10, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`V-OP BETA ${APP_VERSION}`, pageWidth - margin - 21, 14.5, { align: 'center' });

  // Custom Tuning tagline
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('PPEI CUSTOM TUNING · REDEFINING THE LIMITS · PPEI.COM', pageWidth / 2, 57.5, { align: 'center' });

  y = 65;

  // ── VEHICLE INFO ───────────────────────────────────────────────────────────
  if (healthReport?.vehicleInfo) {
    const vi = healthReport.vehicleInfo;
    checkBreak(50);
    addText('VEHICLE INFORMATION', 13, 'bold', [30, 58, 138]);
    const rows = [
      ['Year / Make / Model', `${vi.year} ${vi.make} ${vi.model}`],
      ['Engine', vi.engine],
      ['VIN', vi.vin],
      ['Transmission', vi.transmission],
      ['Factory HP / Torque', `${vi.factoryHp} HP / ${vi.factoryTorque} lb·ft`],
    ];
    rows.forEach(([label, val]) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(label + ':', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(val || '—', margin + 52, y);
      y += 6;
    });
    y += 4;
  }

  // ── PERFORMANCE SUMMARY ────────────────────────────────────────────────────
  checkBreak(50);
  addText('PERFORMANCE SUMMARY', 13, 'bold', [30, 58, 138]);
  const stats = [
    ['Peak RPM', `${data.stats.rpmMax.toFixed(0)} rpm`],
    ['Peak MAF', `${data.stats.mafMax.toFixed(1)} lb/min`],
    ['Peak HP (Torque Method)', `${data.stats.hpTorqueMax.toFixed(0)} HP`],
    ['Peak Boost', `${data.stats.boostMax.toFixed(1)} psi`],
    ['Session Duration', `${(data.stats.duration / 60).toFixed(1)} min`],
    ['Samples', data.rpm.length.toLocaleString()],
  ];
  const col = contentWidth / 2;
  for (let i = 0; i < stats.length; i += 2) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
    doc.text(stats[i][0] + ':', margin, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(stats[i][1], margin + 52, y);
    if (i + 1 < stats.length) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
      doc.text(stats[i + 1][0] + ':', margin + col, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.text(stats[i + 1][1], margin + col + 52, y);
    }
    y += 6;
  }
  y += 6;

  // ── HEALTH REPORT ──────────────────────────────────────────────────────────
  if (healthReport) {
    checkBreak(40);
    addText('VEHICLE HEALTH REPORT', 13, 'bold', [30, 58, 138]);
    addText(`Overall Health Score: ${healthReport.overallScore}/100 — ${healthReport.overallStatus.toUpperCase()}`, 10, 'bold',
      healthReport.overallScore >= 80 ? [22, 163, 74] : healthReport.overallScore >= 60 ? [202, 138, 4] : [220, 38, 38]);
    y += 2;
    const sections = [
      { name: 'Engine Health', score: healthReport.engineHealth.score, status: healthReport.engineHealth.status, findings: healthReport.engineHealth.findings },
      { name: 'Fuel System', score: healthReport.fuelSystem.score, status: healthReport.fuelSystem.status, findings: healthReport.fuelSystem.findings },
      { name: 'Transmission', score: healthReport.transmission.score, status: healthReport.transmission.status, findings: healthReport.transmission.findings },
      { name: 'Thermal Management', score: healthReport.thermalManagement.score, status: healthReport.thermalManagement.status, findings: healthReport.thermalManagement.findings },
    ];
    sections.forEach(sec => {
      const isGood = sec.score >= 80;
      const isWarn = sec.score >= 60 && sec.score < 80;
      const col: [number, number, number] = isGood ? [22, 163, 74] : isWarn ? [202, 138, 4] : [220, 38, 38];
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
      doc.text(`${isGood ? '✓' : isWarn ? '⚠' : '✗'} ${sec.name} — ${sec.score}/100`, margin, y);
      y += 4.5;
      sec.findings.slice(0, 2).forEach((f: string) => {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.setFontSize(8);
        const fl = doc.splitTextToSize('  ' + f, contentWidth - 4);
        doc.text(fl, margin + 2, y); y += fl.length * 3.8;
      });
    });
    y += 4;
  }  // ── POTENTIAL FAULT AREAS ─────────────────────────────────────────────────────
  if (diagnostics && diagnostics.issues.length > 0) {
    checkBreak(40);
    addText('POTENTIAL FAULT AREAS', 13, 'bold', [30, 58, 138]);
    addText('NOTE: These are data-driven indicators only. A CEL or confirmed fault code may not be present.', 8, 'normal', [120, 80, 20]);
    y += 2;
    diagnostics.issues.forEach(issue => {
      checkBreak(28);
      const sevColor: [number, number, number] = issue.severity === 'critical' ? [220, 38, 38] : [202, 138, 4];
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...sevColor);
      doc.text(`${issue.title}`, margin, y); y += 5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      const descLines = doc.splitTextToSize(issue.description, contentWidth);
      doc.text(descLines, margin, y); y += descLines.length * 4 + 1;
      doc.setTextColor(30, 100, 30);
      const recLines = doc.splitTextToSize('→ ' + issue.recommendation, contentWidth);
      doc.text(recLines, margin, y); y += recLines.length * 4 + 4;
    });
    y += 4;
  } else {
    checkBreak(16);
    addText('POTENTIAL FAULT AREAS', 13, 'bold', [30, 58, 138]);
    addText('\u2713 No potential fault areas detected in this datalog.', 10, 'normal', [22, 163, 74]);
    y += 4;
  }

  // ===== DYNO CHART =====
doc.addPage();
  y = margin + 5;
  addText('DYNO RESULTS — HP & TORQUE', 13, 'bold', [30, 58, 138]);
  await addImg(refs.dynoRef.current, '', true);

  // ── AIRFLOW OUTLOOK TABLE ──────────────────────────────────────────────────
  if (refs.boostEffRef?.current) {
    checkBreak(10);
    addText('AIRFLOW OUTLOOK — Boost, VGT Vane Position & MAF by RPM', 13, 'bold', [107, 70, 193]);
    await addImg(refs.boostEffRef.current, '', true);
  }

  // ── FAULT ZONE CHARTS ──────────────────────────────────────────────────────
  if (diagnostics && diagnostics.issues.length > 0) {
    const faultRefs: Array<[React.RefObject<HTMLDivElement | null>, string]> = [
      [refs.railFaultRef, 'Rail Pressure — Potential Fault Area'],
      [refs.boostFaultRef, 'Boost Pressure — Potential Fault Area'],
      [refs.egtFaultRef, 'Exhaust Gas Temperature — Potential Fault Area'],
      [refs.mafFaultRef, 'Mass Airflow — Potential Fault Area'],
      [refs.tccFaultRef, 'Torque Converter Clutch — Potential Fault Area'],
      [refs.vgtFaultRef, 'VGT Turbo Vane Tracking — Potential Fault Area'],
      [refs.regulatorFaultRef, 'Fuel Pressure Regulator — Potential Fault Area'],
      [refs.coolantFaultRef, 'Coolant Temperature — Potential Fault Area'],
      [refs.idleRpmFaultRef, 'Idle RPM — Potential Fault Area'],
      [refs.converterStallRef, 'Converter Stall / Turbo Spool — Potential Fault Area'],
    ];
    for (const [ref, label] of faultRefs) {
      if (ref.current) {
        checkBreak(10);
        await addImg(ref.current, label, true);
      }
    }
  }

  // ── PAGE NUMBERS + PPEI WATERMARK ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer bar
    doc.setFillColor(13, 15, 20);
    doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');

    // V-OP BETA watermark — left footer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`V-OP BETA ${APP_VERSION}`, margin, pageHeight - 6);

    // Page number — center
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

    // Date — right
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 6, { align: 'right' });

    // Subtle diagonal watermark on every page (except cover)
    if (i > 1) {
      doc.saveGraphicsState();
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(48);
      doc.setFont('helvetica', 'bold');
      // @ts-ignore — jsPDF supports opacity via GState
      doc.setGState(new (doc as any).GState({ opacity: 0.035 }));
      doc.text(`V-OP BETA ${APP_VERSION}`, pageWidth / 2, pageHeight / 2, {
        align: 'center',
        angle: 45,
      });
      doc.restoreGraphicsState();
    }

    // Beta disclaimer on last page
    if (i === pageCount) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(130, 130, 130);
      const disclaimer = 'DISCLAIMER: This report was generated by V-OP BETA, an AI-powered analysis tool by PPEI Custom Tuning. All data, scores, and recommendations are provided for informational purposes only and should not be considered a definitive mechanical diagnosis. V-OP is in active beta development — results may contain inaccuracies. For serious concerns, contact PPEI directly at ppei.com. Use at your own discretion.';
      const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
      doc.text(disclaimerLines, margin, pageHeight - 20);
    }
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`PPEI_Report_${APP_VERSION}_${timestamp}.pdf`);
}
// cache bust Wed Mar 25 16:19:48 EDT 2026
