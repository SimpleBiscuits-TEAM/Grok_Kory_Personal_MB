import { mysqlTable, varchar, text, int, timestamp, boolean, mysqlEnum, json, unique, index } from 'drizzle-orm/mysql-core';
import { users } from './schema';

// Projects table
export const projects = mysqlTable('projects', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  vehicleMake: varchar('vehicle_make', { length: 100 }),
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  vehicleYear: int('vehicle_year'),
  ecuFamily: varchar('ecu_family', { length: 100 }),
  ecuId: varchar('ecu_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  isArchived: boolean('is_archived').default(false),
}, (table) => ({
  userProjectsIdx: index('idx_user_projects').on(table.userId, table.createdAt),
  archivedIdx: index('idx_archived').on(table.isArchived),
}));

// Project Files
export const projectFiles = mysqlTable('project_files', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fileType: mysqlEnum('file_type', ['binary', 'a2l', 'csv', 'reference', 'comparison']).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: int('file_size'),
  fileHash: varchar('file_hash', { length: 64 }),
  s3Key: varchar('s3_key', { length: 500 }),
  s3Url: varchar('s3_url', { length: 500 }),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
}, (table) => ({
  projectFilesIdx: index('idx_project_files').on(table.projectId, table.fileType),
  fileHashUnique: unique('uk_file_hash').on(table.fileHash),
}));

// Project Versions
export const projectVersions = mysqlTable('project_versions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  versionNumber: int('version_number').notNull(),
  binaryHash: varchar('binary_hash', { length: 64 }),
  changesSummary: text('changes_summary'),
  mapsModified: json('maps_modified'),
  checksumsApplied: boolean('checksums_applied').default(false),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectVersionsIdx: index('idx_project_versions').on(table.projectId, table.versionNumber),
  projectVersionUnique: unique('uk_project_version').on(table.projectId, table.versionNumber),
}));

// Project Metadata
export const projectMetadata = mysqlTable('project_metadata', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id, { onDelete: 'cascade' }).unique(),
  currentBinaryHash: varchar('current_binary_hash', { length: 64 }),
  currentVersion: int('current_version'),
  totalMapsModified: int('total_maps_modified').default(0),
  lastEditedBy: varchar('last_edited_by', { length: 255 }),
  lastEditedAt: timestamp('last_edited_at'),
  checksumStatus: mysqlEnum('checksum_status', ['valid', 'invalid', 'unchecked']).default('unchecked'),
  tags: json('tags'),
  notes: text('notes'),
}, (table) => ({
  projectMetadataIdx: index('idx_project_metadata').on(table.projectId),
}));

// Tune Library
export const tuneLibrary = mysqlTable('tune_library', {
  id: varchar('id', { length: 36 }).primaryKey(),
  vehicleMake: varchar('vehicle_make', { length: 100 }).notNull(),
  vehicleModel: varchar('vehicle_model', { length: 100 }).notNull(),
  vehicleYear: int('vehicle_year'),
  ecuFamily: varchar('ecu_family', { length: 100 }).notNull(),
  ecuPartNumber: varchar('ecu_part_number', { length: 100 }).notNull(),
  osVersion: varchar('os_version', { length: 50 }).notNull(),
  hardwareRevision: varchar('hardware_revision', { length: 50 }),
  tuneName: varchar('tune_name', { length: 255 }).notNull(),
  tuneDescription: text('tune_description'),
  tuneVersion: varchar('tune_version', { length: 50 }),
  binaryHash: varchar('binary_hash', { length: 64 }).notNull().unique(),
  a2lHash: varchar('a2l_hash', { length: 64 }),
  s3BinaryKey: varchar('s3_binary_key', { length: 500 }).notNull(),
  s3A2lKey: varchar('s3_a2l_key', { length: 500 }),
  fileSize: int('file_size'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  isActive: boolean('is_active').default(true),
  createdBy: varchar('created_by', { length: 255 }),
}, (table) => ({
  tuneMatchIdx: index('idx_tune_match').on(table.vehicleMake, table.vehicleModel, table.ecuFamily, table.osVersion),
  ecuPartIdx: index('idx_ecu_part').on(table.ecuPartNumber, table.osVersion),
  activeIdx: index('idx_active').on(table.isActive),
}));

// Tune Deliveries
export const tuneDeliveries = mysqlTable('tune_deliveries', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tuneLibraryId: varchar('tune_library_id', { length: 36 }).notNull().references(() => tuneLibrary.id, { onDelete: 'cascade' }),
  hardwareId: varchar('hardware_id', { length: 255 }),
  vehicleVin: varchar('vehicle_vin', { length: 17 }),
  requestedAt: timestamp('requested_at').defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  deliveryStatus: mysqlEnum('delivery_status', ['pending', 'delivered', 'failed', 'rejected']).default('pending'),
  failureReason: text('failure_reason'),
  customerEmail: varchar('customer_email', { length: 255 }),
}, (table) => ({
  hardwareDeliveriesIdx: index('idx_hardware_deliveries').on(table.hardwareId, table.requestedAt),
  vinDeliveriesIdx: index('idx_vin_deliveries').on(table.vehicleVin),
  statusIdx: index('idx_delivery_status').on(table.deliveryStatus),
}));

// Hardware Devices
export const hardwareDevices = mysqlTable('hardware_devices', {
  id: varchar('id', { length: 36 }).primaryKey(),
  hardwareId: varchar('hardware_id', { length: 255 }).notNull().unique(),
  customerEmail: varchar('customer_email', { length: 255 }),
  customerName: varchar('customer_name', { length: 255 }),
  vehicleVin: varchar('vehicle_vin', { length: 17 }),
  vehicleMake: varchar('vehicle_make', { length: 100 }),
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  vehicleYear: int('vehicle_year'),
  registeredAt: timestamp('registered_at').defaultNow(),
  lastRequestAt: timestamp('last_request_at'),
  totalDeliveries: int('total_deliveries').default(0),
}, (table) => ({
  hardwareIdIdx: index('idx_hardware_id').on(table.hardwareId),
  customerEmailIdx: index('idx_customer_email').on(table.customerEmail),
}));

// Project Comparisons
export const projectComparisons = mysqlTable('project_comparisons', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stockBinaryHash: varchar('stock_binary_hash', { length: 64 }),
  tunedBinaryHash: varchar('tuned_binary_hash', { length: 64 }),
  differencesCount: int('differences_count'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectComparisonsIdx: index('idx_project_comparisons').on(table.projectId),
}));

// Tune Folders — hierarchical folder system for organizing tunes
// Auto-generated folders: Make > Model > Year > ECU Family
// Users can also create custom folders at any level
export const tuneFolders = mysqlTable('tune_folders', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: varchar('parent_id', { length: 36 }), // null = root folder
  name: varchar('name', { length: 255 }).notNull(),
  // Auto-organization metadata — populated when folder is auto-generated
  folderType: mysqlEnum('folder_type', ['root', 'make', 'model', 'year', 'ecu_family', 'ecu_variant', 'custom']).default('custom'),
  vehicleMake: varchar('vehicle_make', { length: 100 }),
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  vehicleYear: int('vehicle_year'),
  ecuFamily: varchar('ecu_family', { length: 100 }),
  ecuVariant: varchar('ecu_variant', { length: 100 }),
  // Dispatch metadata — used by auto-delivery system for matching
  osVersion: varchar('os_version', { length: 50 }),
  ecuPartNumber: varchar('ecu_part_number', { length: 100 }),
  hardwareRevision: varchar('hardware_revision', { length: 50 }),
  // Folder state
  sortOrder: int('sort_order').default(0),
  isAutoGenerated: boolean('is_auto_generated').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => ({
  userFoldersIdx: index('idx_user_folders').on(table.userId, table.parentId),
  folderTypeIdx: index('idx_folder_type').on(table.folderType),
  autoMatchIdx: index('idx_auto_match').on(table.vehicleMake, table.vehicleModel, table.ecuFamily),
}));

// Saved Tunes — individual tune files stored in folders
export const savedTunes = mysqlTable('saved_tunes', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: varchar('folder_id', { length: 36 }).references(() => tuneFolders.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // Vehicle / ECU metadata for auto-organization & dispatch matching
  vehicleMake: varchar('vehicle_make', { length: 100 }),
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  vehicleYear: int('vehicle_year'),
  ecuFamily: varchar('ecu_family', { length: 100 }),
  ecuId: varchar('ecu_id', { length: 100 }),
  osVersion: varchar('os_version', { length: 50 }),
  ecuPartNumber: varchar('ecu_part_number', { length: 100 }),
  // File references
  binaryHash: varchar('binary_hash', { length: 64 }),
  a2lHash: varchar('a2l_hash', { length: 64 }),
  s3BinaryKey: varchar('s3_binary_key', { length: 500 }),
  s3BinaryUrl: varchar('s3_binary_url', { length: 500 }),
  s3A2lKey: varchar('s3_a2l_key', { length: 500 }),
  s3A2lUrl: varchar('s3_a2l_url', { length: 500 }),
  fileSize: int('file_size'),
  // Tune metadata
  tuneStage: varchar('tune_stage', { length: 50 }), // e.g., "Stock", "Stage 1", "Stage 2", "Custom"
  powerLevel: varchar('power_level', { length: 100 }), // e.g., "+50hp", "600hp"
  fuelType: varchar('fuel_type', { length: 50 }), // e.g., "Diesel", "E85", "93 Octane"
  modifications: text('modifications'), // JSON array of mods
  checksumStatus: mysqlEnum('checksum_status', ['valid', 'invalid', 'unchecked']).default('unchecked'),
  // Dispatch readiness
  isDispatchReady: boolean('is_dispatch_ready').default(false),
  dispatchPriority: int('dispatch_priority').default(0), // Higher = preferred for auto-delivery
  // State
  tags: json('tags'),
  notes: text('notes'),
  isFavorite: boolean('is_favorite').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => ({
  userTunesIdx: index('idx_user_tunes').on(table.userId, table.folderId),
  dispatchMatchIdx: index('idx_dispatch_match').on(table.vehicleMake, table.vehicleModel, table.ecuFamily, table.osVersion, table.ecuPartNumber),
  favoriteIdx: index('idx_favorite').on(table.userId, table.isFavorite),
  dispatchReadyIdx: index('idx_dispatch_ready').on(table.isDispatchReady, table.dispatchPriority),
}));

// ── Geofence Zones ──────────────────────────────────────────────────────
// Super admin (Kory) can create global geofence zones
// Tuners can create their own geofence zones for their clients
export const geofenceZones = mysqlTable('geofence_zones', {
  id: varchar('id', { length: 36 }).primaryKey(),
  createdBy: int('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // Polygon coordinates stored as JSON array of {lat, lng} points
  polygonCoords: json('polygon_coords').notNull(), // [{lat: number, lng: number}, ...]
  // Scope: 'global' = super_admin zone, 'tuner' = tuner-created zone
  scope: mysqlEnum('scope', ['global', 'tuner']).default('tuner'),
  // What actions are restricted
  blockUpload: boolean('block_upload').default(true),
  blockDownload: boolean('block_download').default(true),
  // Restrict specific user (null = applies to all users in zone)
  restrictedUserId: int('restricted_user_id').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => ({
  createdByIdx: index('idx_geofence_created_by').on(table.createdBy),
  scopeIdx: index('idx_geofence_scope').on(table.scope, table.isActive),
}));

// ── User Map Layouts ────────────────────────────────────────────────────
// Users can build custom map layouts ("default map list") by selecting important maps
// Layouts are saved to database and can be loaded in the editor
export const userMapLayouts = mysqlTable('user_map_layouts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // ECU family this layout applies to (layouts are ECU-specific)
  ecuFamily: varchar('ecu_family', { length: 100 }),
  // Ordered list of map names/identifiers the user selected
  mapList: json('map_list').notNull(), // [{mapName: string, mapAddress: number, priority: number}, ...]
  isDefault: boolean('is_default').default(false), // User's default layout for this ECU
  sortOrder: int('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => ({
  userLayoutsIdx: index('idx_user_layouts').on(table.userId, table.ecuFamily),
  defaultIdx: index('idx_default_layout').on(table.userId, table.isDefault),
}));

// ── Tune Sharing ────────────────────────────────────────────────────────
// Tuners can share tune files with other tuners
// Owner controls access: view-only or full access
export const tuneShares = mysqlTable('tune_shares', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tuneId: varchar('tune_id', { length: 36 }).notNull().references(() => savedTunes.id, { onDelete: 'cascade' }),
  ownerId: int('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sharedWithId: int('shared_with_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Permission level
  permission: mysqlEnum('permission', ['view', 'download', 'edit']).default('view'),
  // Optional expiration
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  tuneShareIdx: index('idx_tune_share').on(table.tuneId, table.sharedWithId),
  ownerSharesIdx: index('idx_owner_shares').on(table.ownerId),
  sharedWithIdx: index('idx_shared_with').on(table.sharedWithId, table.isActive),
}));

// ── Admin Audit Log ─────────────────────────────────────────────────────
// Tracks all admin actions for accountability
export const adminAuditLog = mysqlTable('admin_audit_log', {
  id: varchar('id', { length: 36 }).primaryKey(),
  adminId: int('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(), // e.g., 'delete_user', 'create_geofence', 'override_geofence'
  targetType: varchar('target_type', { length: 50 }), // 'user', 'tune', 'geofence', etc.
  targetId: varchar('target_id', { length: 255 }),
  details: text('details'), // JSON with action-specific details
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  adminActionIdx: index('idx_admin_action').on(table.adminId, table.createdAt),
  targetIdx: index('idx_audit_target').on(table.targetType, table.targetId),
}));

// ── Knox Map Changes ───────────────────────────────────────────────────
// Tracks AI-suggested map changes with approval workflow
export const knoxMapChanges = mysqlTable('mara_map_changes', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: varchar('project_id', { length: 36 }).references(() => projects.id, { onDelete: 'set null' }),
  mapName: varchar('map_name', { length: 255 }).notNull(),
  mapAddress: int('map_address'),
  // Change details
  changeType: varchar('change_type', { length: 50 }).notNull(), // 'modify', 'smooth', 'scale', 'fill'
  changeDescription: text('change_description').notNull(),
  originalValues: json('original_values'), // Array of original cell values
  proposedValues: json('proposed_values'), // Array of proposed cell values
  cellRange: json('cell_range'), // {startRow, startCol, endRow, endCol}
  reasoning: text('reasoning'), // Knox's explanation for the change
  // Approval workflow
  status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'auto_approved']).default('pending'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userChangesIdx: index('idx_mara_user_changes').on(table.userId, table.status),
  projectChangesIdx: index('idx_mara_project_changes').on(table.projectId),
}));


// ── Support Sessions ────────────────────────────────────────────────────────
// PPEI employees can generate invite links for customers to join support sessions
// Customers don't need accounts - they join via link
export const supportSessions = mysqlTable('support_sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  inviteLink: varchar('invite_link', { length: 255 }).notNull().unique(),
  createdBy: int('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  // Session state
  status: mysqlEnum('status', ['active', 'ended', 'expired']).default('active'),
  expiresAt: timestamp('expires_at').notNull(),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  createdByIdx: index('idx_support_created_by').on(table.createdBy),
  statusIdx: index('idx_support_status').on(table.status),
  inviteLinkIdx: index('idx_support_invite_link').on(table.inviteLink),
}));

// ── Support Session Recordings ──────────────────────────────────────────────
// Stores metadata for recorded support sessions (screen + webcam + audio + chat)
export const supportSessionRecordings = mysqlTable('support_session_recordings', {
  id: varchar('id', { length: 36 }).primaryKey(),
  sessionId: varchar('session_id', { length: 36 }).notNull().references(() => supportSessions.id, { onDelete: 'cascade' }),
  // Recording files stored in S3
  screenRecordingUrl: varchar('screen_recording_url', { length: 500 }),
  webcamRecordingUrl: varchar('webcam_recording_url', { length: 500 }),
  audioRecordingUrl: varchar('audio_recording_url', { length: 500 }),
  // Combined video with all streams
  combinedVideoUrl: varchar('combined_video_url', { length: 500 }),
  chatTranscript: json('chat_transcript'), // Array of {timestamp, sender, message}
  // Recording metadata
  duration: int('duration'), // Duration in seconds
  fileSize: varchar('file_size', { length: 50 }), // Total file size in bytes (stored as string for large numbers)
  // Educational content tagging
  isEducational: boolean('is_educational').default(false),
  courseTitle: varchar('course_title', { length: 255 }),
  courseTopic: varchar('course_topic', { length: 255 }), // e.g., 'Boost Control', 'Fuel Tuning'
  tags: json('tags'), // Array of string tags for searchability
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  sessionIdx: index('idx_recording_session').on(table.sessionId),
  educationalIdx: index('idx_recording_educational').on(table.isEducational),
  topicIdx: index('idx_recording_topic').on(table.courseTopic),
}));

// ── Support Metrics ─────────────────────────────────────────────────────────
// Tracks support session quality and performance metrics
export const supportMetrics = mysqlTable('support_metrics', {
  id: varchar('id', { length: 36 }).primaryKey(),
  sessionId: varchar('session_id', { length: 36 }).notNull().references(() => supportSessions.id, { onDelete: 'cascade' }),
  // Response and resolution
  responseTime: int('response_time'), // Seconds from invite sent to customer joined
  resolutionStatus: mysqlEnum('resolution_status', ['resolved', 'partial', 'escalated', 'pending']).default('pending'),
  resolutionNotes: text('resolution_notes'),
  // Customer feedback
  customerSatisfaction: int('customer_satisfaction'), // 1-5 star rating
  customerFeedback: text('customer_feedback'),
  // Session activity
  totalParticipants: int('total_participants'),
  totalDuration: int('total_duration'), // Seconds
  screenShareTime: int('screen_share_time'), // Seconds
  audioTime: int('audio_time'), // Seconds
  videoTime: int('video_time'), // Seconds
  chatMessages: int('chat_messages'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  sessionIdx: index('idx_metrics_session').on(table.sessionId),
  resolutionIdx: index('idx_metrics_resolution').on(table.resolutionStatus),
}));
