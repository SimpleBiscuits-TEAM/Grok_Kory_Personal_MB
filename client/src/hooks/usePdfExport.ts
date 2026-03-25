import { useState } from 'react';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { DiagnosticReport } from '@/lib/diagnostics';
import { HealthReportData } from '@/lib/healthReport';
import { generatePerformanceReport } from '@/lib/pdfExport';

export interface PdfExportRefs {
  dynoRef: React.RefObject<HTMLDivElement | null>;
  boostEffRef: React.RefObject<HTMLDivElement | null>;
  railFaultRef: React.RefObject<HTMLDivElement | null>;
  boostFaultRef: React.RefObject<HTMLDivElement | null>;
  egtFaultRef: React.RefObject<HTMLDivElement | null>;
  mafFaultRef: React.RefObject<HTMLDivElement | null>;
  tccFaultRef: React.RefObject<HTMLDivElement | null>;
  vgtFaultRef: React.RefObject<HTMLDivElement | null>;
  regulatorFaultRef: React.RefObject<HTMLDivElement | null>;
  coolantFaultRef: React.RefObject<HTMLDivElement | null>;
  statsRef: React.RefObject<HTMLDivElement | null>;
  healthRef: React.RefObject<HTMLDivElement | null>;
}

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportToPdf = async (
    data: ProcessedMetrics,
    fileName: string,
    diagnostics: DiagnosticReport | null,
    healthReport: HealthReportData | null,
    refs: PdfExportRefs
  ): Promise<void> => {
    setIsExporting(true);
    setExportError(null);

    try {
      await generatePerformanceReport(data, fileName, diagnostics, healthReport, refs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setExportError(errorMessage);
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportToPdf,
    isExporting,
    exportError,
  };
}
