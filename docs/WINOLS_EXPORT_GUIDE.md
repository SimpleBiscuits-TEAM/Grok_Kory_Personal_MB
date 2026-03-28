# WinOLS Export Guide for VOP

This guide explains how to export maps and binaries from WinOLS projects for use in the VOP (Vehicle Operations Platform) decompiler.

## What is a WinOLS Project?

A WinOLS project (.ols file) is a binary container that includes:
- **Metadata**: Vehicle, ECU, software version information
- **Binary**: The raw ECU firmware (typically 1-4MB)
- **Maps**: Calibration data definitions with addresses and metadata
- **Annotations**: User notes and descriptions

## Extracting from WinOLS

### Method 1: Direct .ols File Upload (Recommended)

The VOP decompiler can read .ols files directly:

1. Open the VOP editor
2. Click "Load A2L/Project"
3. Select your WinOLS .ols file
4. VOP automatically extracts:
   - Binary file
   - Map definitions
   - Metadata (vehicle, ECU ID, software version)

**Advantages:**
- Preserves all metadata
- Includes all maps
- One-click import
- No manual steps required

### Method 2: Manual Export from WinOLS

If you need to export individual components:

#### Export Binary

1. In WinOLS, go to **File → Export → Binary**
2. Choose format:
   - **BIN**: Raw binary (recommended)
   - **S-Record**: Motorola S19/S28 format
   - **Intel HEX**: Intel HEX format
3. Save file (e.g., `ECU_Binary.bin`)

#### Export Maps

1. In WinOLS, go to **File → Export → Maps**
2. Choose format:
   - **CSV**: Comma-separated values (for analysis)
   - **XML**: Structured format (for parsing)
   - **Binary**: Proprietary format
3. Save file (e.g., `ECU_Maps.csv`)

#### Export Project Metadata

1. In WinOLS, go to **File → Project Info**
2. Note the following:
   - Vehicle name
   - ECU ID
   - Software version
   - Processor type
   - Binary size

### Method 3: Command-Line Extraction

If you have access to the .ols file on a Linux/Mac system:

```bash
# Extract header information
od -A x -t x1z -N 512 project.ols

# Extract binary section (2MB at offset 0x17921)
dd if=project.ols of=binary.bin bs=1 skip=$((0x17921 + 4)) count=$((0x200000))

# Extract map section (starting at MAP marker)
# First, find the MAP marker offset
strings project.ols | grep -n "^MAP"

# Then extract from that offset
dd if=project.ols of=maps.bin bs=1 skip=<offset>
```

## File Formats Explained

### BIN (Raw Binary)

- **Extension**: `.bin`
- **Format**: Raw binary data
- **Size**: Typically 512KB-4MB
- **Byte Order**: Big-endian (MSB_FIRST) for ME17
- **Use**: Direct binary editing, comparison

**Advantages:**
- Smallest file size
- Fastest to load
- Direct memory mapping

**Disadvantages:**
- No address information
- Requires offset alignment

### S-Record (Motorola)

- **Extension**: `.s`, `.s19`, `.s28`, `.s37`
- **Format**: Text-based hex encoding
- **Includes**: Address information, checksums
- **Use**: Bootloader flashing, cross-platform compatibility

**Advantages:**
- Human-readable
- Includes addresses
- Built-in checksums
- Cross-platform

**Disadvantages:**
- Larger file size
- Slower to parse
- May have address gaps

### Intel HEX

- **Extension**: `.hex`, `.ihex`
- **Format**: Text-based hex encoding
- **Includes**: Address information, checksums
- **Use**: Bootloader flashing, cross-platform compatibility

**Advantages:**
- Standard format
- Includes addresses
- Built-in checksums
- Wide tool support

**Disadvantages:**
- Larger file size
- Slower to parse
- May have address gaps

## VOP Import Process

### Step 1: Upload WinOLS Project

```
VOP Editor → Load A2L/Project → Select .ols file
```

### Step 2: Automatic Extraction

VOP automatically:
1. Parses WinOLS header
2. Extracts binary file
3. Finds map definitions
4. Detects ECU family
5. Loads A2L definitions

### Step 3: Verify Import

Check the following in VOP:
- **Vehicle Info**: Correct vehicle/model shown
- **ECU ID**: Matches your ECU
- **Binary Size**: Shows extracted binary size
- **Map Count**: Number of maps found
- **Base Address**: Correct for ECU family

### Step 4: Export A2L (Optional)

To save the generated A2L for other tools:

```
VOP Editor → File → Export A2L
```

This creates an ASAP2-compliant `.a2l` file that can be used in:
- INCA (Bosch tuning tool)
- CANape (Vector tuning tool)
- Other ASAP2-compatible tools

## Troubleshooting

### "File size mismatch" Error

**Cause**: Exported binary is different size than WinOLS project binary

**Solution**:
- Use the .ols file directly (VOP handles size differences automatically)
- Or export from WinOLS as S-Record/HEX format (VOP will pad/truncate as needed)

### "No maps found" Error

**Cause**: Map definitions not found in project

**Solution**:
1. Verify the .ols file is not corrupted
2. Check WinOLS can open the file
3. Try exporting maps separately from WinOLS
4. Contact VOP support with the .ols file

### "ECU not recognized" Error

**Cause**: ECU ID not in VOP database

**Solution**:
1. Verify ECU ID is correct (shown in WinOLS project info)
2. Check if ECU family is supported (ME17, MG1, etc.)
3. Manually set base address if known
4. Contact VOP support to add ECU variant

### "Binary offset mismatch" Error

**Cause**: Binary addresses don't align with A2L definitions

**Solution**:
1. Verify you're using the correct A2L for the binary
2. Check base address setting (ME17 = 0x80020000)
3. Try auto-heal alignment in VOP editor
4. Manually adjust offset if needed

## Best Practices

1. **Keep Original Files**: Always keep the original .ols file as backup

2. **Verify Metadata**: Check vehicle/ECU info matches your vehicle

3. **Use Direct Import**: Upload .ols files directly to VOP when possible

4. **Export for Backup**: Export A2L and binary separately for archival

5. **Document Changes**: Keep notes on any modifications made

6. **Test Carefully**: Always test on a non-critical vehicle first

## Supported WinOLS Versions

- WinOLS 5.0 and later
- Tested with Can-Am Spyder and Maverick projects
- Should work with other Bosch ME17 projects

## Next Steps

After importing your WinOLS project:

1. **Browse Maps**: Use the map tree to explore calibration data
2. **View Map Data**: Click maps to see values and 3D visualization
3. **Compare Tunes**: Load a modified binary to compare changes
4. **Export A2L**: Save the A2L for use in other tools
5. **Generate Report**: Create a decompilation report

## Support

For issues or questions:
- Check the VOP documentation
- Review the ME17_WINOLS_DECOMPILER.md guide
- Contact VOP support with your .ols file
