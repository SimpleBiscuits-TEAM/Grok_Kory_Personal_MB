# GMW3110 DisableNormalCommunication ($28) — Key Findings

## From Scribd search results (GMW3110 document, page 137+):

1. **"are disabled with the ($28) DisableNormalCommunications service, and a programming session is..."**
   - Confirms DisableNormalCommunication is used in conjunction with programming session

2. **"8.9 DisableNormalCommunication ($28) Service. The purpose of this service..."**
   - This is the main section describing the service

3. **"Table 109: DisableNormalCommunication Request Message..."**
   - Request format documentation

4. **Key insight from Reddit thread**: "Critical messages may still be sent. The goal of this service is to reduce messages for Reflashing but it shouldn't disrupt important messages other controllers require."
   - This means DisableNormalCommunication should NOT block diagnostic responses
   - It only disables NORMAL (non-diagnostic) CAN traffic
   - Diagnostic USDT responses should still work!

## Implications for our issue

If DisableNormalCommunication only disables normal CAN traffic (not diagnostic responses), then the ECU SHOULD still respond to USDT commands after the broadcast. The fact that it doesn't respond suggests:

1. **ProgrammingMode ($A5) is the real culprit** — A5 01 (Enable) + A5 03 (Complete) may put the ECU in a state where it only accepts commands via the bootloader, possibly on different CAN IDs
2. **The ECU may have rebooted into bootloader** after A5 03 — bootloader may use different CAN IDs
3. **Timing issue** — the ECU may need more time after A5 03 to become responsive
4. **The ECU may require a specific wake-up sequence** after ProgrammingMode Complete

## Critical question: Does ProgrammingMode ($A5) change the ECU's CAN ID?

Some GM ECUs switch to bootloader CAN IDs after ProgrammingMode. For example:
- Application mode: TX=0x7E0, RX=0x7E8
- Bootloader mode: TX=0x241, RX=0x641 (or similar)

Need to check E41/L5P specific bootloader CAN IDs.
