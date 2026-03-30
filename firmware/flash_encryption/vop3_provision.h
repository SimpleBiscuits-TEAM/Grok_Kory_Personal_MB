/**
 * @file vop3_provision.h
 * @brief VOP 3.0 Manufacturing Provisioning Module
 *
 * Handles one-time device provisioning during manufacturing:
 *   1. Burns the master encryption key into eFuse BLOCK_KEY4
 *   2. Sets read protection on the key block (software can never read it back)
 *   3. Optionally enables ESP-IDF flash encryption in Release Mode
 *   4. Optionally enables Secure Boot v2
 *
 * CRITICAL: These operations are IRREVERSIBLE. Once eFuses are burned,
 * they cannot be changed. The provisioning flow must be carefully
 * validated before running on production hardware.
 *
 * Manufacturing Flow:
 *   1. Flash VOP 3.0 firmware via USB-C
 *   2. Run provisioning command via serial console
 *   3. Provisioning burns master key, sets protections
 *   4. Board reboots and derives its unique device key
 *   5. Board is ready for encrypted script deployment
 *
 * Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
 */

#ifndef VOP3_PROVISION_H
#define VOP3_PROVISION_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Provisioning status codes
 */
typedef enum {
    VOP_PROV_OK                 = 0,
    VOP_PROV_ERR_ALREADY_DONE   = -1,  /**< Device already provisioned */
    VOP_PROV_ERR_EFUSE_WRITE    = -2,  /**< eFuse write failed */
    VOP_PROV_ERR_EFUSE_PROTECT  = -3,  /**< eFuse protection failed */
    VOP_PROV_ERR_BAD_KEY        = -4,  /**< Invalid master key */
    VOP_PROV_ERR_VERIFY         = -5,  /**< Post-burn verification failed */
} vop_prov_err_t;

/**
 * @brief Check if this device has already been provisioned.
 *
 * Reads eFuse BLOCK_KEY4 purpose field. If it's set to USER purpose,
 * the device has been provisioned.
 *
 * @return true if provisioned, false if virgin
 */
bool vop_provision_is_done(void);

/**
 * @brief Provision a VOP 3.0 board with the master encryption key.
 *
 * This function:
 *   1. Verifies the board is not already provisioned
 *   2. Burns the 256-bit master key into eFuse BLOCK_KEY4
 *   3. Sets KEY_PURPOSE_4 to USER
 *   4. Enables read protection on BLOCK_KEY4 (key becomes hardware-only)
 *   5. Enables write protection on BLOCK_KEY4 (key cannot be overwritten)
 *   6. Verifies the burn by attempting to read back (should fail = protected)
 *
 * WARNING: This operation is IRREVERSIBLE.
 *
 * @param master_key  256-bit master key (32 bytes) — same key for all VOP boards
 * @return VOP_PROV_OK on success, negative error code on failure
 */
vop_prov_err_t vop_provision_burn_master_key(const uint8_t master_key[32]);

/**
 * @brief Enable ESP-IDF flash encryption in Release Mode.
 *
 * This encrypts the internal 16MB flash (firmware, partition table, NVS)
 * using the ESP32-S3's built-in AES-XTS flash encryption. Combined with
 * our custom Winbond encryption, this provides full-stack protection.
 *
 * WARNING: After enabling Release Mode, the device can only be updated
 * via OTA with properly signed and encrypted firmware images.
 *
 * @return VOP_PROV_OK on success, negative error code on failure
 */
vop_prov_err_t vop_provision_enable_flash_encryption(void);

/**
 * @brief Enable Secure Boot v2.
 *
 * Ensures only signed bootloader and firmware can execute. The signing
 * key hash is burned into eFuse and verified on every boot.
 *
 * @param pubkey_hash  SHA-256 hash of the RSA-3072 public signing key
 * @return VOP_PROV_OK on success, negative error code on failure
 */
vop_prov_err_t vop_provision_enable_secure_boot(const uint8_t pubkey_hash[32]);

/**
 * @brief Print provisioning status to serial console.
 *
 * Displays:
 *   - Whether master key is burned
 *   - Whether flash encryption is enabled
 *   - Whether secure boot is enabled
 *   - Device unique ID (hash, not raw eFuse)
 *   - eFuse burn counts and remaining capacity
 */
void vop_provision_print_status(void);

#ifdef __cplusplus
}
#endif

#endif /* VOP3_PROVISION_H */
