import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ProcessedMetrics } from './dataProcessor';

/**
 * Generate a professional PDF report from performance data
 */
export async function generatePerformanceReport(
  data: ProcessedMetrics,
  fileName: string,
  chartImages: {
    rpmVsMaf?: string;
    hpVsRpm?: string;
    timeSeries?: string;
  }
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  let yPosition = margin;

  // Helper function to add text
  const addText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' = 'normal',
    color: [number, number, number] = [0, 0, 0]
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont('helvetica', weight);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, yPosition);
    yPosition += (lines.length * size) / 2.5 + 2;
  };

  // Helper function to add a page break
  const checkPageBreak = (spaceNeeded: number) => {
    if (yPosition + spaceNeeded > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
  };

  // Helper function to add an image
  const addImage = (imgData: string, width: number, height: number) => {
    checkPageBreak(height + 5);
    doc.addImage(imgData, 'PNG', margin, yPosition, width, height);
    yPosition += height + 5;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TITLE PAGE
  // ─────────────────────────────────────────────────────────────────────────
  doc.setFillColor(30, 58, 138); // Dark blue
  doc.rect(0, 0, pageWidth, 60, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Duramax Performance Analysis', margin, 25);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('OBD-II Log Report', margin, 35);

  yPosition = 70;

  // Report metadata
  addText(`File: ${fileName}`, 11, 'bold', [0, 0, 0]);
  addText(`Generated: ${new Date().toLocaleString()}`, 10, 'normal', [100, 100, 100]);
  addText(`Session Duration: ${(data.stats.duration / 60).toFixed(1)} minutes`, 10);

  yPosition += 10;

  // ─────────────────────────────────────────────────────────────────────────
  // EXECUTIVE SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(40);
  addText('Executive Summary', 16, 'bold', [30, 58, 138]);

  const summaryData = [
    ['Peak RPM', `${data.stats.rpmMax.toFixed(0)} rpm`],
    ['Peak MAF', `${data.stats.mafMax.toFixed(1)} lb/min`],
    ['Peak Horsepower', `${data.stats.hpTorqueMax.toFixed(0)} HP`],
    ['Peak Boost', `${data.stats.boostMax.toFixed(1)} psi`],
    ['Average RPM', `${data.stats.rpmMean.toFixed(0)} rpm`],
    ['Average MAF', `${data.stats.mafMean.toFixed(1)} lb/min`],
  ];

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  let tableY = yPosition;
  const colWidth = contentWidth / 2;

  for (let i = 0; i < summaryData.length; i += 2) {
    // Left column
    doc.setFont('helvetica', 'bold');
    doc.text(summaryData[i][0], margin, tableY);
    doc.setFont('helvetica', 'normal');
    doc.text(summaryData[i][1], margin + 50, tableY);

    // Right column
    if (i + 1 < summaryData.length) {
      doc.setFont('helvetica', 'bold');
      doc.text(summaryData[i + 1][0], margin + colWidth, tableY);
      doc.setFont('helvetica', 'normal');
      doc.text(summaryData[i + 1][1], margin + colWidth + 50, tableY);
    }

    tableY += 8;
  }

  yPosition = tableY + 10;

  // ─────────────────────────────────────────────────────────────────────────
  // CHARTS
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(100);
  addText('Performance Charts', 16, 'bold', [30, 58, 138]);

  // RPM vs MAF Chart
  if (chartImages.rpmVsMaf) {
    checkPageBreak(95);
    addText('RPM vs Mass Airflow (MAF)', 12, 'bold');
    try {
      addImage(chartImages.rpmVsMaf, contentWidth, 70);
    } catch (e) {
      addText('Chart image could not be rendered', 10, 'normal', [200, 0, 0]);
    }
  }

  // HP vs RPM Chart
  if (chartImages.hpVsRpm) {
    checkPageBreak(95);
    addText('Estimated Horsepower vs RPM', 12, 'bold');
    try {
      addImage(chartImages.hpVsRpm, contentWidth, 70);
    } catch (e) {
      addText('Chart image could not be rendered', 10, 'normal', [200, 0, 0]);
    }
  }

  // Time Series Chart
  if (chartImages.timeSeries) {
    checkPageBreak(95);
    addText('Time-Series Overview', 12, 'bold');
    try {
      addImage(chartImages.timeSeries, contentWidth, 70);
    } catch (e) {
      addText('Chart image could not be rendered', 10, 'normal', [200, 0, 0]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METHODOLOGY
  // ─────────────────────────────────────────────────────────────────────────
  checkPageBreak(60);
  addText('Analysis Methodology', 16, 'bold', [30, 58, 138]);

  addText('Horsepower Calculations:', 11, 'bold');
  yPosition += 2;

  addText(
    'Torque Method: HP = Torque(lb·ft) × RPM / 5252',
    10,
    'normal',
    [50, 50, 50]
  );
  addText(
    'This method uses the SAE J1979 actual engine torque percentage multiplied by the ECM reference torque value.',
    9,
    'normal',
    [80, 80, 80]
  );

  yPosition += 3;

  addText(
    'MAF Method: HP = MAF(lb/min) × 60 / (BSFC × AFR)',
    10,
    'normal',
    [50, 50, 50]
  );
  addText(
    'This method estimates horsepower from mass airflow using diesel-specific BSFC (0.35 lb/hp-hr) and AFR (19:1) constants.',
    9,
    'normal',
    [80, 80, 80]
  );

  yPosition += 5;

  addText('Data Processing:', 11, 'bold');
  yPosition += 2;

  const methodologyPoints = [
    'Raw OBD-II data parsed from CSV log file',
    'Torque values calculated as percentage of ECM reference torque',
    'Data downsampled for visualization performance',
    'Binned statistics computed for trend analysis',
    'All calculations performed client-side in the browser',
  ];

  methodologyPoints.forEach((point) => {
    addText(`• ${point}`, 9, 'normal', [80, 80, 80]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    doc.text(
      'Duramax Performance Analyzer',
      margin,
      pageHeight - 10
    );
  }

  // Save the PDF
  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`Duramax_Report_${timestamp}.pdf`);
}

/**
 * Convert a DOM element to a canvas image
 */
export async function elementToImage(element: HTMLElement): Promise<string> {
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error converting element to image:', error);
    throw error;
  }
}

/**
 * Render Recharts chart to image by creating a temporary SVG
 */
export async function renderChartToImage(
  chartElement: HTMLElement
): Promise<string> {
  return elementToImage(chartElement);
}
