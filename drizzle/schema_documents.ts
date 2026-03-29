import { mysqlTable, int, varchar, text, timestamp, mysqlEnum, json, decimal, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./schema";

/**
 * Reference Documents Storage
 * Stores PDFs, function sheets, patents, and other technical documentation
 * for reverse engineering and A2L generation
 */
export const referenceDocuments = mysqlTable(
  "reference_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileType: mysqlEnum("fileType", ["pdf", "txt", "doc", "patent", "video_transcript"]).notNull(),
    ecuFamily: varchar("ecuFamily", { length: 64 }).notNull(), // e.g., "MG1C", "E41", "T93", "BRP"
    documentType: mysqlEnum("documentType", [
      "function_sheet",
      "patent",
      "reverse_engineering_guide",
      "calibration_reference",
      "technical_specification",
      "other"
    ]).notNull(),
    title: varchar("title", { length: 255 }),
    description: text("description"),
    storageUrl: text("storageUrl").notNull(), // S3 URL
    storageKey: varchar("storageKey", { length: 512 }).notNull(), // S3 key for retrieval
    fileSize: int("fileSize"), // bytes
    extractedText: text("extractedText"), // OCR/PDF text extraction for indexing
    metadata: json("metadata").$type<{
      author?: string;
      publishDate?: string;
      version?: string;
      keywords?: string[];
      relatedMaps?: string[];
    }>(),
    uploadedBy: int("uploadedBy").notNull().references(() => users.id),
    uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ecuFamilyIdx: index("idx_ecu_family").on(table.ecuFamily),
    documentTypeIdx: index("idx_document_type").on(table.documentType),
    uploadedByIdx: index("idx_uploaded_by").on(table.uploadedBy),
  })
);

export type ReferenceDocument = typeof referenceDocuments.$inferSelect;
export type InsertReferenceDocument = typeof referenceDocuments.$inferInsert;

/**
 * A2L Library Storage
 * Stores parsed and raw A2L definitions for cross-referencing during reverse engineering
 */
export const a2lLibrary = mysqlTable(
  "a2l_library",
  {
    id: int("id").autoincrement().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    ecuFamily: varchar("ecuFamily", { length: 64 }).notNull(),
    version: varchar("version", { length: 64 }),
    mapCount: int("mapCount"),
    measurementCount: int("measurementCount"),
    storageUrl: text("storageUrl").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    rawContent: text("rawContent"), // Full A2L text (can be large)
    parsedMaps: json("parsedMaps").$type<Array<{
      name: string;
      address: number;
      size: number;
      dataType: string;
      description?: string;
      category?: string;
    }>>(),
    uploadedBy: int("uploadedBy").notNull().references(() => users.id),
    uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ecuFamilyIdx: index("idx_a2l_ecu_family").on(table.ecuFamily),
    uploadedByIdx: index("idx_a2l_uploaded_by").on(table.uploadedBy),
  })
);

export type A2LLibrary = typeof a2lLibrary.$inferSelect;
export type InsertA2LLibrary = typeof a2lLibrary.$inferInsert;

/**
 * Binary Signatures
 * Stores ECU family detection patterns (magic bytes, signatures, offsets)
 * Used for auto-detecting unknown binary files
 */
export const binarySignatures = mysqlTable(
  "binary_signatures",
  {
    id: int("id").autoincrement().primaryKey(),
    ecuFamily: varchar("ecuFamily", { length: 64 }).notNull(),
    signatureName: varchar("signatureName", { length: 255 }).notNull(), // e.g., "MG1C_DEADBEEF"
    magicBytes: varchar("magicBytes", { length: 32 }), // e.g., "DEADBEEF"
    patternOffset: int("patternOffset"), // Byte offset where pattern appears
    patternHex: varchar("patternHex", { length: 512 }).notNull(), // Hex pattern to match
    patternMask: varchar("patternMask", { length: 512 }), // Optional mask for fuzzy matching
    confidenceScore: decimal("confidenceScore", { precision: 3, scale: 2 }), // 0.00-1.00
    description: text("description"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    ecuFamilyIdx: index("idx_sig_ecu_family").on(table.ecuFamily),
  })
);

export type BinarySignature = typeof binarySignatures.$inferSelect;
export type InsertBinarySignature = typeof binarySignatures.$inferInsert;

/**
 * Calibration Maps
 * Extracted from A2Ls and reference documents
 * Used for pattern matching and A2L generation
 */
export const calibrationMaps = mysqlTable(
  "calibration_maps",
  {
    id: int("id").autoincrement().primaryKey(),
    mapName: varchar("mapName", { length: 255 }).notNull(),
    ecuFamily: varchar("ecuFamily", { length: 64 }).notNull(),
    address: int("address").notNull(), // Memory address in ECU
    size: int("size").notNull(), // Map size in bytes
    dataType: varchar("dataType", { length: 64 }).notNull(), // e.g., "int16", "float32", "uint8"
    dimensions: varchar("dimensions", { length: 64 }), // e.g., "1D", "2D", "3D"
    description: text("description"),
    category: varchar("category", { length: 128 }), // e.g., "fuel_injection", "boost_control"
    sourceType: mysqlEnum("sourceType", ["a2l", "document", "reverse_engineered"]).notNull(),
    sourceDocumentId: int("sourceDocumentId").references(() => referenceDocuments.id),
    sourceA2LId: int("sourceA2LId").references(() => a2lLibrary.id),
    xAxisName: varchar("xAxisName", { length: 255 }), // For 2D/3D maps
    yAxisName: varchar("yAxisName", { length: 255 }),
    zAxisName: varchar("zAxisName", { length: 255 }),
    metadata: json("metadata").$type<{
      units?: string;
      minValue?: number;
      maxValue?: number;
      scalingFactor?: number;
      offset?: number;
      relatedMaps?: string[];
    }>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    ecuFamilyIdx: index("idx_cal_ecu_family").on(table.ecuFamily),
    mapNameIdx: index("idx_map_name").on(table.mapName),
    addressIdx: index("idx_address").on(table.address),
  })
);

export type CalibrationMap = typeof calibrationMaps.$inferSelect;
export type InsertCalibrationMap = typeof calibrationMaps.$inferInsert;

/**
 * Document Knowledge Index
 * Extracted knowledge chunks from documents for semantic search and Knox's learning
 */
export const documentKnowledgeIndex = mysqlTable(
  "document_knowledge_index",
  {
    id: int("id").autoincrement().primaryKey(),
    documentId: int("documentId").notNull().references(() => referenceDocuments.id),
    keyword: varchar("keyword", { length: 255 }).notNull(),
    contentExcerpt: text("contentExcerpt").notNull(), // Relevant text chunk
    relevanceScore: decimal("relevanceScore", { precision: 3, scale: 2 }), // 0.00-1.00
    chunkIndex: int("chunkIndex"), // Position in document
    mapReferences: json("mapReferences").$type<string[]>(), // Referenced calibration maps
    functionReferences: json("functionReferences").$type<string[]>(), // Referenced functions
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    documentIdIdx: index("idx_doc_knowledge_doc_id").on(table.documentId),
    keywordIdx: index("idx_knowledge_keyword").on(table.keyword),
  })
);

export type DocumentKnowledgeIndex = typeof documentKnowledgeIndex.$inferSelect;
export type InsertDocumentKnowledgeIndex = typeof documentKnowledgeIndex.$inferInsert;

/**
 * Binary Analysis Results
 * Stores results from reverse engineering analysis of unknown binaries
 */
export const binaryAnalysisResults = mysqlTable(
  "binary_analysis_results",
  {
    id: int("id").autoincrement().primaryKey(),
    binaryFileName: varchar("binaryFileName", { length: 255 }).notNull(),
    binaryHash: varchar("binaryHash", { length: 64 }).notNull(), // SHA256 of binary
    detectedEcuFamily: varchar("detectedEcuFamily", { length: 64 }),
    detectionConfidence: decimal("detectionConfidence", { precision: 3, scale: 2 }), // 0.00-1.00
    binarySize: int("binarySize"),
    analysisStatus: mysqlEnum("analysisStatus", ["pending", "in_progress", "completed", "failed"]).notNull(),
    discoveredMaps: json("discoveredMaps").$type<Array<{
      address: number;
      size: number;
      confidence: number;
      suggestedName?: string;
    }>>(),
    suggestedA2LStructure: text("suggestedA2LStructure"), // Generated A2L content
    analysisNotes: text("analysisNotes"),
    analyzedBy: int("analyzedBy").references(() => users.id),
    analyzedAt: timestamp("analyzedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    binaryHashIdx: index("idx_binary_hash").on(table.binaryHash),
    ecuFamilyIdx: index("idx_analysis_ecu_family").on(table.detectedEcuFamily),
  })
);

export type BinaryAnalysisResult = typeof binaryAnalysisResults.$inferSelect;
export type InsertBinaryAnalysisResult = typeof binaryAnalysisResults.$inferInsert;

/**
 * Relations
 */
export const referenceDocumentsRelations = relations(referenceDocuments, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [referenceDocuments.uploadedBy],
    references: [users.id],
  }),
  knowledgeIndex: many(documentKnowledgeIndex),
  calibrationMaps: many(calibrationMaps),
}));

export const a2lLibraryRelations = relations(a2lLibrary, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [a2lLibrary.uploadedBy],
    references: [users.id],
  }),
  calibrationMaps: many(calibrationMaps),
}));

export const calibrationMapsRelations = relations(calibrationMaps, ({ one }) => ({
  sourceDocument: one(referenceDocuments, {
    fields: [calibrationMaps.sourceDocumentId],
    references: [referenceDocuments.id],
  }),
  sourceA2L: one(a2lLibrary, {
    fields: [calibrationMaps.sourceA2LId],
    references: [a2lLibrary.id],
  }),
}));

export const documentKnowledgeIndexRelations = relations(documentKnowledgeIndex, ({ one }) => ({
  document: one(referenceDocuments, {
    fields: [documentKnowledgeIndex.documentId],
    references: [referenceDocuments.id],
  }),
}));

export const binaryAnalysisResultsRelations = relations(binaryAnalysisResults, ({ one }) => ({
  analyzedByUser: one(users, {
    fields: [binaryAnalysisResults.analyzedBy],
    references: [users.id],
  }),
}));
