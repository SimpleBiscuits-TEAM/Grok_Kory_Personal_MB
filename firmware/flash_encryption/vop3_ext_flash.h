/**
 * @file vop3_ext_flash.h
 * @brief VOP 3.0 External Flash Driver — Winbond 25Q256FVE6 Abstraction
 *
 * Provides a thin abstraction over the ESP-IDF SPI flash driver for the
 * external 32MB Winbond 25Q256FVE6 SPI NOR flash connected via SPI2.
 *
 * Flash Layout (32MB = 0x0200_0000 bytes):
 *   0x0000_0000 - 0x000F_FFFF : Script Index Table (1MB)
 *   0x0010_0000 - 0x00FF_FFFF : Encrypted Flash Scripts (15MB)
 *   0x0100_0000 - 0x017F_FFFF : Encrypted Calibration Data (8MB)
 *   0x0180_0000 - 0x01BF_FFFF : Firmware Update Staging (4MB)
 *   0x01C0_0000 - 0x01EF_FFFF : Datalog Storage (3MB)
 *   0x01F0_0000 - 0x01FF_FFFF : Reserved / Wear-leveling metadata (1MB)
 *
 * Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
 */

#ifndef VOP3_EXT_FLASH_H
#define VOP3_EXT_FLASH_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Flash Layout Constants ── */
#define VOP_EXT_FLASH_SIZE          (32 * 1024 * 1024)  /* 32MB total */
#define VOP_EXT_FLASH_SECTOR_SIZE   4096                /* 4KB sectors */
#define VOP_EXT_FLASH_BLOCK_SIZE    65536               /* 64KB blocks */
#define VOP_EXT_FLASH_PAGE_SIZE     256                 /* 256B page program */

/* Partition offsets */
#define VOP_FLASH_PART_INDEX        0x00000000  /* Script index table */
#define VOP_FLASH_PART_SCRIPTS      0x00100000  /* Encrypted scripts start */
#define VOP_FLASH_PART_CALDATA      0x01000000  /* Encrypted calibration data */
#define VOP_FLASH_PART_FW_STAGING   0x01800000  /* Firmware update staging */
#define VOP_FLASH_PART_DATALOG      0x01C00000  /* Datalog storage */
#define VOP_FLASH_PART_RESERVED     0x01F00000  /* Reserved / metadata */

/**
 * @brief Initialize the external SPI flash.
 *
 * Configures SPI2 for communication with the Winbond 25Q256FVE6:
 *   - SPI Mode 0 (CPOL=0, CPHA=0)
 *   - 80MHz clock (max for Winbond 25Q256 in fast read mode)
 *   - 4-byte address mode (required for >16MB)
 *   - Quad SPI (QIO) for maximum throughput
 *
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_init(void);

/**
 * @brief Read data from external flash.
 *
 * @param offset  Byte offset (0 to 32MB-1)
 * @param buf     Destination buffer
 * @param len     Number of bytes to read
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_read(uint32_t offset, void *buf, size_t len);

/**
 * @brief Write data to external flash.
 *
 * Handles page-boundary crossing automatically. The target region
 * must be erased before writing (flash can only clear bits 1→0).
 *
 * @param offset  Byte offset (must be page-aligned for best performance)
 * @param buf     Source data
 * @param len     Number of bytes to write
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_write(uint32_t offset, const void *buf, size_t len);

/**
 * @brief Erase a 4KB sector on external flash.
 *
 * @param offset  Byte offset (must be sector-aligned: multiple of 4096)
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_erase_sector(uint32_t offset);

/**
 * @brief Erase a 64KB block on external flash.
 *
 * @param offset  Byte offset (must be block-aligned: multiple of 65536)
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_erase_block(uint32_t offset);

/**
 * @brief Read the Winbond JEDEC ID for chip identification.
 *
 * Expected: Manufacturer=0xEF, Device=0x4019 for W25Q256FV
 *
 * @param manufacturer  Receives manufacturer byte
 * @param device_id     Receives 16-bit device ID
 * @return 0 on success, -1 on failure
 */
int vop3_ext_flash_read_id(uint8_t *manufacturer, uint16_t *device_id);

#ifdef __cplusplus
}
#endif

#endif /* VOP3_EXT_FLASH_H */
