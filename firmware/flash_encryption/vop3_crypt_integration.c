/**
 * @file vop3_crypt_integration.c
 * @brief VOP 3.0 Flash Encryption Integration Example
 *
 * Demonstrates how the encryption module integrates with the VOP 3.0
 * firmware boot sequence and flash script execution pipeline.
 *
 * This is NOT a standalone file — it shows the integration points
 * within the existing VOP 3.0 firmware architecture.
 *
 * Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
 */

#include "vop3_flash_crypt.h"
#include "vop3_provision.h"
#include "vop3_ext_flash.h"
#include "esp_log.h"

static const char *TAG = "vop_main";

/* Global encryption context — lives for the entire session */
static vop_crypt_ctx_t g_crypt_ctx;

/* ──────────────────────────────────────────────────────────────
 * Boot Integration
 *
 * Called during VOP 3.0 firmware startup, after WiFi/BLE init
 * but before any flash script access.
 * ────────────────────────────────────────────────────────────── */

void vop3_security_init(void)
{
    ESP_LOGI(TAG, "═══════════════════════════════════════════");
    ESP_LOGI(TAG, "  VOP 3.0 Security Subsystem Init");
    ESP_LOGI(TAG, "═══════════════════════════════════════════");

    /* Print provisioning status */
    vop_provision_print_status();

    /* Initialize external Winbond flash */
    if (vop3_ext_flash_init() != 0) {
        ESP_LOGE(TAG, "External flash init failed — scripts unavailable");
        return;
    }

    /* Verify Winbond chip identity */
    uint8_t mfr;
    uint16_t dev_id;
    if (vop3_ext_flash_read_id(&mfr, &dev_id) == 0) {
        ESP_LOGI(TAG, "External flash: MFR=0x%02X DEV=0x%04X %s",
                 mfr, dev_id,
                 (mfr == 0xEF && dev_id == 0x4019) ? "(Winbond W25Q256FV ✓)" : "(UNKNOWN!)");
    }

    /* Initialize encryption engine */
    if (!vop_provision_is_done()) {
        ESP_LOGW(TAG, "Device not provisioned — encryption disabled");
        ESP_LOGW(TAG, "Run 'vop_provision' command to burn master key");
        return;
    }

    vop_crypt_err_t err = vop_crypt_init(&g_crypt_ctx);
    if (err != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Encryption engine init failed: %s", vop_crypt_err_str(err));
        ESP_LOGE(TAG, "Flash scripts will be INACCESSIBLE");
        return;
    }

    ESP_LOGI(TAG, "Encryption engine ready — all flash scripts protected");
}

/* ──────────────────────────────────────────────────────────────
 * Script Execution Integration
 *
 * Called when the user triggers a flash operation from the VOP app.
 * The phone sends a script ID, the ESP32-S3 looks up the encrypted
 * script on the Winbond flash, decrypts it into PSRAM, executes it,
 * then securely wipes the plaintext.
 * ────────────────────────────────────────────────────────────── */

/**
 * @brief Execute an encrypted flash script.
 *
 * This is the main entry point for the flash execution pipeline.
 * The script is decrypted from Winbond flash into PSRAM, parsed,
 * executed (CAN commands sent to ECU), and then wiped.
 *
 * @param script_id  The script to execute (maps to flash offset via index)
 * @return 0 on success, -1 on failure
 */
int vop3_execute_encrypted_script(uint32_t script_id)
{
    ESP_LOGI(TAG, "Executing encrypted script ID=%lu", (unsigned long)script_id);

    if (!g_crypt_ctx.initialized) {
        ESP_LOGE(TAG, "Encryption engine not initialized");
        return -1;
    }

    /*
     * Step 1: Look up flash offset from script index table.
     *
     * The index table at VOP_FLASH_PART_INDEX maps script IDs to
     * their byte offsets in the scripts partition. This table itself
     * is also encrypted (stored as a special blob with script_id=0).
     *
     * For this example, we use a simple direct mapping:
     *   offset = SCRIPTS_BASE + (script_id * MAX_SCRIPT_SLOT_SIZE)
     */
    const uint32_t SLOT_SIZE = 256 * 1024; /* 256KB per script slot */
    uint32_t flash_offset = VOP_FLASH_PART_SCRIPTS + (script_id * SLOT_SIZE);

    if (flash_offset >= VOP_FLASH_PART_CALDATA) {
        ESP_LOGE(TAG, "Script ID %lu exceeds scripts partition", (unsigned long)script_id);
        return -1;
    }

    /* Step 2: Decrypt script from Winbond flash into PSRAM */
    uint8_t *script_data = NULL;
    size_t script_len = 0;

    vop_crypt_err_t err = vop_crypt_decrypt_script(
        &g_crypt_ctx, flash_offset, &script_data, &script_len);

    if (err == VOP_CRYPT_ERR_AUTH_FAIL) {
        ESP_LOGE(TAG, "SECURITY ALERT: Script %lu has been tampered with!",
                 (unsigned long)script_id);
        /* Could trigger additional security responses here:
         * - Lock the device
         * - Send alert to VOP cloud
         * - Increment a permanent tamper counter in eFuse
         */
        return -1;
    }

    if (err != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Script decryption failed: %s", vop_crypt_err_str(err));
        return -1;
    }

    ESP_LOGI(TAG, "Script decrypted: %lu bytes in PSRAM", (unsigned long)script_len);

    /*
     * Step 3: Parse and execute the flash script.
     *
     * The script is now in PSRAM as plaintext. The VOP script parser
     * processes commands like:
     *   CAN_SEND(0x7E0, [0x10, 0x03])
     *   CAN_REQUEST_SEED(0x7E0, 0x27, 0x01)
     *   FLASH_BLOCKS(0x7E0, 0x34, blocks[])
     *   FLASH_PATCH(offset, data[])
     *
     * The parser and executor are in separate modules (not shown here).
     */

    /* ── PLACEHOLDER: Script parsing and execution ── */
    /* vop3_script_parse_and_execute(script_data, script_len); */
    ESP_LOGI(TAG, "Script execution would happen here (parser integration point)");

    /*
     * Step 4: Securely wipe plaintext from PSRAM.
     *
     * This is CRITICAL — the plaintext must not persist in memory
     * after execution. An attacker with JTAG access or a memory dump
     * tool could extract the script if it's left in PSRAM.
     */
    vop_crypt_free_plaintext(script_data, script_len);
    script_data = NULL;

    ESP_LOGI(TAG, "Script %lu executed and wiped from memory",
             (unsigned long)script_id);

    return 0;
}

/* ──────────────────────────────────────────────────────────────
 * OTA Script Update Integration
 *
 * Called when a new flash script is received from the VOP cloud
 * via WiFi. The script arrives encrypted with a transport key
 * (TLS), is re-encrypted with the device key, and stored on
 * the Winbond flash.
 * ────────────────────────────────────────────────────────────── */

/**
 * @brief Store a new flash script received via OTA.
 *
 * The plaintext script is received in PSRAM (from the TLS-decrypted
 * WiFi payload), encrypted with the device-unique key, and written
 * to the Winbond flash.
 *
 * @param script_id    Script identifier
 * @param script_data  Plaintext script data (in PSRAM)
 * @param script_len   Length of script data
 * @param flags        Script type flags
 * @return 0 on success, -1 on failure
 */
int vop3_store_ota_script(
    uint32_t script_id,
    const uint8_t *script_data,
    size_t script_len,
    uint16_t flags)
{
    ESP_LOGI(TAG, "Storing OTA script ID=%lu (%lu bytes)",
             (unsigned long)script_id, (unsigned long)script_len);

    if (!g_crypt_ctx.initialized) {
        ESP_LOGE(TAG, "Encryption engine not initialized");
        return -1;
    }

    /* Calculate flash offset from script ID */
    const uint32_t SLOT_SIZE = 256 * 1024;
    uint32_t flash_offset = VOP_FLASH_PART_SCRIPTS + (script_id * SLOT_SIZE);

    if (flash_offset >= VOP_FLASH_PART_CALDATA) {
        ESP_LOGE(TAG, "Script ID %lu exceeds scripts partition", (unsigned long)script_id);
        return -1;
    }

    /* Encrypt and store */
    vop_crypt_err_t err = vop_crypt_encrypt_and_store(
        &g_crypt_ctx, flash_offset, script_data, script_len, script_id, flags);

    if (err != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Script encryption/storage failed: %s", vop_crypt_err_str(err));
        return -1;
    }

    ESP_LOGI(TAG, "Script %lu encrypted and stored at offset 0x%08lX",
             (unsigned long)script_id, (unsigned long)flash_offset);

    return 0;
}

/* ──────────────────────────────────────────────────────────────
 * Shutdown Integration
 *
 * Called during VOP 3.0 firmware shutdown or deep sleep entry.
 * Ensures all sensitive material is wiped from RAM.
 * ────────────────────────────────────────────────────────────── */

void vop3_security_shutdown(void)
{
    uint32_t decrypts, tampers;
    vop_crypt_get_stats(&g_crypt_ctx, &decrypts, &tampers);

    ESP_LOGI(TAG, "Security shutdown: %lu decrypts, %lu tamper events",
             (unsigned long)decrypts, (unsigned long)tampers);

    vop_crypt_deinit(&g_crypt_ctx);

    ESP_LOGI(TAG, "All encryption keys wiped from memory");
}
