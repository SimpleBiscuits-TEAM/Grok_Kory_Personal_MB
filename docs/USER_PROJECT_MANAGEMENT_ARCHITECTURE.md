# User Project Management System Architecture

## Overview

This document outlines how to implement a complete project management system where users can store, organize, and manage their ECU tuning projects with full version history and collaboration features.

## Database Schema

```sql
-- Users table (already exists)
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  role ENUM('user', 'admin'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Projects
CREATE TABLE projects (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  ecu_family VARCHAR(100),
  ecu_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_archived BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id, created_at DESC),
  INDEX (is_archived)
);

-- Project Files (binaries, A2L, etc)
CREATE TABLE project_files (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id VARCHAR(36) NOT NULL,
  file_type ENUM('binary', 'a2l', 'csv', 'reference', 'comparison'),
  file_name VARCHAR(255) NOT NULL,
  file_size INT,
  file_hash VARCHAR(64),
  s3_key VARCHAR(500),
  s3_url VARCHAR(500),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX (project_id, file_type)
);

-- Project Versions (snapshots of edits)
CREATE TABLE project_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id VARCHAR(36) NOT NULL,
  version_number INT,
  binary_hash VARCHAR(64),
  changes_summary TEXT,
  maps_modified JSON,
  checksums_applied BOOLEAN,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX (project_id, version_number DESC)
);

-- Project Metadata (current state)
CREATE TABLE project_metadata (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id VARCHAR(36) UNIQUE NOT NULL,
  current_binary_hash VARCHAR(64),
  current_version INT,
  total_maps_modified INT DEFAULT 0,
  last_edited_by VARCHAR(255),
  last_edited_at TIMESTAMP,
  checksum_status ENUM('valid', 'invalid', 'unchecked'),
  tags JSON,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Comparison Projects (stock vs tuned)
CREATE TABLE project_comparisons (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id VARCHAR(36) NOT NULL,
  stock_binary_hash VARCHAR(64),
  tuned_binary_hash VARCHAR(64),
  differences_count INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## UI/UX Layout

### 1. Dashboard (After Login)

```
┌─────────────────────────────────────────────────────────────────┐
│  V-OP BETA                          [User: john@example.com] [⚙] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  REDEFINING THE LIMITS                                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ MY PROJECTS                                  [+ New Project] │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │                                                               │ │
│  │ ┌──────────────────────┐  ┌──────────────────────┐           │ │
│  │ │ 2024 Duramax L5P     │  │ Can-Am Maverick ME17 │           │ │
│  │ │ Stock: 6.6L Diesel   │  │ Rotax 3.0L Turbo    │           │ │
│  │ │ 3 versions           │  │ 2 versions          │           │ │
│  │ │ Last: 2 days ago     │  │ Last: 1 week ago    │           │ │
│  │ │ [Open] [Compare]     │  │ [Open] [Compare]    │           │ │
│  │ └──────────────────────┘  └──────────────────────┘           │ │
│  │                                                               │ │
│  │ ┌──────────────────────┐  ┌──────────────────────┐           │ │
│  │ │ Polaris RZR Pro R    │  │ [+ Create New]       │           │ │
│  │ │ Rotax 3.0L           │  │                      │           │ │
│  │ │ 1 version           │  │                      │           │ │
│  │ │ Last: 3 weeks ago   │  │                      │           │ │
│  │ │ [Open] [Compare]    │  │                      │           │ │
│  │ └──────────────────────┘  └──────────────────────┘           │ │
│  │                                                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ RECENT ACTIVITY                                             │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │ • Modified ignition timing map (Duramax) - 2 days ago       │ │
│  │ • Created new version (Can-Am) - 1 week ago                 │ │
│  │ • Applied Dynojet unlock (Polaris) - 3 weeks ago            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Project Editor (Open Project)

```
┌─────────────────────────────────────────────────────────────────┐
│  V-OP BETA  > Projects > 2024 Duramax L5P    [Save] [Export] [⚙] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ PROJECT INFO                                                 │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ Vehicle: 2024 Duramax L5P 6.6L Diesel                        │ │
│ │ ECU: Bosch ME17.8.5 (VM7E270175A0)                           │ │
│ │ Current Version: 3 of 5                                      │ │
│ │ Last Modified: 2 days ago by you                             │ │
│ │ Checksum Status: ✓ Valid                                     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ FILES                                                        │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ Primary Binary:    Duramax_Stock_6.6L.bin (2.0 MB)          │ │
│ │ A2L Definition:    ME17_8.5_Complete.a2l (450 KB)           │ │
│ │ Reference File:    Duramax_Stock_6.6L.s (1.8 MB)            │ │
│ │ Comparison:        Duramax_Tuned_6.6L.bin (2.0 MB)          │ │
│ │                                                               │ │
│ │ [Upload New File] [Download All] [View History]             │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ EDITOR TABS                                                  │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ [Calibration] [Compare] [Maps] [History] [Notes]             │ │
│ │                                                               │ │
│ │ ┌────────────────────────────────────────────────────────┐   │ │
│ │ │ CALIBRATION EDITOR                                   │   │ │
│ │ ├────────────────────────────────────────────────────────┤   │ │
│ │ │ Map List:                                              │   │ │
│ │ │ ├─ Ignition Timing                                     │   │ │
│ │ │ ├─ Fuel Injection                                      │   │ │
│ │ │ ├─ Boost Control                                       │   │ │
│ │ │ ├─ EGR Settings                                        │   │ │
│ │ │ └─ [+ 47 more maps]                                    │   │ │
│ │ │                                                        │   │ │
│ │ │ [Selected Map: Ignition Timing]                        │   │ │
│ │ │ ┌──────────────────────────────────────────────────┐  │   │ │
│ │ │ │ Map Table Editor (Heatmap)                       │  │   │ │
│ │ │ │ [Math Ops] [Smooth] [Reset] [Compare]           │  │   │ │
│ │ │ └──────────────────────────────────────────────────┘  │   │ │
│ │ │                                                        │   │ │
│ │ │ Changes: 12 maps modified | Checksums: ✓ Valid       │   │ │
│ │ └────────────────────────────────────────────────────────┘   │ │
│ │                                                               │ │
│ │ [← Back to Projects] [Save Version] [Export Binary]          │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Version History View

```
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT HISTORY: 2024 Duramax L5P                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ VERSION 5 (CURRENT)                                         │ │
│ │ Modified 2 days ago by you                                  │ │
│ │ Changes: Ignition timing +2°, Boost +5 PSI                 │ │
│ │ Maps Changed: 3 (Ignition, Boost, Fuel)                    │ │
│ │ [Restore] [Compare with V4] [Download] [Delete]            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ VERSION 4                                                   │ │
│ │ Created 1 week ago by you                                   │ │
│ │ Changes: Applied Dynojet unlock patch                       │ │
│ │ Maps Changed: 1 (Protection Disable)                        │ │
│ │ [Restore] [Compare with V5] [Download] [Delete]            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ VERSION 3                                                   │ │
│ │ Created 2 weeks ago by you                                  │ │
│ │ Changes: Initial tune - fuel and timing adjustments         │ │
│ │ Maps Changed: 5                                             │ │
│ │ [Restore] [Compare with V4] [Download] [Delete]            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ VERSION 2 (STOCK BASELINE)                                  │ │
│ │ Created 1 month ago by you                                  │ │
│ │ Changes: Stock binary imported                              │ │
│ │ Maps Changed: 0                                             │ │
│ │ [Restore] [Compare with V3] [Download] [Delete]            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Create New Project Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│  CREATE NEW PROJECT                                      [Close] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Project Name: [_____________________________]                   │
│                                                                   │
│  Vehicle Information:                                            │
│  ├─ Make:      [Dropdown: Duramax / Can-Am / Polaris / Other]   │
│  ├─ Model:     [_____________________________]                   │
│  ├─ Year:      [2024]                                           │
│  └─ Engine:    [_____________________________]                   │
│                                                                   │
│  ECU Information:                                                │
│  ├─ Family:    [Dropdown: ME17.8.5 / MG1C / Aisin / Other]      │
│  ├─ ECU ID:    [_____________________________]                   │
│  └─ Software:  [_____________________________]                   │
│                                                                   │
│  Initial Files:                                                  │
│  ├─ [ ] Upload Stock Binary                                     │
│  ├─ [ ] Upload A2L Definition                                   │
│  ├─ [ ] Upload Reference File                                   │
│  └─ [ ] Upload Comparison Binary                                │ │
│                                                                   │
│  [Cancel]  [Create Project]                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints (tRPC Procedures)

### Project Management

```typescript
// Get all user projects
trpc.projects.list.useQuery()

// Get single project with all metadata
trpc.projects.get.useQuery({ projectId: string })

// Create new project
trpc.projects.create.useMutation({
  name: string
  description?: string
  vehicleMake: string
  vehicleModel: string
  vehicleYear: number
  ecuFamily: string
  ecuId: string
})

// Update project metadata
trpc.projects.update.useMutation({
  projectId: string
  name?: string
  description?: string
  tags?: string[]
  notes?: string
})

// Archive project
trpc.projects.archive.useMutation({
  projectId: string
  isArchived: boolean
})

// Delete project
trpc.projects.delete.useMutation({
  projectId: string
})
```

### File Management

```typescript
// Upload file to project
trpc.projects.uploadFile.useMutation({
  projectId: string
  fileType: 'binary' | 'a2l' | 'csv' | 'reference' | 'comparison'
  file: File
})

// Get presigned URL for download
trpc.projects.getDownloadUrl.useQuery({
  projectId: string
  fileId: string
})

// Delete file from project
trpc.projects.deleteFile.useMutation({
  projectId: string
  fileId: string
})
```

### Version Management

```typescript
// Get project version history
trpc.projects.versions.list.useQuery({
  projectId: string
})

// Create new version (save checkpoint)
trpc.projects.versions.create.useMutation({
  projectId: string
  binaryHash: string
  changesSummary: string
  mapsModified: string[]
  checksumsApplied: boolean
})

// Restore to previous version
trpc.projects.versions.restore.useMutation({
  projectId: string
  versionId: string
})

// Compare two versions
trpc.projects.versions.compare.useQuery({
  projectId: string
  versionId1: string
  versionId2: string
})
```

## Implementation Steps

### Phase 1: Database & Backend (Week 1)
1. Create database schema
2. Implement tRPC procedures for CRUD operations
3. Add S3 file upload/download handlers
4. Implement version tracking logic

### Phase 2: Dashboard UI (Week 2)
1. Create projects list page
2. Implement project cards with quick actions
3. Add "Create New Project" dialog
4. Implement search and filtering

### Phase 3: Editor Integration (Week 3)
1. Modify CalibrationEditor to load from user projects
2. Implement auto-save to project versions
3. Add version history sidebar
4. Implement restore/compare functionality

### Phase 4: Polish & Testing (Week 4)
1. Add notifications for save/upload events
2. Implement error handling and recovery
3. Add analytics tracking
4. Comprehensive testing

## Key Features

### 1. **Project Isolation**
- Each user sees only their own projects
- Database queries filtered by user_id
- S3 file paths include user_id for security

### 2. **Version Control**
- Every save creates a version snapshot
- Binary hash for change detection
- Maps modified tracking
- Ability to restore any previous version

### 3. **File Management**
- Multiple file types per project (stock, tuned, reference, comparison)
- S3 storage with presigned URLs
- File versioning and history
- Automatic cleanup of old versions

### 4. **Collaboration Ready**
- User tracking (created_by, last_edited_by)
- Activity timestamps
- Future: Share projects with other users
- Future: Comment/note system

### 5. **Data Persistence**
- Session state saved to project
- Auto-save every 10 seconds
- Graceful recovery on reconnection
- Full audit trail

## Security Considerations

1. **Authentication**: Already handled by Manus OAuth
2. **Authorization**: Check user_id matches on all queries
3. **File Access**: S3 presigned URLs expire after 1 hour
4. **Data Encryption**: S3 encryption at rest
5. **Audit Logging**: Track all modifications

## Storage Costs

Assuming 1000 users, 5 projects each, 2 versions per project:
- Database: ~50MB (negligible)
- S3 Storage: ~5TB (2MB binary × 5 × 1000 × 2 versions)
- S3 Costs: ~$115/month (at $0.023 per GB)
- Bandwidth: Variable (~$0.09 per GB)

## Migration Path

1. **Phase 1**: Keep existing localStorage for backward compatibility
2. **Phase 2**: Add database storage option
3. **Phase 3**: Migrate existing sessions to database
4. **Phase 4**: Deprecate localStorage

This approach ensures zero disruption to existing users while adding powerful new features.
