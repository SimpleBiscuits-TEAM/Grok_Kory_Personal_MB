Based on the provided video, here is a summary of the IDA Pro workflow for decompiling a Nissan ECU ROM, specifically focusing on the requested points:

**1) How the binary is loaded into IDA Pro**
*   The raw `.bin` file is dragged into IDA Pro.
*   The processor type is manually set to **Renesas SH-4 (big endian) [SH4B]**.
*   A custom device name is selected (in this case, `SH7058_1000`) from a custom configuration file. This step is crucial as it loads predefined interrupt vectors and peripheral registers specific to this ECU.
*   During the loading options, the RAM section is manually created. For this specific chip, the start address is set to `0xFFFF0000` with a size of `0xFFFE` (the user notes using `FFFE` instead of `FFFF` to avoid an IDA bug regarding invalid addresses).

**2) How the processor architecture is identified**
*   The architecture is identified *before* loading the file into IDA Pro.
*   The user runs a custom command-line tool called `nisrom` against the binary file.
*   This tool analyzes the ROM and outputs key information, including the specific CPU type (identified as **7058** / SH7058), the ROM size (1MB), and the location of the secondary interrupt vector table.

**3) How calibration maps and tables are found**
*   *Note: The video specifically demonstrates finding "Call Tables" (arrays of function pointers executed by the ECU), rather than engine calibration maps (like fuel or ignition).*
*   To find these tables, the user traces the execution path starting from the main periodic timer interrupt (specifically `ATU31_IMI3A`).
*   They navigate to the very end of this timer interrupt function and follow a branch (`BSR`) instruction.
*   This leads to a function containing multiple loops. By analyzing the assembly, the user identifies that these loops are designed to load a counter, grab a pointer from a list, jump to that subroutine, increment the address, and repeat. The addresses referenced by these loops are the Call Tables.

**4) How addresses are resolved**
*   **Vector Base Register (VBR):** The primary reset vector is always at address `0x00000000`. By looking at the instructions immediately following the power-on reset, the user finds an `LDC` (Load Control Register) instruction that changes the VBR to a new address (e.g., `0x1000`).
*   **Call Table Resolution:** Addresses for the call tables are resolved by looking at the registers loaded immediately prior to the execution loops. The code loads the start address of the table into a register, and the loop uses `JSR` (Jump to Subroutine) to execute the address stored at that pointer.

**5) How data types are identified**
*   Data types are largely identified and formatted manually by the user once the structure is understood.
*   When a raw hex address is identified as a pointer in a call table, the user presses `O` to define it as an **Offset**.
*   The user then navigates to that offset and presses `P` to define the destination as a **Procedure/Subroutine**.
*   To clean up the view of the call tables, the user highlights the data and uses the **Convert to Array** tool, setting the element size to 4 bytes (since they are 32-bit pointers) to format the raw data into a readable list of function pointers.

**6) Any specific techniques for Nissan/Bosch ECU reverse engineering**
*   *The video focuses exclusively on Nissan techniques (Renesas SH processors), not Bosch.*
*   **Secondary Vector Tables:** A specific technique used in Nissan ROMs is that they do not rely solely on the primary interrupt vector table at address `0x0`. Shortly after the power-on reset, the code explicitly changes the Vector Base Register (VBR) to point to a secondary table (often at `0x1000` or `0x800`).
*   **Timer Interrupt Call Tables:** Nissan ECUs heavily rely on a specific timer interrupt (`ATU31_IMI3A`) that triggers periodically. This interrupt acts as a master scheduler, looping through massive arrays of function pointers (Call Tables) to execute various ECU tasks sequentially.

**7) Key IDA Pro settings and plugins used**
*   **Processor Setting:** `Renesas SH-4 (big endian) [SH4B]`.
*   **Custom Device Files:** The user utilizes a custom file (pulled from their GitHub repository) that defines the interrupt vectors and peripheral registers for various SH705x variants, as IDA does not have these built-in.
*   **Custom IDC Script (`calltable.idc`):** Because manually defining hundreds of subroutines inside the call tables is tedious, the user runs a custom IDC script. They input the number of entries in a specific table, and the script automatically loops through the hex data, defining offsets and creating subroutines for each entry.