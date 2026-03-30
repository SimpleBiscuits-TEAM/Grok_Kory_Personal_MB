/**
 * @file vop3_flash_crypt.c
 * @brief VOP 3.0 Flash Script Encryption — Implementation
 *
 * AES-256-GCM authenticated encryption for flash scripts stored on the
 * external Winbond 25Q256FVE6 32MB SPI NOR flash. Uses ESP32-S3 hardware
 * AES acceleration and eFuse-derived per-device keys.
 *
 * Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — Do not distribute.
 */

#include "vop3_flash_crypt.h"

/* ── ESP-IDF Includes ── */
#include "esp_log.h"
#include "esp_efuse.h"
#include "esp_efuse_table.h"
#include "esp_random.h"
#include "esp_heap_caps.h"
#include "nvs_flash.h"
#include "nvs.h"

/* ── mbedtls (hardware-accelerated on ESP32-S3) ── */
#include "mbedtls/gcm.h"
#include "mbedtls/hkdf.h"
#include "mbedtls/md.h"
#include "mbedtls/platform_util.h"

/* ── External flash driver (project-specific) ── */
#include "vop3_ext_flash.h"

static const char *TAG = "vop_crypt";

/* ──────────────────────────────────────────────────────────────
 * Internal helpers
 * ────────────────────────────────────────────────────────────── */

/**
 * @brief Read the 256-bit master key from eFuse BLOCK_KEY4.
 *
 * The key block must have been pre-burned during manufacturing with
 * read protection enabled. This function uses the eFuse API which
 * accesses the hardware register directly — the key never appears
 * in flash-backed memory.
 */
static vop_crypt_err_t read_master_key(uint8_t master_key[VOP_AES_KEY_SIZE])
{
    esp_err_t err = esp_efuse_read_block(VOP_EFUSE_KEY_BLOCK,
                                          master_key, 0, VOP_AES_KEY_SIZE * 8);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "eFuse key read failed: %s", esp_err_to_name(err));
        return VOP_CRYPT_ERR_EFUSE_READ;
    }

    /* Verify key is not all-zeros (unburned) */
    uint8_t zero_check = 0;
    for (int i = 0; i < VOP_AES_KEY_SIZE; i++) {
        zero_check |= master_key[i];
    }
    if (zero_check == 0) {
        ESP_LOGE(TAG, "eFuse key block is empty — not provisioned!");
        return VOP_CRYPT_ERR_EFUSE_READ;
    }

    return VOP_CRYPT_OK;
}

/**
 * @brief Read the unique device ID from eFuse BLOCK0 (MAC + wafer info).
 *
 * The device ID is a combination of the factory-burned MAC address and
 * wafer lot information, providing a unique 256-bit identity per chip.
 * We hash the raw eFuse block to get a clean 32-byte device ID.
 */
static vop_crypt_err_t read_device_id(uint8_t device_id[32])
{
    uint8_t raw_efuse[32];

    /* Read the base MAC address (6 bytes) and extend with chip info */
    esp_err_t err = esp_efuse_read_block(EFUSE_BLK0, raw_efuse, 0, 256);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Device ID eFuse read failed: %s", esp_err_to_name(err));
        return VOP_CRYPT_ERR_EFUSE_READ;
    }

    /* SHA-256 hash of the raw eFuse block to get a clean 32-byte ID */
    const mbedtls_md_info_t *md_info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (mbedtls_md(md_info, raw_efuse, sizeof(raw_efuse), device_id) != 0) {
        ESP_LOGE(TAG, "SHA-256 of device ID failed");
        return VOP_CRYPT_ERR_KEY_DERIVE;
    }

    /* Wipe raw eFuse data from stack */
    mbedtls_platform_zeroize(raw_efuse, sizeof(raw_efuse));

    return VOP_CRYPT_OK;
}

/**
 * @brief Derive the per-device AES-256 key using HKDF-SHA256.
 *
 * HKDF(master_key, device_id, "VOP3-FlashCrypt-v1") → 256-bit key
 *
 * The master key is wiped from memory immediately after derivation.
 * Only the derived key persists in the context (in IRAM).
 */
static vop_crypt_err_t derive_device_key(
    const uint8_t master_key[VOP_AES_KEY_SIZE],
    const uint8_t device_id[32],
    uint8_t device_key[VOP_AES_KEY_SIZE])
{
    const mbedtls_md_info_t *md_info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);

    int ret = mbedtls_hkdf(md_info,
                            device_id, 32,              /* salt = device ID */
                            master_key, VOP_AES_KEY_SIZE, /* IKM = master key */
                            (const uint8_t *)VOP_HKDF_INFO,
                            VOP_HKDF_INFO_LEN,          /* info context */
                            device_key, VOP_AES_KEY_SIZE); /* output */
    if (ret != 0) {
        ESP_LOGE(TAG, "HKDF key derivation failed: -0x%04X", (unsigned)-ret);
        return VOP_CRYPT_ERR_KEY_DERIVE;
    }

    return VOP_CRYPT_OK;
}

/**
 * @brief Log a tamper event to NVS for forensic analysis.
 *
 * Records the flash offset, timestamp, and error type. This data
 * survives reboots and can be retrieved for security auditing.
 */
static void log_tamper_event(uint32_t flash_offset, vop_crypt_err_t err)
{
    nvs_handle_t nvs;
    if (nvs_open("vop_security", NVS_READWRITE, &nvs) == ESP_OK) {
        uint32_t count = 0;
        nvs_get_u32(nvs, "tamper_cnt", &count);
        count++;
        nvs_set_u32(nvs, "tamper_cnt", count);

        /* Store last tamper details */
        nvs_set_u32(nvs, "tamper_offset", flash_offset);
        nvs_set_i32(nvs, "tamper_err", (int32_t)err);

        /* Store timestamp (uptime in milliseconds) */
        int64_t uptime_ms = esp_timer_get_time() / 1000;
        nvs_set_i64(nvs, "tamper_time", uptime_ms);

        nvs_commit(nvs);
        nvs_close(nvs);

        ESP_LOGW(TAG, "TAMPER EVENT #%lu at offset 0x%08lX (err=%d)",
                 (unsigned long)count, (unsigned long)flash_offset, (int)err);
    }
}

/* ──────────────────────────────────────────────────────────────
 * Public API Implementation
 * ────────────────────────────────────────────────────────────── */

vop_crypt_err_t vop_crypt_init(vop_crypt_ctx_t *ctx)
{
    if (ctx == NULL) {
        return VOP_CRYPT_ERR_NOT_INIT;
    }

    /* Clear context */
    mbedtls_platform_zeroize(ctx, sizeof(vop_crypt_ctx_t));

    ESP_LOGI(TAG, "Initializing VOP flash encryption engine...");

    /* Step 1: Read master key from eFuse (read-protected block) */
    uint8_t master_key[VOP_AES_KEY_SIZE];
    vop_crypt_err_t ret = read_master_key(master_key);
    if (ret != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Failed to read master key from eFuse");
        mbedtls_platform_zeroize(master_key, sizeof(master_key));
        return ret;
    }

    /* Step 2: Read device unique ID */
    ret = read_device_id(ctx->device_id);
    if (ret != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Failed to read device ID");
        mbedtls_platform_zeroize(master_key, sizeof(master_key));
        return ret;
    }

    /* Step 3: Derive per-device key via HKDF */
    ret = derive_device_key(master_key, ctx->device_id, ctx->device_key);

    /* CRITICAL: Wipe master key from stack immediately */
    mbedtls_platform_zeroize(master_key, sizeof(master_key));

    if (ret != VOP_CRYPT_OK) {
        ESP_LOGE(TAG, "Key derivation failed");
        mbedtls_platform_zeroize(ctx, sizeof(vop_crypt_ctx_t));
        return ret;
    }

    ctx->initialized = true;
    ctx->decrypt_count = 0;
    ctx->tamper_count = 0;

    ESP_LOGI(TAG, "Flash encryption engine initialized (device-unique key derived)");
    return VOP_CRYPT_OK;
}

void vop_crypt_deinit(vop_crypt_ctx_t *ctx)
{
    if (ctx != NULL) {
        ESP_LOGI(TAG, "Destroying encryption context (stats: %lu decrypts, %lu tampers)",
                 (unsigned long)ctx->decrypt_count, (unsigned long)ctx->tamper_count);
        mbedtls_platform_zeroize(ctx, sizeof(vop_crypt_ctx_t));
    }
}

vop_crypt_err_t vop_crypt_decrypt_script(
    vop_crypt_ctx_t *ctx,
    uint32_t flash_offset,
    uint8_t **plaintext,
    size_t *plaintext_len)
{
    if (ctx == NULL || !ctx->initialized) {
        return VOP_CRYPT_ERR_NOT_INIT;
    }
    if (plaintext == NULL || plaintext_len == NULL) {
        return VOP_CRYPT_ERR_NOT_INIT;
    }

    *plaintext = NULL;
    *plaintext_len = 0;

    /* ── Step 1: Read and validate header from external flash ── */
    vop_crypt_header_t header;
    if (vop3_ext_flash_read(flash_offset, &header, sizeof(header)) != 0) {
        ESP_LOGE(TAG, "Flash read failed at offset 0x%08lX", (unsigned long)flash_offset);
        return VOP_CRYPT_ERR_FLASH_READ;
    }

    if (header.magic != VOP_CRYPT_MAGIC) {
        ESP_LOGE(TAG, "Bad magic: 0x%08lX (expected 0x%08lX)",
                 (unsigned long)header.magic, (unsigned long)VOP_CRYPT_MAGIC);
        return VOP_CRYPT_ERR_BAD_MAGIC;
    }

    if (header.version != VOP_CRYPT_VERSION) {
        ESP_LOGE(TAG, "Unsupported version: %u", header.version);
        return VOP_CRYPT_ERR_BAD_VERSION;
    }

    if (header.orig_size > VOP_MAX_SCRIPT_SIZE || header.cipher_size > VOP_MAX_SCRIPT_SIZE) {
        ESP_LOGE(TAG, "Script too large: orig=%lu, cipher=%lu",
                 (unsigned long)header.orig_size, (unsigned long)header.cipher_size);
        return VOP_CRYPT_ERR_BAD_SIZE;
    }

    /* ── Step 2: Allocate PSRAM buffer for ciphertext ── */
    uint8_t *cipher_buf = (uint8_t *)heap_caps_malloc(header.cipher_size, MALLOC_CAP_SPIRAM);
    if (cipher_buf == NULL) {
        ESP_LOGE(TAG, "PSRAM alloc failed for ciphertext (%lu bytes)",
                 (unsigned long)header.cipher_size);
        return VOP_CRYPT_ERR_ALLOC;
    }

    /* ── Step 3: Read ciphertext from external flash ── */
    if (vop3_ext_flash_read(flash_offset + sizeof(header), cipher_buf, header.cipher_size) != 0) {
        ESP_LOGE(TAG, "Flash read failed for ciphertext");
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_FLASH_READ;
    }

    /* ── Step 4: Allocate PSRAM buffer for plaintext ── */
    uint8_t *plain_buf = (uint8_t *)heap_caps_malloc(header.orig_size, MALLOC_CAP_SPIRAM);
    if (plain_buf == NULL) {
        ESP_LOGE(TAG, "PSRAM alloc failed for plaintext (%lu bytes)",
                 (unsigned long)header.orig_size);
        mbedtls_platform_zeroize(cipher_buf, header.cipher_size);
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_ALLOC;
    }

    /* ── Step 5: AES-256-GCM authenticated decryption ── */
    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);

    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES,
                                  ctx->device_key, VOP_AES_KEY_SIZE * 8);
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM setkey failed: -0x%04X", (unsigned)-ret);
        mbedtls_gcm_free(&gcm);
        mbedtls_platform_zeroize(cipher_buf, header.cipher_size);
        heap_caps_free(cipher_buf);
        heap_caps_free(plain_buf);
        return VOP_CRYPT_ERR_DECRYPT;
    }

    /*
     * Additional Authenticated Data (AAD): the header fields before IV/tag.
     * This binds the script_id, flags, and sizes to the ciphertext,
     * preventing an attacker from swapping headers between blobs.
     */
    const size_t aad_len = offsetof(vop_crypt_header_t, iv);

    ret = mbedtls_gcm_auth_decrypt(&gcm,
                                    header.cipher_size,
                                    header.iv, VOP_AES_IV_SIZE,
                                    (const uint8_t *)&header, aad_len,
                                    header.tag, VOP_AES_TAG_SIZE,
                                    cipher_buf,
                                    plain_buf);

    mbedtls_gcm_free(&gcm);

    /* Wipe ciphertext from PSRAM immediately */
    mbedtls_platform_zeroize(cipher_buf, header.cipher_size);
    heap_caps_free(cipher_buf);

    if (ret != 0) {
        ESP_LOGE(TAG, "GCM auth decrypt FAILED at offset 0x%08lX — TAMPER DETECTED!",
                 (unsigned long)flash_offset);
        mbedtls_platform_zeroize(plain_buf, header.orig_size);
        heap_caps_free(plain_buf);
        ctx->tamper_count++;
        log_tamper_event(flash_offset, VOP_CRYPT_ERR_AUTH_FAIL);
        return VOP_CRYPT_ERR_AUTH_FAIL;
    }

    /* ── Step 6: Handle decompression if flagged ── */
    if (header.flags & VOP_CRYPT_FLAG_COMPRESSED) {
        /*
         * LZ4 decompression would go here.
         * For now, this is a placeholder — LZ4 integration is straightforward
         * and reduces flash usage by ~40-60% for typical script files.
         */
        ESP_LOGW(TAG, "Compressed blob — LZ4 decompression not yet implemented");
        /* TODO: Implement LZ4 decompression from plain_buf into a new buffer */
    }

    /* Success */
    *plaintext = plain_buf;
    *plaintext_len = header.orig_size;
    ctx->decrypt_count++;

    ESP_LOGI(TAG, "Decrypted script ID=%lu (%lu bytes) from offset 0x%08lX",
             (unsigned long)header.script_id,
             (unsigned long)header.orig_size,
             (unsigned long)flash_offset);

    return VOP_CRYPT_OK;
}

vop_crypt_err_t vop_crypt_encrypt_and_store(
    vop_crypt_ctx_t *ctx,
    uint32_t flash_offset,
    const uint8_t *plaintext,
    size_t plaintext_len,
    uint32_t script_id,
    uint16_t flags)
{
    if (ctx == NULL || !ctx->initialized) {
        return VOP_CRYPT_ERR_NOT_INIT;
    }
    if (plaintext == NULL || plaintext_len == 0) {
        return VOP_CRYPT_ERR_BAD_SIZE;
    }
    if (plaintext_len > VOP_MAX_SCRIPT_SIZE) {
        return VOP_CRYPT_ERR_BAD_SIZE;
    }

    /* ── Step 1: Build header ── */
    vop_crypt_header_t header = {
        .magic       = VOP_CRYPT_MAGIC,
        .version     = VOP_CRYPT_VERSION,
        .flags       = flags,
        .script_id   = script_id,
        .orig_size   = (uint32_t)plaintext_len,
        .cipher_size = (uint32_t)plaintext_len, /* GCM ciphertext = same size as plaintext */
    };

    /* Generate random IV using hardware RNG */
    esp_fill_random(header.iv, VOP_AES_IV_SIZE);

    /* ── Step 2: Allocate PSRAM for ciphertext ── */
    uint8_t *cipher_buf = (uint8_t *)heap_caps_malloc(plaintext_len, MALLOC_CAP_SPIRAM);
    if (cipher_buf == NULL) {
        ESP_LOGE(TAG, "PSRAM alloc failed for encryption (%lu bytes)",
                 (unsigned long)plaintext_len);
        return VOP_CRYPT_ERR_ALLOC;
    }

    /* ── Step 3: AES-256-GCM encryption ── */
    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);

    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES,
                                  ctx->device_key, VOP_AES_KEY_SIZE * 8);
    if (ret != 0) {
        ESP_LOGE(TAG, "GCM setkey failed: -0x%04X", (unsigned)-ret);
        mbedtls_gcm_free(&gcm);
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_ENCRYPT;
    }

    /* AAD = header fields before IV (binds metadata to ciphertext) */
    const size_t aad_len = offsetof(vop_crypt_header_t, iv);

    ret = mbedtls_gcm_crypt_and_tag(&gcm,
                                     MBEDTLS_GCM_ENCRYPT,
                                     plaintext_len,
                                     header.iv, VOP_AES_IV_SIZE,
                                     (const uint8_t *)&header, aad_len,
                                     plaintext,
                                     cipher_buf,
                                     VOP_AES_TAG_SIZE,
                                     header.tag);

    mbedtls_gcm_free(&gcm);

    if (ret != 0) {
        ESP_LOGE(TAG, "GCM encrypt failed: -0x%04X", (unsigned)-ret);
        mbedtls_platform_zeroize(cipher_buf, plaintext_len);
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_ENCRYPT;
    }

    /* ── Step 4: Erase flash sector(s) before writing ── */
    size_t total_size = sizeof(header) + plaintext_len;
    size_t sectors = (total_size + VOP_FLASH_SECTOR_SIZE - 1) / VOP_FLASH_SECTOR_SIZE;

    for (size_t i = 0; i < sectors; i++) {
        if (vop3_ext_flash_erase_sector(flash_offset + i * VOP_FLASH_SECTOR_SIZE) != 0) {
            ESP_LOGE(TAG, "Flash erase failed at sector %lu", (unsigned long)i);
            mbedtls_platform_zeroize(cipher_buf, plaintext_len);
            heap_caps_free(cipher_buf);
            return VOP_CRYPT_ERR_FLASH_WRITE;
        }
    }

    /* ── Step 5: Write header to flash ── */
    if (vop3_ext_flash_write(flash_offset, &header, sizeof(header)) != 0) {
        ESP_LOGE(TAG, "Flash write failed for header");
        mbedtls_platform_zeroize(cipher_buf, plaintext_len);
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_FLASH_WRITE;
    }

    /* ── Step 6: Write ciphertext to flash ── */
    if (vop3_ext_flash_write(flash_offset + sizeof(header), cipher_buf, plaintext_len) != 0) {
        ESP_LOGE(TAG, "Flash write failed for ciphertext");
        mbedtls_platform_zeroize(cipher_buf, plaintext_len);
        heap_caps_free(cipher_buf);
        return VOP_CRYPT_ERR_FLASH_WRITE;
    }

    /* Wipe ciphertext from PSRAM */
    mbedtls_platform_zeroize(cipher_buf, plaintext_len);
    heap_caps_free(cipher_buf);

    ESP_LOGI(TAG, "Encrypted and stored script ID=%lu (%lu bytes) at offset 0x%08lX",
             (unsigned long)script_id, (unsigned long)plaintext_len,
             (unsigned long)flash_offset);

    return VOP_CRYPT_OK;
}

void vop_crypt_free_plaintext(uint8_t *plaintext, size_t plaintext_len)
{
    if (plaintext != NULL) {
        mbedtls_platform_zeroize(plaintext, plaintext_len);
        heap_caps_free(plaintext);
    }
}

vop_crypt_err_t vop_crypt_validate_header(
    uint32_t flash_offset,
    vop_crypt_header_t *header)
{
    if (header == NULL) {
        return VOP_CRYPT_ERR_NOT_INIT;
    }

    if (vop3_ext_flash_read(flash_offset, header, sizeof(*header)) != 0) {
        return VOP_CRYPT_ERR_FLASH_READ;
    }

    if (header->magic != VOP_CRYPT_MAGIC) {
        return VOP_CRYPT_ERR_BAD_MAGIC;
    }

    if (header->version != VOP_CRYPT_VERSION) {
        return VOP_CRYPT_ERR_BAD_VERSION;
    }

    if (header->orig_size > VOP_MAX_SCRIPT_SIZE || header->cipher_size > VOP_MAX_SCRIPT_SIZE) {
        return VOP_CRYPT_ERR_BAD_SIZE;
    }

    return VOP_CRYPT_OK;
}

const char *vop_crypt_err_str(vop_crypt_err_t err)
{
    switch (err) {
        case VOP_CRYPT_OK:              return "OK";
        case VOP_CRYPT_ERR_NOT_INIT:    return "Engine not initialized";
        case VOP_CRYPT_ERR_BAD_MAGIC:   return "Invalid magic in header";
        case VOP_CRYPT_ERR_BAD_VERSION: return "Unsupported format version";
        case VOP_CRYPT_ERR_BAD_SIZE:    return "Script exceeds max size";
        case VOP_CRYPT_ERR_AUTH_FAIL:   return "GCM auth failed — TAMPERED";
        case VOP_CRYPT_ERR_EFUSE_READ:  return "eFuse read failed";
        case VOP_CRYPT_ERR_KEY_DERIVE:  return "Key derivation failed";
        case VOP_CRYPT_ERR_ENCRYPT:     return "Encryption failed";
        case VOP_CRYPT_ERR_DECRYPT:     return "Decryption failed";
        case VOP_CRYPT_ERR_FLASH_READ:  return "External flash read error";
        case VOP_CRYPT_ERR_FLASH_WRITE: return "External flash write error";
        case VOP_CRYPT_ERR_ALLOC:       return "PSRAM allocation failed";
        case VOP_CRYPT_ERR_COMPRESSED:  return "LZ4 decompression failed";
        default:                        return "Unknown error";
    }
}

void vop_crypt_get_stats(
    const vop_crypt_ctx_t *ctx,
    uint32_t *decrypt_count,
    uint32_t *tamper_count)
{
    if (ctx != NULL && ctx->initialized) {
        if (decrypt_count) *decrypt_count = ctx->decrypt_count;
        if (tamper_count)  *tamper_count  = ctx->tamper_count;
    }
}
