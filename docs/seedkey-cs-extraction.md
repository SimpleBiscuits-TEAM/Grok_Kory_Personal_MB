# Seed_key.cs Algorithm Extraction

## GM_5B (AES-128-ECB) ECUs

All use `ComputeSeed2Key`: 5-byte seed → pad with 0xFF to 16 bytes (seed at offset 0x0B-0x0F) → AES-128-ECB encrypt → take first 5 bytes.

| ECU | AES Key (hex) |
|-----|---------------|
| E41 | 45 AE 6B A2 CB 81 F5 65 6B 05 07 2D 74 FF 47 E0 |
| E83 | 1F FA 31 25 94 11 A0 E6 F2 CA 9D C6 98 14 DB 97 |
| E78 | 1F FA 31 25 94 11 A0 E6 F2 CA 9D C6 98 14 DB 97 |
| E39/E39A | F4 56 F4 16 AA DE 19 15 24 51 84 75 13 4E 01 0E |
| E46 | CB FE 2A 30 69 53 F8 F9 32 AA F7 AC 68 28 A5 D7 |
| E88/E90/E99 | 32 43 85 D3 A0 70 4D A2 92 62 20 B3 F9 CC E0 0A |
| E92 | 8F 1D 7E 62 A7 D6 CF 4E A6 07 1C 3A 32 A4 20 F0 |
| E80 | E1 CA F8 B2 A1 90 60 A5 EA 21 1F 13 0A C2 C2 15 |
| E98 | 7D FB 24 44 A2 46 06 19 3D 2C 67 9F 0D D4 42 AD |
| T87/T87A/TCUT87/TCUT87A | DF 7F 64 D2 DD DA C1 A1 8F 1B 4D 4A 19 16 10 F9 |

Note: E83, E78, E39, E46, E92, E80, E88, E98, T87 also have GM_2B fallback for 2-byte seeds.

## GM_2B (DLL-based) ECUs

Uses `SetSeedAndGetKey(seed16, AlgoType, &result)` from `dllsecurity.dll`.

| ECU | AlgoType | Invert | Reverse result |
|-----|----------|--------|----------------|
| E83 (2B fallback) | 0x3DE | true | yes |
| E78 (2B fallback) | 0x3DB | true | yes |
| E35A/E35B | 0x376 | true | yes |
| E67 | 0x389 | true | no |
| E39/E39A (2B fallback) | 0xDB | true | yes |
| E86 | 0x402 | true | yes |
| E88/E90/E99 (2B fallback) | 0x42B | true | yes |
| E98 (2B fallback) | 0x42B | true | yes |
| E92 (2B fallback) | 0x401 | true | yes |
| E80 (2B fallback) | 0x43D | true | yes |
| T76 | 0xC5 | true | no |
| AF40 | 0x2F | true | yes |
| T43 | 0x384 | true | no |
| T87 (2B fallback) | 0x439 | true | yes |
| ME762/ME763/ME96 | 0xB | false | no |
| ME764/ME961 | 0x3F0 | true | yes |
| EDC17C18/C19/C59/CP47 | 0xE3 | false | no |

## Notes
- GM_5B seed must be 5 bytes, last byte should be 0x06
- GM_2B uses native DLL — cannot run in browser, need JS reimplementation
- E83/E78 share the same AES key
- T87 has EFILive lock detection with alternate key calculation
