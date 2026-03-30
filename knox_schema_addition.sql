-- Knox Knowledge Base Tables
-- Stores reference documents, A2L extractions, flash log analysis, and training data

CREATE TABLE IF NOT EXISTS knox_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(64) NOT NULL,       -- 'a2l', 'calibration', 'strategy_doc', 'diagnostic_spec', 'flash_log', 'pid_def', 'training', 'bcm', 'gmlan', 'seed_key', 'certification'
  platform VARCHAR(64) NOT NULL,       -- 'ford_6.0', 'ford_6.4', 'ford_6.7_edc17', 'ford_6.7_mg1', 'ford_3.0', 'gm_duramax', 'gm_bcm', 'bosch_edc17', 'bosch_mg1', 'general'
  ecuFamily VARCHAR(64),               -- 'VXCF4', 'fs0l300c', 'DDBW2', 'DDCJ1', 'DFFH3', 'DFHJ2', 'dcyh4', 'MG1CS019', 'P826', etc.
  yearRange VARCHAR(32),               -- '2003-2007', '2008-2010', '2011-2012', '2013', '2018', '2020', '2022', '2023-2025'
  fileName VARCHAR(512) NOT NULL,
  fileType VARCHAR(16) NOT NULL,       -- 'a2l', 'hex', 'bin', 'vbf', 's19', 'pdf', 'doc', 'xls', 'xml', 'txt', 'log'
  fileSize INT NOT NULL,               -- bytes
  s3Key VARCHAR(512),                  -- S3 storage key for the raw file
  s3Url TEXT,                          -- S3 URL for retrieval
  description TEXT,                    -- human-readable description
  extractedMetadata TEXT,              -- JSON: extracted key info (map counts, PIDs, addresses, etc.)
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_category (category),
  INDEX idx_platform (platform),
  INDEX idx_ecuFamily (ecuFamily)
);

CREATE TABLE IF NOT EXISTS knox_a2l_maps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documentId INT NOT NULL,             -- FK to knox_documents
  mapName VARCHAR(255) NOT NULL,       -- e.g., 'InjCrv_qSetM_MAP'
  mapType VARCHAR(64),                 -- 'CHARACTERISTIC', 'MEASUREMENT', 'AXIS_PTS'
  address VARCHAR(32),                 -- hex address in ECU
  dataType VARCHAR(32),               -- 'FLOAT32_IEEE', 'UWORD', etc.
  unit VARCHAR(64),                    -- 'mg/str', 'bar', 'degC', etc.
  description TEXT,                    -- long name from A2L
  dimensions VARCHAR(64),             -- '16x16', '1x20', 'scalar'
  minVal DECIMAL(20,6),
  maxVal DECIMAL(20,6),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_documentId (documentId),
  INDEX idx_mapName (mapName)
);

CREATE TABLE IF NOT EXISTS knox_flash_analysis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stockDocId INT,                      -- FK to knox_documents (stock flash log)
  modifiedDocId INT,                   -- FK to knox_documents (modified flash log)
  platform VARCHAR(64) NOT NULL,
  analysisType VARCHAR(64) NOT NULL,   -- 'security_bypass', 'calibration_diff', 'protocol_sequence'
  title VARCHAR(255) NOT NULL,
  findings TEXT NOT NULL,              -- JSON: detailed analysis
  udsSequence TEXT,                    -- JSON: extracted UDS service sequences
  securityMethod TEXT,                 -- description of security access method used
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_platform (platform)
);

CREATE TABLE IF NOT EXISTS knox_seed_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(64) NOT NULL,       -- 'ford', 'gm', 'bosch'
  ecuType VARCHAR(64),                 -- 'ECM', 'TCM', 'BCM'
  keyBytes VARCHAR(255) NOT NULL,      -- hex string of the key
  algorithm VARCHAR(128),              -- description of seed-key algorithm if known
  source VARCHAR(255),                 -- where this key came from
  notes TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_platform (platform)
);

CREATE TABLE IF NOT EXISTS knox_calibration_lookup (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(64) NOT NULL,
  yearModel VARCHAR(16),               -- '2018', '2020', etc.
  partNumber VARCHAR(64) NOT NULL,     -- e.g., 'PC3A-14C204-CJC'
  partType VARCHAR(32),                -- 'ECM', 'TCM'
  description TEXT,
  howToObtain TEXT,                     -- instructions for downloading
  s3Key VARCHAR(512),                  -- S3 key if we have the file stored
  s3Url TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_partNumber (partNumber),
  INDEX idx_platform (platform)
);
