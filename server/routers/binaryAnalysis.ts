/**
 * Binary Analysis Router
 * tRPC endpoints for analyzing unknown ECU binaries and detecting ECU families
 */

import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { detectECUFamily, getAvailableFamilies, analyzeBinary } from '../lib/binarySignatureDetector';
import { discoverMapsInBinary, generateA2L, validateA2L, type DiscoveredMap } from '../lib/a2lGenerator';

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
   * Discover calibration maps in a binary file
   */
  discoverMaps: protectedProcedure
    .input(
      z.object({
        binaryData: z.string().describe('Base64-encoded binary file content'),
        fileName: z.string(),
        ecuFamily: z.string().describe('ECU family to use for discovery heuristics'),
        minMapSize: z.number().min(2).max(256).default(8),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const binaryBuffer = Buffer.from(input.binaryData, 'base64');

        if (binaryBuffer.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Binary file is empty' });
        }
        if (binaryBuffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Binary file exceeds 10MB limit' });
        }

        const maps = discoverMapsInBinary(binaryBuffer, input.ecuFamily, {
          minMapSize: input.minMapSize,
        });

        const validation = validateA2L(maps);

        return {
          success: true,
          maps,
          mapCount: maps.length,
          validation,
          message: `Discovered ${maps.length} potential calibration maps`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Map discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Generate A2L definition file from discovered maps
   */
  generateA2L: protectedProcedure
    .input(
      z.object({
        maps: z.array(
          z.object({
            name: z.string(),
            address: z.number(),
            size: z.number(),
            dataType: z.string(),
            dimensions: z.enum(['1D', '2D', '3D']),
            xAxisSize: z.number().optional(),
            yAxisSize: z.number().optional(),
            description: z.string().optional(),
            category: z.string().optional(),
            units: z.string().optional(),
            minValue: z.number().optional(),
            maxValue: z.number().optional(),
            confidence: z.number(),
          })
        ),
        projectName: z.string(),
        ecuFamily: z.string(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const a2lContent = generateA2L(input.maps as DiscoveredMap[], {
          projectName: input.projectName,
          ecuFamily: input.ecuFamily,
          version: input.version,
        });

        const validation = validateA2L(input.maps as DiscoveredMap[]);

        return {
          success: true,
          a2lContent,
          validation,
          stats: {
            characteristicCount: input.maps.length,
            fileSize: a2lContent.length,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `A2L generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Full reverse engineering pipeline: detect -> discover -> generate -> validate
   */
  reverseEngineer: protectedProcedure
    .input(
      z.object({
        binaryData: z.string().describe('Base64-encoded binary file content'),
        fileName: z.string(),
        ecuName: z.string().optional(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const binaryBuffer = Buffer.from(input.binaryData, 'base64');

        if (binaryBuffer.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Binary file is empty' });
        }
        if (binaryBuffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Binary file exceeds 10MB limit' });
        }

        // Step 1: Detect ECU family
        const detection = detectECUFamily(binaryBuffer, input.fileName);
        const ecuFamily = detection?.family || input.ecuName || 'UNKNOWN';
        const detectionConfidence = detection?.confidence || 0;

        // Step 2: Full binary analysis
        const analysis = analyzeBinary(binaryBuffer, input.fileName);

        // Step 3: Discover calibration maps
        const maps = discoverMapsInBinary(binaryBuffer, ecuFamily);

        // Step 4: Generate A2L
        const projectName = input.ecuName || ecuFamily;
        const a2lContent = generateA2L(maps, {
          projectName,
          ecuFamily,
          version: input.version || '1.0.0',
        });

        // Step 5: Validate
        const validation = validateA2L(maps);

        return {
          success: true,
          detection: {
            family: ecuFamily,
            confidence: detectionConfidence,
            analysis,
          },
          discovery: {
            mapCount: maps.length,
            maps: maps.slice(0, 100), // Limit to first 100 for response size
            totalMaps: maps.length,
          },
          a2l: {
            content: a2lContent,
            fileSize: a2lContent.length,
          },
          validation,
          message: `Reverse engineered ${ecuFamily}: detected with ${(detectionConfidence * 100).toFixed(1)}% confidence, discovered ${maps.length} maps, generated ${a2lContent.length} byte A2L`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Reverse engineering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
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
