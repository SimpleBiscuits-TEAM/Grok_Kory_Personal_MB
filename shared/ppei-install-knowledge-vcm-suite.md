# PPEI HPTuners VCM Suite — Read File & InfoLog Guide

## What You Need
- HP Tuners MPVI3 or MPVI4 device
- Windows laptop with VCM Suite BETA installed (always use latest BETA)
- USB-C cable (included with device)
- Vehicle with charged battery (+ optional charger recommended)

## What You'll Produce
- InfoLog file (.txt)
- ECM Read file (.hpt)
- TCM Read file (.hpt)

## PART 1 — PREPARATION & SOFTWARE SETUP

### Download & Install VCM Suite BETA
1. Go to https://www.hptuners.com/downloads/
2. Find "VCM Suite Latest BETA Download" and download the installer
3. Run the installer, follow prompts
4. Use the BETA shortcut — look for "VCM Editor (BETA)" and "VCM Scanner (BETA)" on desktop or Start Menu. Always open the version labeled BETA.

### Vehicle Preparation
- IMPORTANT: Battery must be fully charged. Connect a battery charger during the entire process. Do NOT start the engine.
1. Connect a battery charger to maintain stable voltage
2. Close all vehicle doors, turn off all accessories (radio, HVAC, headlights, dash cams)
3. Do not operate any vehicle functions (door locks, windows, interior buttons) during reading

## PART 2 — GENERATING A VCM SUITE INFOLOG
1. Connect the device: USB-C cable → MPVI3/MPVI4 → laptop. Plug MPVI into vehicle OBD-II port (under dashboard, driver's side)
2. Turn ignition to ON/RUN (do NOT start engine):
   - Conventional key: Turn key two clicks forward to ON or RUN
   - GM push-button: Without pressing brake, hold Start button 8-10 seconds
   - Dodge/Chrysler/Jeep push-button: Without pressing brake, press Start once (ACC), wait 2 seconds, press again (RUN)
3. Open VCM Editor (BETA) or VCM Scanner (BETA)
4. Click the VCM Suite Info button (blue circle with lowercase "i" in top toolbar)
5. Inside the Info window, click the blue "i" icon again to poll the software and vehicle (takes 5-20 seconds)
6. Save the InfoLog: Click the Save icon (floppy disk), save as YourName_InfoLog.txt

## PART 3 — READING ECM AND TCM SEPARATELY
- IMPORTANT: Close VCM Scanner completely before starting. If scanner is running in background, it blocks VCM Editor from communicating with vehicle.
- Confirm vehicle is still in ON position with engine OFF.

### Process 1: Reading ECM (Engine) Only
1. Open VCM Editor (BETA). Close any open tune files (File > Close)
2. Click Flash > Read Vehicle
3. Wait 10-15 seconds for Vehicle Reader to initialize
4. Click Gather Info — software scans and lists detected controllers
5. Set dropdowns: ECM = Read, TCM = Do Not Read, others (FSCM) = Do Not Read
6. Click Read button. Progress bar shows status.
   - NOTE: Dashboard may flash warning lights, chime, accessories may toggle — this is normal, don't interrupt
7. Turn off ignition when read is complete
8. Save ECM file: File > Save As → YourName_Stock_ECM.hpt

### Process 2: Reading TCM (Transmission) Only
1. Close the ECM file (File > Close)
2. Turn ignition back to ON/RUN (engine OFF)
3. Click Flash > Read Vehicle
4. Wait 10-15 seconds for initialization
5. Click Gather Info
6. Set dropdowns: ECM = Do Not Read, TCM = Read, others = Do Not Read
7. Click Read button
8. Turn off ignition when complete
9. Save TCM file: File > Save As → YourName_Stock_TCM.hpt

## FINAL STEPS — SEND FILES
Send all 3 files to PPEI support team:
| File | Example Name | Format |
|------|-------------|--------|
| InfoLog | YourName_InfoLog.txt | .txt |
| ECM Read | YourName_Stock_ECM.hpt | .hpt |
| TCM Read | YourName_Stock_TCM.hpt | .hpt |

If you get any error messages, take a screenshot and include it in your email.

Contact: www.ppei.com | +1 337-485-7070
