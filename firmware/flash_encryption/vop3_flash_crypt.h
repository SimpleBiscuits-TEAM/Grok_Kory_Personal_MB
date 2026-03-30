/**
 * @file vop3_flash_crypt.h
 * @brief VOP 3.0 Flash Script Encryption Module
 *
 * Provides AES-256-GCM authenticated encryption for flash scripts and
 * calibration data stored on the external Winbond 25Q256FVE6 32MB SPI NOR
 * flash. Decryption occurs into PSRAM only during execution, and plaintext
 * is zeroed immediately after use.
 *
 * Security Architecture:
 *   - Master key stored in eFuse BLOCK_KEY4 (read-protected, software-inaccessible)
 *   - Per-device key derived via HKDF-SHA256(master_key, device_efuse_id)
 *   - AES-256-GCM provides both confidentiality and integrity (AEAD)
 *   - 12-byte random IV per encrypted blob (stored alongside ciphertext)
 *   - 16-byte GCM authentication tag detects any tampering
 *   - Hardware AES acceleration via ESP32-S3 crypto engine (mbedtls)
 *
 * Encrypted Blob Format (on Winbond flash):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Magic (4B)  │ Version (2B) │ Flags (2B) │ Script ID (4B)   │
 *   │ Orig Size (4B) │ Cipher Size (4B) │ IV (12B) │ Tag (16B)   │
 *   │ Ciphertext (variable) │ Padding to 4KB boundary            │
 *   └─────────────────────────────────────────────────────────────┘
 *   Total header: 48 bytes
 *
 * Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — Do not distribute.
 */

#ifndef VOP3_FLASH_CRYPT_H
#define VOP3_FLASH_CRYPT_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ──────────────────────── Constants ──────────────────────── */

/** Magic bytes identifying an encrypted VOP flash blob: "VCR\x03" (VOP Crypt v3) */
#define VOP_CRYPT_MAGIC             0x03524356U

/** Current encryption format version */
#define VOP_CRYPT_VERSION           0x0001

/** AES-256 key size in bytes */
#define VOP_AES_KEY_SIZE            32

/** AES-GCM IV (nonce) size in bytes — NIST recommended */
#define VOP_AES_IV_SIZE             12

/** AES-GCM authentication tag size in bytes */
#define VOP_AES_TAG_SIZE            16

/** HKDF info string for key derivation */
#define VOP_HKDF_INFO               "VOP3-FlashCrypt-v1"

/** HKDF info string length */
#define VOP_HKDF_INFO_LEN           18

/** Maximum plaintext script size: 2MB (fits comfortably in 64MB PSRAM) */
#define VOP_MAX_SCRIPT_SIZE         (2 * 1024 * 1024)

/** Winbond flash sector size for aligned writes */
#define VOP_FLASH_SECTOR_SIZE       4096

/** eFuse block used for master encryption key */
#define VOP_EFUSE_KEY_BLOCK         EFUSE_BLK_KEY4

/** eFuse key purpose for our custom encryption key */
#define VOP_EFUSE_KEY_PURPOSE       EFUSE_KEY_PURPOSE_USER

/* ──────────────────────── Flags ──────────────────────── */

/** Blob contains a flash script (.vopscript) */
#define VOP_CRYPT_FLAG_SCRIPT       (1U << 0)

/** Blob contains calibration/tune data (.voptune) */
#define VOP_CRYPT_FLAG_CALDATA      (1U << 1)

/** Blob contains firmware update payload */
#define VOP_CRYPT_FLAG_FIRMWARE     (1U << 2)

/** Blob is compressed (LZ4) before encryption */
#define VOP_CRYPT_FLAG_COMPRESSED   (1U << 3)

/** Blob is device-locked (cannot be transferred to another board) */
#define VOP_CRYPT_FLAG_DEVICE_LOCK  (1U << 4)

/* ──────────────────────── Data Structures ──────────────────────── */

/**
 * @brief Encrypted blob header stored at the beginning of each encrypted
 *        region on the Winbond external flash.
 *
 * All multi-byte fields are little-endian (ESP32-S3 native byte order).
 */
typedef struct __attribute__((packed)) {
    uint32_t magic;             /**< Must be VOP_CRYPT_MAGIC */
    uint16_t version;           /**< Format version (VOP_CRYPT_VERSION) */
    uint16_t flags;             /**< Combination of VOP_CRYPT_FLAG_* */
    uint32_t script_id;         /**< Unique script identifier */
    uint32_t orig_size;         /**< Original plaintext size in bytes */
    uint32_t cipher_size;       /**< Ciphertext size in bytes (excl. header) */
    uint8_t  iv[VOP_AES_IV_SIZE];   /**< Random IV / nonce */
    uint8_t  tag[VOP_AES_TAG_SIZE]; /**< GCM authentication tag */
} vop_crypt_header_t;

_Static_assert(sizeof(vop_crypt_header_t) == 48, "Header must be exactly 48 bytes");

/**
 * @brief Runtime context for the encryption engine.
 *
 * Holds the derived per-device key and state. The key is derived once
 * during vop_crypt_init() and held in IRAM (not flash-backed) for the
 * lifetime of the session. It is securely wiped on vop_crypt_deinit().
 */
typedef struct {
    uint8_t  device_key[VOP_AES_KEY_SIZE];  /**< Derived per-device AES-256 key */
    uint8_t  device_id[32];                 /**< Device unique ID from eFuse */
    bool     initialized;                   /**< True after successful init */
    uint32_t decrypt_count;                 /**< Number of successful decryptions */
    uint32_t tamper_count;                  /**< Number of detected tamper events */
} vop_crypt_ctx_t;

/* ──────────────────────── Error Codes ──────────────────────── */

typedef enum {
    VOP_CRYPT_OK                = 0,    /**< Success */
    VOP_CRYPT_ERR_NOT_INIT      = -1,   /**< Engine not initialized */
    VOP_CRYPT_ERR_BAD_MAGIC     = -2,   /**< Invalid magic in header */
    VOP_CRYPT_ERR_BAD_VERSION   = -3,   /**< Unsupported format version */
    VOP_CRYPT_ERR_BAD_SIZE      = -4,   /**< Script exceeds max size */
    VOP_CRYPT_ERR_AUTH_FAIL     = -5,   /**< GCM tag mismatch — tampered! */
    VOP_CRYPT_ERR_EFUSE_READ    = -6,   /**< Failed to read eFuse key/ID */
    VOP_CRYPT_ERR_KEY_DERIVE    = -7,   /**< HKDF key derivation failed */
    VOP_CRYPT_ERR_ENCRYPT       = -8,   /**< AES-GCM encryption failed */
    VOP_CRYPT_ERR_DECRYPT       = -9,   /**< AES-GCM decryption failed */
    VOP_CRYPT_ERR_FLASH_READ    = -10,  /**< External flash read error */
    VOP_CRYPT_ERR_FLASH_WRITE   = -11,  /**< External flash write error */
    VOP_CRYPT_ERR_ALLOC         = -12,  /**< PSRAM allocation failed */
    VOP_CRYPT_ERR_COMPRESSED    = -13,  /**< LZ4 decompression failed */
} vop_crypt_err_t;

/* ──────────────────────── Public API ──────────────────────── */

/**
 * @brief Initialize the flash encryption engine.
 *
 * Reads the master key from eFuse BLOCK_KEY4, reads the device unique ID
 * from eFuse BLOCK0, and derives the per-device AES-256 key using
 * HKDF-SHA256. The master key is never stored in RAM — only the derived
 * key is retained.
 *
 * Must be called once during VOP 3.0 boot, before any flash script access.
 *
 * @param[out] ctx  Pointer to encryption context to initialize
 * @return VOP_CRYPT_OK on success, negative error code on failure
 */
vop_crypt_err_t vop_crypt_init(vop_crypt_ctx_t *ctx);

/**
 * @brief Securely destroy the encryption context.
 *
 * Zeroes the derived key and all sensitive state from memory using
 * mbedtls_platform_zeroize() to prevent compiler optimization from
 * eliding the wipe.
 *
 * @param[in,out] ctx  Pointer to encryption context to destroy
 */
void vop_crypt_deinit(vop_crypt_ctx_t *ctx);

/**
 * @brief Decrypt a flash script from external Winbond flash into PSRAM.
 *
 * Reads the encrypted blob from the specified flash offset, validates
 * the header, performs AES-256-GCM authenticated decryption, and returns
 * a pointer to the plaintext in PSRAM. The caller is responsible for
 * calling vop_crypt_free_plaintext() when done.
 *
 * If the GCM tag does not verify, the function returns
 * VOP_CRYPT_ERR_AUTH_FAIL and increments ctx->tamper_count. The tamper
 * event is also logged to NVS for forensic analysis.
 *
 * @param[in]  ctx          Initialized encryption context
 * @param[in]  flash_offset Byte offset on external flash where blob starts
 * @param[out] plaintext    Receives pointer to decrypted data in PSRAM
 * @param[out] plaintext_len Receives length of decrypted data
 * @return VOP_CRYPT_OK on success, negative error code on failure
 */
vop_crypt_err_t vop_crypt_decrypt_script(
    vop_crypt_ctx_t *ctx,
    uint32_t flash_offset,
    uint8_t **plaintext,
    size_t *plaintext_len
);

/**
 * @brief Encrypt a plaintext script and write it to external flash.
 *
 * Generates a random 12-byte IV, encrypts the plaintext using AES-256-GCM,
 * constructs the blob header, and writes the complete encrypted blob to
 * the specified flash offset. The write is sector-aligned.
 *
 * This function is used during OTA script updates and initial provisioning.
 *
 * @param[in] ctx          Initialized encryption context
 * @param[in] flash_offset Byte offset on external flash for the blob
 * @param[in] plaintext    Pointer to plaintext script data
 * @param[in] plaintext_len Length of plaintext data
 * @param[in] script_id    Unique script identifier
 * @param[in] flags        Combination of VOP_CRYPT_FLAG_*
 * @return VOP_CRYPT_OK on success, negative error code on failure
 */
vop_crypt_err_t vop_crypt_encrypt_and_store(
    vop_crypt_ctx_t *ctx,
    uint32_t flash_offset,
    const uint8_t *plaintext,
    size_t plaintext_len,
    uint32_t script_id,
    uint16_t flags
);

/**
 * @brief Securely free decrypted plaintext from PSRAM.
 *
 * Zeroes the plaintext buffer before freeing to prevent residual data
 * from persisting in PSRAM.
 *
 * @param[in] plaintext     Pointer returned by vop_crypt_decrypt_script()
 * @param[in] plaintext_len Length returned by vop_crypt_decrypt_script()
 */
void vop_crypt_free_plaintext(uint8_t *plaintext, size_t plaintext_len);

/**
 * @brief Validate an encrypted blob header without decrypting.
 *
 * Reads and checks the header at the given flash offset. Useful for
 * inventory scanning of stored scripts.
 *
 * @param[in]  flash_offset Byte offset on external flash
 * @param[out] header       Receives the parsed header
 * @return VOP_CRYPT_OK if header is valid, negative error code otherwise
 */
vop_crypt_err_t vop_crypt_validate_header(
    uint32_t flash_offset,
    vop_crypt_header_t *header
);

/**
 * @brief Get human-readable error string for a vop_crypt error code.
 *
 * @param[in] err  Error code from any vop_crypt function
 * @return Pointer to static string describing the error
 */
const char *vop_crypt_err_str(vop_crypt_err_t err);

/**
 * @brief Get runtime statistics from the encryption engine.
 *
 * @param[in]  ctx           Initialized encryption context
 * @param[out] decrypt_count Number of successful decryptions since init
 * @param[out] tamper_count  Number of detected tamper events since init
 */
void vop_crypt_get_stats(
    const vop_crypt_ctx_t *ctx,
    uint32_t *decrypt_count,
    uint32_t *tamper_count
);

#ifdef __cplusplus
}
#endif

#endif /* VOP3_FLASH_CRYPT_H */
