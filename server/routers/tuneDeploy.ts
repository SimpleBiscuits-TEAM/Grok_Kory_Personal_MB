/**
 * Tune Deploy — tRPC surface for library search, admin delete, and future vehicle auto-match.
 *
 * FUTURE: Vehicle auto-matching pipeline
 * 1. When a vehicle connects (PCAN / WiFi flasher), read current ECU OS + calibration IDs via UDS
 *    (reuse flash session + DID maps where available).
 * 2. Call `suggestMatches` with { ecuOs, calibrationPartNumbers, vin }.
 * 3. Extend `suggestTuneDeployMatches` with:
 *    - VIN decode → filter by modelYear range overlapping meta.modelYearStart/End
 *    - Weighted scoring (exact PN > OS prefix match > family match)
 *    - Optional: embeddings on compatibility labels for fuzzy search
 * 4. Present ranked list in Flash / Tune Deploy UI with one-tap "stage calibration".
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  tuneDeployListInputSchema,
  tuneDeployVehicleSnapshotSchema,
} from "../../shared/tuneDeploySchemas";
import {
  deleteTuneDeployCalibration,
  listTuneDeployCalibrations,
  suggestTuneDeployMatches,
} from "../tuneDeployDb";

export const tuneDeployRouter = router({
  list: protectedProcedure.input(tuneDeployListInputSchema).query(async ({ input }) => {
    return listTuneDeployCalibrations(input);
  }),

  /**
   * Ranked suggestions for a connected vehicle. Stub scoring lives in tuneDeployDb;
   * tighten queries when you have canonical OS/PN fields from the ECU readout.
   */
  suggestMatches: protectedProcedure
    .input(tuneDeployVehicleSnapshotSchema.extend({ limit: z.number().min(1).max(50).optional() }))
    .query(async ({ input }) => {
      const matches = await suggestTuneDeployMatches({
        ecuOs: input.ecuOs,
        calibrationPartNumbers: input.calibrationPartNumbers,
        limit: input.limit,
      });
      return { matches };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteTuneDeployCalibration(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete calibration" });
      }
      return { ok: true as const };
    }),
});
