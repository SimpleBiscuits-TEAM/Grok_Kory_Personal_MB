"""USB–CAN bridge binary framing (magic 0x55 0xAA, CRC16-CCITT over type..payload)."""

from __future__ import annotations

import struct
from typing import Iterator, Tuple

MAGIC = b"\x55\xAA"

TYPE_CAN_TX = 0x01
TYPE_CAN_RX = 0x02
TYPE_CMD = 0x10
TYPE_ACK = 0x11
TYPE_NACK = 0x12

TYPE_IDENTITY_WRITE_START = 0x30
TYPE_IDENTITY_WRITE_CONT = 0x31
TYPE_IDENTITY_READ_REQ = 0x32
TYPE_IDENTITY_READ_DATA = 0x33

TYPE_EFUSE_WRITE_START = 0x34
TYPE_EFUSE_WRITE_CONT = 0x35

FLAG_EXTD = 1 << 0
FLAG_RTR = 1 << 1
FLAG_EFUSE_SIMULATE = 1 << 2
FLAG_IDENTITY_WINBOND = 1 << 3
FLAG_IDENTITY_CRC_OK = 1 << 4

W25_IDENTITY_STRUCT_BYTES = 68
EFUSE_NAME_BYTES = 24


def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def build_packet(pkt_type: int, flags: int, can_id: int, data: bytes) -> bytes:
    if data is None:
        data = b""
    if len(data) > 8:
        raise ValueError("DLC must be <= 8 for Classic CAN framing")
    dlc = len(data)
    header = struct.pack("<2sBBIB", MAGIC, pkt_type, flags, can_id & 0xFFFFFFFF, dlc)
    body = header[2:] + data
    crc = crc16_ccitt(body)
    return header + data + struct.pack("<H", crc)


def iter_frames_from_buffer(buf: bytearray) -> Iterator[Tuple[int, int, int, bytes]]:
    """Yields (pkt_type, flags, can_id, data) and removes consumed bytes from buf."""
    while True:
        mi = buf.find(MAGIC)
        if mi < 0:
            buf.clear()
            return
        if mi > 0:
            del buf[:mi]

        if len(buf) < 9:
            return

        _, pkt_type, flags, can_id, dlc = struct.unpack_from("<2sBBIB", buf, 0)
        if dlc > 8:
            dlc = 8

        frame_len = 9 + dlc + 2
        if len(buf) < frame_len:
            return

        frame = bytes(buf[:frame_len])
        del buf[:frame_len]

        rx_crc = struct.unpack_from("<H", frame, frame_len - 2)[0]
        calc = crc16_ccitt(frame[2 : frame_len - 2])
        if rx_crc != calc:
            continue

        data = frame[9 : 9 + dlc]
        yield pkt_type, flags, can_id, data
