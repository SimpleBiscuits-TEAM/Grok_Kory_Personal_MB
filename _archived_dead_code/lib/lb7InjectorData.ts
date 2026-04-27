/**
 * LB7 Diesel Injector Flow Converter — Reference Data
 *
 * Source 1: {B0720} Main Injection Pulse — Stock OEM LB7 duration table (µs)
 *   Rows: mm3/stroke (0,1,2,3,4,5,6,7,8,9,10,20,30,40,50,60,70,80,90,100)
 *   Cols: MPa (0,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190)
 *
 * Source 2: S&S Diesel Motorsport SAC00™ flow sheet
 *   Base Engine: Duramax LB7, Type: New, Size: SAC00™
 *   Test Conditions: Viscor SAE-J967, 40°C, 1000 inj/min, S&S Bench #6
 *   8 injectors tested at 4 test points
 */

// ── Stock OEM LB7 Main Injection Pulse Table (µs) ──────────────────────────
// Row index = mm3/stroke, Column index = MPa pressure
export const LB7_PRESSURE_AXIS_MPA = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
export const LB7_QUANTITY_AXIS_MM3 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// Each row is a mm3/stroke value, each column is a MPa value
// Values in microseconds (µs)
export const LB7_STOCK_DURATION_TABLE: number[][] = [
  // 0 MPa  10     20     30     40     50     60     70     80     90    100    110    120    130    140    150    160    170    180    190
  [0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   0.0],   // 0 mm3
  [0.0, 339.0, 280.0, 220.0, 210.0, 198.0, 180.0, 161.0, 142.5, 138.5, 135.0, 131.0, 127.0, 127.0, 127.0, 127.0, 127.0, 127.0, 127.0, 127.0],   // 1 mm3
  [0.0, 477.0, 377.0, 270.0, 255.0, 242.0, 216.0, 198.0, 180.0, 168.0, 157.0, 153.0, 149.0, 139.0, 137.0, 135.0, 132.5, 130.0, 147.0, 147.0],   // 2 mm3
  [0.0, 530.0, 430.0, 306.5, 285.0, 274.0, 242.0, 220.0, 208.0, 193.0, 182.0, 178.0, 174.0, 158.0, 154.0, 148.5, 143.0, 138.0, 174.0, 174.0],   // 3 mm3
  [0.0, 572.5, 460.0, 331.5, 310.0, 300.0, 269.0, 247.0, 230.0, 221.0, 213.0, 209.0, 205.0, 183.0, 174.0, 166.5, 161.0, 156.0, 205.0, 205.0],   // 4 mm3
  [0.0, 591.5, 496.0, 356.5, 332.0, 318.0, 290.0, 270.5, 249.0, 237.5, 228.5, 224.5, 220.5, 201.0, 193.0, 184.0, 177.0, 174.0, 220.0, 220.0],   // 5 mm3
  [0.0, 629.5, 528.0, 387.0, 354.5, 334.0, 305.0, 284.0, 266.0, 253.0, 240.0, 236.0, 232.0, 213.0, 204.0, 196.0, 193.0, 186.0, 233.0, 233.0],   // 6 mm3
  [0.0, 673.0, 560.0, 423.0, 380.0, 350.0, 316.0, 299.0, 279.0, 268.0, 256.0, 252.0, 248.0, 231.0, 223.0, 216.0, 211.0, 203.0, 250.0, 250.0],   // 7 mm3
  [0.0, 714.0, 603.0, 460.0, 410.0, 365.0, 326.0, 309.0, 291.0, 279.5, 271.5, 267.5, 263.5, 248.0, 242.0, 233.0, 228.0, 223.0, 263.0, 263.0],   // 8 mm3
  [0.0, 740.0, 640.0, 519.0, 444.0, 382.0, 340.0, 318.0, 300.0, 291.0, 296.0, 289.0, 290.0, 276.0, 266.0, 264.0, 255.0, 240.0, 280.0, 280.0],   // 9 mm3
  [0.0, 770.0, 770.0, 587.0, 485.0, 394.0, 350.0, 329.0, 310.0, 300.0, 307.0, 298.0, 301.0, 288.0, 280.0, 278.0, 267.0, 254.0, 285.0, 285.0],   // 10 mm3
  [0.0,1006.0,1000.0, 760.0, 640.0, 555.0, 483.0, 430.0, 390.0, 371.0, 344.0, 331.0, 330.0, 316.0, 309.0, 309.0, 304.0, 302.0, 330.0, 330.0],   // 20 mm3
  [0.0,1270.0,1270.0,1020.0, 840.0, 712.0, 621.0, 560.0, 505.0, 470.0, 450.0, 430.0, 422.0, 411.0, 402.0, 390.0, 384.0, 382.0, 412.0, 412.0],   // 30 mm3
  [0.0,1700.0,1700.0,1460.0,1210.0, 970.0, 810.0, 700.0, 635.0, 589.0, 560.0, 522.0, 500.0, 483.0, 462.0, 456.0, 450.0, 444.0, 470.0, 470.0],   // 40 mm3
  [0.0,2070.0,2070.0,1874.0,1539.0,1340.0,1140.0,1020.0, 920.0, 845.0, 776.0, 716.0, 665.0, 627.0, 597.0, 572.0, 553.0, 546.0, 580.0, 580.0],   // 50 mm3
  [0.0,2438.0,2438.0,2173.0,1888.0,1640.0,1410.0,1269.0,1164.0,1080.0, 990.0, 930.0, 886.0, 850.0, 818.0, 780.0, 738.0, 747.0, 747.0, 747.0],   // 60 mm3
  [0.0,3021.0,3021.0,2606.5,2280.0,1900.0,1700.0,1509.0,1372.0,1270.0,1190.0,1130.0,1060.0,1025.0, 988.0, 957.0, 906.0, 920.0, 925.0, 925.0],   // 70 mm3
  [0.0,3583.0,3583.0,3072.0,2610.0,2210.0,1980.0,1760.0,1620.0,1481.0,1402.0,1321.0,1252.0,1190.0,1145.0,1103.0,1054.0,1065.0,1075.0,1075.0],   // 80 mm3
  [0.0,3583.0,3583.0,3360.0,2976.5,2580.0,2291.0,2127.0,1973.0,1840.0,1742.0,1643.0,1549.0,1469.0,1367.5,1281.5,1220.0,1229.5,1229.5,1229.5],   // 90 mm3
  [0.0,3583.0,3583.0,3500.0,3220.0,2880.0,2660.0,2470.0,2360.0,2217.5,2030.0,1910.0,1800.0,1720.0,1622.0,1540.0,1450.0,1431.0,1431.0,1431.0],   // 100 mm3
];

// ── S&S Diesel SAC00™ Flow Sheet Data ───────────────────────────────────────
// Test points: 4 conditions at specific MPa and µSec
// Injected Quantity in mm³/stroke for each of 8 injectors
export interface SSFlowTestPoint {
  testPoint: number;
  pressureMPa: number;
  durationUs: number;
  /** Injected quantity per injector (mm³/stroke), injectors 1-8 */
  injectorFlows: number[];
  /** Average flow across all 8 injectors */
  avgFlow: number;
  /** Variance */
  variance: string;
}

export const SS_SAC00_FLOW_DATA: SSFlowTestPoint[] = [
  {
    testPoint: 1,
    pressureMPa: 160,
    durationUs: 1700,
    injectorFlows: [127, 127, 127, 127, 127, 127, 127, 127],
    avgFlow: 127,
    variance: '0.0%',
  },
  {
    testPoint: 2,
    pressureMPa: 160,
    durationUs: 1350,
    injectorFlows: [101, 102, 102, 102, 102, 102, 103, 102],
    avgFlow: 102,
    variance: '2.0%',
  },
  {
    testPoint: 3,
    pressureMPa: 60,
    durationUs: 700,
    injectorFlows: [25.9, 28.7, 27.7, 26.2, 28.4, 28.9, 28.1, 26.8],
    avgFlow: 27.6,
    variance: '3 mm³',
  },
  {
    testPoint: 4,
    pressureMPa: 30,
    durationUs: 800,
    injectorFlows: [12.7, 14.6, 13.2, 12.5, 13, 14.3, 12.8, 11.7],
    avgFlow: 13.1,
    variance: '2.9 mm³',
  },
];

// Return flow data (not used in duration correction, but recorded for reference)
// Test Point: Return Flow at 160 MPa, 1350 µs
// Injector flows (mm³/stroke): [30, 31, 37, 30, 32, 28, 27, 27]

/**
 * ── Understanding the Conversion ──────────────────────────────────────────
 *
 * The stock OEM table maps (mm3/stroke, MPa) → duration (µs).
 * The stock injector delivers X mm3 at a given (MPa, duration).
 * The S&S SAC00 injector delivers a DIFFERENT quantity at the same (MPa, duration).
 *
 * From the flow sheet, we can determine the S&S injector's flow characteristics
 * relative to stock at specific test points:
 *
 * Test Point 1: 160 MPa, 1700 µs → S&S delivers 127 mm3/stroke
 *   Stock table at 160 MPa: 1700 µs is NOT in the table directly.
 *   Looking at row 80 (80 mm3), col 160 MPa = 1054 µs
 *   Looking at row 100 (100 mm3), col 160 MPa = 1450 µs
 *   So at 160 MPa, 1700 µs, stock would deliver ~115-120 mm3 (extrapolated)
 *   S&S delivers 127 mm3 → S&S flows ~6-10% MORE than stock at high pressure/duration
 *
 * Test Point 2: 160 MPa, 1350 µs → S&S delivers 102 mm3/stroke
 *   Stock table at 160 MPa, ~1350 µs → stock delivers ~90-95 mm3 (interpolated)
 *   S&S delivers 102 mm3 → S&S flows ~7-10% MORE
 *
 * Test Point 3: 60 MPa, 700 µs → S&S delivers ~27.6 mm3/stroke
 *   Stock table at 60 MPa: row 20 = 483 µs, row 30 = 621 µs, row 40 = 810 µs
 *   700 µs at 60 MPa → stock delivers ~35 mm3 (interpolated)
 *   S&S delivers 27.6 mm3 → S&S flows ~21% LESS than stock at mid pressure
 *
 * Test Point 4: 30 MPa, 800 µs → S&S delivers ~13.1 mm3/stroke
 *   Stock table at 30 MPa: row 20 = 760 µs, row 30 = 1020 µs
 *   800 µs at 30 MPa → stock delivers ~21.5 mm3 (interpolated)
 *   S&S delivers 13.1 mm3 → S&S flows ~39% LESS than stock at low pressure
 *
 * KEY INSIGHT: The S&S SAC00 injectors flow LESS at low pressures and MORE at
 * high pressures compared to stock. This is typical of performance injectors
 * with different nozzle geometry.
 *
 * CORRECTION APPROACH:
 * To make the S&S injectors deliver the SAME fuel quantity as stock at each
 * operating point, we need to INCREASE duration at low pressures (where S&S
 * flows less) and DECREASE duration at high pressures (where S&S flows more).
 *
 * The ratio is: corrected_duration = stock_duration × (stock_flow / ss_flow)
 * Where stock_flow and ss_flow are the flow rates at the same (MPa, duration).
 */

// ── Derived Flow Ratio at Test Points ───────────────────────────────────────
// We compute what the stock injector delivers at the same (MPa, µs) as each
// S&S test point, then derive the ratio.

export interface FlowRatioPoint {
  pressureMPa: number;
  durationUs: number;
  stockFlowMm3: number;   // What stock delivers at this (MPa, µs)
  ssFlowMm3: number;      // What S&S delivers at this (MPa, µs)
  ratio: number;           // stock / ss — multiply stock duration by this
}
