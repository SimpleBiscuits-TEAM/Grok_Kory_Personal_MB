#!/usr/bin/env python3
"""
VOP 3.0 Flash Script Encryption Tool (Host-Side)

Encrypts flash scripts and calibration files for deployment to VOP 3.0 boards.
Produces encrypted blobs that can be written to the Winbond 25Q256FVE6 external
flash or delivered via OTA.

Two encryption modes:
  1. DEVICE-BOUND: Encrypts for a specific board using its device ID + master key.
     The blob can only be decrypted by that one board.
  2. UNIVERSAL: Encrypts with master key only (no device ID salt).
     Any provisioned VOP 3.0 board can decrypt it. Used for OTA distribution
     where the board re-encrypts with its device key on receipt.

Usage:
  # Encrypt a flash script for a specific device
  python vop_encrypt_script.py encrypt \\
      --input script.vopscript \\
      --output script.vopenc \\
      --master-key keys/master.key \\
      --device-id A1B2C3D4... \\
      --script-id 42 \\
      --type script

  # Encrypt for universal OTA distribution
  python vop_encrypt_script.py encrypt \\
      --input script.vopscript \\
      --output script.vopenc \\
      --master-key keys/master.key \\
      --universal \\
      --script-id 42

  # Decrypt (for testing/verification only)
  python vop_encrypt_script.py decrypt \\
      --input script.vopenc \\
      --output script_decrypted.vopscript \\
      --master-key keys/master.key \\
      --device-id A1B2C3D4...

  # Generate a new master key
  python vop_encrypt_script.py genkey --output keys/master.key

  # Inspect an encrypted blob header
  python vop_encrypt_script.py inspect --input script.vopenc

Copyright (c) 2026 VOP / SimpleBiscuits. All rights reserved.
PROPRIETARY AND CONFIDENTIAL — Do not distribute.
"""

import argparse
import hashlib
import hmac
import os
import struct
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
except ImportError:
    print("ERROR: 'cryptography' package required. Install with:")
    print("  pip install cryptography")
    sys.exit(1)

# ──────────────────────── Constants ────────────────────────

MAGIC = 0x03524356          # "VCR\x03" — VOP Crypt v3
VERSION = 0x0001
HEADER_SIZE = 48            # bytes
AES_KEY_SIZE = 32           # AES-256
IV_SIZE = 12                # GCM nonce
TAG_SIZE = 16               # GCM auth tag
MAX_SCRIPT_SIZE = 2 * 1024 * 1024  # 2MB
HKDF_INFO = b"VOP3-FlashCrypt-v1"

# Flag definitions
FLAG_SCRIPT     = 1 << 0
FLAG_CALDATA    = 1 << 1
FLAG_FIRMWARE   = 1 << 2
FLAG_COMPRESSED = 1 << 3
FLAG_DEVICE_LOCK = 1 << 4

FLAG_MAP = {
    "script":   FLAG_SCRIPT,
    "caldata":  FLAG_CALDATA,
    "firmware": FLAG_FIRMWARE,
}


# ──────────────────────── Header Packing ────────────────────────

def pack_header(flags, script_id, orig_size, cipher_size, iv, tag):
    """Pack a VOP encrypted blob header (48 bytes, little-endian)."""
    return struct.pack(
        "<IHHIII12s16s",
        MAGIC,
        VERSION,
        flags,
        script_id,
        orig_size,
        cipher_size,
        iv,
        tag,
    )


def unpack_header(data):
    """Unpack a VOP encrypted blob header. Returns dict or raises ValueError."""
    if len(data) < HEADER_SIZE:
        raise ValueError(f"Header too short: {len(data)} bytes (need {HEADER_SIZE})")

    magic, version, flags, script_id, orig_size, cipher_size, iv, tag = struct.unpack(
        "<IHHIII12s16s", data[:HEADER_SIZE]
    )

    if magic != MAGIC:
        raise ValueError(f"Bad magic: 0x{magic:08X} (expected 0x{MAGIC:08X})")

    if version != VERSION:
        raise ValueError(f"Unsupported version: {version} (expected {VERSION})")

    return {
        "magic": magic,
        "version": version,
        "flags": flags,
        "script_id": script_id,
        "orig_size": orig_size,
        "cipher_size": cipher_size,
        "iv": iv,
        "tag": tag,
    }


# ──────────────────────── Key Derivation ────────────────────────

def derive_device_key(master_key: bytes, device_id: str) -> bytes:
    """
    Derive a per-device AES-256 key using HKDF-SHA256.

    Mirrors the firmware's derive_device_key() function exactly:
      HKDF(IKM=master_key, salt=SHA256(device_id_hex), info="VOP3-FlashCrypt-v1")

    The device_id is the hex string of the SHA-256 hash of the raw eFuse block.
    """
    # Convert hex device ID to bytes (this is the SHA-256 of raw eFuse)
    device_id_bytes = bytes.fromhex(device_id)
    if len(device_id_bytes) != 32:
        raise ValueError(f"Device ID must be 32 bytes (64 hex chars), got {len(device_id_bytes)}")

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=AES_KEY_SIZE,
        salt=device_id_bytes,
        info=HKDF_INFO,
    )
    return hkdf.derive(master_key)


def derive_universal_key(master_key: bytes) -> bytes:
    """
    Derive a universal encryption key (not device-bound).

    Uses a fixed salt so any provisioned board can derive the same key
    from the shared master key. The board then re-encrypts with its
    device-unique key upon receipt.
    """
    universal_salt = hashlib.sha256(b"VOP3-Universal-Transport-Key").digest()

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=AES_KEY_SIZE,
        salt=universal_salt,
        info=HKDF_INFO,
    )
    return hkdf.derive(master_key)


# ──────────────────────── Encrypt / Decrypt ────────────────────────

def encrypt_script(
    plaintext: bytes,
    key: bytes,
    script_id: int,
    flags: int,
) -> bytes:
    """
    Encrypt a flash script using AES-256-GCM.

    Returns the complete encrypted blob (header + ciphertext).
    The AAD (Additional Authenticated Data) is the header fields
    before the IV, binding metadata to the ciphertext.
    """
    if len(plaintext) > MAX_SCRIPT_SIZE:
        raise ValueError(f"Script too large: {len(plaintext)} bytes (max {MAX_SCRIPT_SIZE})")

    # Generate random IV
    iv = os.urandom(IV_SIZE)

    # Build AAD from header fields (everything before IV)
    aad = struct.pack("<IHHIII", MAGIC, VERSION, flags, script_id, len(plaintext), len(plaintext))

    # AES-256-GCM encrypt
    aesgcm = AESGCM(key)
    ciphertext_and_tag = aesgcm.encrypt(iv, plaintext, aad)

    # cryptography library appends the 16-byte tag to ciphertext
    ciphertext = ciphertext_and_tag[:-TAG_SIZE]
    tag = ciphertext_and_tag[-TAG_SIZE:]

    # Pack complete blob
    header = pack_header(flags, script_id, len(plaintext), len(ciphertext), iv, tag)
    return header + ciphertext


def decrypt_script(blob: bytes, key: bytes) -> tuple:
    """
    Decrypt a VOP encrypted blob.

    Returns (plaintext, header_dict).
    Raises ValueError on auth failure (tamper detection).
    """
    header = unpack_header(blob)
    ciphertext = blob[HEADER_SIZE : HEADER_SIZE + header["cipher_size"]]

    if len(ciphertext) != header["cipher_size"]:
        raise ValueError(
            f"Ciphertext truncated: {len(ciphertext)} bytes (expected {header['cipher_size']})"
        )

    # Reconstruct AAD
    aad = struct.pack(
        "<IHHIII",
        header["magic"],
        header["version"],
        header["flags"],
        header["script_id"],
        header["orig_size"],
        header["cipher_size"],
    )

    # AES-256-GCM decrypt (cryptography lib expects ciphertext + tag concatenated)
    aesgcm = AESGCM(key)
    ciphertext_and_tag = ciphertext + header["tag"]

    try:
        plaintext = aesgcm.decrypt(header["iv"], ciphertext_and_tag, aad)
    except Exception as e:
        raise ValueError(f"AUTHENTICATION FAILED — blob has been tampered with! ({e})")

    if len(plaintext) != header["orig_size"]:
        raise ValueError(
            f"Size mismatch: decrypted {len(plaintext)} bytes, header says {header['orig_size']}"
        )

    return plaintext, header


# ──────────────────────── CLI Commands ────────────────────────

def cmd_genkey(args):
    """Generate a new 256-bit master key."""
    key = os.urandom(AES_KEY_SIZE)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(key)
    print(f"Generated {AES_KEY_SIZE * 8}-bit master key: {output}")
    print(f"  Hex: {key.hex()}")
    print()
    print("CRITICAL: Store this key securely! It must be burned into every")
    print("VOP 3.0 board's eFuse during manufacturing provisioning.")
    print("If lost, all encrypted scripts become permanently inaccessible.")


def cmd_encrypt(args):
    """Encrypt a flash script."""
    # Load master key
    master_key = Path(args.master_key).read_bytes()
    if len(master_key) != AES_KEY_SIZE:
        print(f"ERROR: Master key must be {AES_KEY_SIZE} bytes, got {len(master_key)}")
        sys.exit(1)

    # Derive encryption key
    if args.universal:
        key = derive_universal_key(master_key)
        print("Mode: UNIVERSAL (any provisioned board can decrypt)")
    else:
        if not args.device_id:
            print("ERROR: --device-id required for device-bound encryption")
            print("       Use --universal for OTA distribution")
            sys.exit(1)
        key = derive_device_key(master_key, args.device_id)
        print(f"Mode: DEVICE-BOUND (device {args.device_id[:16]}...)")

    # Load plaintext
    plaintext = Path(args.input).read_bytes()
    print(f"Input: {args.input} ({len(plaintext)} bytes)")

    # Determine flags
    flags = FLAG_MAP.get(args.type, FLAG_SCRIPT)
    if not args.universal:
        flags |= FLAG_DEVICE_LOCK

    # Encrypt
    blob = encrypt_script(plaintext, key, args.script_id, flags)

    # Write output
    Path(args.output).write_bytes(blob)
    print(f"Output: {args.output} ({len(blob)} bytes)")
    print(f"  Script ID: {args.script_id}")
    print(f"  Flags: 0x{flags:04X}")
    print(f"  Overhead: {len(blob) - len(plaintext)} bytes (header + tag)")
    print(f"  Encryption: AES-256-GCM")
    print("  Status: SUCCESS")


def cmd_decrypt(args):
    """Decrypt a flash script (testing/verification only)."""
    master_key = Path(args.master_key).read_bytes()
    if len(master_key) != AES_KEY_SIZE:
        print(f"ERROR: Master key must be {AES_KEY_SIZE} bytes")
        sys.exit(1)

    blob = Path(args.input).read_bytes()
    header = unpack_header(blob)

    # Determine key based on flags
    if header["flags"] & FLAG_DEVICE_LOCK:
        if not args.device_id:
            print("ERROR: Blob is device-locked, --device-id required")
            sys.exit(1)
        key = derive_device_key(master_key, args.device_id)
    else:
        key = derive_universal_key(master_key)

    try:
        plaintext, hdr = decrypt_script(blob, key)
    except ValueError as e:
        print(f"DECRYPTION FAILED: {e}")
        sys.exit(1)

    Path(args.output).write_bytes(plaintext)
    print(f"Decrypted: {args.output} ({len(plaintext)} bytes)")
    print(f"  Script ID: {hdr['script_id']}")
    print("  Integrity: VERIFIED (GCM tag valid)")


def cmd_inspect(args):
    """Inspect an encrypted blob header without decrypting."""
    blob = Path(args.input).read_bytes()

    try:
        header = unpack_header(blob)
    except ValueError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    print(f"VOP Encrypted Blob: {args.input}")
    print(f"  Total size:    {len(blob)} bytes")
    print(f"  Magic:         0x{header['magic']:08X} (VCR\\x03)")
    print(f"  Version:       {header['version']}")
    print(f"  Script ID:     {header['script_id']}")
    print(f"  Original size: {header['orig_size']} bytes")
    print(f"  Cipher size:   {header['cipher_size']} bytes")
    print(f"  IV:            {header['iv'].hex()}")
    print(f"  GCM Tag:       {header['tag'].hex()}")

    # Decode flags
    flags = header["flags"]
    flag_names = []
    if flags & FLAG_SCRIPT:      flag_names.append("SCRIPT")
    if flags & FLAG_CALDATA:     flag_names.append("CALDATA")
    if flags & FLAG_FIRMWARE:    flag_names.append("FIRMWARE")
    if flags & FLAG_COMPRESSED:  flag_names.append("COMPRESSED")
    if flags & FLAG_DEVICE_LOCK: flag_names.append("DEVICE_LOCK")
    print(f"  Flags:         0x{flags:04X} [{', '.join(flag_names) or 'NONE'}]")

    # Verify ciphertext length
    expected = HEADER_SIZE + header["cipher_size"]
    if len(blob) < expected:
        print(f"  WARNING: Blob truncated! Expected {expected} bytes, got {len(blob)}")
    elif len(blob) > expected:
        padding = len(blob) - expected
        print(f"  Padding:       {padding} bytes (sector alignment)")


def cmd_batch(args):
    """Batch encrypt all scripts in a directory."""
    master_key = Path(args.master_key).read_bytes()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    extensions = {".vopscript", ".voptune", ".vopfw"}
    type_map = {".vopscript": "script", ".voptune": "caldata", ".vopfw": "firmware"}

    if args.universal:
        key = derive_universal_key(master_key)
    else:
        if not args.device_id:
            print("ERROR: --device-id required for device-bound encryption")
            sys.exit(1)
        key = derive_device_key(master_key, args.device_id)

    script_id = args.start_id
    count = 0

    for filepath in sorted(input_dir.iterdir()):
        if filepath.suffix.lower() not in extensions:
            continue

        plaintext = filepath.read_bytes()
        ftype = type_map.get(filepath.suffix.lower(), "script")
        flags = FLAG_MAP.get(ftype, FLAG_SCRIPT)
        if not args.universal:
            flags |= FLAG_DEVICE_LOCK

        blob = encrypt_script(plaintext, key, script_id, flags)

        out_path = output_dir / (filepath.stem + ".vopenc")
        out_path.write_bytes(blob)

        print(f"  [{script_id:04d}] {filepath.name} → {out_path.name} "
              f"({len(plaintext)} → {len(blob)} bytes)")

        script_id += 1
        count += 1

    print(f"\nBatch complete: {count} files encrypted (IDs {args.start_id}–{script_id - 1})")


# ──────────────────────── Main ────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="VOP 3.0 Flash Script Encryption Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # genkey
    p_genkey = subparsers.add_parser("genkey", help="Generate a new master key")
    p_genkey.add_argument("--output", "-o", required=True, help="Output key file path")

    # encrypt
    p_enc = subparsers.add_parser("encrypt", help="Encrypt a flash script")
    p_enc.add_argument("--input", "-i", required=True, help="Input plaintext file")
    p_enc.add_argument("--output", "-o", required=True, help="Output encrypted blob")
    p_enc.add_argument("--master-key", "-k", required=True, help="Master key file")
    p_enc.add_argument("--device-id", "-d", help="Device ID (64 hex chars)")
    p_enc.add_argument("--universal", "-u", action="store_true", help="Universal mode")
    p_enc.add_argument("--script-id", "-s", type=int, default=0, help="Script ID")
    p_enc.add_argument("--type", "-t", choices=["script", "caldata", "firmware"],
                       default="script", help="Content type")

    # decrypt
    p_dec = subparsers.add_parser("decrypt", help="Decrypt a blob (testing only)")
    p_dec.add_argument("--input", "-i", required=True, help="Input encrypted blob")
    p_dec.add_argument("--output", "-o", required=True, help="Output plaintext file")
    p_dec.add_argument("--master-key", "-k", required=True, help="Master key file")
    p_dec.add_argument("--device-id", "-d", help="Device ID (64 hex chars)")

    # inspect
    p_insp = subparsers.add_parser("inspect", help="Inspect blob header")
    p_insp.add_argument("--input", "-i", required=True, help="Encrypted blob file")

    # batch
    p_batch = subparsers.add_parser("batch", help="Batch encrypt a directory")
    p_batch.add_argument("--input-dir", required=True, help="Input directory")
    p_batch.add_argument("--output-dir", required=True, help="Output directory")
    p_batch.add_argument("--master-key", "-k", required=True, help="Master key file")
    p_batch.add_argument("--device-id", "-d", help="Device ID (64 hex chars)")
    p_batch.add_argument("--universal", "-u", action="store_true", help="Universal mode")
    p_batch.add_argument("--start-id", type=int, default=1, help="Starting script ID")

    args = parser.parse_args()

    commands = {
        "genkey": cmd_genkey,
        "encrypt": cmd_encrypt,
        "decrypt": cmd_decrypt,
        "inspect": cmd_inspect,
        "batch": cmd_batch,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
