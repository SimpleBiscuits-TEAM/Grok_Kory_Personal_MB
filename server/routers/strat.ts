/**
 * Strat Router — tRPC procedures for PPEI Post-Sale Tech Support AI Agent
 *
 * Strat — V-OP's dedicated tech support AI.
 * Helps customers AFTER purchase with installation, device setup,
 * tune flashing, data logging, error code troubleshooting, and
 * general product support for EFILive, EZ LYNK, HP Tuners, and DEBETA.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { stratFeedback } from "../../drizzle/schema";

/**
 * Hardcoded $0502 response — bypasses LLM entirely.
 * Uses exact owner-approved language + BBX reconfiguration steps from PPEI PDF guide.
 * This guarantees consistent, accurate responses every time.
 */
const HARDCODED_0502_RESPONSE = `This should be an easy fix. $0502 indicates that the AutoCal/FlashScan is either out of date, not configured to recognize your vehicle's controllers, or both.

**Step 1 — Download & Install EFILive V8**

Start by following this link to download and install the latest version of EFILive software on your computer (if you haven't done this already): [https://www.efilive.com/download-efilive](https://www.efilive.com/download-efilive)

**Step 2 — Update Firmware**

Once installed, connect the AutoCal/FlashScan to your computer via USB and open the **EFILive V8 Scan and Tune** software. Click **"Check Firmware"** at the top of the page. In the popup window, update each section that needs it:
- **Boot Block** — click Update if out of date
- **Firmware** — click Update if out of date
- **Config Files** — click Update Files if out of date

Once everything shows OK, click **OK** to close.

**Step 3 — Reconfigure BBX Settings**

Use the provided BBX file to reconfigure the AutoCal to recognize your vehicle's controllers:
1. Locate the BBX file (e.g., "All Diesel bbx") saved to your desktop and **double-click it** — this opens EFILive with the BBX Quick Setup Manager
2. Click the **F2: Scan** tab and place a checkmark next to your vehicle's controller(s)
3. Click the **F3: Tune** tab and select the same controller(s)
4. Click the dropdown arrow beside the **Program** button at the bottom:
   - First select **"Format CONFIG file system"** → click Yes
   - Then click the dropdown again and select **"Program Selections and Configuration Files (Slower)"** → click Yes
5. Wait for the progress bar to finish — you'll see "Configuration files have been copied" → click OK

Your AutoCal is now updated and configured. Try flashing your tune again.

Did you receive a BBX file along with your tuning and installation instructions when you purchased? If not, let me know and I can help you get the right one.`;

/**
 * BBX File CDN URLs — uploaded per owner directive.
 */
const DURAMAX_BBX_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663499288273/VRRqdUTMemLPozZ853E4Du/DURAMAX_AllDieselBBX2.12.22_8fe25114.bbx';
const CUMMINS_BBX_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663499288273/VRRqdUTMemLPozZ853E4Du/AllDieselBBX1.13.23_7626c0e0.bbx';

/**
 * Shared BBX configuration instructions — referenced by both BBX download responses and $0502.
 */
const BBX_CONFIG_STEPS = `**How to configure your AutoCal using the BBX file:**
1. Save the BBX file to your desktop
2. **Double-click** the BBX file — this opens EFILive with the BBX Quick Setup Manager
3. Click the **F2: Scan** tab and place a checkmark next to your vehicle's controller(s)
4. Click the **F3: Tune** tab and select the same controller(s)
5. Click the dropdown arrow beside the **Program** button at the bottom:
   - First select **"Format CONFIG file system"** \u2192 click Yes
   - Then click the dropdown again and select **"Program Selections and Configuration Files (Slower)"** \u2192 click Yes
6. Wait for the progress bar to finish — you'll see "Configuration files have been copied" \u2192 click OK

Your AutoCal is now configured and ready to flash your tune!`;

/**
 * ECM Controller reference list for Duramax vehicles.
 */
const DURAMAX_CONTROLLER_REF = `**Duramax ECM Controller Reference:**
- 2001-2004 LB7: **E54**
- 2004.5-2005.5 LLY: **E60**
- 2006-2007 LBZ: **E35A**
- 2007.5-2010 LMM: **E35B**
- 2011-2014 LML: **E86A**
- 2015-2016 LML: **E86B**
- 2006-2008 Allison 6-Speed TCM: **A40**
- 2001-2005.5 Allison 5-Speed TCM: **AL5**
- 2009+ Allison 6-Speed TCM: **A50**
- 2015.5-2016 LML Allison TCM: **T87**`;

/**
 * ECM Controller reference list for Cummins vehicles.
 */
const CUMMINS_CONTROLLER_REF = `**Cummins ECM Controller Reference:**
- 2006-2007 5.9L Cummins: **CMB**
- 2007.5-2009 6.7L Cummins: **CMC**
- 2010-2012 6.7L Cummins: **CMD**
- 2013-2017 6.7L Cummins: **CME**`;

/**
 * Hardcoded response when a Duramax customer requests a BBX file.
 */
const HARDCODED_DURAMAX_BBX_RESPONSE = `Here's the Duramax All Diesel BBX file — download it here:

**[Download Duramax BBX File](${DURAMAX_BBX_URL})**

Before configuring, make sure your EFILive V8 software is up to date. If you haven't already, download and install the latest version here: [https://www.efilive.com/download-efilive](https://www.efilive.com/download-efilive)

Then connect your AutoCal/FlashScan via USB, open EFILive V8, click **"Check Firmware"**, and update **Boot Block**, **Firmware**, and **Config Files** if any are out of date.

${BBX_CONFIG_STEPS}

${DURAMAX_CONTROLLER_REF}

Select the controller(s) that match your vehicle in both the F2: Scan and F3: Tune tabs. Let me know if you need help figuring out which one to pick!`;

/**
 * Hardcoded response when a Cummins customer requests a BBX file.
 */
const HARDCODED_CUMMINS_BBX_RESPONSE = `Here's the Cummins All Diesel BBX file — download it here:

**[Download Cummins BBX File](${CUMMINS_BBX_URL})**

Before configuring, make sure your EFILive V8 software is up to date. If you haven't already, download and install the latest version here: [https://www.efilive.com/download-efilive](https://www.efilive.com/download-efilive)

Then connect your AutoCal/FlashScan via USB, open EFILive V8, click **"Check Firmware"**, and update **Boot Block**, **Firmware**, and **Config Files** if any are out of date.

${BBX_CONFIG_STEPS}

${CUMMINS_CONTROLLER_REF}

Select the controller(s) that match your vehicle in both the F2: Scan and F3: Tune tabs. Let me know if you need help figuring out which one to pick!`;

/**
 * Complete PPEI Support Knowledge Base — scraped from support.ppei.com
 * 23 articles covering EFILive, EZ LYNK, HP Tuners, and DEBETA products.
 */
const PPEI_SUPPORT_KB = `# PPEI Support Knowledge Base — Complete Content

**Total articles:** 23 (22 scraped + 1 error codes from direct read)

---

## EFILive FlashScan/AutoCal Data Logging Procedure

**Source:** https://support.ppei.com/portal/en/kb/articles/efilive-autocal-datalogging-procedure

# EFILive FlashScan/AutoCal Data Logging Procedure

Use this guide to capture, save, and send your datalog to your tuner. Files can also be attached when creating or updating tickets. This will ensure that your requests are handled in the most efficient manner possible.  

**Part 1 – Recording a Datalog**  

1.      Download and install the latest version of EFILive V8 Scan & Tune:

2.      Configure FlashScan/AutoCal V3 for BBX features if not already set up. If you purchased your AutoCal from PPEI - the BBX settings are already set, and you can proceed to #3.

b.     To program your device with the .bbx for the correct controller [click here]()  

3.      Connect your **FlashScan/AutoCal** device to your vehicle.

4.      Turn the vehicle ignition **On_._** Do not start the vehicle

5.      Navigate to the **Scan Tool - Select OK**.  

6.      Press **OK** on **Select PID's**  

7.      Select correct controller type from BBX configured controllers. (Controllers defined below)

| **Vehicle: Year/Make** | **Engine Controller** | **Transmission Controller** |
| --- | --- | --- |
| **2001 - 2004 6.6L Duramax LB7** | **E54** | **AL5** |
| **2004.5 - 2005.5 6.6L Duramax LLY** | **E60** | **AL5** |
| **2006 - 2007 6.6L Duramax LBZ** | **E35A** | **A40** |
| **2007.5 - 2010 6.6L Duramax LMM** | **E35B** | **A40 & (A50 2009+)** |
| **2011 - 2014 6.6L Duramax LML** | **E86A** | **A50** |
| **2015 - 2016 6.6L Duramax LML** | _**E86B**_ | _**T87**_ |
| **2016 - 2018 2.8L Duramax LWN** | _**E98**_ | _**T43**_ |
| **2014 - 2015 Chevrolet Cruze** | _**E47**_ | _**N/A**_ |
| **2006 - 2007 5.9L Cummins** | _**CMB**_ | _**N/A**_ |
| **2007.5 - 2009 6.7L Cummins** | _**CMC**_ | _**N/A**_ |
| **2010 - 2012 6.7L Cummins** | _**CMD**_ | _**N/A**_ |
| **2013 - 2017 6.7L Cummins** | _**CME**_ | _**N/A**_ |
| **2018 - 2021 6.7L Cummins** | **CMF** | _**N/A**_ |

8.      Press **OK on Record Data** to commence the logging session.

                  a.      The LCD will display recording status, elapsed time, frame count, and the selected PIDs.

9.      Start the vehicle and drive to record actual performance.

   a.      Data Log Recordings should not exceed 1-2 minutes.

   b.      Replicate the performance issue where the vehicle isn’t performing properly.  

10.      Press OK on **FlashScan/AutoCal** to stop data logging and save the log file.

11.      Once the data log recording is saved make note of the “**saved as**” name as you will be required to remove the file off your device and email it to PPEI. In some cases, you may have multiple recordings where you will need to remember which log needs to be sent to PPEI.

12.      You may disconnect the FlashScan/AutoCal from the OBDII port and turn your vehicle off.  

**Part 2 – Saving a Data Log to your desktop**  

1.      Download and install the latest version of EFILive V8 Scan & Tune: (_skip this step if you have already downloaded the latest version of EFILive in Part 1 above_)

2.      Connect your **FlashScan/AutoCal** to the computer used to download and install EFILive V8 Scan & Tune.

3.      Open **EFILive Explorer** computer program – application icon

4.      Select – **F3: Data Files** (see _figure 1_ below in light blue)

5.      Select – **Scan** (see _figure 1_ below in light pink)

6.      The **Scan** folder will show all data log recordings – **Right-click** the data log that requires reviewing (see _figure 1_ below in dark blue) – select **Copy** from the dropdown.

**Figure** **1  
**

7.      **Minimize** the EFILive Explorer program and any other window that may be open.

8.      **Right-Click** and **Paste** the data log that requires reviewing to your desktop.

**Part 3 – Sending a Data Log to PPEI**

_If you are currently in communication with a PPEI support technician that is referencing this data log, please skip to **step 2** below._  

1.      **Only** create a new support ticket if you do not or have not already created one previously. It is **very unlikely** that a support ticket hasn’t already been created if you received these instructions from a PPEI Support Technician. So before creating a ticket, please verify that you do not have one before proceeding. Creating a news support ticket when you already have an open support ticket will only delay the process of having your logs reviewed and the issues resolved

a.     Complete all required fields [Create a PPEI Support Ticket Here]()  

2.      Locate the email (PPEI Ticket) containing the correspondence with the PPEI Support Technician.

3.      Reply to the email and provide a brief description of the issue that tells us the conditions and tune levels that were present with each data log you send. (Ex: Log 0001: Maxx Effort tune 0-60mph at wide-open throttle, Log 0002: Economy mild acceleration under load) - Attach the EFILive data log that you pasted to your desktop in step 8 in part 2 above and send the email.

---

## EFILive FlashScan/AutoCal VIN License & Activation Codes

**Source:** https://support.ppei.com/portal/en/kb/articles/efilive-autocal-flashscan-vin-license-activation-codes

For VIN License purchases, you must be running EFILive V8.2.24 software or later to generate valid VIN License Auth Codes.

​1.   Download and install the latest version of EFILIve V8 Scan & Tune: https://www.efilive.com/download-efilive

2.   Locate your VIN License activation email. 

3.   Connect your FlashScan/AutoCal device to your PC.

4.   Start the EFILive V8 Scan and Tune application.

5.   Click the [F7: Licenses] button in the left-hand pane.

6.   Click the [F3: VINs] button in the left-hand pane.

7.   Paste the Activation Code and enter the License number from your email.

8.   Select [Activate VIN License] to add the licenses to the device.

---

## EFILive AutoCal/FlashScan Serial and Auth Code

**Source:** https://support.ppei.com/portal/en/kb/articles/efilive-autocal-flashscan-serial-and-auth-code

For VIN License purchases, you must be running EFILive V8.2.24 software or later to generate valid VIN License Auth Codes.  

**TCM flashing does not require an available VIN License for customers running V8.3.1 software or later, and licensed TCMs are no longer displayed.*  

2. Connect your **FlashScan/AutoCal**device to your PC.

3. Start the **EFILive V8 Scan and Tune**application.

4. Click the **[F7: Licenses]** button in the left-hand pane.

5. The serial number will be shown in the **Serial Number** field.  

6. Click the **[F3: VINs]** button in the left-hand pane.

7. Click the **[Generate Auth Code]** button. The Authentication Code will be shown in the **Auth Code**: field.

Note: An Auth Code is not applicable to a Scan Only product, only devices with a Tuning Option license.  

  

8. If generating the serial and**auth-code**to place a VIN License order, the number of additional VIN licenses that may be purchased for the device must be greater than zero. Where available license slots equal zero, customers will be unable to generate an Auth Code to order VIN Licenses. VIN License Capacity is:  

8.1. **FlashScan V3** - 600 VIN Licenses.  

8.2. **FlashScan V2** - 221 VIN Licenses.  

8.3. **AutoCal V3** - 600 VIN Licenses, however, the **VIN License Slot Count** has a default value of 1.  

8.4. **AutoCal V2** - 221 VIN Licenses, however, the **VIN License Slot Count** has a default value of 1.  

---

## EFILive FlashScan/AutoCal V3 Data Logging Procedure

**Source:** https://support.ppei.com/portal/en/kb/articles/efilive-flashscan-autocal-v3-data-logging-procedure-8-3-2022

# EFILive FlashScan/AutoCal V3 Data Logging Procedure

**Part 1 – Recording a Datalog**  

1.      Download and install the latest version of EFILive V8 Scan & Tune:

2.      Configure FlashScan/AutoCal V3 for BBX features if not already set up. If you purchased your AutoCal from PPEI - the BBX settings are already set, and you can proceed to #3.

b.     To program your device with the .bbx for the correct controller [click here]()  

3.      Connect your **FlashScan/AutoCal V3** device to your vehicle.

4.      Turn the vehicle ignition **On_._** Do not start the vehicle

5.      Navigate to the **Scan Tool > F1 Select PIDs** menu option.

6.      Select correct controller type from BBX configured controllers. (Controllers defined below)

| **Vehicle: Year/Make** | 

**Engine Controller**

 | 

**Transmission Controller**

 |
| 

**2001 - 2004 6.6L Duramax LB7**

 | 

**E54**

 | 

**AL5**

 |
| 

**2004.5 - 2005.5 6.6L Duramax LLY**

 | 

**E60**

 | 

**AL5**

 |
| 

**2006 - 2007 6.6L Duramax LBZ**

 | 

**E35A**

 | 

**A40**

 |
| 

**2007.5 - 2010 6.6L Duramax LMM**

 | 

**E35B**

 | 

**A40 & (A50 2009+)**

 |
| 

**2011 - 2014 6.6L Duramax LML**

 | 

**E86A**

 | 

**A50**

 |
| 

**2015 - 2016 6.6L Duramax LML**

 | 

_**E86B**_

 | 

_**T87**_

 |
| 

**2016 - 2018 2.8L Duramax LWN**

 | 

_**E98**_

 | 

_**T43**_

 |
| 

**2014 - 2015 Chevrolet Cruze**

 | 

_**E47**_

 | 

_**N/A**_

 |
| 

**2006 - 2007 5.9L Cummins**

 | 

_**CMB**_

 | 

_**N/A**_

 |
| 

**2007.5 - 2009 6.7L Cummins**

 | 

_**CMC**_

 | 

_**N/A**_

 |
| 

**2010 - 2012 6.7L Cummins**

 | 

_**CMD**_

 | 

_**N/A**_

 |
| 

**2013 - 2017 6.7L Cummins**

 | 

_**CME**_

 | 

_**N/A**_

 |
| 

**2018 - 2021 6.7L Cummins**

 | 

**CMF**

 | 

_**N/A**_

 |

7.      Navigate to the F1 Scan Tool > F2 Data Logging menu option. 

8.      Select **F1: Record Data** to commence the logging session.

9.      The LCD will display recording status, elapsed time, frame count, and the selected PIDs.

10.      Start the vehicle and drive to record actual performance.

   a.      Data Log Recordings should not exceed 1-2 minutes.

   b.      Replicate the performance issue where the vehicle isn’t performing properly.

11.      A range of options are available while the Log is recording:

·       To pause/resume the log - Select **✔**

·       To stop data logging and save the logged data - Select **X**

12.      Select X on **FlashScan/AutoCal V3** to stop data logging and save the log file.

13.      Once the data log recording is saved make note of the “**saved as**” name as you will be required to remove the file off your device and email it to PPEI. In some cases, you may have multiple recordings where you will need to remember which log needs to be sent to PPEI.

14.      You may disconnect the FlashScan/AutoCal from the OBDII port and turn your vehicle off.  

**Part 2 – Saving a Data Log to your desktop**  

1.      Download and install the latest version of EFILive V8 Scan & Tune: (_skip this step if you have already downloaded the latest version of EFILive in Part 1 above_)

2.      Connect your **FlashScan/AutoCal** to the computer used to download and install EFILive V8 Scan & Tune.

3.      Open **EFILive Explorer** computer program – application icon

4.      Select – **F3: Data Files** (see _figure 1_ below in light blue)

5.      Select – **Scan** (see _figure 1_ below in light pink)

6.      The **Scan** folder will show all data log recordings – **Right-click** the data log that requires reviewing (see _figure 1_ below in dark blue) – select **Copy** from the dropdown.

**Figure** **1  
**

7.      **Minimize** the EFILive Explorer program and any other window that may be open.

8.      **Right-Click** and **Paste** the data log that requires reviewing to your desktop.

**Part 3 – Sending a Data Log to PPEI**

_If you are currently in communication with a PPEI support technician that is referencing this data log, please skip to **step 2** below._  

1.      **Only** create a new support ticket if you do not or have not already created one previously. It is **very unlikely** that a support ticket hasn’t already been created if you received these instructions from a PPEI Support Technician. So before creating a ticket, please verify that you do not have one before proceeding. Creating a news support ticket when you already have an open support ticket will only delay the process of having your logs reviewed and the issues resolved

a.     Complete all required fields [Create a PPEI Support Ticket Here]()  

2.      Locate the email (PPEI Ticket) containing the correspondence with the PPEI Support Technician.

3.      Reply to the email and provide a brief description of the issue that tells us the conditions and tune levels that were present with each data log you send. (Ex: Log 0001: Maxx Effort tune 0-60mph at wide-open throttle, Log 0002: Economy mild acceleration under load) - Attach the EFILive data log that you pasted to your desktop in step 8 in part 2 above and send the email.

---

## Flashing .COZ Formatted Tune Files

**Source:** https://support.ppei.com/portal/en/kb/articles/flashing-coz-formatted-tune-files

Use these steps to flash your vehicle when you’ve received tune files in the .COZ format. Prior to flashing, your tune must be loaded onto you AutoCal.  

1.  Verify that the AutoCal is up-to-date with the current/most recent firmware and configured for the appropriate vehicle using our latest BBX config files/settings.
2.  Verify that the tune file is loaded onto the AutoCal and that the AutoCal is programmed to use ‘simple menu’.
3.  Once this has been done, connect the AutoCal to the OBD2 port and turn the key to the ON/RUN position.
4.  When the AutoCal is connected, it should say “Scan Tool”. Scroll down to ‘Tuning Tool’ and press OK.
5.  Scroll down to ‘Program Cal’ and press OK.
6.  Scroll down and select the tune file ending in .COZ then press OK.
7.  If the controller has not been licensed, it will say ‘License ECU Now?’ Press OK to activate VIN license.
8.  The flashing process will now begin and will progress to 100%.
9.  When flashing has reached 100%, the AutoCal screen will display the message, ‘Ignition off now’. Turn the key to the OFF position, and press OK.
10.  The AutoCal will display ‘Program Cal’. This indicates that flashing has completed successfully.
11.  You may now disconnect the AutoCal from the OBD2 port and start the vehicle. _(Before starting the vehicle make sure than any modifications being done to the vehicle have been completed and vehicle is OK to start)_.

---

## Loading New/Revised Tunes

**Source:** https://support.ppei.com/portal/en/kb/articles/loading-new-revised-tunes

Use the following steps to load new or revised tune files into your EFILive tool. This is necessary before each flash.

1.  Save the tune file(s) attached to your order email on your Desktop _(files will end with .ctz or .coz)_.
2.  Do **NOT** connect your AutoCal/V2 until step 2 has been completed and the EFI Live V8 Scan & Tune software has been successfully installed.
3.  [Download EFI Live V8 Software]() and install when the download has completed.
4.  Install EFI Live V8 software once download process has completed.
5.  Connect AutoCal/V2 to computer using supplied USB cable and wait a couple minutes for device drivers to install successfully.
6.  Open the EFI Live V8 Explorer Program _(icon will be on your Desktop)_.
7.  On the “F3: Data Files” tab it should have an EFILive folder, Scan folder, Tune folder, and Read folder _(just to the right of the multi-colored triangle at the bottom left of the window)_.
8.  Now click on the ‘Tune Folder’.
9.  If you have any old/unnecessary tune files, right click on them and delete.
10.  Minimize the EFILive Explorer window so you can see the Desktop.
11.  Locate the tune file(s) that you saved from your email _(in step 1)_, right click on the file(s), and select ‘Copy’.
12.  Open the EFILive Explorer software back up from the taskbar at the bottom, right click in the area to the right of the Tune folder, and select ‘Paste’.
13.  Once the green progress bar finishes moving across the screen _(may take a couple minutes)_, you may disconnect the AutoCal/V2 and flash the truck with the new file.

---

## Flashing .CTZ Formatted Tune Files

**Source:** https://support.ppei.com/portal/en/kb/articles/flashing-ctz-formatted-tune-files

Use these steps to flash your vehicle when you’ve received tune files in the .CTZ format. Prior to flashing, your tune must be loaded onto you AutoCal.

1.  Verify that the AutoCal is up-to-date with the current/most recent firmware and configured for the appropriate vehicle using our latest BBX config files/settings.
2.  Verify that the tune file is loaded onto the AutoCal and that the AutoCal is programmed to use ‘simple menu’.
3.  Once this has been done, connect the AutoCal to the OBD2 port and turn the key to the ON/RUN position.
4.  When the AutoCal is connected, it should say “Scan Tool”. Scroll down to ‘Tuning Tool’ and press OK.
5.  Scroll down to ‘Program Full’ and press OK.
6.  Scroll down and select the tune file ending in .CTZ then press OK.
7.  If the controller has not been licensed, it will say ‘License ECU Now?’ Press OK to activate VIN license.
8.  The flashing process will now begin and will progress to 100%.
9.  When flashing has reached 100%, the AutoCal screen will display the message, ‘Ignition off now’. Turn the key to the OFF position, and press OK.
10.  Once this has been done, a countdown will begin. When the countdown is complete, the AutoCal will display ‘Program Full’. This indicates that flashing has completed successfully.
11.  You may now disconnect the AutoCal from the OBD2 port and start the vehicle. _(Before starting the vehicle make sure than any modifications being done to the vehicle have been completed and vehicle is OK to start)_.

---

## Retrieving Datalog Files

**Source:** https://support.ppei.com/portal/en/kb/articles/retrieving-datalog-files

# Retrieving Datalog Files

Use this guide to retrieve and send datalogs to our technical support team. When you have the file, attach it to a new or existing support ticket.

1.  Do **NOT** connect your AutoCal/V2 until step 2 has been completed and the EFI Live V8 Scan & Tune software has been successfully installed.
2.  [Download EFI Live V8 Software]() and install when the download has completed.
3.  Connect your AutoCal/V2 to computer using the supplied USB cable and wait for the device drivers to install successfully.
4.  Open the EFI Live V8 Scan & Tune software *(icon will be located on your Desktop)*.
5.  On the ‘F3: Data Files’ tab it should have an EFILive folder, Scan folder, Tune folder, and Read folder *(just to the right of the multi-colored triangle at the bottom left of the window)*.
6.  Now click on the ‘Scan Folder’.
7.  Out to the right of the Scan folder, you will see your datalog files.
8.  Right click on the read file that you wish to email and select ‘Copy’.
9.  Minimize the window so you see the desktop, and right click on the desktop. Select ‘Paste’.
10. Attach that read file *(on your desktop)* to a technical support ticket.

---

## Retrieving Read Files

**Source:** https://support.ppei.com/portal/en/kb/articles/retrieving-read-files

# Retrieving Read Files

Use this guide to retrieve and send read files to our technical support team. When you have the file, attach it to a new or existing support ticket.

1.  Do **NOT** connect your AutoCal/V2 until step 2 has been completed and the EFI Live V8 Scan & Tune software has been successfully installed.
2.  [Download EFI Live V8 Software]() and install when the download has completed.
3.  Connect your AutoCal/V2 to computer using the supplied USB cable and wait for the device drivers to install successfully.
4.  Open the EFI Live V8 Scan & Tune software *(icon will be located on your Desktop)*.
5.  On the ‘F3: Data Files’ tab it should have an EFILive folder, Scan folder, Tune folder, and Read folder *(just to the right of the multi-colored triangle at the bottom left of the window)*.
6.  Now click on the ‘Read Folder’.
7.  Out to the right of the Read folder, you will see your read files *(if you’ve read out any)*.
8.  Right click on the read file that you wish to email and select ‘Copy’.
9.  Minimize the window so you see the desktop, and right click on the desktop. Select ‘Paste’.
10. Attach that read file *(on your desktop)* to a technical support ticket.

---

## Updating Device BBX Settings & Configuration Files

**Source:** https://support.ppei.com/portal/en/kb/articles/updating-device-bbx-settings-configuration-files

Updating Device BBX Settings & Configuration Files 
 This guide is continued from  Updating Device Bootblock & Firmware . Please follow both steps to ensure that your device is up to date. 

 -  Locate the All Diesel BBX file saved to your desktop and double click it. 
 -  Click on the F2: Scan tab at the top left of the window. 
 -  Place a check mark in each box beside the appropriate controller(s).  See Controller list below for reference) 
 ECM Controller List 2001-2004 6.6L Duramax LB7:  E54 2004.5-2005.5 6.6L Duramax LLY:  E60 2001-2005.5 Allison 5 Speed TCM:  AL5 2006-2007 6.6L Duramax LBZ:  E35A 2007.5-2010 6.6L Duramax LMM:  E35B 2006-2008 Allison 6 Speed TCM:  A40 2011-2014 6.6L Duramax LML:  E86A 2009-2015 Allison 6 Speed TCM:  A50 2015-2016 6.6L Duramax LML:  E86B 2015.5-2016 LML Allison TCM:  T87 2016-2018 2.8L Duramax:  E98 2016-2018 2.8L Duramax 6-speeed TCM:  T43 2006-2007 5.9L Cummins:  CMB 2007.5-2009 6.7L Cummins:  CMC 2010-2012 6.7L Cummins:  CMD 2013-2017 6.7L Cummins:  CME 2014-2015 Chevrolet Cruze:  E47 

 -  Click on the F3: Tune tab and select the appropriate controller(s) again. 
 -  After you’ve made your selections next to the appropriate controller(s), click on the dropdown beside the Program button at the bottom of the window. 
 -  Select the third option in the list ‘Format CONFIG file system’. Click Yes on the pop-up window to continue. 
 -  Click on the dropdown beside the Program button again, and this time select the second option in the list ‘Program Selections and Configuration Files (Slower)’. 
 -  Click Yes on the popup window ‘This operation may take a few minutes’ to continue. 
 -  Once the green progress bar finishes moving across the screen, a popup window will say ‘Configuration files have been copied’. Hit OK on that message and select Close at the bottom right of the screen. 
 -  Your AutoCal/V2 is now up-to-date and properly configured! 

 -  Related Articles 

 -  Updating Device Bootblock & Firmware Use the following guide to ensure that your EFILive tool is up to date. This is required before taking any action with your AutoCal/V2. Do NOT connect Autocal/ V2 until step 2 has been completed and EFI Live V8 Scan & Tune program has been ... 

 -  Flashing .CTZ Formatted Tune Files Use these steps to flash your vehicle when you’ve received tune files in the .CTZ format. Prior to flashing, your tune must be loaded onto you AutoCal. Verify that the AutoCal is up-to-date with the current/most recent firmware and configured for the ... 

 -  Flashing .COZ Formatted Tune Files Use these steps to flash your vehicle when you’ve received tune files in the .COZ format. Prior to flashing, your tune must be loaded onto you AutoCal. Verify that the AutoCal is up-to-date with the current/most recent firmware and configured for the ... 

 -  Retrieving Read Files Use this guide to retrieve and send read files to our technical support team. When you have the file, attach it to a new or existing support ticket. Do NOT connect your AutoCal/V2 until step 2 has been completed and the EFI Live V8 Scan & Tune ... 

 -  Retrieving Datalog Files Use this guide to retrieve and send datalogs to our technical support team. When you have the file, attach it to a new or existing support ticket. Do NOT connect your AutoCal/V2 until step 2 has been completed and the EFI Live V8 Scan & Tune software ...

---

## Updating Device Bootblock & Firmware

**Source:** https://support.ppei.com/portal/en/kb/articles/updating-device-bootblock-firmware

Use the following guide to ensure that your EFILive tool is up to date. This is required before taking any action with your AutoCal/V2.

1.  Do NOT connect Autocal/ V2 until step 2 has been completed and EFI Live V8 Scan & Tune program has been successfully installed.
2.  Download EFI Live V8 Software.
3.  Install EFI Live V8 Software once download process has completed.
4.  Connect the Autocal/V2 to your computer using the supplied USB cable and wait for device drivers to install successfully.
5.  Open the EFI Live V8 Scan & Tune program (icon will be located on your Desktop).
6.  Click on the Check Firmware button towards the top left of the window.
7.  In the pop-up window, begin at the top, with Bootblock, and update each section that is out of date, by clicking on the Update button beside it. If Bootblock is up to date, proceed to firmware and click update, followed by config files.
8.  Once it says Bootblock version, Firmware version, and Config Files are all ok, click OK at the bottom right and proceed with updating BBX settings.

Proceed to Updating BBX Settings & Configurations Files

---

## Aisin Transmission Calibration Installation - EFILive

**Source:** https://support.ppei.com/portal/en/kb/articles/aisin-transmission-calibration-installation-efilive

Aisin Transmission Tuning

Upon receiving your PPEI Aisin Transmission Tuning please verify all parts & tools are present before proceeding. If you are missing any parts, please contact the vendor you purchased parts from before proceeding. If you purchased everything through PPEI and you are missing specific parts, please create a ticket to speed up the process at this link: https://www.ppei.com/#ticket

Required Tools for Full Installation

• A Laptop with Windows Operating System (mac OS will not work)
• Wi-Fi Internet Access
• Email Containing PPEI Aisin Transmission Calibration
• EFILive V3 FlashScan or EFILive V3 AutoCal

Installation Instructions

1. Download and install the most up to date version of EFI Live:
a. https://www.efilive.com/download-efilive
2. Save the tune file that PPEI has sent you to your desktop.
3. Connect the V3 AutoCal or FlashScan to both the computer and the truck using the supplied cables. (THIS WILL NOT WORK IF YOU ARE USING A V2 AUTOCAL OR V2 FLASHSCAN)
4. Turn the vehicles key to the run position with the engine off. (If you have a push button, press the button twice)
5. Locate and double click on the tune file that we sent you.
6. Once EFI Live opens click F7: Full-Flash
7. Select “Full – Flash” – Accept/select OK to all the warnings to proceed with flashing.
8. The flashing process will now begin and will progress to 100%. This will take roughly 2 minutes.
9. Once the flashing has been completed the screen will prompt you to “Place ignition off now” turn the ignition to the off position and click “start countdown”
10. Upon completion of the countdown, you may disconnect the device from the OBD2 port and start the vehicle.

---

## 2013 – 2017 Cummins AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2013-2017-cummins-autocal-installation-tuning

# 2013 – 2017 Cummins AutoCal Installation & Tuning

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2013 – 20017 Cummins 6.7L

| Tune Level/Switch Position | HP Output Gains |
| --- | --- |
| 1 – Tow | + 30HP |
| 2 – EcoTow | + 65HP |
| 3 – Street | + 100HP |
| 5 – Maxx | + 130HP |

### Step One: CSP4/Single Tune Install Instructions

1. Plug the AutoCal into the truck’s OBDII using supplied cable.
2. Turn the key to the ‘RUN’ position. Do NOT start the truck.
3. Scroll down using the right *(skull)* button until you see ‘Tuning Tool’. Press the ‘OK’ button *(skull)* in the center of the AutoCal.
4. Scroll down to ‘Program Full’ press ‘OK’.
5. Scroll down to the pre-loaded tune file *(CSP4 or Single Tune)* & press ‘OK’.
6. It will prompt you to ‘LICENSE ECU NOW’. press ‘OK’.
7. It will then ask ‘Are you sure?’. press ‘OK’.
8. The screen will say ‘Checking 0… 100%’. Followed by ‘Erasing… Flashing’ with a percentage (%) below it. The flashing process will take approximately 13 minutes to complete.
9. Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’.
10. Once the countdown has finished, you can disconnect the AutoCal from the OBDII port and start the truck up!

### How To Change Tune Levels

1. Turn the key to the ON position *(do NOT start truck)*
2. Connect the AutoCal to the vehicle’s OBDII port *(driver-side, beneath the dash)*
3. Scroll down to ‘Tuning Tool’ and hit OK.
4. Then scroll down to ‘Switch Tunes’ and hit OK.
5. Scroll down to the desired tune level and hit OK to select it.
6. It should say ‘Tune Switched’. After this, simply disconnect the AutoCal and it will remain on the selected tune level until changed again.

---

## 2001 – 2010 Duramax AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2001-2010-duramax-autocal-installation-tuning

# 2001 – 2010 Duramax AutoCal Installation & Tuning

On this page

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2001 – 2004 LB7 & 2004.5 – 2005.5 LLY

| Tune Level/Switch Position | Stock Transmission DSP5 Tunes | Built Transmission DSP5 Tunes |
| --- | --- | --- |
| 1 | + 15HP | + 30HP |
| 2 | + 30HP | + 60HP |
| 3 | + 60HP | + 120HP |
| 4 | + 100HP | + 160HP |
| 5 | + 120HP | + 230HP |

2006 – 2007 LBZ & 2007.5 – 2010 LMM

| Tune Level/Switch Position | Stock Transmission DSP5 Tunes | Built Transmission DSP5 Tunes |
| --- | --- | --- |
| 1 | + 30HP | + 30HP |
| 2 | + 50HP | + 60HP |
| 3 | + 100HP | + 120HP |
| 4 | + 120HP | + 160HP |
| 5 | + 150HP | + 230HP |

### Preparing Your Vehicle For Tuning

1.  Always have all the doors closed while reading or flashing the vehicle and keep them closed until process is complete. (windows can be down before starting installation for ventilation)
2.  Disconnect all electronic accessories from auxiliary ports prior to connecting the programmer to your vehicle’s OBDII port. _(ex: iPod, iPad, satellite radio, cell phone charger, GPS, radar detector, etc.)_
3.  Turn off stereo, A/C, headlights prior to reading/installing tune.
4.  Disconnect any paired Bluetooth devices from radio/headunit.
5.  NEVER unplug the AutoCal/V2 device while it is reading or flashing the vehicle.
6.  Do not try to install a tune on your vehicle if battery voltage is low _<(below 12v)_. Charge your battery beforehand if necessary.
7.  **Tip: Getting your vehicle up to operating temperature prior to flashing a tune in will prevent the glow plugs and/or grid heater from pre-heating and draining the battery voltage levels.
8.  Do **NOT** try to read/flash the vehicle while it is connected to a battery charger _(unless you are using a quality charger that has a trickle charge setting and/or maintains voltage consistently without any drops/spikes in voltage levels)_! Any changes in voltage during the flash procedure can result in damage to your ECM, laptop, and/or AutoCal/V2 device.
9.  If your vehicle is attached to a trailer, make sure the brake light receptacle outlet and plug are disconnected.

Duramax Fuse Removal**Remove the fuses that correspond with your vehicle year before connecting the Autocal.

| Year | Engine | Pull Fuse | Pull Fuse | Pull Fuse | Pull Fuse | Fuse Locations |
| --- | --- | --- | --- | --- | --- | --- |
| 2001 | LB7 | SEO-1 | SEO-2 | Driver-side dash fuse panel |
| 2002 | LB7 | SEO-1 | SEO-2 | Driver-side dash fuse panel |
| 2003 | LB7 | TBC BATT | TBC IGNITION | INFO | RADIO | Driver-side Engine Bay Fuse Box |
| 2004 | LB7 | TBC BATT | TBC IGNITION | INFO | RADIO | Driver-side Engine Bay Fuse Box |
| 2004.5 | LLY | TBC BATT | TBC IGNITION | INFO | RADIO | Driver-side Engine Bay Fuse Box |
| 2005 | LLY | TBC BATT | TBC IGNITION | INFO | RADIO | Driver-side Engine Bay Fuse Box |

### Step One: Reading Out The Stock Program

1.  Plug the AutoCal into the truck’s OBDII using supplied cable.
2.  Turn the key to the on position _(do NOT start the truck)_.
3.  Scroll down to the ‘Tuning Tool’ and hit ‘Ok’.
4.  Select the ‘Read Tune’ option.
5.  It’ll say E54 _(01-04 LB7)_ or E60 _(04.5-05 LLY)_ or E35A _(06-07 LBZ)_ or E35B _(07.5-10 LMM)_. Hit ‘Ok’ on the appropriate ECM for your truck and it will begin reading the stock file from the truck.
6.  When it finishes reading out the stock file, the AutoCal will prompt you to turn the ‘Ignition Off Now!’. Turn the key off and press ‘OK’. Once the countdown completes, you can proceed to Step Two: Flashing the Tune File _(below)_

### Step Two: Flashing The Tune File

1.  Plug the AutoCal into the truck’s OBDII using supplied cable _(if not already connected from Step One above)_.
2.  Turn the key to the ‘RUN’ position, do NOT start the vehicle!
3.  Scroll down _(using the right button)_ to ‘Tuning Tool’ and hit ‘OK’ _(skip this step if you just read out your stock file from Step One above)_.
4.  Scroll down to ‘Program Full’ and press the ‘OK’ button
5.  You should see your tune file _(will typically be named something like DSP5_ST, LMM_ST, or a single hp tune)_ & press ‘OK’ the screen will say ‘Checking to 100%’.
6.  It will ask if you want to ‘LICENSE ECU NOW?’ _(will only be displayed the first time you flash the truck with your Autocal/V2)_. press ‘OK’.
7.  It will now ask ‘Are you sure?’. press ‘OK’ to proceed with the flashing procedure.
8.  The AutoCal should now say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 4-7 minutes.
9.  When the flash process has completed successfully, and it reaches 100%, the AutoCal will prompt you to turn the ‘Ignition Off Now!’. Turn the key off and press ‘OK’. Once the countdown has completed, you can disconnect the Autocal from the OBDII port, and start your truck! _(** Note: Be sure to replace/reconnect any fuses and/or accessories that were removed prior to the tuning process! **)_

---

## 2010 – 2012 Cummins AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2010-2012-cummins-autocal-installation-tuning

# 2010 – 2012 Cummins AutoCal Installation & Tuning

On this page

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2010 – 2012 Cummins 6.7L

| Tune Level/Switch Position | HP Output Gains |
| --- | --- |
| 1 – Optimized Stock | + 15HP |
| 2 – Tow | + 30HP |
| 3 – EcoTow | + 65HP |
| 4 – Street | + 100HP |
| 5 – Maxx | + 130HP |

### Step One: Unlock File

1.  Plug the AutoCal into the truck’s OBD II port using the supplied cord.
2.  Turn the ignition to the ON position. do NOT start the vehicle!
3.  Scroll down _(using down arrow…right button)_ to ‘Tuning Tool’. Press the ‘OK’ button _(in the center of the AutoCal)_.
4.  Scroll down to ‘Program FULL’. Press ‘OK’.
5.  Scroll down to the ‘A_FLASH.ctz’. Press ‘OK’.
6.  It will ask if you want to ‘LICENSE ECU NOW’ press ‘OK’.
7.  It will now ask ‘Are you sure?’ press ‘OK’ to proceed with the flashing process.
8.  The AutoCal should then say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 13 minutes.
9.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will appear. When the countdown has finished, you’ve unlocked your PCM.

### Step Two: Flashing The Tune File

1.  Turn the key back to the ON position. Do **NOT** start the vehicle!
2.  The AutoCal should have ‘Program Full’ displayed on the screen already _(if you’ve just completed Step One above)_.
3.  Toggle down to the pre-loaded tune _(CSP2, CSP5, or Single Tune)_. Press ‘OK’.
4.  The screen will say ‘Checking 0… 100%’. Followed by ‘Erasing… Flashing’ with a percentage (%) below it. The flashing process will again take approximately 13 minutes to complete.
5.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
6.  Once the countdown has completed, the vehicle has successfully been tuned. You may disconnect the AutoCal from the OBDII port, start the truck up, and enjoy!

### Switching CSP Tune Levels Using Your AutoCal

1.  Turn the key to the ON position _(do NOT start truck)_.
2.  Connect the AutoCal to the vehicle’s OBDII port _(driver-side, beneath the dash)_.
3.  Scroll down to ‘Tuning Tool’ and hit OK.
4.  Then scroll down to ‘Switch Tunes’ and hit OK.
5.  Scroll down to the desired tune level and hit OK to select it.
6.  It should say ‘Tune Switched’ …after this, simply disconnect the AutoCal and it will remain on the selected tune level until changed again.

---

## 2006 – 2009 Cummins AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2006-2009-cummins-autocal-installation-tuning

# 2006 – 2009 Cummins AutoCal Installation & Tuning

On this page

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2006 – 2009 Cummins 5.9L & 6.7L

| Tune Level/Switch Position | HP Output Gains |
| --- | --- |
| 1 – Optimized Stock | + 30HP |
| 2 – Tow | + 60HP |
| 3 – EcoTow | + 100HP |
| 4 – Street | + 120HP |
| 5 – Maxx | + 180HP |

### Step One: Reading Out The Stock Program

1.  Plug the AutoCal into the truck’s OBDII using supplied cable.
2.  Turn the key to the on position *(do NOT start the truck)*
3.  Scroll down to the ‘Tuning Tool’ and hit ‘OK’.
4.  Select the ‘Read Tune’ option.
5.  It’ll say Hit ‘OK’ on the appropriate ECM/TCM for your truck *(CMB: 2006-07 5.9L, CMC:2007.5-09 6.7L)* and will begin reading the stock file from the truck.
6.  When it finishes reading out the stock file, the AutoCal will prompt you to turn the ‘Ignition Off Now!’. Turn the key off and press ‘OK’. Once the countdown completes, you can proceed to Step Two: Flashing the Tune File *(below)*

### Step Two: Flashing The Tune File

1.  Plug the AutoCal into the truck’s OBDII using supplied cable *(if not already connected from Step One above)*.
2.  Turn the key to the ‘RUN’ position, do not start the truck.
3.  Toggle down using the right *(skull)* button until you see ‘Program Full’ *(under the ‘Tuning Tool’ option in the main menu)* . Press the ‘OK’ button *(skull)* in the center of the AutoCal.
4.  It will say ‘Read’…Toggle down to your tune file *(will be either CSP5 or a single hp tune)* & press ‘OK’ the screen will say ‘Checking to 100%’.
5.  It will ask if you want to ‘LICENSE ECU NOW’ *(will only be displayed the first time you flash the truck with your AutoCal/V2)*. press ‘OK’.
6.  It will now ask ‘Are you sure?’. Press ‘OK’.
7.  The AutoCal should now say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 13 minutes.
8.  When the flashing has finished and it reaches 100%, the AutoCal will prompt you to turn the ‘Ignition Off Now!’. Turn the key off and press ‘OK’. Once the countdown completes, you can disconnect the AutoCal from the OBDII port, and start your truck! *(**Note: Be sure to replace any fuses that were removed prior to the tuning process!**)*

### Switching CSP Tune Levels Using Your AutoCal

1.  Turn the key to the ON position *(do NOT start truck)*.
2.  Connect the AutoCal to the vehicle’s OBDII port *(driver-side, beneath the dash)*.
3.  Scroll down to ‘Tuning Tool’ and hit OK.
4.  Then scroll down to ‘Switch Tunes’ and hit OK.
5.  Scroll down to the desired tune level and hit OK to select it.
6.  It should say ‘Tune Switched’. After this, simply disconnect the AutoCal and it will remain on the selected tune level until changed again.

---

## 2015 – 2016 Duramax AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2015-2016-duramax-autocal-installation-tuning

This guide will provide you with information about the power levels available
for your vehicle and walk you through the installation process. Follow each
step carefully to ensure maximum functionality. Please do not hesitate to
**create a support ticket**  if you run into any issues that require advanced
troubleshooting.

2015 – 2016 LML

Tune Level/Switch Position| HP Output Gains  
---|---  
1 – Stock| \\+ 0HP  
2 – Economy| \\+ 60HP  
2 – EcoTow| \\+ 120HP  
3 – Street| \\+ 150HP  
5 – Maxx| \\+ 200HP  
  
### Flashing The Tune File

  1. Plug the AutoCal into the truck’s OBD II port using the supplied cord.
  2. Turn the ignition to the ON position. do NOT start the vehicle!
  3. Scroll down _(using down arrow…right button)_  to ‘Tuning Tool’. Press the ‘OK’ button _(in the center of the AutoCal)_.
  4. Scroll down to ‘Program CAL’. Press ‘OK’.
  5. Scroll down to the desired tune level and hit ‘OK’. The screen will say ‘Checking to 100%’.
  6. It will ask if you want to ‘LICENSE ECU NOW’ press ‘OK’.
  7. It will now ask ‘Are you sure?’ press ‘OK’ to proceed with the flashing process.
  8. The AutoCal should then say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 1-2 minutes.
  9. Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
  10. Once the countdown has completed, the vehicle has successfully been tuned. You may disconnect the AutoCal from the OBDII port, start the truck up, and enjoy!

### How To Change Tune Levels

  1. Plug the AutoCal into the truck’s OBD II port using the supplied cord.
  2. Turn the ignition to the ‘Run’ position. Do **NOT**  start the vehicle!
  3. Scroll down using the right _(skull)_  button until you see ‘Tuning Tool’. Press the ‘OK’ button _(skull)_  in the center of the AutoCal.
  4. Scroll down to ‘Program Cal’. Press ‘OK’.
  5. Scroll down to tune of choice and click ‘OK’.
  6. The screen will say ‘Checking 0… 100%’. Followed by ‘Erasing… Flashing’ with a percentage (%) below it. The flashing process will again take approximately 1-2 minutes to complete.
  7. Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
  8. Once the countdown has finished, you can disconnect the AutoCal from the OBDII port and start the truck up!

---

## 2011 – 2016 Duramax EFILive SOTF Tuning Installation

**Source:** https://support.ppei.com/portal/en/kb/articles/2011-2016-duramax-efilive-sotf-tuning-installation

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2011 – 2016 LML

| Tune Level/Switch Position | HP Output Gains |
| --- | --- |
| 1 – Optimized Stock | + 30HP |
| 2 – Economy | + 60HP |
| 2 – EcoTow | + 100HP |
| 3 – Street | + 150HP |
| 5 – Maxx | + 200HP |

### Installing The Engine Calibration

1.  Plug the AutoCal into the truck’s OBD II port using the supplied cord.
2.  Turn the ignition to the ON position. do NOT start the vehicle!
3.  Scroll down _(using down arrow/right button)_ to ‘Tuning Tool’. Press the ‘OK’ button _(in the center of the AutoCal)_.
4.  Scroll down to ‘Program FULL’. Press ‘OK’.
5.  Hit ‘OK’ on the SOTF tune _(or single HP tune file…depending on what tuning you purchased)_. the screen will say ‘Checking to 100%’.
6.  It will ask if you want to ‘LICENSE ECU NOW’ press ‘OK’.
7.  It will now ask ‘Are you sure’ press ‘OK’ to proceed with the flashing process.
8.  The AutoCal should then say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 4-7 minutes.
9.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
10.  Once the countdown has completed, the vehicle has been tuned. You may disconnect the AutoCal from the OBDII port, start the truck up, and enjoy your newfound SOTF power!

### Installing The Transmission Calibration

1.  Plug the AutoCal into the truck’s OBD II port using the supplied cord.
2.  Turn the ignition to the ON position. do NOT start the vehicle!
3.  Scroll down _(using down arrow…right button)_ to ‘Tuning Tool’. Press the ‘OK’ button _(in the center of the AutoCal)_.
4.  Scroll down to ‘Program FULL’. Press ‘OK’.
5.  Scroll down to the TCM tune. Press ‘OK’.
6.  It will ask if you want to ‘LICENSE ECU NOW’ press ‘OK’.
7.  It will now ask ‘Are you sure’. Press ‘OK’ to proceed with the flashing process.
8.  The AutoCal will say ‘Checking 0-100%… Erasing Wait… Flashing 0-100%’ This process takes approximately 3-5 minutes.
9.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
10.  Once the countdown has finished, your PPEI transmission calibration has been installed successfully. You may disconnect the AutoCal from the OBDII port and start the truck up!

**\\*\\*RELEARN PROCESS**: Any time you reflash your TCM, we strongly recommend relearning the trans before you turn the power up, drive it aggressively, and/or tow heavy with the truck. The following guidelines will assist in properly relearning your transmission to optimize the benefits/results of our transmission calibrations. After flashing, keep the throttle below 50% on a mild tune and go through as many 1-6 and 6-1 shifts for at least 100 miles _(the more the better)_. Then gradually increase throttle application along with the tune level up.\\*\\*

---

## 2011 – 2014 Duramax AutoCal Installation & Tuning

**Source:** https://support.ppei.com/portal/en/kb/articles/2011-2014-duramax-autocal-installation-tuning

This guide will provide you with information about the power levels available for your vehicle and walk you through the installation process. Follow each step carefully to ensure maximum functionality. Please do not hesitate to **create a support ticket** if you run into any issues that require advanced troubleshooting.

2011 – 2014 LML

| Tune Level/Switch Position | HP Output Gains |
| --- | --- |
| 1 – Flash | + 0HP |
| 2 – Economy | + 60HP |
| 3 – EcoTow | + 120HP |
| 4 – Street | + 150HP |
| 5 – Maxx | + 200HP |

### Step One: Preparing The Vehicle

1.  Plug the AutoCal into the truck’s OBD II port using the supplied cord.
2.  Turn the ignition to the ON position. do NOT start the vehicle!
3.  Scroll down _(using down arrow…right button)_ to ‘Tuning Tool’. Press the ‘OK’ button _(in the center of the AutoCal)_.
4.  Scroll down to ‘Program FULL’. Press ‘OK’.
5.  Scroll down to the ‘A_FLASH.ctz’. Press ‘OK’.
6.  It will ask if you want to ‘LICENSE ECU NOW’ press ‘OK’.
7.  It will now ask ‘Are you sure?’ press ‘OK’ to proceed with the flashing process.
8.  The AutoCal should then say ‘Please Wait… Erasing… Flashing’ with a percentage (%) below it. The flashing process takes approximately 4-5 minutes.
9.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will appear. Once the countdown finishes, you’re ready to proceed to Step Two: Flashing the Tune File.

### Step Two: Flashing The Tune File

1.  Turn the key back to the ON position. Do **NOT** start the vehicle!
2.  The AutoCal should have ‘Program Full’ displayed on the screen already _(if you’ve just completed Step One above)_.
3.  Scroll down to ‘Program CAL’. Press ‘OK’.
4.  Scroll down to the desired tune level and hit ‘OK’.
5.  The screen will say ‘Checking 0. 100%’. Followed by ‘Erasing… Flashing’ with a percentage (%) below it. The flashing process will again take approximately 1-2 minutes to complete.
6.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
7.  Once the countdown has completed, the vehicle has successfully been tuned. You may disconnect the AutoCal from the OBDII port, start the truck up, and enjoy!

### How To Change Tune Levels

1.  Plug the AutoCal into the truck’s OBD II port using the supplied cord.
2.  Turn the ignition to the ‘Run’ position. Do **NOT** start the vehicle!
3.  Scroll down using the right _(skull)_ button until you see ‘Tuning Tool’. Press the ‘OK’ button _(skull)_ in the center of the AutoCal.
4.  Scroll down to ‘Program Cal’. Press ‘OK’.
5.  Scroll down to tune of choice and click ‘OK’.
6.  The screen will say ‘Checking 0… 100%’. Followed by ‘Erasing… Flashing’ with a percentage (%) below it. The flashing process will again take approximately 1-2 minutes to complete.
7.  Once it reaches 100% the AutoCal will prompt you with the ‘IGNITION OFF NOW!’ message. Turn the key off and press ‘OK’. A countdown will begin.
8.  Once the countdown has finished, you can disconnect the AutoCal from the OBDII port and start the truck up!

---

## EZ LYNK AutoAgent Installation Guide

**Source:** https://support.ppei.com/portal/en/kb/articles/ez-lynk-autoagent-installation-guide

* EZ Lynk Install Procedure * 

 

Upon Receiving your EZ Lynk Product/Tuning, please review and perform the Instructions/Procedure below:

 

EZ Lynk is a universal device/platform that is used for tuning multiple vehicle types. The below instructions contain variations for certain vehicles. Follow the steps below as they pertain to you and your vehicle. 

 

** Indicates important notation that should be observed.

 

 

Installing an EZ LYNK device that was ordered with tuning:

 

- Basic Setup Procedure -  

 

1. Using your Apple or Android Smart Device (iOS/Android) - Download the "Auto Agent" App from the App store. (Please use a device that uses cell data (or connect to your closest wifi/internet source when you get to step 8 in order to lynk to the vehicle and then download your ECU profiles)  

 

2. Create an account using your personal email/password.

 

** (If you are a PPEI dealer/shop installing this product for a customer, you may create your account/log in using your "shop" or personal email to complete the process below. You may also use the customer's email to log in to the app on your device with their password, or you may create a password for them that they can change later. Ex. "1234".  IF you choose to log in to the app and connect to the vehicle using your shop's email/account, inform the customer that in order for them to be able to access their profiles, they must create their own log in account on the app, then proceed on the app and select "vehicle" -> "technicians" and enter "tuning@ppei.com by selecting the "+" symbol that can be found at the top right hand corner of the screen. Once that has been done, the vehicle has been "lynked" to PPEI. The customer will then need to email/call with the VIN and email account in use to have profiles enabled on their account.)***

 

3.    Once inside the vehicle, turn the key to the ON/RUN position  

 

4.    Connect EZ Lynk Auto Agent device to the OBD port and verify that the light is illuminated.  (Leave the key in the ON/RUN position). 

 

5.    Once you have verified light is illuminated and key is in the ON/RUN position, enter the settings on your smart device, turn WIFI on and select the EZ Lynk device from your available WIFI networks. (To verify connection, you will see a check mark next to the EZ Lynk WIFI source. You will see a message below stating, "no internet connection", this is normal as this is not an internet source. This is solely a communication between the Auto Agent and your device/phone.)

 

6.    Now that you have established WIFI connection with the EZ Lynk device, open the Auto Agent app on your phone/smart device.  

 

7.    Select "vehicle" and verify that the vehicle displayed is correct.  

 

8.    Now Select "technicians" – You should see a prompt to “lynk” with PPEI (tuning@ppei.com) (If you have any issues with this step, please see step 9)

 

9.    Once that is complete, select "ECU Profiles". This can be found under "vehicle" on the app.  

 

**(IF you see the message "It seems that your technician has not created any ECU Profiles for you" - you will need to call us at (337) 485-7070 or go to this link and let us know your issue by “creating a ticket”:  

 

https://ppei.com/pages/contact

 

**If you have also purchased TCM tuning (Cummins or Duramax) you will need to contact us and let us know you have lynked the vehicle with us so we can add your TCM profiles. The reason for this is because not all purchases include TCM tuning, so TCM tuning cannot be “autoshared” like all other profiles available. 

 

10.  Now it is time to select your ECU Profile and install. (The ECU Profiles will have a definitive name/title indicating its appropriate use. If you are concerned, have any questions, or do not see a profile available for your specific modifications/usage, please contact us by calling (337) 485-7070 or creating a support ticket by using the link listed above in step #9.   Your ticket should include the VIN and PPEI order number, as well as a description/list of your modifications and any questions as well.)

 

11.  Once you have chosen the proper ECU Profile, verify that the key is in the ON/RUN position before continuing.  

 

12.  "Fetch" the tune profile from the cloud server by tapping the cloud symbol on the right-hand side of the profile name. (If you are using a device that is not using cell data, such as an ipad, tablet, or old iphone, you will need to fetch the profile somewhere that you have an active WIFI connection to complete this step.)

 

13.  Once the profile has been "fetched" it will say "install" to the right of the profile. Make sure that you are connected to the EZ LYNK device (by going to your smart phone/tablet’s list of available WIFI networks and verify that the EZ Lynk device displays as “Connected”). Then verify that the key is in the ON/RUN position, and select the "Install" icon beside the tune profile you wish to install.

 

(**Nissan Titan Vehicles should turn on hazard lights at this time to ensure ECM readiness).  

 

14.  The app will now guide you through the flashing procedure.  

 

(Vehicles requiring an unlock cable, Cummins and Titan, should connect the appropriate cable in the engine bay when prompted to do so. See instructions for connecting the unlock cable.) 

 

15.  Once install is complete the app will instruct you to turn the key to the off position. Once you have followed those instructions and the key is off, you may proceed. Once the button exclaiming “Let’s Go!” is displayed on the screen, you have successfully completed the flash process and are ready to start the vehicle.  

 

**NOTE: For Cummins equipped vehicles, we recommend leaving the key in the OFF position for 10 minutes prior to starting the engine.

 

**IF this is an off-road vehicle with emissions equipment removed, you must have the vehicle converted to an Off-Road vehicle that is intended for Race/Competition or Recreational use in designated areas. ANY use of an off-road vehicle on legal roadways will terminate support from us. The vehicle will need to have an aftermarket, free-flowing exhaust system installed on the truck, and the EGR/throttle valve sensors must be disconnected (if not removed completely with a bypass kit) prior to starting the vehicle. We recommend flashing the vehicle prior to performing any other modifications, to ensure there are no issues.

 

 

 

 

Installing a “Support pack” (Limited or Unlimited) using an EZ LYNK Device that you already have:

 

1. Using your Apple or Android Smart Device (iOS/Android) - Download the "Auto Agent" App from the App store.  (Please use a device that uses cell data (or connect to your closest wifi/internet source when you get to step 8 in order to lynk to the vehicle and then download your ECU profiles)

 

2. Create an account using your personal email/password. Or log in to your pre-existing account on the app. 

 

** (If you are a PPEI dealer/shop installing this product for a customer, you may create your account/log in using your "shop" or personal email to complete the process below. You may also use the customer's email to log in to the app on your device with their password, or you may create a password for them that they can change later. Ex. "1234".  IF you choose to log in to the app and connect to the vehicle using your shop's email/account, inform the customer that in order for them to be able to access their profiles, they must create their own log in account on the app, then proceed on the app and select "vehicle" -> "technicians" and enter "kory@ppei.com by selecting the "+" symbol that can be found at the top right hand corner of the screen. Once that has been done, the vehicle has been "lynked" to PPEI. The customer will then need to email/call with the VIN and email account in use to have profiles enabled on their account. IF the customer has not purchased an EZ LYNK unit along with the support pack or will not be using one, this step is not necessary)***

 

3.    Once inside the vehicle, turn the key to the ON/RUN position 

 

4.    Connect EZ Lynk Auto Agent device to the OBD port and verify that the light is illuminated.  (Leave the key in the ON/RUN position). 

 

5.    Once you have verified light is illuminated and key is in the ON/RUN position, enter the settings on your smart device, turn WIFI on and select the EZ Lynk device from your available WIFI networks. (To verify connection, you will see a check mark next to the EZ Lynk WIFI source. You will see a message below stating, "no internet connection", this is normal as this is not an internet source. This is solely a communication between the Auto Agent and your device/phone.)

 

6.    Now that you have established WIFI connection with the EZ Lynk device, open the Auto Agent app on your phone/smart device. 

 

7.    Select "vehicle" and verify that the vehicle displayed is correct. 

 

8.    Now Select "technicians" – You should see a prompt to “lynk” with PPEI (tuning@ppei.com) (see step 9 if you do not see this prompt)

 

9.    Once that is complete, select "ECU Profiles". This can be found under "vehicle" on the app. 

 

**(IF you see the message "It seems that your technician has not created any ECU Profiles for you" - you will need to call us at (337) 990-4840 or go to this link and let us know your issue by “creating a ticket”:  

 

https://www.ppei.com/support#close

 

**If you have also purchased TCM tuning (Cummins or Duramax) you will need to contact us and let us know you have lynked the vehicle with us so we can add your TCM profiles. The reason for this is because not all purchases include TCM tuning, so TCM tuning cannot be “autoshared” like all other profiles available.  

 

 

10.  Now it is time to select your ECU Profile and install. (The ECU Profiles will have a definitive name/title indicating its appropriate use. If you are concerned, have any questions, or do not see a profile available for your specific modifications/usage, please contact us by calling (337) 990-4840 or creating a support ticket by using the link listed above in step #9.   Your ticket should include the VIN and PPEI order number, as well as a description/list of your modifications and any questions as well.)

11.  Once you have chosen the proper ECU Profile, verify that the key is in the ON/RUN position before continuing.

12.  "Fetch" the tune profile from the cloud server by tapping the cloud symbol on the right-hand side of the profile name. (If you are using a device that is not using cell data, such as an ipad, tablet, or old iphone, you will need to fetch the profile somewhere that you have an active WIFI connection to complete this step.)

13.  Once the profile has been "fetched" it will say "install" to the right of the profile. Make sure that you areconnected to the EZ LYNK device (by going to your smart phone/tablet’s list of available WIFI networks and verify that the EZ Lynk device displays as “Connected”). Then verify that the key is in the ON/RUN position, and select the "Install" icon beside the tune profile you wish to install.

(**Nissan Titan Vehicles should turn on hazard lights at this time to ensure ECM readiness). 

14.  The app will now guide you through the flashing procedure.

(Vehicles requiring an unlock cable, Cummins and Titan, should connect the appropriate cable in the engine bay when prompted to do so. See instructions for connecting the unlock cable.) 

15.  Once install is complete the app will instruct you to turn the key to the off position. Once you have followed those instructions and the key is off, you may proceed. Once the button exclaiming “Let’s Go!” is displayed on the screen, you have successfully completed the flash process and are ready to start the vehicle.

16.  Clean a flat visible surface under the hood and affix the enclosed CARB EO sticker for SMOG purposes.

**NOTE: For Cummins equipped vehicles, we recommend leaving the key in the OFF position for 10 minutes after flashing has completed, prior to starting the engine.EZ LYNK’s AutoAgent and AutoAgent 2 are universal vehicle communication devices that allow you to diagnose, monitor, and program your vehicle. They use cloud based technology to allow you and your mechanic/technician to communicate or transmit data in real-time. 

---

## T93 TCM Install & Tuning Instructions

**Source:** https://support.ppei.com/portal/en/kb/articles/t93-tcm-install-tuning-instructions

-Installing HP Tuners on your Computer

1. Go to https://www.hptuners.com/ 

2. From here, select “Downloads” 

3. Select “Download VCM Suite BETA” 

​4. Once downloaded, open the application from your downloads folder and install the program. 

-Installing your T93 TCM 

1. Connect your MPVI3 to the truck and key on. If your truck has a push-to-start, press and hold the button until your dashboard is illuminated. 

2. Open VCM Scanner. 

3. Select the blue image of a vehicle below the vehicle and layout options “Connect to Vehicle.” 

4. Once you have done this, select the green power button for “Vehicle Controls & Special Functions” 

5. Select “System” 

6. Select “Replace TCM” and follow as instructed. IF YOU SKIP THESE STEPS, YOU WILL HAVE SHIFTING ISSUES AND HAVE TO COMPLETE THE INSTALLATION PROCESS AGAIN 

 7. Locate the TCM in between the driver’s headlight and the battery underneath the hood. It will be located under a fuse panel. 

8. Press the locking tab on the small fuse panel and remove it from its holding bracket. 

9. Below this you will locate the TCM. Remove the old TCM and replace it with your unlocked TCM. 

10. Select the blue image of a vehicle below the vehicle and layout options “Connect to Vehicle.” 

11. Once you have done this select the green power button for “Vehicle Controls & Special Functions” 

12. Select “System” 

13. Select “Replace TCM” and follow as instructed. 

14. Once completed select the black image of the vehicle labeled “Disconnect from Vehicle” located below Layout. 

​

-Obtaining Read File 

1. Open VCM Editor 

2. Select the Green arrow pointing upwards labeled “Read Vehicle.” 

3. When the Vehicle Reader window opens, select “READ” 

4. A second window labeled Vehicle Reader will now open. Make sure that the E41 ECM at the top has “DO NOT READ” selected and that T93 has “READ ENTIRE” selected. 

5. Click “READ” 

6. Save the supplied stock file to your computer. 

7. You will now click the RED downward arrow “Write Vehicle.” 

8. The licensing window will appear, select “SHOW LICENSE OPTIONS” 

9. Click “Specific” and proceed with “Ok.” 

10. The Vehicle Writer window will now be open select “CLOSE” 

-Obtaining Info Log 

1. Click “HELP” in the VCM Editor taskbar. 

2. Select “VCM Suite Information” in the drop-down. 

3. Click the blue “I” and allow for the data to populate. 

4. Once you see “Gathering Information Complete” click the “Save Information” just to the left of the blue “I” and save the InfoLog in the same location as the read file. 

-Sending Read & Info Log to PPEI 

1. Email the read file and InfoLog that you just obtained to the current email thread that you have going with PPEI. Make sure that this email contains an order number and or ticket number. 

2. Once you have emailed the read file and Infolog to PPEI, you will need to wait until we reply with the completed tune file. 

-Tuning Your TCM 

1. Download the PPEI TCM tune from your email to your computer. 

2. You must now select the “CLOSE FILE” option above favorites. This icon will look like a folder with a backward arrow. 

3. Select File>Open and open the PPEI TCM Tune. 

4. Select the RED downward arrow “Write Vehicle.” 

5. Click on the drop-down and select “Write Entire.” 

6. Select the “Write” option 

7. YOUR TCM HAS NOW BEEN TUNED, ENJOY!

---

## 2020+ L5P Duramax T93 TCM Transmission Tuning Instructions - HP Tuners

**Source:** https://support.ppei.com/portal/en/kb/articles/t93-tcm-tuning-instructions-hp-tuners

# 2020+ L5P Duramax T93 TCM Transmission Tuning Instructions - HP Tuners

**T93 TCM Install & Tuning Instructions**

\\-Installing HP Tuners on your Computer

1. Go to https://www.hptuners.com/downloads/
2. Select **“Download VCM Suite BETA.”**
3. Once downloaded, open the application from your downloads folder and install the program. 

**\\-**Installing your T93 TCM

1. Connect your MPVI3 to the truck and turn the key to the on position (do not start). If your truck has a push-to-start, press and hold the button until your dashboard is illuminated.
2. On your computer - Open VCM Scanner.
3. Select the blue image of a vehicle below the **vehicle** and **layout** options **“Connect to Vehicle.”**
4. Once you have done this, select the **green** power button for “**Vehicle Controls & Special Functions.”**
5. Select “**System.**”
6. Select **“Replace TCM”** and follow as instructed. **IF YOU SKIP THESE STEPS, YOU WILL HAVE SHIFTING ISSUES AND HAVE TO COMPLETE THE INSTALLATION PROCESS AGAIN**
7. Locate the TCM in between the driver’s headlight and the battery underneath the hood. It will be located under a fuse panel.
8. Press the locking tab on the small fuse panel and remove it from its holding bracket.
9. Below this, you will locate the TCM. Remove the old TCM and replace it with your unlocked TCM.
10. Select the blue image of a vehicle below the **vehicle** and **layout** options **“Connect to Vehicle.”**
11. Once you have done this, select the **green** power button for “**Vehicle Controls & Special Functions.”**
12. Select “**System.**”
13. Select **“Replace TCM”** and follow as instructed.
14. Once completed, select the black image of the vehicle labeled “**Disconnect from Vehicle**” located below the Layout.

\\-Tuning Your TCM

1. Download the PPEI TCM tune from your email to your computer.
2. Open VCM Editor
3. Select the **Green** arrow pointing upwards labeled **“Read Vehicle.”**
4. When the Vehicle Reader window opens, select **“READ.”**
5. A second window labeled Vehicle Reader will now open. Make sure that the E41 ECM at the top has **“DO NOT READ”** selected and that T93 has **“READ ENTIRE”** selected.
6. Click **“READ.”**
7. Save the supplied stock file to your computer.
8. You will now click the **RED** downward arrow “**Write Vehicle.”**
9. The licensing window will appear. Select **“SHOW LICENSE OPTIONS”**
10. Click **“Specific”** and proceed with **“Ok.”**
11. The Vehicle Writer window will now be open select **“CLOSE.”**
12. You must now select the **“CLOSE FILE”** option above favorites. This icon will look like a folder with a backwards arrow.
13. Select **File>Open** and open the PPEI TCM Tune.
14. Select the **RED** downward arrow **“Write Vehicle.”**
15. Click on the drop-down and select **“Write Entire.”**
16. Select the **“Write”** option
17. YOUR TCM HAS NOW BEEN TUNED, ENJOY!

---

## Complete EFILive Error Code Reference

**Sources:** https://support.ppei.com/portal/en/kb/articles/0333-0281-0101-0537 and EFILive official documentation

### General Troubleshooting for Error Codes $0333, $0281, $0101, $0537:
These codes can occur for a few reasons, but most of the time it is caused by aftermarket electronics or tuning that was previously installed on the vehicle.
To troubleshoot this issue, please proceed with the following:
1) Disconnect/Uninstall any and all aftermarket electronics (they can be reinstalled later).
2) Ensure that only the AutoCal is connected to the OBD port during the tuning process and not split with another device.
3) Disconnect the following fuses:
   - TBC Batt (LLY)
   - TBC Ignition (LLY)
   - Info
   - Radio
   - Radio AMP
   - SEO1 (LB7)
   - SEO2 (LB7)
If the code or issue still exists, we can attempt to flash the ECM in passthrough mode with the use of a windows based laptop and internet access.
In the unlikely event that we cannot get the ECM to accept the flash in passthrough mode, we can have you send your ECM into our facility to be bench flashed. We will mail it back to you tuned and ready for installation.
Please reach out to us at (337) 485-7070 for further assistance.

### All EFILive Error Codes:
$0101 - No Data Received: EFILive device tried to communicate with vehicle and failed. Check USB/OBDII cables, try another USB port, key 2 clicks forward (on position), engine not running, update device.
$0106 - Received data out of range: Firmware may need updating. Check boot block, firmware, update BBX settings in EFILive V8.
$0194 - Write failure: Target file system is full. Reformat Config file system, check SD card/internal memory free space.
$0281 - No data received or key not in run position: Check all cables, ignition in run position, vehicle supported by EFILive, remove aftermarket electronics.
$0333 - Security Access Denied: Controller not unlocked or re-armed. Try "Assume Lock may be Faulty" and "Try Alt Keys" in V8 pass-thru. For LB7/LLY, remove radio, radio amp, info fuses.
$0335 - Invalid Key: Controller locked with customer key. Try pass through flash with "Try Common Alternative Keys", "Assume Lock may be Faulty", "Try Alt Keys". May need new ECM if lock is bad.
$0340 - Download Not Accepted: For Cummins, re-flash ECM with stock file. For others, contact EFILive.
$050B - Script file not supported by firmware: Update Firmware and BBX settings.
$050C - Operation not supported: Read/flash attempted for unsupported controller. Re-program BBX settings via F5: BBX window.
$0502 - BBX settings corrupted or AutoCal not configured: **VERY COMMON ERROR.**
In most cases, this means the AutoCal is not updated (firmware, config files, boot block), not configured to recognize the vehicle's controllers, or both.
**Immediate fix — give these steps RIGHT AWAY when a customer reports $0502:**
1. Ensure you have selected/programmed the correct controller type(s) in the BBX configuration.
   Controller reference: E54=LB7 01-04, E60=LLY 04.5-05, E35A=LBZ 06-07, E35B=LMM 07.5-10, E86A=LML 11-14, E86B=LML 15, CMB=5.9L Cummins 06-07, CMC=6.7L Cummins 07.5-09, CMD=6.7L Cummins 10-12, CME=6.7L Cummins 13-15.
2. Re-install (or repair-install) the EFILive V8 software from efilive.com.
3. Plug in your AutoCal/V2 via USB. Open EFILive V8 > click the small device icon in the taskbar > F6: Firmware > Update Boot Block/Firmware if it shows red.
4. Reprogram the BBX configuration: F5: BBx > F2: Scan tab (select your controller) > F3: Tune tab (select same controller) > Program button > Format CONFIG File System > then Program Selections and Configuration File (Slower).
5. Ask the customer ONE follow-up: "Did you receive a BBX file along with your tuning and installation instructions when you purchased? If so, open that file in EFILive — it will auto-configure the correct controllers for your vehicle."
$0503 - Script file not valid: Script (*.obj) file is corrupt. Update boot block, firmware, and BBX settings.
$0521 - Cannot read from tune file: Tune file corrupted during transfer. Remove file from device, re-download, reload. If persists, request new file from tuner.
$0525 - Tune file not compatible with software version: Download latest EFILive V8, update boot block, firmware, BBX settings.
$0530 - Device license mismatch: Tune file restricted to specific devices. Contact PPEI for link code or licensing verification.
$0532 - Controller needs licensing before flashing: License the controller to your device first, then flash.
$0533 - No VIN-license slots available: Need to purchase additional VIN license slots. Contact PPEI at (337) 485-7070.
$0534 - Invalid Serial Number: Corrupt serial number. Retry operation. For LB7/LLY, full-flash stock file to restore serial.
$0535 - AutoCal not linked to FlashScan: AutoCal must be linked to parent FlashScan. Contact PPEI for link code.
$0536 - Tune file not registered to this AutoCal: AutoCal can only flash files created for that specific device. Contact PPEI customer service.
$0537 - Controller locked with custom key: ECM locked by previous tuner. Try pass through with alt keys options. If can't unlock, contact previous tuner or may need new ECM.
$0539 - Tune file does not allow full flashing: File only supports cal flash. .coz files must be Cal flashed. Contact tuner for full-flash file.
$053B - Device serial mismatch: Tune file restricted to specific serial. Contact tune file author.
$053C - Tune file does not allow calibration flashing: File must be full-flashed only.
$053E - VIN security restriction mismatch: Tune file VIN doesn't match controller. Verify VIN, contact PPEI if mismatch.
$0540 - Incompatible operating system: Tune file OS doesn't match controller. Contact tuner for correct file.
$0548 - Flash checksum failed: Data corrupted during programming. Retry flash.
$0549 - Ignition is switched off: Turn ignition to on position and retry.
$06FF - Checksum failure: Data corrupted during reprogramming. Retry flash.
$0677 - Boot loader checksum failed: Boot loader corrupted. Full flash stock file first, then retry tune.
$0683 - Battery Voltage out of Range: Battery too high or low. Charge battery before flashing if low. Diagnose overcharging if high.

### How to look up unlisted error codes:
Open EFILive V8 Scan and Tune -> Click F8: Tools -> Click F8: Error Codes -> Enter the error code number for description.

---

## PPEI Error App — Expanded Error Code Reference (Additional Detail)

The following provides ADDITIONAL detail for error codes from the PPEI Error Code Finder app. Use this alongside the reference above — if both sources cover the same code, combine the knowledge for the most thorough response.

$0101: Data link is dead — no signal reaching the diagnostic tool, complete communication breakdown.
  Cause: USB cable unplugged, damaged, or fried. PC USB port may be malfunctioning, or hardware glitch in device or truck's OBD system.
  Fix: Visually inspect USB cable for damage, ensure securely plugged into both PC and device. Try a different USB port (preferably USB 2.0). Test with a known working cable. Reboot PC and diagnostic tool. If still dead, check truck's OBD port for bent pins or debris.

$0280: OBD system is offline — vehicle isn't establishing a connection with the scan tool.
  Cause: Truck's OBD port may be unpowered or faulty — blown fuse, disconnected wiring harness, or power supply issue.
  Fix: Confirm truck's ignition is fully on (not just accessory mode). Inspect OBD-II fuse in vehicle's fuse box and replace if blown. Test with different OBD cable. Use multimeter to check OBD port for 12V power on pin 16.

$0281: No data coming from the truck — complete silence from the ECM.
  Cause: Disconnected or faulty cable, dead OBD port, or ECM issue due to power failure or internal fault.
  Fix: Inspect all cable connections. Verify truck engine is running or at least in 'on' position. Restart Scan and Tune software. Check ECM power supply with multimeter (pins 16 for power, 4/5 for ground).

$0311: OBD mode is locked — diagnostic mode won't activate.
  Cause: Security lockout, misconfigured settings, or incompatible scan tool profile.
  Fix: Verify scan tool config matches truck's ECM. Update firmware via [Check Firmware] in V8. For 2001-2010 Duramax reading transmission, disconnect fuses per 'lb7 and lly's.docx' guide. For 2018+ Cummins, verify unlock cable installed per '18-21 Cummins Bypass Install Instructions.pdf'.

$0312: Sub-function is blocked — OBD refuses to perform a specific diagnostic task.
  Cause: Sub-function locked by ECM security feature, or not supported by vehicle's OBD system.
  Fix: Confirm truck's compatibility. Update scan tool firmware. If still blocked, perform factory reset on scan tool and retry.

$0322: Controller request failed due to incorrect conditions or sequence.
  Cause: ECM isn't ready — wrong security key for 2017+ GM controllers, incorrect scan tool settings, or module interference in older Duramax.
  Fix: For 2001-2010 Duramax reading transmission, disconnect fuses per guide. For 2018+ Cummins, verify unlock cable, update EFI Live software and firmware. Retry operation.

$0331: Controller rejects the request — doesn't support the specific OBD mode or parameter.
  Cause: Unsupported model, security block (Gateway Module), outdated software/firmware, or connection issue.
  Fix: Verify vehicle is supported on EFI Live's website. Update software and firmware. For 2018+ Cummins, ensure bypass cable is used. Check all cables.

$0333: Security is tight — ECM access shut down.
  Cause: ECM locked down due to security protocol, expired license, or VIN mismatch.
  Fix: Most cases on 2018+ Cummins — an unlock cable needs to be installed per '18-21 Cummins Bypass Install Instructions.pdf'.

$0340: Download is stalled — flash process won't complete.
  Cause: Likely not on most updated EFI Live software, or bypass cable not installed (2018+ Cummins).
  Fix: Redownload EFI Live software, open Scan and Tune, click CHECK FIRMWARE to update firmware. For 2018+ Cummins, verify unlock cable is installed.

$0380: Diagnostic service crashed — scan tool's diagnostic mode failed unexpectedly.
  Cause: Software glitch in Scan and Tune or hardware issue with scan tool.
  Fix: Close and restart Scan and Tune. Update software to latest version. Test scan tool on another PC or with different cable.

$0482: The *.pmm file is mismatched — parameter file doesn't sync with tune or controller.
  Cause: Loaded *.pmm file version doesn't match tune file or controller's configuration.
  Fix: Open tune file in V8, verify *.pmm file matches. Reload correct *.pmm from original tune package. Reapply tune via [F3: Tune].

$0502: The most common EFI error code. AutoCal needs to be reconfigured using the BBX file.
  Cause: The *.obj file is not present on the device — failed installation or incomplete programming.
  Fix: This should be an easy fix. $0502 indicates the AutoCal/FlashScan is either out of date, not configured to recognize the vehicle's controllers, or both.
  1. Download and install latest EFILive V8 from https://www.efilive.com/download-efilive
  2. Connect AutoCal/FlashScan via USB, open EFILive V8, click "Check Firmware" — update Boot Block, Firmware, and Config Files
  3. Use the provided BBX file to reconfigure: double-click BBX file → F2: Scan tab (select controllers) → F3: Tune tab (select same) → Program dropdown → Format CONFIG → Program Selections
  For Duramax trucks, use the Duramax BBX file. For Cummins trucks, use the Cummins BBX file. Ask the customer if they received a BBX file with their purchase.

$0503: Likely needs to update EFI Live software and then update firmware on the AutoCal.
  Cause: The *.obj file has been corrupted — interrupted download or storage error.
  Fix: Redownload EFI Live software from www.efilive.com/download-efilive. Open Scan and Tune, click Check Firmware to update. Reprogram BBX settings.

$0504: Bootloader is gone — the *.bix file is missing.
  Cause: Likely just needs to configure the AutoCal with the BBX file.
  Fix: Reinstall V8 and configure with BBX file. Follow 'program autocal step by step.pdf' guide.

$0505: Tune file is absent — controller has no tune loaded.
  Cause: No tune file uploaded — skipped step or file deletion.
  Fix: Load tune file using [F3: Tune] in V8. Verify file path. If missing, download from PPEI support site.

$0524: Tune file contents can't be verified.
  Cause: Tune file corrupted or wasn't saved correctly.
  Fix: Save tune file from email to desktop, drag and drop into EFI Live Explorer. Check target file system isn't corrupted. Contact tuner to verify file. Request resend if needed.

$0525: Tune file is unrecognized — incompatible firmware.
  Cause: Tune file format/version doesn't match controller's expected configuration.
  Fix: Reload correct tune file and update firmware in EFI Live Scan and Tune.

$0526: Tune layout is unreadable.
  Cause: Tune file layout corrupted or uses incompatible structure.
  Fix: Reinstall tune file from fresh download. Update software to latest version.

$0527: Tune file contains a bad controller checksum.
  Cause: Checksum failed — corrupted download, outdated V8 software, or transfer error.
  Fix: Redownload latest EFI Live V8 from www.efilive.com/download-efilive. Reload tune file. Reprogram controller via [F5: BBX]->[Program].

$0530: License conflict — tune tied to another device or VIN.
  Cause: Tune's license registered to different device or VIN.
  Fix: Check license details with PPEI. Clear conflicts by unregistering old device. Verify VIN matches.

$0531: Serial is off — tune doesn't match device's serial number.
  Cause: Mismatch between tune file's serial and device's hardware serial.
  Fix: Check device serial in V8 under device settings. Reload tune with correct serial. Request new tune from PPEI if mismatched.

$0532: Controller is unlicensed — flash stopped due to missing authorization.
  Cause: Controller lacks valid license for the tune.
  Fix: Acquire license from PPEI. Verify VIN and controller serial match license.

$0533: VIN slots are full — no room for new tune.
  Cause: Controller's VIN slots fully occupied.
  Fix: Need to purchase a new VIN license.

$0534: Serial is corrupt — device's serial number data invalid.
  Cause: Serial number corrupted from failed update or hardware fault.
  Fix: Reset device to factory settings via V8. If still corrupt, contact PPEI support for replacement.

$0535: AutoCal is unlinked — no bond with FlashScan device.
  Cause: AutoCal not paired with FlashScan.
  Fix: Link AutoCal to FlashScan using pairing wizard in V8 under [F5: BBX].

$0536: This AutoCal is not licensed to PPEI.
  Cause: Tune file isn't designed for the specific AutoCal device.
  Fix: Contact the tuner the AutoCal is linked with and request an unlink code. After getting the unlink code, contact PPEI for a linking code.

$0537: Common code for 01-04 Duramax. Modules communicating during flash interrupt the process.
  Cause: Generally people say you need a custom key — this is rarely the case, it's a known issue with these ECMs when flashing with EFI.
  Fix: Charge the truck for 2 hours. Disconnect the fuses under the hood (see 'lb7 and lly's.docx'). Leave key in run position for 5 minutes before attempting full flash. If still getting 0537, attempt Pass-thru flash (AutoCal plugged into truck and laptop simultaneously). If all fail, ECM needs to come out for bench flash.

$0538: This ECM cannot be read!
  Cause: DSP operating system prevents read operations — flash-only mode.
  Fix: Likely you don't need to read the ECM unless your tuner told you to. Continue with just flashing. Double check with tuner.

$0539: Tune requires full-flash only — calibration flashing is locked.
  Cause: Tune mandates complete flash, disallowing partial calibration updates.
  Fix: Perform full flash via [F5: BBX]->[Program] in V8. Ensure stable power.

$0540: OS clash — tune out of sync with controller's operating system.
  Cause: Mismatch between tune's required OS and controller's current OS.
  Fix: Update controller's OS via V8's [Check Firmware]. Reload tune and retry flash.

$0542: E35 tune lacks OS — full-flash stalls without required system.
  Cause: E35 tune requires an OS not installed on the controller.
  Fix: Install required OS for E35 controllers via V8, then perform full flash.

$0544: Device serial number is corrupted, causing repeated failures.
  Cause: Scan tool's serial number data unreadable — hardware issue or failed firmware update.
  Fix: For 2001-05 Duramax reading transmission tune, disconnect fuses per 'lb7 and lly's.docx' guide. Ensure EFI Live software updated from www.efilive.com/download-efilive and firmware updated via [Check Firmware].

$0548: Flash checksum is bad — data trashed.
  Cause: Flash data's checksum failed — corruption during transfer or storage.
  Fix: Redownload flash file from original source. Verify file integrity before retrying with stable connection.

$0549: ECM is no longer communicating — not a good code to get.
  Cause: Likely an issue with the flashing process that bricked the ECM.
  Fix: MAKE SURE KEY IS IN RUN POSITION and try to reflash the tune again. If same code, contact PPEI for further instructions.

$0552: Controller is unauthorized — flash halted due to missing permissions.
  Cause: Controller not authorized for the tune — license issue.
  Fix: Verify authorization with PPEI and update license. Confirm VIN and controller match license.

---

## EZLYNK Troubleshooting Guide (from PPEI Error App)

### EZLYNK WiFi Not Broadcasting
Issue: The EZLYNK device isn't broadcasting a WiFi signal (e.g., "EZLYNK_XX").
Fix: Unplug from OBD-II port, wait 60 seconds, replug. Check for blue light — if not lit, device may be faulty. Inspect OBD-II port for bent pins or debris. If persists, contact EZLYNK support for firmware update or replacement.

### Unable to Connect to EZLYNK Network
Issue: You see "EZLYNK_XX" network but can't connect.
Fix: Ignore "No Internet Connection" message — it's normal (connects to vehicle, not internet). Restart phone and EZLYNK device. Ensure within WiFi range. Update EZLYNK app to latest version.

### Cannot Communicate with ECM
Issue: EZLYNK app shows "Unable to communicate with your vehicle."
Fix: Turn key to "Run" position (don't start engine) to boot ECM. Ensure device securely plugged into OBD-II port. Check for loose connections. Verify ECM is not locked.

### Firmware Update Failure
Issue: EZLYNK device disconnects during firmware update.
Fix: Unplug device, wait 30 seconds, replug. Check firmware version in app under Settings > About. Ensure stable internet connection and retry. Contact EZLYNK support if unresponsive.

### Tune Installation Stalls at 0%
Issue: Progress bar stalls at 0% when installing tune.
Fix: Often due to incomplete data downloads over cell data. Unplug device, connect phone to stable WiFi, fetch tune profile again via "Cloud" button. Replug and retry. Ensure vehicle battery is charged.

### Unable to Link with Technician
Issue: EZLYNK app fails to link vehicle with technician.
Fix: Ensure connected to internet/mobile data. In app: Vehicle tab > select vehicle > Technicians > Lynk. Enter technician's email. If you don't have the email, contact your EZLYNK dealer.

---

## BBX File Downloads

When a customer needs a BBX file:
- **Duramax** (GM/Chevy/GMC/Silverado/Sierra, LB7/LLY/LBZ/LMM/LML): Provide the Duramax All Diesel BBX file
- **Cummins** (Dodge/Ram, 5.9L/6.7L): Provide the Cummins All Diesel BBX file

Always include the BBX configuration steps: save to desktop, double-click to open in EFILive, F2: Scan (select controllers), F3: Tune (select same), Program > Format CONFIG > Program Selections.

---

`;

const STRAT_SYSTEM_PROMPT = `You are Strat — PPEI's post-sale tech support AI agent, built into the V-OP (Vehicle Optimizer by PPEI) platform.

## Your Identity
Your name is Strat. You are a dedicated tech support specialist for PPEI products. You help customers AFTER they've purchased a product — with installation, device setup, tune flashing, data logging, error code troubleshooting, and general product support.

You are NOT a sales agent. You are NOT a diagnostic agent. You are a tech support agent focused specifically on PPEI products and the tuning devices/platforms they support (EFILive, EZ LYNK, HP Tuners, DEBETA).

## Your Personality
- Friendly, approachable, and patient — like a knowledgeable buddy in the shop
- You speak casually but accurately — no corporate jargon, no condescension
- You're thorough — you walk customers through steps one at a time
- You confirm understanding before moving to the next step
- If something could brick a device or cause damage, you warn clearly
- You use the customer's name if they provide it
- You're honest when you don't know something — you escalate rather than guess

## Your Knowledge Domains (STAY IN YOUR LANE)

### What You DO Handle:
- EFILive AutoCal/FlashScan setup, installation, and operation
- EFILive tune flashing (.COZ, .CTZ formats)
- EFILive data logging procedures (V2 and V3)
- EFILive VIN licensing and activation codes
- EFILive serial numbers and auth codes
- EFILive BBX settings and configuration file updates
- EFILive bootblock and firmware updates
- ALL EFILive error codes ($0101, $0106, $0194, $0281, $0333, $0335, $0340, $050B, $050C, $0502, $0503, $0521, $0525, $0530, $0532, $0533, $0534, $0535, $0536, $0537, $0539, $053B, $053C, $053E, $0540, $0548, $0549, $06FF, $0677, $0683, and more — you have the FULL error code reference in your knowledge base)
- EZ LYNK AutoAgent installation and setup
- HP Tuners T93 TCM installation and tuning
- HP Tuners L5P Duramax TCM transmission tuning
- Duramax AutoCal installation (all generations: LB7, LLY, LBZ, LMM, LML, L5P)
- Cummins AutoCal installation (2006-2009, 2010-2012, 2013-2017)
- Aisin transmission calibration installation via EFILive
- SOTF (Switch on the Fly) tuning installation for 2011-2016 Duramax
- DEBETA by PPEI product support
- General "I just got my product, now what?" questions
- "My flash failed" or "I got an error" troubleshooting

### What You DO NOT Handle (Route to Other Agents):
- Vehicle diagnostics, DTC interpretation, datalog analysis → Tell the customer: "That sounds like a diagnostic question — Knox is our expert for that. You can find Knox in the **AI CHAT** tab or the **DIAGNOSTIC** tab."
- Weather, atmospheric conditions, SAE corrections → Tell the customer: "Laura handles weather — check the **WEATHER** tab."
- Business opportunities, Innovator Program → Tell the customer: "Pitch is our business strategy AI — check the **PITCH** tab."
- Fleet management → Tell the customer: "Goose handles fleet — check the **FLEET** tab."
- Tune calibration questions (what maps to change, how to tune) → Tell the customer: "That's a calibration question — Knox is the expert. Check the **AI CHAT** tab."
- Anything about V-OP hardware, VOP 3.0 device, CarPlay integration → Tell the customer: "That's a V-OP platform question — reach out to the team directly or check the community forum."

When routing, be specific about which tab to go to. Don't just say "ask another agent" — tell them exactly where to go.

## CRITICAL RESPONSE RULES — READ THIS FIRST
**You MUST follow these rules for EVERY response:**
- **Be SHORT, SIMPLE, and TO THE POINT.** No walls of text. No long introductions.
- **Give the fix IMMEDIATELY.** Do NOT ask a bunch of qualifying questions before providing guidance. If the customer tells you the error code or issue, give the resolution steps RIGHT AWAY.
- **Maximum 1 follow-up question per response.** If you need clarification, ask ONE question at the end — not a numbered list of 3-5 questions.
- **Resolution-first, questions-second.** Always lead with the fix/guidance, then ask a single follow-up if needed.
- **Keep greetings to ONE short sentence.** Don't write a paragraph of pleasantries.
- **No filler phrases** like "That's a great question!" or "I'd be happy to help you with that!" — just get to the answer.
- **When recommending a BBX file, ALWAYS include the download link** from the BBX DOWNLOAD LINKS section appended to this prompt. Format it as a clickable markdown link.
- **For EZLYNK issues**, use the EZLYNK Troubleshooting Guide in your knowledge base. Cover WiFi, connection, ECM communication, firmware, tune install, and technician linking issues.
- **You have TWO sources of error code knowledge** — the original EFILive Error Code Reference AND the expanded PPEI Error App reference. Combine both for the most thorough, accurate response.

Example of GOOD response to "I'm getting $0502 on my AutoCal":
"This should be an easy fix. $0502 indicates that the AutoCal/FlashScan is either out of date, not configured to recognize your vehicle's controllers, or both.

1. Download and install the latest EFILive V8: https://www.efilive.com/download-efilive
2. Connect your AutoCal via USB, open EFILive V8, click **Check Firmware** — update Boot Block, Firmware, and Config Files
3. Use the BBX file to reconfigure: double-click it → F2: Scan (select your controller) → F3: Tune (select same) → Program → Format CONFIG → Program Selections

Here's the BBX file you'll need: **[Download BBX File](link)**

Did you receive a BBX file with your purchase? If not, let me know your vehicle and I'll get you the right one."

Example of BAD response (DO NOT DO THIS):
"Hey there! I'm Strat... That's a common one... Let me ask you a few things: 1. What year? 2. What version AutoCal? 3. Have you connected recently?" ← TOO MANY QUESTIONS, NO FIX GIVEN

## How You Respond
1. **Error codes:** Give the fix steps IMMEDIATELY. Reference the specific error code from your knowledge base. Ask ONE follow-up at the end if needed (e.g., "Did you receive a BBX file with your purchase?").
2. **Installation questions:** Give the relevant steps right away based on what they told you. If you need their vehicle/device info and they didn't provide it, ask ONE question.
3. **First message (no specific issue):** Keep it short: "Hey! I'm Strat, PPEI tech support. What do you need help with?"
4. **Data logging questions:** Give the procedure. If you need to know their device, ask.
5. **"I don't know" situations:** Be honest and brief: "I want to get you the right answer — call **(337) 485-7070** or submit a ticket at **support.ppei.com**."

## Escalation Rules
- If the customer has tried all troubleshooting steps and the issue persists → Recommend calling **(337) 485-7070** or submitting a ticket at https://support.ppei.com
- If the customer needs to send in their ECM for bench flashing → Explain the process: "If we can't get the flash to take remotely, PPEI can bench flash your ECM. You'd ship it to our facility, we flash it, and ship it back tuned and ready to install. Call **(337) 485-7070** to set that up."
- If the customer mentions passthrough mode → Explain they'll need a Windows laptop with internet access and walk them through it
- NEVER tell a customer to modify tune files, edit calibration maps, or do anything that could void their warranty or damage their vehicle

## Response Format
- Use markdown for readability
- Use numbered steps for procedures
- Bold important warnings
- Keep responses focused and practical
- Keep responses SHORT — aim for 3-6 numbered steps max per response
- Only ask ONE follow-up question per response, placed at the end

## PPEI Contact Info (for escalation)
- Phone: **(337) 485-7070**
- Support Portal: https://support.ppei.com
- Submit a Ticket: https://support.ppei.com (click "Submit a ticket")

=== PPEI PRODUCT KNOWLEDGE BASE ===

\${PPEI_SUPPORT_KB}

=== END KNOWLEDGE BASE ===`;

export const stratRouter = router({
  /**
   * Chat with Strat — the post-sale tech support AI agent.
   * Accepts a message + conversation history, returns Strat's reply.
   */
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(10000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .max(30)
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const lowerMsg = input.message.toLowerCase();
      const historyText = (input.history || []).map(m => m.content.toLowerCase()).join(' ');
      const fullContext = `${lowerMsg} ${historyText}`;

      // ── BBX file requests — detect Duramax or Cummins and serve the right file (hardcoded for exact download links) ──
      const wantsBBX = /\bbbx\b/i.test(lowerMsg) || (/\bbbx\b/i.test(fullContext) && /need|send|get|download|where|have|file|request|provide/i.test(lowerMsg));
      if (wantsBBX) {
        const isDuramaxBBX = /duramax|lb7|lly|lbz|lmm|lml|gm|chevy|chevrolet|gmc|silverado|sierra/i.test(fullContext);
        const isCumminsBBX = /cummins|dodge|ram|5\.9|6\.7/i.test(fullContext);
        if (isDuramaxBBX) {
          return { reply: HARDCODED_DURAMAX_BBX_RESPONSE };
        }
        if (isCumminsBBX) {
          return { reply: HARDCODED_CUMMINS_BBX_RESPONSE };
        }
        // If we can't determine the vehicle, ask
        return {
          reply: `I can get you the right BBX file! What vehicle do you have? Is it a **Duramax** (GM/Chevy/GMC) or a **Cummins** (Dodge/Ram)? That way I can send you the correct one.`,
        };
      }

      // ── Build system prompt with contextual BBX download links ──
      // Detect vehicle type and inject the correct BBX download URL so the LLM can reference it naturally
      const isDuramax = /duramax|lb7|lly|lbz|lmm|lml|gm|chevy|chevrolet|gmc|silverado|sierra/i.test(fullContext);
      const isCummins = /cummins|dodge|ram|5\.9|6\.7/i.test(fullContext);
      let bbxContext = '';
      if (isDuramax) {
        bbxContext = `\n\n## ACTIVE BBX DOWNLOAD LINK (include in response when relevant)\nDuramax BBX File: ${DURAMAX_BBX_URL}\nFormat as: **[Download Duramax BBX File](${DURAMAX_BBX_URL})**`;
      } else if (isCummins) {
        bbxContext = `\n\n## ACTIVE BBX DOWNLOAD LINK (include in response when relevant)\nCummins BBX File: ${CUMMINS_BBX_URL}\nFormat as: **[Download Cummins BBX File](${CUMMINS_BBX_URL})**`;
      } else {
        bbxContext = `\n\n## BBX DOWNLOAD LINKS (include the correct one when the customer's vehicle is known)\nDuramax BBX File: ${DURAMAX_BBX_URL}\nCummins BBX File: ${CUMMINS_BBX_URL}\nIf you recommend a BBX file, format as a clickable markdown link.`;
      }

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: STRAT_SYSTEM_PROMPT + bbxContext },
      ];

      // Add conversation history
      if (input.history) {
        for (const msg of input.history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: "user", content: input.message });

      try {
        const response = await invokeLLM({ messages });
        const reply =
          response.choices?.[0]?.message?.content ||
          "I'm having a moment — let me regroup. Try that again?";
        return { reply };
      } catch (err: any) {
        console.error("[Strat] LLM error:", err);
        return {
          reply: `I'm experiencing a connection issue. Error: ${err.message || "Unknown"}. Give me a sec and try again. If this keeps happening, call us at (337) 485-7070.`,
        };
      }
    }),

  /** Submit feedback after 5+ interactions */
  submitFeedback: protectedProcedure
    .input(
      z.object({
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
        productCategory: z.string().optional(),
        resolved: z.boolean().optional(),
        messageCount: z.number().optional(),
        conversationSummary: z.string().optional(),
        chatLog: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
        sessionDuration: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        await db.insert(stratFeedback).values({
          userId: ctx.user?.id ?? null,
          rating: input.rating,
          comment: input.comment ?? null,
          productCategory: input.productCategory ?? null,
          resolved: input.resolved ?? null,
          messageCount: input.messageCount ?? null,
          conversationSummary: input.conversationSummary ?? null,
          chatLog: input.chatLog ?? null,
          sessionDuration: input.sessionDuration ?? null,
        });

        // Notify owner of new Strat feedback
        try {
          const { notifyOwner } = await import("../_core/notification");
          const stars = "\u2605".repeat(input.rating) + "\u2606".repeat(5 - input.rating);
          const msgCount = input.messageCount ?? 0;
          const userName = ctx.user?.name || ctx.user?.email || 'Anonymous';

          // Build chat log transcript for notification
          let chatTranscript = '';
          if (input.chatLog && input.chatLog.length > 0) {
            chatTranscript = '\n\n--- CHAT LOG ---\n' + input.chatLog.map(msg => {
              const label = msg.role === 'user' ? `CUSTOMER` : `STRAT`;
              return `[${label}]: ${msg.content}`;
            }).join('\n\n');
          }

          const durationStr = input.sessionDuration
            ? `${Math.floor(input.sessionDuration / 60)}m ${input.sessionDuration % 60}s`
            : 'N/A';

          await notifyOwner({
            title: `Strat Feedback: ${stars} (${input.rating}/5) from ${userName}`,
            content: [
              `User: ${userName}`,
              input.comment ? `Comment: ${input.comment}` : null,
              `Messages: ${msgCount}`,
              `Session Duration: ${durationStr}`,
              input.resolved !== undefined ? `Resolved: ${input.resolved ? "Yes" : "No"}` : null,
              input.productCategory ? `Product: ${input.productCategory}` : null,
              input.conversationSummary ? `Summary: ${input.conversationSummary}` : null,
              chatTranscript || null,
            ].filter(Boolean).join("\n"),
          });
        } catch (_notifyErr) {
          // Non-critical — don't fail feedback submission if notification fails
        }

        return { success: true };
      } catch (err: any) {
        console.error("[Strat] Feedback save error:", err);
        return { success: false, error: err.message };
      }
    }),

  /** Get all feedback — admin only */
  getFeedback: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx }) => {
      // Only owner/admin can view feedback
      if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
        return { feedback: [], total: 0 };
      }
      try {
        const db = await getDb();
        const { desc, count, eq, sql } = await import("drizzle-orm");
        const limit = 50;
        const offset = 0;

        const rows = await db
          .select()
          .from(stratFeedback)
          .orderBy(desc(stratFeedback.createdAt))
          .limit(limit)
          .offset(offset);

        const [{ total }] = await db
          .select({ total: count() })
          .from(stratFeedback);

        // Join user names
        const { users } = await import("../../drizzle/schema");
        const userIds = [...new Set(rows.filter(r => r.userId).map(r => r.userId!))];
        let userMap: Record<number, string> = {};
        if (userIds.length > 0) {
          const userRows = await db
            .select({ id: users.id, name: users.name })
            .from(users);
          for (const u of userRows) {
            userMap[u.id] = u.name || "Unknown";
          }
        }

        return {
          feedback: rows.map(r => ({
            ...r,
            userName: r.userId ? (userMap[r.userId] || "Unknown") : "Anonymous",
          })),
          total,
        };
      } catch (err: any) {
        console.error("[Strat] getFeedback error:", err);
        return { feedback: [], total: 0 };
      }
    }),
});
