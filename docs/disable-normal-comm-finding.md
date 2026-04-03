# DisableNormalCommunication (0x28) — Key Finding

From GMLAN spec (GMW3110):
> "The purpose of this service is to prevent a device from transmitting or receiving all messages 
> which are **not the direct result of a diagnostic request**."

This means:
- 0x28 does NOT block diagnostic responses (UDS/GMLAN requests and responses still work)
- 0x28 only blocks normal CAN traffic (periodic messages, status broadcasts, etc.)
- Security access (0x27) SHOULD work after 0x28

From pcmhacking.net (real GM ECU flashing):
- Session (0x10 0x03) → DisableNormalComm (0x28) → Security (0x27) — this sequence WORKS
- First seed request can fail, but retrying after 30s succeeds

## Conclusion
DisableNormalCommunication is NOT the cause of our timeout. The real issue is likely:
1. ProgrammingMode A5 01/A5 03 changes ECU state
2. TesterPresent keepalive may be interfering with response capture
3. The ECU may need more settling time after A5 03
4. Or the bridge/WebSocket is dropping frames

## Best Fix Strategy
Since PRE_CHECK already has security access GRANTED, skip the SECURITY_ACCESS phase entirely.
The ECU is already unlocked — proceed directly to PRE_FLASH (RequestDownload 0x34).
