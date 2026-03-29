import { mysqlTable, varchar, int, bigint, index, text, mysqlEnum } from "drizzle-orm/mysql-core";
import { users } from "./schema";

// ── Offset Profiles ──────────────────────────────────────────────────────────
// Stores binary offset correction profiles per ECU/vehicle type

export const offsetProfiles = mysqlTable("offset_profiles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  ecuId: varchar("ecuId", { length: 255 }).notNull(),
  vehicleType: varchar("vehicleType", { length: 255 }).notNull(),
  offsetDelta: int("offsetDelta").notNull(),
  confidence: int("confidence").notNull(), // 0-100
  tableSignaturesMatched: text("tableSignaturesMatched").notNull(), // JSON array
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  userIdx: index("idx_offset_user").on(table.userId),
  ecuIdx: index("idx_offset_ecu").on(table.ecuId),
  vehicleIdx: index("idx_offset_vehicle").on(table.vehicleType),
  userEcuVehicleIdx: index("idx_offset_user_ecu_vehicle").on(table.userId, table.ecuId, table.vehicleType),
}));

export type OffsetProfile = typeof offsetProfiles.$inferSelect;
export type InsertOffsetProfile = typeof offsetProfiles.$inferInsert;

// ── Offset Correction History ────────────────────────────────────────────────
// Audit trail of offset corrections applied

export const offsetCorrectionHistory = mysqlTable("offset_correction_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  ecuId: varchar("ecuId", { length: 255 }).notNull(),
  vehicleType: varchar("vehicleType", { length: 255 }).notNull(),
  offsetDelta: int("offsetDelta").notNull(),
  confidence: int("confidence").notNull(),
  status: mysqlEnum("status", ["applied", "failed", "manual"]).notNull(),
  notes: text("notes"),
  appliedAt: bigint("appliedAt", { mode: "number" }).notNull(),
}, (table) => ({
  userIdx: index("idx_history_user").on(table.userId),
  ecuIdx: index("idx_history_ecu").on(table.ecuId),
  statusIdx: index("idx_history_status").on(table.status),
  appliedAtIdx: index("idx_history_applied").on(table.appliedAt),
}));

export type OffsetCorrectionRecord = typeof offsetCorrectionHistory.$inferSelect;
export type InsertOffsetCorrectionRecord = typeof offsetCorrectionHistory.$inferInsert;
