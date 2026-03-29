/**
 * Binary Analysis Router
 * tRPC endpoints for analyzing unknown ECU binaries and detecting ECU families
 */

import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { detectECUFamily, getAvailableFamilies, analyzeBinary } from '../lib/binarySignatureDetector';

export const binaryAnalysisRouter = router({
  /**
   * Analyze an uploaded binary file to detect ECU family
   * Returns detected family, confidence score, and detailed analysis
   */
  detectECUFamily: protectedProcedure
    .input(
      z.object({
        binaryData: z.string().describe('Base64-encoded binary file content'),
        fileName: z.string().describe('Original file name'),
        minConfidence: z.number().min(0).max(1).default(0.3).describe('Minimum confidence threshold'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Decode base64 to buffer
        const binaryBuffer = Buffer.from(input.binaryData, 'base64');

        if (binaryBuffer.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Binary file is empty',
          });
        }

        if (binaryBuffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Binary file exceeds 10MB limit',
          });
        }

        // Analyze the binary
        const result = detectECUFamily(binaryBuffer, input.fileName, input.minConfidence);

        if (!result) {
          return {
            success: false,
            detectedFamily: null,
            confidence: 0,
            message: `Could not detect ECU family with confidence >= ${input.minConfidence}`,
            analysis: analyzeBinary(binaryBuffer, input.fileName),
          };
        }

        return {
          success: true,
          detectedFamily: result.family,
          confidence: result.confidence,
          message: `Detected ${result.family} with ${(result.confidence * 100).toFixed(1)}% confidence`,
          analysis: result.details,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Binary analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Get list of all supported ECU families
   */
  getAvailableFamilies: publicProcedure.query(() => {
    return getAvailableFamilies();
  }),

  /**
   * Analyze binary and return detailed signature matches
   */
  analyzeBinaryDetailed: protectedProcedure
    .input(
      z.object({
        binaryData: z.string().describe('Base64-encoded binary file content'),
        fileName: z.string().describe('Original file name'),
      })
    )
    .query(async ({ input }) => {
      try {
        const binaryBuffer = Buffer.from(input.binaryData, 'base64');

        if (binaryBuffer.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Binary file is empty',
          });
        }

        const analysis = analyzeBinary(binaryBuffer, input.fileName);

        return {
          success: true,
          analysis,
          recommendations: generateRecommendations(analysis),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Detailed analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});

/**
 * Generate recommendations based on analysis results
 */
function generateRecommendations(analysis: ReturnType<typeof analyzeBinary>): string[] {
  const recommendations: string[] = [];

  if (!analysis.detectedFamily) {
    recommendations.push(
      'Could not identify ECU family. This may be an unsupported ECU or a corrupted binary file.'
    );
    recommendations.push('Try uploading the corresponding A2L file to help with identification.');
    return recommendations;
  }

  if (analysis.confidence < 0.5) {
    recommendations.push(
      `Low confidence match (${(analysis.confidence * 100).toFixed(1)}%). Consider uploading the A2L file for this ECU.`
    );
  }

  if (analysis.detectedFamily === 'MG1C' || analysis.detectedFamily === 'CANAM_MG1') {
    recommendations.push('This is a Bosch MG1C ECU (Motorola 68K architecture).');
    recommendations.push('Proceed to calibration map discovery phase.');
  }

  if (analysis.detectedFamily === 'ME17' || analysis.detectedFamily === 'MED17') {
    recommendations.push('This is a Bosch ME17/MED17 ECU.');
    recommendations.push('Calibration map discovery for this family is in development.');
  }

  return recommendations;
}
