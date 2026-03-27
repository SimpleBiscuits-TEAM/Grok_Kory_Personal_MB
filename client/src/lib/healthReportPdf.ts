/**
 * PPEI Vehicle Health Report PDF Generator
 * Author: Kory (Maybe?)
 *
 * Generates a standalone, customer-friendly PDF health report with personality.
 * Tone adjusts based on severity: light/funny for clean, more serious for critical.
 * Includes BETA AI disclaimer, dyno graph note, and recommendations.
 */

import jsPDF from 'jspdf';
import { HealthReportData } from './healthReport';
import { ProcessedMetrics } from './dataProcessor';

const PPEI_RED: [number, number, number] = [220, 38, 38];
const DARK_BG: [number, number, number] = [13, 15, 20];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [180, 180, 180];
const MED_GRAY: [number, number, number] = [120, 120, 120];
const TEXT_DARK: [number, number, number] = [40, 40, 40];
const TEXT_BODY: [number, number, number] = [60, 60, 60];
const GREEN: [number, number, number] = [22, 163, 74];
const AMBER: [number, number, number] = [202, 138, 4];
const BLUE: [number, number, number] = [30, 100, 200];

function getOverallMood(status: string): 'happy' | 'cautious' | 'concerned' | 'serious' {
  if (status === 'excellent') return 'happy';
  if (status === 'good') return 'cautious';
  if (status === 'fair') return 'concerned';
  return 'serious';
}

function getGreeting(mood: 'happy' | 'cautious' | 'concerned' | 'serious', vehicleName: string): string {
  switch (mood) {
    case 'happy':
      return `Great news! Your ${vehicleName} is running like a champ. Honestly, if trucks could smile, this one would be grinning ear to ear. Everything looks fantastic, and you should feel great about how you're taking care of this thing.`;
    case 'cautious':
      return `Good news overall for your ${vehicleName}! Things are looking solid, but we spotted a couple of areas worth keeping an eye on. Nothing to lose sleep over, but a little attention now saves a lot of headache later. Think of it like flossing... you know you should.`;
    case 'concerned':
      return `Your ${vehicleName} is hanging in there, but it's trying to tell you something. We found some areas that need attention before your next big tow or spirited drive. Don't panic, but don't ignore it either. Let's walk through what we found.`;
    case 'serious':
      return `We need to talk about your ${vehicleName}. The data is showing some areas that really need professional attention. We're not trying to scare you, but this is the kind of stuff you want to get ahead of before it gets ahead of you. Please read through the findings carefully.`;
  }
}

function getClosing(mood: 'happy' | 'cautious' | 'concerned' | 'serious'): string {
  switch (mood) {
    case 'happy':
      return `Keep doing what you're doing! Your truck is in great shape. If every customer took care of their vehicle like you do, mechanics would be out of a job. (Don't tell them we said that.)`;
    case 'cautious':
      return `Overall you're in good shape. Address the items we flagged when you get a chance, and you'll be back to a perfect score in no time. Your truck will thank you... probably with better MPG.`;
    case 'concerned':
      return `We know this report has a few more yellow flags than you'd like to see. The good news is that catching these things early is exactly what this tool is for. Get these items checked out and you'll be back to full confidence.`;
    case 'serious':
      return `We strongly recommend getting these items addressed before any heavy use. Contact PPEI directly if you need guidance on next steps. We're here to help, and your truck is counting on you.`;
  }
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'B+';
  if (score >= 70) return 'C+';
  if (score >= 60) return 'D';
  return 'F';
}

function getSectionComment(name: string, score: number): string {
  if (score >= 95) {
    const comments: Record<string, string> = {
      'Engine Health': 'Your engine is purring like a kitten. Well, a 6.6L diesel kitten. A very loud kitten.',
      'Fuel System': 'Rail pressure is dialed in tighter than a drum. The fuel system is doing exactly what it should.',
      'Transmission': 'Shifts are clean, converter is happy, and everything is playing nice together.',
      'Thermal Management': 'Temps are right where they should be. Your cooling system is doing its job beautifully.',
    };
    return comments[name] || 'Looking great across the board.';
  }
  if (score >= 80) {
    const comments: Record<string, string> = {
      'Engine Health': 'Engine is running well with minor notes. Nothing that should keep you up at night.',
      'Fuel System': 'Fuel system is mostly happy. A small deviation here and there, but nothing alarming.',
      'Transmission': 'Transmission is performing well. We noticed a couple of things worth monitoring.',
      'Thermal Management': 'Temps are generally good. Keep an eye on the items we flagged.',
    };
    return comments[name] || 'Performing well with minor items to watch.';
  }
  if (score >= 60) {
    const comments: Record<string, string> = {
      'Engine Health': 'The engine has some items that need attention. Not an emergency, but don\'t put it off too long.',
      'Fuel System': 'The fuel system is showing some stress. Worth investigating before your next long haul.',
      'Transmission': 'The transmission is showing some wear indicators. A fluid check and inspection would be smart.',
      'Thermal Management': 'We\'re seeing some temperature concerns. The cooling system may need a look.',
    };
    return comments[name] || 'Needs attention. Schedule a check-up.';
  }
  const comments: Record<string, string> = {
    'Engine Health': 'The engine needs professional attention. Please don\'t ignore this one.',
    'Fuel System': 'The fuel system is struggling. This should be a priority service item.',
    'Transmission': 'The transmission data is concerning. Get this inspected by a drivetrain specialist.',
    'Thermal Management': 'Temperature readings are outside safe ranges. This needs immediate attention.',
  };
  return comments[name] || 'Needs immediate professional attention.';
}

export function generateHealthReportPdf(
  healthReport: HealthReportData,
  data: ProcessedMetrics,
  fileName: string,
  hasDynoChart: boolean = false,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const vehicleName = healthReport.vehicleInfo
    ? `${healthReport.vehicleInfo.year} ${healthReport.vehicleInfo.make} ${healthReport.vehicleInfo.model}`
    : 'vehicle';

  const mood = getOverallMood(healthReport.overallStatus);

  // ── Helper functions ──────────────────────────────────────────────────────
  const addText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = TEXT_DARK,
    maxWidth: number = contentWidth,
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const style = weight === 'italic' ? 'italic' : weight;
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, margin, y);
    y += (lines.length * size) / 2.8 + 2;
  };

  const addWrappedText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = TEXT_BODY,
    lineSpacing: number = 1.5,
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const style = weight === 'italic' ? 'italic' : weight;
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkBreak(size / 2.8 + lineSpacing);
      doc.text(line, margin, y);
      y += size / 2.8 + lineSpacing;
    }
    y += 2;
  };

  const checkBreak = (space: number) => {
    if (y + space > pageHeight - 20) {
      doc.addPage();
      y = margin + 5;
    }
  };

  const drawHR = (color: [number, number, number] = [220, 220, 220]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const scoreColor = (score: number): [number, number, number] => {
    if (score >= 90) return GREEN;
    if (score >= 75) return BLUE;
    if (score >= 60) return AMBER;
    return PPEI_RED;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════

  // Dark header band
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, pageWidth, 70, 'F');

  // Red accent bar
  doc.setFillColor(...PPEI_RED);
  doc.rect(0, 70, pageWidth, 3, 'F');

  // PPEI branding
  doc.setTextColor(...WHITE);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('PPEI', margin, 24);

  // Vertical red divider
  doc.setDrawColor(...PPEI_RED);
  doc.setLineWidth(0.8);
  doc.line(margin + 26, 12, margin + 26, 64);

  // Title
  doc.setFontSize(20);
  doc.text('VEHICLE HEALTH REPORT', margin + 32, 24);

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT_GRAY);
  doc.text('Comprehensive AI-Powered Diagnostic Analysis', margin + 32, 33);

  // Vehicle name
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(vehicleName.toUpperCase(), margin + 32, 44);

  // File & date info
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MED_GRAY);
  doc.text(`Datalog: ${fileName}`, margin + 32, 53);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 32, 59);
  doc.text(`Author: Kory (Maybe?)`, margin + 32, 65);

  // BETA badge
  doc.setFillColor(...PPEI_RED);
  doc.roundedRect(pageWidth - margin - 36, 10, 36, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('PPEI AI BETA', pageWidth - margin - 18, 17.5, { align: 'center' });

  // Score circle area
  const scoreX = pageWidth - margin - 25;
  const scoreY = 48;
  doc.setFillColor(30, 30, 35);
  doc.circle(scoreX, scoreY, 16, 'F');
  doc.setDrawColor(...scoreColor(healthReport.overallScore));
  doc.setLineWidth(1.5);
  doc.circle(scoreX, scoreY, 16, 'S');
  doc.setTextColor(...scoreColor(healthReport.overallScore));
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(`${healthReport.overallScore}`, scoreX, scoreY + 3, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...LIGHT_GRAY);
  doc.text('/ 100', scoreX, scoreY + 9, { align: 'center' });

  y = 82;

  // ── GREETING / INTRO ──────────────────────────────────────────────────────
  addWrappedText(getGreeting(mood, vehicleName), 10, 'normal', TEXT_BODY, 1.8);
  y += 3;

  // ── OVERALL SCORE SUMMARY ─────────────────────────────────────────────────
  checkBreak(30);
  doc.setFillColor(245, 245, 248);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...scoreColor(healthReport.overallScore));
  doc.text(`Overall Health: ${healthReport.overallScore}/100  (${getScoreEmoji(healthReport.overallScore)})`, margin + 6, y + 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_BODY);
  doc.text(`Status: ${healthReport.overallStatus.toUpperCase()}`, margin + 6, y + 17);

  // Status bar
  const barY = y + 5;
  const barW = 50;
  const barX = pageWidth - margin - barW - 6;
  doc.setFillColor(230, 230, 230);
  doc.roundedRect(barX, barY, barW, 5, 1, 1, 'F');
  const fillW = (healthReport.overallScore / 100) * barW;
  doc.setFillColor(...scoreColor(healthReport.overallScore));
  doc.roundedRect(barX, barY, fillW, 5, 1, 1, 'F');

  y += 28;

  // ── VEHICLE INFO ──────────────────────────────────────────────────────────
  if (healthReport.vehicleInfo) {
    checkBreak(45);
    const vi = healthReport.vehicleInfo;
    addText('VEHICLE INFORMATION', 12, 'bold', BLUE);
    drawHR([200, 210, 230]);

    const infoRows = [
      ['Year / Make / Model', `${vi.year} ${vi.make} ${vi.model}`],
      ['Engine', vi.engine],
      ['Transmission', vi.transmission],
      ['VIN', vi.vin],
      ['Drive Type', vi.driveType],
      ['Factory HP / Torque', `${vi.factoryHp} HP / ${vi.factoryTorque} lb-ft`],
    ];

    infoRows.forEach(([label, val]) => {
      checkBreak(7);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_BODY);
      doc.text(`${label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT_DARK);
      doc.text(val || 'N/A', margin + 55, y);
      y += 6;
    });
    y += 4;
  }

  // ── SYSTEM-BY-SYSTEM BREAKDOWN ────────────────────────────────────────────
  const sections = [
    { name: 'Engine Health', score: healthReport.engineHealth.score, status: healthReport.engineHealth.status, findings: healthReport.engineHealth.findings },
    { name: 'Fuel System', score: healthReport.fuelSystem.score, status: healthReport.fuelSystem.status, findings: healthReport.fuelSystem.findings },
    { name: 'Transmission', score: healthReport.transmission.score, status: healthReport.transmission.status, findings: healthReport.transmission.findings },
    { name: 'Thermal Management', score: healthReport.thermalManagement.score, status: healthReport.thermalManagement.status, findings: healthReport.thermalManagement.findings },
  ];

  checkBreak(20);
  addText('SYSTEM-BY-SYSTEM BREAKDOWN', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);

  sections.forEach((sec) => {
    checkBreak(35);

    // Section header with score
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(margin, y - 1, contentWidth, 10, 1, 1, 'F');

    // Score indicator dot
    doc.setFillColor(...scoreColor(sec.score));
    doc.circle(margin + 4, y + 3.5, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(sec.name.toUpperCase(), margin + 10, y + 5.5);

    doc.setTextColor(...scoreColor(sec.score));
    doc.text(`${sec.score}/100`, pageWidth - margin - 20, y + 5.5);

    y += 13;

    // Friendly comment
    addWrappedText(getSectionComment(sec.name, sec.score), 9, 'italic', [100, 100, 110], 1.3);

    // Findings
    if (sec.findings.length > 0) {
      sec.findings.forEach((finding) => {
        checkBreak(10);
        const isGood = finding.includes('healthy') || finding.includes('normal') || finding.includes('excellent') || finding.includes('Normal');
        const isWarn = finding.includes('WARNING') || finding.includes('elevated') || finding.includes('CAUTION');
        const isBad = finding.includes('CRITICAL') || finding.includes('FAULT') || finding.includes('FAIL') || finding.includes('dangerously');

        const bulletColor: [number, number, number] = isBad ? PPEI_RED : isWarn ? AMBER : isGood ? GREEN : TEXT_BODY;
        const bullet = isBad ? '!' : isWarn ? '~' : '+';

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...bulletColor);
        doc.text(bullet, margin + 2, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_BODY);
        const lines = doc.splitTextToSize(finding, contentWidth - 10);
        doc.text(lines, margin + 8, y);
        y += lines.length * 3.8 + 1.5;
      });
    }

    y += 4;
  });

  // ── POTENTIAL FAULT AREA SUMMARY ──────────────────────────────────────────
  if (healthReport.diagnosticSummary.anyFaultDetected) {
    checkBreak(30);
    addText('POTENTIAL FAULT AREAS DETECTED', 12, 'bold', PPEI_RED);
    drawHR(PPEI_RED);

    addWrappedText(
      'The following conditions were flagged during analysis. Remember, these are data-driven indicators from your datalog, not confirmed fault codes. A Check Engine Light may or may not be present. Think of these as "hey, you might want to look at this" flags.',
      9, 'normal', TEXT_BODY, 1.5,
    );

    const faultStatuses = [
      { label: 'Rail Pressure (Low)', status: healthReport.diagnosticSummary.p0087Status },
      { label: 'Rail Pressure (High)', status: healthReport.diagnosticSummary.highRailStatus },
      { label: 'Boost Pressure', status: healthReport.diagnosticSummary.p0299Status },
      { label: 'Exhaust Gas Temp', status: healthReport.diagnosticSummary.egtStatus },
      { label: 'Mass Airflow (Idle)', status: healthReport.diagnosticSummary.p0101Status },
      { label: 'Converter Slip', status: healthReport.diagnosticSummary.converterSlipStatus },
    ];

    faultStatuses.forEach((f) => {
      if (f.status.includes('DETECTED') || f.status.includes('WARNING')) {
        checkBreak(8);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(f.status.includes('DETECTED') ? PPEI_RED : AMBER));
        doc.text(`  ${f.label}`, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_BODY);
        const statusText = f.status.replace(/^[^—]*— /, '');
        doc.text(statusText, margin + 50, y);
        y += 6;
      }
    });
    y += 4;
  } else {
    checkBreak(20);
    addText('POTENTIAL FAULT AREAS', 12, 'bold', GREEN);
    drawHR([180, 220, 180]);
    addWrappedText(
      'No potential fault areas were detected in this datalog. Your vehicle passed all diagnostic checks with flying colors. If your truck could high-five you right now, it would.',
      9, 'normal', TEXT_BODY, 1.5,
    );
    y += 2;
  }

  // ── DYNO GRAPH DISCLAIMER ─────────────────────────────────────────────────
  if (hasDynoChart && data.stats.hpTorqueMax > 0) {
    checkBreak(25);
    addText('A NOTE ABOUT THE DYNO GRAPH', 11, 'bold', BLUE);
    drawHR([200, 210, 230]);
    addWrappedText(
      'If you see HP and torque estimates in this report, please keep in mind that those numbers are calculated from the datalog and are heavily dependent on how the tuning is set up. They can often be inaccurate compared to an actual chassis dyno pull. That said, they are still a good reference for understanding what is going on with the vehicle under load. Use them as a trend indicator, not as gospel. If you want real numbers, strap it to a dyno!',
      9, 'normal', TEXT_BODY, 1.5,
    );
    y += 2;
  }

  // ── RECOMMENDATIONS ───────────────────────────────────────────────────────
  checkBreak(30);
  addText('RECOMMENDATIONS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);

  healthReport.recommendations.forEach((rec) => {
    checkBreak(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_BODY);
    const lines = doc.splitTextToSize(`>  ${rec}`, contentWidth - 6);
    doc.text(lines, margin + 2, y);
    y += lines.length * 3.8 + 2;
  });
  y += 4;

  // ── CLOSING MESSAGE ───────────────────────────────────────────────────────
  checkBreak(30);
  drawHR([200, 210, 230]);
  addWrappedText(getClosing(mood), 9.5, 'normal', TEXT_DARK, 1.6);
  y += 4;

  // ── BETA DISCLAIMER (with joke) ───────────────────────────────────────────
  checkBreak(45);
  doc.setFillColor(255, 248, 240);
  doc.setDrawColor(...PPEI_RED);
  doc.setLineWidth(0.5);
  const disclaimerH = 42;
  doc.roundedRect(margin, y, contentWidth, disclaimerH, 2, 2, 'FD');

  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PPEI_RED);
  doc.text('IMPORTANT: BETA AI MODEL DISCLAIMER', margin + 6, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_BODY);
  const disclaimerLines = doc.splitTextToSize(
    'This report was generated by the PPEI AI Beta engine. While we think it\'s pretty smart (it definitely thinks it\'s smarter than us), it\'s still learning. Please don\'t make major repair decisions based solely on this report without consulting PPEI directly or a qualified technician. We\'re training and improving this system rapidly, and every datalog you run helps make it better.',
    contentWidth - 12,
  );
  doc.text(disclaimerLines, margin + 6, y);
  y += disclaimerLines.length * 3.5 + 3;

  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 100, 60);
  const jokeLines = doc.splitTextToSize(
    '"I asked the AI if it was sure about its diagnosis. It said \'I\'m 97.3% confident, which is about 97.3% more confident than I should be.\' So yeah... maybe call PPEI too."  - Kory (Maybe?)',
    contentWidth - 12,
  );
  doc.text(jokeLines, margin + 6, y);
  y += jokeLines.length * 3.5 + 4;

  // ── CONTACT INFO ──────────────────────────────────────────────────────────
  checkBreak(20);
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, y, contentWidth, 14, 1, 1, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_DARK);
  doc.text('Questions? Contact PPEI directly:', margin + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLUE);
  doc.text('ppei.com  |  support@ppei.com  |  (936) 271-4234', margin + 4, y + 10.5);
  y += 18;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE NUMBERS + FOOTER
  // ══════════════════════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer bar
    doc.setFillColor(...DARK_BG);
    doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');

    // Author credit
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PPEI_RED);
    doc.text('PPEI AI BETA', margin, pageHeight - 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MED_GRAY);
    doc.text('Author: Kory (Maybe?)', margin, pageHeight - 4);

    // Page number
    doc.setTextColor(...LIGHT_GRAY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

    // Date
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 6, { align: 'right' });

    // Subtle watermark on non-cover pages
    if (i > 1) {
      doc.saveGraphicsState();
      doc.setTextColor(230, 230, 230);
      doc.setFontSize(38);
      doc.setFont('helvetica', 'bold');
      // @ts-ignore
      doc.setGState(new (doc as any).GState({ opacity: 0.035 }));
      doc.text('PPEI AI BETA', pageWidth / 2, pageHeight / 2, {
        align: 'center',
        angle: 45,
      });
      doc.restoreGraphicsState();
    }
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanName = vehicleName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`PPEI_Health_Report_${cleanName}_${timestamp}.pdf`);
}
