import { mysqlTable, varchar, text, int, decimal, timestamp, index, primaryKey } from 'drizzle-orm/mysql-core';

/**
 * Calibration Definition Tables
 * Stores ECU calibration definitions extracted from a2l files
 * Maps calibration tables to binary file offsets
 */

// ECU Models and their calibration definitions
export const ecuModels = mysqlTable(
  'ecu_models',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    manufacturer: varchar('manufacturer', { length: 100 }).notNull(), // e.g., "Bosch"
    family: varchar('family', { length: 100 }).notNull(), // e.g., "MG1"
    variant: varchar('variant', { length: 100 }).notNull(), // e.g., "MG1C400A1T2"
    baseAddress: varchar('base_address', { length: 20 }).notNull(), // e.g., "0x08FC0000"
    baseAddressInt: int('base_address_int').notNull(),
    binarySize: int('binary_size').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    familyIdx: index('idx_family').on(table.family),
    variantIdx: index('idx_variant').on(table.variant),
  })
);

// Calibration characteristics (tables, maps, curves, etc.)
export const calibrationCharacteristics = mysqlTable(
  'calibration_characteristics',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    ecuModelId: varchar('ecu_model_id', { length: 50 })
      .notNull()
      .references(() => ecuModels.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    ecuAddress: varchar('ecu_address', { length: 20 }).notNull(), // e.g., "0x938B742"
    ecuAddressInt: int('ecu_address_int').notNull(),
    binOffset: varchar('bin_offset', { length: 20 }).notNull(), // e.g., "0x003CB742"
    binOffsetInt: int('bin_offset_int').notNull(),
    dataType: varchar('data_type', { length: 50 }).notNull(), // uint8, uint16, uint32, int8, int16, int32, float, etc.
    size: int('size'), // Size in bytes if known
    category: varchar('category', { length: 100 }), // e.g., "FUEL", "BOOST", "TIMING", "MAP", "CAN"
    subcategory: varchar('subcategory', { length: 100 }),
    minValue: decimal('min_value', { precision: 20, scale: 6 }),
    maxValue: decimal('max_value', { precision: 20, scale: 6 }),
    unit: varchar('unit', { length: 50 }),
    scale: decimal('scale', { precision: 10, scale: 6 }),
    offset: decimal('offset', { precision: 10, scale: 6 }),
    isTable: int('is_table').default(0), // 1 if this is a lookup table/map
    tableRows: int('table_rows'),
    tableCols: int('table_cols'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    ecuModelIdx: index('idx_ecu_model').on(table.ecuModelId),
    nameIdx: index('idx_name').on(table.name),
    categoryIdx: index('idx_category').on(table.category),
    binOffsetIdx: index('idx_bin_offset').on(table.binOffsetInt),
  })
);

// A2L file definitions (source files)
export const a2lDefinitions = mysqlTable(
  'a2l_definitions',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    ecuModelId: varchar('ecu_model_id', { length: 50 })
      .notNull()
      .references(() => ecuModels.id),
    filename: varchar('filename', { length: 255 }).notNull(),
    version: varchar('version', { length: 100 }),
    projectNo: varchar('project_no', { length: 100 }),
    content: text('content'), // Store a2l file content for reference
    characteristicCount: int('characteristic_count'),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    ecuModelIdx: index('idx_ecu_model').on(table.ecuModelId),
    filenameIdx: index('idx_filename').on(table.filename),
  })
);

// Binary file analysis results
export const binaryAnalysis = mysqlTable(
  'binary_analysis',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    ecuModelId: varchar('ecu_model_id', { length: 50 }).references(() => ecuModels.id),
    filename: varchar('filename', { length: 255 }).notNull(),
    fileSize: int('file_size').notNull(),
    fileHash: varchar('file_hash', { length: 64 }), // SHA256 hash
    uploadedAt: timestamp('uploaded_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    ecuModelIdx: index('idx_ecu_model').on(table.ecuModelId),
    filenameIdx: index('idx_filename').on(table.filename),
    hashIdx: index('idx_hash').on(table.fileHash),
  })
);

// Calibration table values extracted from binary files
export const calibrationValues = mysqlTable(
  'calibration_values',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    binaryAnalysisId: varchar('binary_analysis_id', { length: 50 })
      .notNull()
      .references(() => binaryAnalysis.id),
    characteristicId: varchar('characteristic_id', { length: 100 })
      .notNull()
      .references(() => calibrationCharacteristics.id),
    rawValue: text('raw_value'), // Hex representation of raw bytes
    interpretedValue: decimal('interpreted_value', { precision: 20, scale: 6 }), // Scaled/interpreted value
    unit: varchar('unit', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    binaryAnalysisIdx: index('idx_binary_analysis').on(table.binaryAnalysisId),
    characteristicIdx: index('idx_characteristic').on(table.characteristicId),
  })
);

// Export types
export type EcuModel = typeof ecuModels.$inferSelect;
export type NewEcuModel = typeof ecuModels.$inferInsert;

export type CalibrationCharacteristic = typeof calibrationCharacteristics.$inferSelect;
export type NewCalibrationCharacteristic = typeof calibrationCharacteristics.$inferInsert;

export type A2lDefinition = typeof a2lDefinitions.$inferSelect;
export type NewA2lDefinition = typeof a2lDefinitions.$inferInsert;

export type BinaryAnalysis = typeof binaryAnalysis.$inferSelect;
export type NewBinaryAnalysis = typeof binaryAnalysis.$inferInsert;

export type CalibrationValue = typeof calibrationValues.$inferSelect;
export type NewCalibrationValue = typeof calibrationValues.$inferInsert;
