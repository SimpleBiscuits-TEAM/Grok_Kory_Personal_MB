# $0281 Fix Notes

## From EFI Live Error Codes PDF (official document by Paul Blackmore, EFILive Limited)

### $0281 - OBD Error Code (in the $0280..$02FF range = "OBD Error Codes")

**Error:** $0281
**Description:** No data received
**Cause:** FlashScan or AutoCal did not receive valid data from the connected vehicle.
**Action:**
- Check all cables and connections.
- Make sure ignition is turned on to the run position.
- Make sure the vehicle is supported by EFILive.

### Key: This is a COMMUNICATION error, NOT a memory/BBX/configuration error.

The $0280-$02FF range is specifically "OBD Error Codes" — these are about the OBD communication link between the device and the vehicle's ECM/TCM.

### From user's instructions for 2001-2005 Duramax (E54/E60/AL5):
- Very common on these trucks due to busy CANbus with constant background chatter
- Causes: aftermarket electronics, foreign tuning, ECM internal issues
- Fix steps:
  1. Disconnect aftermarket electronics
  2. Ensure only AutoCal/flashing device connected to OBD port
  3. Pull fuses:
     - LB7 (E54): Radio, Radio AMP, INFO, SEO1, SEO2
     - LLY (E60): INFO, RADIO, RADIO AMP, TBC BATT, TBC IGNITION
  4. If still fails: try passthrough mode with EFI Live software + Windows laptop
  5. If still fails: contact PPEI support directly
