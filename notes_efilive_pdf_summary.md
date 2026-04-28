# EFI Live Error Codes PDF Summary

## Key $0281 Entry (OBD Error Codes section, page 22)
- **Code:** $0281
- **Description:** "No data received"
- **Cause:** "FlashScan or AutoCal did not receive valid data from the connected vehicle."
- **Action:** "Check all cables and connections. Make sure ignition is turned on to the run position. Make sure the vehicle is supported by EFILive."

## This is NOT:
- A UDS NRC code
- A DTC/diagnostic trouble code
- A BBX configuration issue
- An internal memory issue
- A "Format CONFIG" issue

## It IS:
- An OBD communication error ($0280-$02FF range)
- The device tried to talk to the vehicle and got no response
- Generic EFI Live fix: check cables, ignition on, vehicle supported

## PPEI-specific addition for 01-05 Duramax:
- E54 (LB7), E60 (LLY), AL5 (Allison) controllers
- CAN bus background chatter interrupts communication
- Aftermarket electronics, foreign tuning, internal ECM issues
- Fuse pull instructions specific to LB7 vs LLY
- Passthrough mode fallback
- Escalation to PPEI live support

## Error Code Categories in PDF:
- USB driver ($0001-$001F)
- HAPI ($0020-$007F)
- Boot ($0080-$00BF)
- Flash Memory ($00C0-$00CF)
- Operating System ($00D0-$00FF)
- USB ($0100-$017F)
- FAT32 ($0180-$01FF)
- File Transfer ($0200-$027F)
- **OBD ($0280-$02FF)** ← $0281 is here
- Controller ($0300-$03FF)
- SD Card ($0400-$047F)
- Black Box ($0480-$04FF)
- Reading/Flashing ($0500-$05FF) ← $0502 is here
- Reading/Flashing ($0600-$06FF)
- Scanning ($0700-$07FF)
- Lua ($0800-$09FF)
- BBX Config ($0A00-$0A7F)
- Internal ($0A80-$0AFF)
- Cryptographic ($0B00-$0B7F)
