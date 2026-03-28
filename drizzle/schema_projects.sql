-- User Projects System
-- This migration adds project storage, versioning, and auto-delivery tune library

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
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
  INDEX idx_user_projects (user_id, created_at DESC),
  INDEX idx_archived (is_archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project Files
CREATE TABLE IF NOT EXISTS project_files (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  file_type ENUM('binary', 'a2l', 'csv', 'reference', 'comparison') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INT,
  file_hash VARCHAR(64),
  s3_key VARCHAR(500),
  s3_url VARCHAR(500),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_files (project_id, file_type),
  UNIQUE KEY uk_file_hash (file_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project Versions (snapshots)
CREATE TABLE IF NOT EXISTS project_versions (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  version_number INT NOT NULL,
  binary_hash VARCHAR(64),
  changes_summary TEXT,
  maps_modified JSON,
  checksums_applied BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_versions (project_id, version_number DESC),
  UNIQUE KEY uk_project_version (project_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project Metadata (current state)
CREATE TABLE IF NOT EXISTS project_metadata (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) UNIQUE NOT NULL,
  current_binary_hash VARCHAR(64),
  current_version INT,
  total_maps_modified INT DEFAULT 0,
  last_edited_by VARCHAR(255),
  last_edited_at TIMESTAMP,
  checksum_status ENUM('valid', 'invalid', 'unchecked') DEFAULT 'unchecked',
  tags JSON,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_metadata (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tune Library Catalog
CREATE TABLE IF NOT EXISTS tune_library (
  id VARCHAR(36) PRIMARY KEY,
  vehicle_make VARCHAR(100) NOT NULL,
  vehicle_model VARCHAR(100) NOT NULL,
  vehicle_year INT,
  ecu_family VARCHAR(100) NOT NULL,
  ecu_part_number VARCHAR(100) NOT NULL,
  os_version VARCHAR(50) NOT NULL,
  hardware_revision VARCHAR(50),
  tune_name VARCHAR(255) NOT NULL,
  tune_description TEXT,
  tune_version VARCHAR(50),
  binary_hash VARCHAR(64) UNIQUE NOT NULL,
  a2l_hash VARCHAR(64),
  s3_binary_key VARCHAR(500) NOT NULL,
  s3_a2l_key VARCHAR(500),
  file_size INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255),
  INDEX idx_tune_match (vehicle_make, vehicle_model, ecu_family, os_version),
  INDEX idx_ecu_part (ecu_part_number, os_version),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tune Delivery Log
CREATE TABLE IF NOT EXISTS tune_deliveries (
  id VARCHAR(36) PRIMARY KEY,
  tune_library_id VARCHAR(36) NOT NULL,
  hardware_id VARCHAR(255),
  vehicle_vin VARCHAR(17),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  delivery_status ENUM('pending', 'delivered', 'failed', 'rejected') DEFAULT 'pending',
  failure_reason TEXT,
  customer_email VARCHAR(255),
  FOREIGN KEY (tune_library_id) REFERENCES tune_library(id) ON DELETE CASCADE,
  INDEX idx_hardware_deliveries (hardware_id, requested_at DESC),
  INDEX idx_vin_deliveries (vehicle_vin),
  INDEX idx_delivery_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hardware Device Registry
CREATE TABLE IF NOT EXISTS hardware_devices (
  id VARCHAR(36) PRIMARY KEY,
  hardware_id VARCHAR(255) UNIQUE NOT NULL,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  vehicle_vin VARCHAR(17),
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_request_at TIMESTAMP,
  total_deliveries INT DEFAULT 0,
  INDEX idx_hardware_id (hardware_id),
  INDEX idx_customer_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tune Comparisons (stock vs tuned)
CREATE TABLE IF NOT EXISTS project_comparisons (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  stock_binary_hash VARCHAR(64),
  tuned_binary_hash VARCHAR(64),
  differences_count INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_comparisons (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
