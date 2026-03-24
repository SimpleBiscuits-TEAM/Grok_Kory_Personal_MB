import { useRef, useState } from 'react';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { generatePerformanceReport, renderChartToImage } from '@/lib/pdfExport';

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rpmVsMafRef = useRef<HTMLDivElement>(null);
  const hpVsRpmRef = useRef<HTMLDivElement>(null);
  const timeSeriesRef = useRef<HTMLDivElement>(null);

  const exportToPdf = async (
    data: ProcessedMetrics,
    fileName: string
  ): Promise<void> => {
    setIsExporting(true);
    setExportError(null);

    try {
      // Render charts to images
      const chartImages: {
        rpmVsMaf?: string;
        hpVsRpm?: string;
        timeSeries?: string;
      } = {};

      if (rpmVsMafRef.current) {
        try {
          chartImages.rpmVsMaf = await renderChartToImage(rpmVsMafRef.current);
        } catch (e) {
          console.warn('Failed to render RPM vs MAF chart:', e);
        }
      }

      if (hpVsRpmRef.current) {
        try {
          chartImages.hpVsRpm = await renderChartToImage(hpVsRpmRef.current);
        } catch (e) {
          console.warn('Failed to render HP vs RPM chart:', e);
        }
      }

      if (timeSeriesRef.current) {
        try {
          chartImages.timeSeries = await renderChartToImage(timeSeriesRef.current);
        } catch (e) {
          console.warn('Failed to render time series chart:', e);
        }
      }

      // Generate PDF
      await generatePerformanceReport(data, fileName, chartImages);
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
    rpmVsMafRef,
    hpVsRpmRef,
    timeSeriesRef,
  };
}
