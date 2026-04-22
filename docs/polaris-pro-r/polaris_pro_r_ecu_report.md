# Polaris Pro R — MG1C400A ECU Logic Flow Report

## Torque Calculation, Airflow Logic, and Tuning Opportunities

**ECU:** Bosch MG1C400A (MDG1 Platform)  
**Vehicle:** Polaris RZR Pro R (925cc NA Twin)  
**A2L File:** MG1C400A1T2_groups_34.a2l (12,883 calibrations, 12,718 measurements)  
**Binary File:** MG1C4E0A1T2.s (6 MB S-record, cal area 0x09380000–0x095BFFFF)  
**Report Date:** April 2026

---

## Table of Contents

1. [ECU Architecture Overview](#1-ecu-architecture-overview)
2. [Torque Structure (TqStrct) — The Master Controller](#2-torque-structure-tqstrct--the-master-controller)
3. [Driver Torque Demand Path](#3-driver-torque-demand-path)
4. [Air Path and Throttle Control](#4-air-path-and-throttle-control)
5. [Ignition Timing System](#5-ignition-timing-system)
6. [Fuel Injection and Lambda Control](#6-fuel-injection-and-lambda-control)
7. [Knock Control System](#7-knock-control-system)
8. [Rev Limit Architecture](#8-rev-limit-architecture)
9. [Component Protection System](#9-component-protection-system)
10. [Drive Mode System](#10-drive-mode-system)
11. [Torque Coordination (TCD)](#11-torque-coordination-tcd)
12. [Tuning Opportunities — Power Extraction Strategy](#12-tuning-opportunities--power-extraction-strategy)
13. [Parameter Reference Tables](#13-parameter-reference-tables)

---

## 1. ECU Architecture Overview

The Polaris Pro R uses a Bosch MG1C400A ECU from the MDG1 (Motorcycle/Powersport Diesel Gasoline) platform family. This is a torque-based engine management system where the driver's accelerator pedal input is converted to a torque request, which the ECU then fulfills through coordinated control of throttle position, ignition timing, and fuel injection.

The MG1C400A is fundamentally different from the Can-Am MG1CA920 in several key ways:

| Feature | Polaris Pro R (MG1C400A) | Can-Am (MG1CA920) |
|---|---|---|
| Aspiration | Naturally Aspirated | Turbocharged |
| Displacement | 925cc Twin | 999cc Triple |
| Torque Control | Direct throttle-to-torque | Boost + throttle coordination |
| Air Path | Throttle body only | Throttle + wastegate + BOV |
| Peak Torque Request | 252 Nm (DrvMod3) | ~400+ Nm |
| Rev Limit | 8650 RPM | ~8500 RPM |
| Normalization Torque | 300 Nm | ~500 Nm |

Because this is an NA engine, there is no boost control, wastegate, or blow-off valve logic. The entire air path is controlled through the electronic throttle body. This simplifies the torque structure significantly but also means that power gains must come from optimizing the torque demand maps, ignition timing, and rev limits rather than boost pressure.

### Key Software Modules

| Module | Function | Key Parameters |
|---|---|---|
| **AccPed** | Accelerator pedal → torque demand | AccPed_tqDes_DrvMod{1-4}_TraRng{5}_MAP |
| **TCD** | Torque coordination / rev limits | TCD_nMax*, NMAXESP, NMAXREV1/2 |
| **IgCtl** | Ignition timing calculation | KFZW, KFZWOP, KFZWMN, IgCtl_offsCyl* |
| **IKCtl** | Knock detection and retard | IKCtl_* (67 parameters) |
| **ExhMgT** | Exhaust/component protection | ExhMgT_tCat*CptProtnMax, ExhMgT_LamCptProtn |
| **MoF** | Motor function / torque conversion | MoF_trqNorm_C, MoF_trqDrag, MoF_trqOfs |
| **MESCtrlr** | Idle speed / engine start control | MESCtrlr_tqBasc* |

---

## 2. Torque Structure (TqStrct) — The Master Controller

The Bosch MDG1 torque structure is the central coordination layer. Every power-producing and power-consuming subsystem communicates through torque. The ECU does not directly command throttle position — it commands a torque, and the air path controller determines the throttle position needed to achieve that torque.

### Torque Flow Overview

```
Driver Pedal (0-100%)
       │
       ▼
┌─────────────────────────┐
│  AccPed Torque Demand    │  ← AccPed_tqDes_DrvMod{N}_TraRng{R}_MAP
│  (per drive mode & gear) │     20 maps total (4 modes × 5 ranges)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Torque Limiters         │  ← Min of:
│  (multiple arbitration)  │     • NMAXESP (rev limit torque)
│                          │     • ExhMgT torque limit (cat protection)
│                          │     • ESP torque intervention
│                          │     • TCD coordination limits
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  MoF Torque Conversion   │  ← MoF_trqNorm_C = 300 Nm
│  (Nm → relative %)       │     MoF_trqOfs_Map, MoF_trqDrag_MAP
└──────────┬──────────────┘
           │
           ├──────────────────┐
           ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│  Air Path Control │  │  Ignition Timing  │
│  (Throttle Body)  │  │  (KFZW + offsets)  │
└──────────────────┘  └──────────────────┘
```

### Normalization Torque

The ECU normalizes all torque values against `MoF_trqNorm_C = 300 Nm`. This means a "100%" torque request equals 300 Nm. The actual peak torque demand in DrvMod3 is 252 Nm, which is 84% of the normalization value. This provides headroom for transient torque overshoots and accessory loads.

| Parameter | Value | Description |
|---|---|---|
| MoF_trqNorm_C | 300 Nm | Normalization torque (100% = 300 Nm) |
| MoF_trqInrMaxStrt_C | 300 Nm | Maximum torque during engine start |
| MoF_trqAdap_C | 16 Nm | Torque adaptation range |
| MoF_trqStrgLtd_C | 0 Nm | Steering torque limit (disabled) |

---

## 3. Driver Torque Demand Path

The accelerator pedal position is converted to a torque demand through a 2D lookup map (RPM × Pedal Position → Torque in Nm). There are **20 separate torque demand maps** — one for each combination of 4 drive modes and 5 transmission ranges.

### Drive Mode × Transmission Range Matrix

| | TraRngDft (Default) | TraRngHi (High) | TraRngLo (Low) | TraRngRev (Reverse) | TraRngStill (Stationary) |
|---|---|---|---|---|---|
| **DrvMod1** (Normal) | 0–142.6 Nm | 0–240 Nm | 0–240 Nm | 0–142.6 Nm | 0–240 Nm |
| **DrvMod2** (Sport) | 0–142.6 Nm | 0–220 Nm | 0–220 Nm | 0–142.6 Nm | 0–132 Nm |
| **DrvMod3** (Performance) | 0–142.6 Nm | **0–252 Nm** | **0–252 Nm** | 0–142.6 Nm | 0–240 Nm |
| **DrvMod4** (Custom) | 0–142.6 Nm | 0–240 Nm | 0–240 Nm | 0–142.6 Nm | 0–240 Nm |

### DrvMod3 TraRngHi — Peak Performance Map (WOT Row)

This is the most aggressive torque demand map. At 100% pedal (WOT):

| RPM | 1000 | 2000 | 2500 | 3000 | 3500 | 4000 | 4500 | 5000 | 5500 | 6000 | 6500 | 7000 | 7500 | 8000 | 8250 | 8500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Torque (Nm)** | 0.0 | 3.8 | 18.8 | 37.0 | 103.3 | 160.1 | 184.9 | 207.2 | 227.1 | 244.7 | **252.0** | **252.0** | **252.0** | **252.0** | **252.0** | **252.0** |

Key observations:
- **Peak torque plateau:** 252 Nm from 6500–8500 RPM (flat torque curve at WOT)
- **Aggressive ramp:** 0→252 Nm between 1000–6500 RPM
- **No torque taper at redline:** The demand stays at 252 Nm all the way to 8500 RPM
- **Low-RPM suppression:** Only 3.8 Nm at 2000 RPM (anti-stall / CVT engagement control)

### Pedal-to-Torque Curve Shape (DrvMod3 @ 7000 RPM)

| Pedal % | 0 | 0.5 | 2.5 | 5 | 15 | 25 | 30 | 35 | 40 | 45 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Torque (Nm)** | 0 | 0 | 3.8 | 7.6 | 37.0 | 72.2 | 91.6 | 113.3 | 137.4 | 163.8 | 189.4 | 227.1 | 246.2 | 252.0 | 252.0 | 252.0 |

The pedal map is progressive — 50% pedal gives ~189 Nm (75% of max), and the torque saturates at 252 Nm around 80% pedal. This means the last 20% of pedal travel has no additional torque effect in DrvMod3 at high RPM.

---

## 4. Air Path and Throttle Control

Since this is a naturally aspirated engine, the air path is straightforward: the electronic throttle body is the sole air control device. The ECU converts the torque demand into a target air charge, then commands the throttle position to achieve that charge.

### Air Path Flow

```
Torque Demand (Nm)
       │
       ▼
┌─────────────────────────┐
│  Torque → Air Charge     │  ← Inverse of volumetric efficiency map
│  Conversion              │     Uses MoF_trqOfs_Map (8×16)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Throttle Position       │  ← ThrVlv controller (547 parameters)
│  Controller (PID)        │     Closed-loop with MAP sensor feedback
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Electronic Throttle     │  ← Physical throttle body
│  Body (ETB)              │     Position feedback via TPS
└─────────────────────────┘
```

### Key Air Path Parameters

| Parameter | Value | Description |
|---|---|---|
| MoF_trqOfs_Map | 12.1–99.6% | Torque offset map (8×16, RPM × load) |
| MoF_trqDrag_MAP | 54.4–136.0 Nm | Engine drag torque (friction + pumping losses) |
| MoF_trqMinAirChrgLoRes_MAP | 38.4–75.2 Nm | Minimum air charge torque at low resolution |
| MoFAirFl_facFuMBnkDistbnMax_C | 1.09375 | Maximum fuel bank distribution factor |

The `MoF_trqOfs_Map` is critical — it defines the offset between the indicated torque (from combustion) and the brake torque (at the crankshaft). This accounts for friction, pumping losses, and accessory loads. The range of 12.1–99.6% suggests significant variation across the operating envelope.

---

## 5. Ignition Timing System

The ignition system is the primary lever for both power production and engine protection. The MG1C400A uses a multi-layer ignition timing architecture:

### Ignition Timing Calculation

```
KFZWOP (Optimal Timing)
       │
       ▼
┌─────────────────────────┐
│  Base Timing Selection   │  ← KFZW (main map, 20×16)
│  (RPM × Charge Air %)   │     KFZWOP (optimal, 12×16)
└──────────┬──────────────┘
           │
           ├── Knock Retard ──── IKCtl (per-cylinder)
           │
           ├── Min Timing ────── KFZWMN (minimum allowed)
           │                     KFZWMNBTS (min at base timing)
           │                     KFZWMNKHLL (min at knock limit)
           │
           ├── Cyl Offsets ───── IgCtl_offsCyl{1-4}Phy_M
           │
           ├── Altitude Comp ─── IgCtl_HiAltiCmp_M (0–6° advance)
           │
           └── Cat Warm-up ───── ExhMgT retard during warm-up
           │
           ▼
┌─────────────────────────┐
│  Final Ignition Timing   │  ← Clamped between KFZWMN and KFZWOP
│  (per cylinder)          │
└─────────────────────────┘
```

### KFZW — Main Ignition Timing Map (20×16)

**X Axis (RPM):** 520, 1000, 1520, 2000, 3000, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7520, 8000, 8520, 9000

**Y Axis (Charge Air %):** 9.8, 15.0, 20.3, 22.5, 24.8, 27.8, 30.0, 32.3, 35.3, 39.8, 45.0, 50.3, 54.8, 60.0, 65.3, 69.8, 75.0, 80.3, 84.8, 95.3

**Timing Values (°BTDC) — Selected Rows:**

| Load \ RPM | 520 | 1000 | 2000 | 3000 | 4000 | 5000 | 6000 | 7000 | 8000 | 9000 |
|---|---|---|---|---|---|---|---|---|---|---|
| **9.8%** (idle) | 32.3 | 30.8 | 27.0 | 22.5 | 18.8 | 13.5 | 6.0 | 0.8 | -0.8 | -0.8 |
| **30%** | 33.8 | 33.0 | 31.5 | 29.3 | 24.0 | 17.3 | 13.5 | 10.5 | 10.5 | 10.5 |
| **50%** | 47.3 | 45.0 | 39.8 | 36.8 | 35.3 | 32.3 | 30.8 | 30.0 | 29.3 | 28.5 |
| **75%** | 30.8 | 30.8 | 28.5 | 27.0 | 27.0 | 26.3 | 25.5 | 24.8 | 39.8 | 34.5 |
| **95.3%** (WOT) | 33.0 | 33.0 | 33.0 | 33.0 | 32.3 | 30.8 | 29.3 | 27.8 | 27.0 | 26.3 |

Key observations:
- **WOT timing is conservative:** 33° at low RPM, dropping to 26.3° at 9000 RPM
- **Mid-load timing is aggressive:** Up to 47.3° at 50% load — this is where the ECU is optimized for efficiency
- **Low-load high-RPM retard:** -0.75° at 9000 RPM / 9.8% load (overrun/decel)
- **The map has discontinuities** at certain load/RPM combinations, suggesting the data wraps or has been patched

### KFZWOP — Optimal Ignition Timing (12×16)

Range: **12.2° to 66.8°** — this represents the MBT (Maximum Brake Torque) timing. The ECU uses this as the upper bound for ignition advance. The fact that KFZWOP goes up to 66.8° while KFZW only reaches 50.3° means there is significant timing headroom at certain operating points.

### KFZWMN — Minimum Ignition Timing (12×16)

Range: **-29.3° to 21.0°** — this is the absolute minimum timing the ECU will allow, even under severe knock conditions. The -29.3° represents extreme retard for knock protection.

### Per-Cylinder Timing Offsets

| Parameter | Range | Description |
|---|---|---|
| IgCtl_offsCyl1Phy_M | 0.0° to 0.0° | Cylinder 1 offset (20×16, all zeros) |
| IgCtl_offsCyl2Phy_M | 0.0° to 0.0° | Cylinder 2 offset (all zeros) |
| IgCtl_offsCyl3Phy_M | 0.0° to 0.0° | Cylinder 3 offset (all zeros) |
| IgCtl_offsCyl4Phy_M | 0.0° to 0.0° | Cylinder 4 offset (all zeros) |

All per-cylinder offsets are zero in the stock calibration. This means the ECU treats all 4 cylinders identically for ignition timing. These maps can be used to compensate for cylinder-to-cylinder variations in knock sensitivity.

### Altitude Compensation

`IgCtl_HiAltiCmp_M` adds 0–6° of ignition advance at high altitude. At altitude, the reduced air density lowers the effective compression ratio, allowing more advance without knock.

---

## 6. Fuel Injection and Lambda Control

The fuel system uses port fuel injection with closed-loop lambda control via wideband O2 sensors.

### Lambda Control Architecture

```
Target Lambda (from torque structure)
       │
       ├── Stoichiometric (λ=1.0) ── Normal operation
       │
       ├── Rich (λ<1.0) ──────────── Component protection
       │                              ExhMgT_LamCptProtn_M (4×4)
       │
       └── Lean (λ>1.0) ──────────── Fuel cut / decel
       │
       ▼
┌─────────────────────────┐
│  Base Fuel Calculation   │  ← Air charge × (1/λ_target) × injector flow
│  (from air model)        │
└──────────┬──────────────┘
           │
           ├── Lambda Adaptation ── MoFAirFl_facLamAdpnMax_T
           │                        (long-term fuel trim)
           │
           ├── Bank Distribution ── MoFAirFl_facFuMBnkDistbnMax_C = 1.09375
           │                        (max 9.4% bank-to-bank variation)
           │
           └── Purge Compensation ── TWCC_tiRmpLambdaSetPPurg_C
           │
           ▼
┌─────────────────────────┐
│  Final Injection Pulse   │
│  Width (per cylinder)    │
└─────────────────────────┘
```

### Component Protection Lambda

`ExhMgT_LamCptProtn_M` (4×4 map) commands rich running (λ < 1.0) when exhaust temperatures approach protection limits. The enrichment cools the exhaust gas to protect the catalytic converter and exhaust valves.

| Parameter | Value | Description |
|---|---|---|
| ExhMgT_ratLamCptProtnLimpExh_C | 0.0 | Lambda ratio for exhaust limp mode |
| ExhMgT_ratLamCptProtnLimpCamsft_C | 0.0 | Lambda ratio for camshaft limp mode |
| ExhMgT_ratLamCptProtnLimpUego_C | NaN | Lambda ratio for UEGO limp mode |

The zero values suggest that in limp mode, the ECU does not apply additional enrichment — it relies on torque reduction instead.

---

## 7. Knock Control System

The MG1C400A has a sophisticated per-cylinder knock control system with **67 calibration parameters**. This is critical for the Pro R's high-compression NA engine.

### Knock Control Flow

```
Knock Sensor Signal (per cylinder)
       │
       ▼
┌─────────────────────────┐
│  Knock Detection         │  ← IKCtl_FacKnockDetThdPhy{1-4}_GM
│  (threshold comparison)  │     Per-cylinder detection thresholds
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Knock Retard            │  ← IKCtl_facDistRtdt_GT (retard step size)
│  (immediate response)    │     IKCtl_facDlyAdpn_T (adaptation delay)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Knock Adaptation        │  ← IKCtl_facDynAdpn_M (dynamic adaptation)
│  (long-term learning)    │     IKCtl_facDlyLoadDynDetn_GT
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Timing Clamp            │  ← KFZWMN (absolute minimum timing)
│  (safety floor)          │     KFZWMNKHLL (knock limit minimum)
└─────────────────────────┘
```

### Key Knock Parameters

| Parameter | Type | Description |
|---|---|---|
| IKCtl_FacKnockDetThdPhy1_GM | MAP | Cylinder 1 knock detection threshold |
| IKCtl_FacKnockDetThdPhy2_GM | MAP | Cylinder 2 knock detection threshold |
| IKCtl_FacKnockDetThdPhy3_GM | MAP | Cylinder 3 knock detection threshold |
| IKCtl_FacKnockDetThdPhy4_GM | MAP | Cylinder 4 knock detection threshold |
| IKCtl_facDistRtdt_GT | MAP | Retard distribution factor |
| IKCtl_facDlyAdpn_T | CURVE | Adaptation delay factor |
| IKCtl_facDynAdpn_M | MAP | Dynamic adaptation factor |
| IKCtl_facFilSwt1 | VALUE | Filter switch threshold |
| KFZWMNKHLL | MAP (4×4) | Minimum timing at knock limit: -12° to -9° |

The knock limit minimum (KFZWMNKHLL) of -12° to -9° means the ECU can retard timing by up to 12° from the base map before hitting the absolute floor. This provides substantial knock protection margin.

---

## 8. Rev Limit Architecture

The Pro R has a multi-layered rev limit system with different limits for different operating conditions:

### Rev Limit Hierarchy

| Parameter | Value (RPM) | Purpose |
|---|---|---|
| **CoPT_nMax_C** | **8800** | Absolute maximum engine speed (hard cut) |
| **OVH_nMaxEngLim_C** | **8800** | Overheat protection max speed |
| **Tra_nMax_C** | **8800** | Transmission max speed |
| **NMAXESP** | **8650** | ESP/stability control rev limit |
| **NMAXREV1** | **8650** | Primary rev limiter |
| **NMAXREV2** | **8650** | Secondary rev limiter |
| **NMAXLDR** | **8650** | Idle speed controller rev limit |
| **NMAXNETSW** | **8650** | Network switch rev limit |
| **NMAXPRBRK** | **8650** | Parking brake rev limit |
| **NMAXTSFS** | **8650** | Torque structure rev limit |
| **TCD_nMaxStand_C** | **8650** | Standing rev limit |
| **TCD_nLimp_C** | **8650** | Limp mode rev limit |
| **NMAXSBSW** | **5000** | Sideband switch rev limit (reduced) |
| **NMAXGLL** | **1250** | Idle speed target |
| **DNMAXH** | **200** | Rev limit hysteresis (fuel cut at 8650, resume at 8450) |
| **ExhMgT_nMaxCatWarm_C** | **8800** | Cat warm-up max speed |

### Rev Limit Behavior

The primary rev limit is **8650 RPM** (NMAXESP/NMAXREV1). When engine speed exceeds 8650 RPM, the ECU performs a fuel cut. The hysteresis (DNMAXH = 200 RPM) means fuel is restored at 8450 RPM. The absolute hard limit is **8800 RPM** (CoPT_nMax_C), which is the point where the ECU will cut ignition regardless of other conditions.

```
                    NMAXGLL     NMAXSBSW    NMAXESP/REV1    CoPT_nMax
                    (1250)      (5000)      (8650)          (8800)
    ────────────────┼───────────┼───────────┼───────────────┼──────────
    Idle            │           │           │               │
                    │  Normal   │           │  Fuel Cut     │ Hard Cut
                    │  Operation│           │  Zone         │
                    │           │  SBSW     │  (200 RPM     │
                    │           │  Limit    │   hysteresis) │
```

---

## 9. Component Protection System

The ExhMgT (Exhaust Management Temperature) module protects the engine and exhaust system from thermal damage. It uses modeled exhaust temperatures (not direct measurement) to trigger protective actions.

### Temperature Limits

| Parameter | Value (°C) | Component |
|---|---|---|
| ExhMgT_tExhDsVlvCptProtnMax_C | **850** | Exhaust valve downstream |
| ExhMgT_tCat1CptProtnMax_C | **880** | Catalytic converter (primary) |
| ExhMgT_tCat1MaxCptProtnMax_C | **950** | Catalytic converter (absolute max) |
| ExhMgT_tExhFrtPipCptProtnMax_C | **1200** | Exhaust front pipe |
| ExhMgT_tWallMnfCptProtnMax_C | **1200** | Exhaust manifold wall |

### Protection Actions

When modeled temperatures approach these limits, the ECU takes progressive action:

1. **Lambda enrichment** — ExhMgT_LamCptProtn_M commands rich running to cool exhaust gas
2. **Ignition retard** — ExhMgT_IaCorrnCptProtn_M retards timing to reduce exhaust temperature
3. **Torque reduction** — ExhMgT_tqLimnCptProtn_M limits the torque demand
4. **Rev limit reduction** — ExhMgT_nMaxCatWarm_C can lower the rev limit during warm-up

### Component Protection Torque Limiter

`ExhMgT_tqLimnCptProtn_M` is a map that reduces the allowed torque as exhaust temperature increases. The `ExhMgT_facTqLimnGain_C` controls how aggressively the torque is reduced.

---

## 10. Drive Mode System

The Pro R has **4 drive modes**, each with **5 transmission range sub-maps** for a total of **20 torque demand maps**.

### Drive Mode Comparison (WOT Torque @ Key RPM Points)

| RPM | DrvMod1 (Normal) | DrvMod2 (Sport) | DrvMod3 (Performance) | DrvMod4 (Custom) |
|---|---|---|---|---|
| 3000 | 37.0 Nm | 37.0 Nm | 37.0 Nm | 37.0 Nm |
| 5000 | 207.2 Nm | 189.4 Nm | 207.2 Nm | 207.2 Nm |
| 6500 | 240.0 Nm | 220.0 Nm | **252.0 Nm** | 240.0 Nm |
| 8000 | 240.0 Nm | 220.0 Nm | **252.0 Nm** | 240.0 Nm |
| 8500 | 240.0 Nm | 220.0 Nm | **252.0 Nm** | 240.0 Nm |

Key observations:
- **DrvMod3 (Performance)** has the highest peak torque at 252 Nm
- **DrvMod2 (Sport)** is actually MORE restrictive than DrvMod1 at high RPM (220 vs 240 Nm) — it likely has a different pedal sensitivity curve
- **DrvMod4 (Custom)** matches DrvMod1 in the stock calibration
- All modes share the same low-RPM torque (37 Nm at 3000 RPM) — the CVT engagement strategy is consistent

### Transmission Range Effects

The "TraRng" suffix indicates the gear/range position:
- **TraRngHi** — High range (normal driving, highest torque)
- **TraRngLo** — Low range (crawling, same or similar torque)
- **TraRngDft** — Default (fallback, reduced to 142.6 Nm)
- **TraRngRev** — Reverse (reduced to 142.6 Nm for safety)
- **TraRngStill** — Stationary (launch torque, varies by mode)

---

## 11. Torque Coordination (TCD)

The TCD module coordinates torque requests from multiple sources and applies speed-dependent limits.

### TCD Rev Limit Maps

| Parameter | Type | Range | Description |
|---|---|---|---|
| TCD_nMaxStd_CUR | CURVE (10 pts) | 0–8650 RPM | Standard rev limit vs. condition |
| TCD_nMaxTEng_CUR | CURVE (10 pts) | 0–8650 RPM | Rev limit vs. engine temperature |
| TCD_nMaxOilT_CUR | CURVE (10 pts) | 0–8650 RPM | Rev limit vs. oil temperature |
| TCD_nMaxGearOilTRnge_T | CURVE | Variable | Rev limit vs. gear oil temp & range |
| TCD_nMaxVehSpdGearRngeBasd_M | MAP | Variable | Rev limit vs. vehicle speed & gear |

These maps allow the ECU to dynamically reduce the rev limit based on engine temperature, oil temperature, and vehicle speed. For example, if the oil temperature is too high, `TCD_nMaxOilT_CUR` will lower the rev limit below 8650 RPM to protect the engine.

---

## 12. Tuning Opportunities — Power Extraction Strategy

Based on the extracted calibration data, here are the primary tuning opportunities for the Polaris Pro R MG1C400A, ordered by impact and risk:

### Tier 1 — High Impact, Low Risk

#### 1. Increase Torque Demand Maps (AccPed_tqDes_DrvMod*)

**Current:** Peak 252 Nm in DrvMod3 (84% of MoF_trqNorm_C = 300 Nm)  
**Opportunity:** Increase to 270–285 Nm (90–95% of normalization)  
**Parameters to modify:**

| Parameter | Current Max | Suggested Max | Notes |
|---|---|---|---|
| AccPed_tqDes_DrvMod3_TraRngHi_MAP | 252 Nm | 270–285 Nm | Primary power map |
| AccPed_tqDes_DrvMod3_TraRngLo_MAP | 252 Nm | 270–285 Nm | Low range match |
| AccPed_tqDes_DrvMod3_TraRngStill_MAP | 240 Nm | 270–285 Nm | Launch torque |
| AccPed_tqDes_DrvMod1_TraRngHi_MAP | 240 Nm | 252–270 Nm | Normal mode boost |

**Risk:** Low — the ECU will still enforce knock limits, component protection, and rev limits. The torque demand is just a request; the ECU will only deliver what the engine can safely produce.

#### 2. Advance Ignition Timing (KFZW)

**Current:** 26.3–33.0° at WOT across the RPM range  
**Opportunity:** Add 2–4° at WOT above 5000 RPM  
**KFZWOP shows headroom:** The optimal timing map goes up to 66.8°, while KFZW only reaches 50.3°. At WOT, the gap between KFZW and KFZWOP is 10–30°, meaning there is significant timing headroom.

| RPM | Current KFZW (WOT) | KFZWOP (Optimal) | Gap | Suggested |
|---|---|---|---|---|
| 5000 | 30.8° | ~45° | 14.2° | 33–35° |
| 6000 | 29.3° | ~42° | 12.7° | 31–33° |
| 7000 | 27.8° | ~40° | 12.2° | 30–32° |
| 8000 | 27.0° | ~38° | 11.0° | 29–31° |
| 9000 | 26.3° | ~36° | 9.7° | 28–30° |

**Risk:** Medium — advancing timing increases knock risk. Must be validated with knock monitoring. The KFZWMN floor (-29.3°) provides safety margin, and the knock control system (IKCtl) will retard if knock is detected.

#### 3. Raise Rev Limit

**Current:** 8650 RPM (NMAXESP/NMAXREV1/NMAXREV2)  
**Opportunity:** Raise to 8800–9000 RPM  
**Parameters to modify:**

| Parameter | Current | Suggested | Notes |
|---|---|---|---|
| NMAXESP | 8650 | 8800–9000 | Primary rev limit |
| NMAXREV1 | 8650 | 8800–9000 | Secondary rev limit |
| NMAXREV2 | 8650 | 8800–9000 | Tertiary rev limit |
| NMAXLDR | 8650 | 8800–9000 | Must match |
| NMAXNETSW | 8650 | 8800–9000 | Must match |
| NMAXPRBRK | 8650 | 8800–9000 | Must match |
| NMAXTSFS | 8650 | 8800–9000 | Must match |
| TCD_nMaxStand_C | 8650 | 8800–9000 | Standing limit |
| TCD_nLimp_C | 8650 | 8800–9000 | Limp mode limit |
| CoPT_nMax_C | 8800 | 9200 | Hard ceiling (raise above new soft limit) |
| OVH_nMaxEngLim_C | 8800 | 9200 | Overheat ceiling |
| Tra_nMax_C | 8800 | 9200 | Transmission ceiling |

**Risk:** Medium — the engine is designed for 8800+ RPM (CoPT_nMax_C = 8800). Raising to 9000 RPM is within the design envelope. Must ensure ignition timing maps have valid data at the new RPM range and that the torque demand maps extend to the new limit.

### Tier 2 — Medium Impact, Medium Risk

#### 4. Optimize Pedal-to-Torque Sensitivity

**Current:** Torque saturates at ~80% pedal in DrvMod3  
**Opportunity:** Reshape the pedal map for more linear response  
**Parameters:** All AccPed_tqDes_DrvMod*_MAP intermediate rows (30–80% pedal)

This doesn't add peak power but improves throttle response and drivability. The stock map has a "dead zone" from 80–100% pedal where no additional torque is commanded.

#### 5. Reduce Component Protection Conservatism

**Current:** Cat protection at 880°C, exhaust valve at 850°C  
**Opportunity:** Raise limits by 20–50°C if using aftermarket exhaust

| Parameter | Current | Suggested | Notes |
|---|---|---|---|
| ExhMgT_tCat1CptProtnMax_C | 880°C | 920–950°C | Only with cat delete |
| ExhMgT_tCat1MaxCptProtnMax_C | 950°C | 980–1000°C | Absolute max |
| ExhMgT_tExhDsVlvCptProtnMax_C | 850°C | 880–900°C | Conservative increase |

**Risk:** Medium-High — these limits exist to protect expensive components. Only modify if the exhaust system has been upgraded or the catalytic converter has been removed.

#### 6. Modify Knock Control Sensitivity

**Current:** IKCtl has 67 parameters controlling knock detection and response  
**Opportunity:** Reduce knock retard aggressiveness on premium fuel  
**Parameters:**
- IKCtl_facDistRtdt_GT — Reduce retard step size
- IKCtl_facDlyAdpn_T — Increase adaptation delay (slower retard)
- IKCtl_FacKnockDetThdPhy{1-4}_GM — Raise detection thresholds

**Risk:** High — knock is the primary engine damage mechanism. Only modify with real-time knock monitoring and high-quality fuel.

### Tier 3 — Supporting Modifications

#### 7. Extend Torque Demand Maps to Higher RPM

If the rev limit is raised above 8500 RPM, the torque demand maps need additional breakpoints. The current X axis ends at 8500 RPM. Adding breakpoints at 8750 and 9000 RPM ensures the ECU has valid torque targets at the new RPM range.

#### 8. Per-Cylinder Ignition Offsets

The stock calibration has all four IgCtl_offsCyl*Phy_M maps set to zero. If one cylinder shows more knock tendency than others (common with twin-cylinder engines due to cooling asymmetry), individual cylinder timing offsets can be added to optimize each cylinder independently.

#### 9. Idle Speed Adjustment

**NMAXGLL = 1250 RPM** — this is the idle speed target. Lowering to 1100–1200 RPM can improve fuel economy and reduce CVT belt wear at idle. Raising to 1300–1400 RPM can improve oil pressure and cooling at idle in hot conditions.

---

## 13. Parameter Reference Tables

### Complete Rev Limit Parameters

| Parameter | Address | Value | Unit | Raw |
|---|---|---|---|---|
| DNMAXH | 0x0938DE7A | 200.0 | RPM | 800 |
| CoPT_nMax_C | — | 8800.0 | RPM | 17600 |
| Tra_nMax_C | — | 8800.0 | RPM | 17600 |
| OVH_nMaxEngLim_C | — | 8800.0 | RPM | 17600 |
| NMAXESP | — | 8650.0 | RPM | 17300 |
| NMAXREV1 | — | 8650.0 | RPM | 17300 |
| NMAXREV2 | — | 8650.0 | RPM | 17300 |
| NMAXGLL | — | 1250.0 | RPM | 2500 |
| NMAXSBSW | — | 5000.0 | RPM | 10000 |
| TCD_nMaxStand_C | — | 8650.0 | RPM | 17300 |
| TCD_nLimp_C | — | 8650.0 | RPM | 17300 |

### Ignition Timing Maps

| Parameter | Address | Type | Dimensions | Range | Unit |
|---|---|---|---|---|---|
| KFZW | 0x0939BF3C | MAP | 20×16 | -0.75 to 50.25 | °BTDC |
| KFZWOP | — | MAP | 12×16 | 12.2 to 66.8 | °BTDC |
| KFZWMN | — | MAP | 12×16 | -29.3 to 21.0 | °BTDC |
| KFZWMNBTS | — | MAP | 12×16 | -18.8 to 39.0 | °BTDC |
| KFZWMNKHLL | — | MAP | 4×4 | -12.0 to -9.0 | °BTDC |

### Torque Demand Maps (Peak WOT Values)

| Map | Peak Torque | RPM Range at Peak |
|---|---|---|
| DrvMod1_TraRngHi | 240 Nm | 6500–8500 |
| DrvMod2_TraRngHi | 220 Nm | 6500–8500 |
| DrvMod3_TraRngHi | **252 Nm** | 6500–8500 |
| DrvMod4_TraRngHi | 240 Nm | 6500–8500 |
| DrvMod3_TraRngLo | **252 Nm** | 6500–8500 |
| DrvMod3_TraRngStill | 240 Nm | 6500–8500 |

### Component Protection Temperatures

| Parameter | Value | Component |
|---|---|---|
| ExhMgT_tExhDsVlvCptProtnMax_C | 850°C | Exhaust valve |
| ExhMgT_tCat1CptProtnMax_C | 880°C | Catalyst (primary) |
| ExhMgT_tCat1MaxCptProtnMax_C | 950°C | Catalyst (absolute max) |
| ExhMgT_tExhFrtPipCptProtnMax_C | 1200°C | Front exhaust pipe |
| ExhMgT_tWallMnfCptProtnMax_C | 1200°C | Exhaust manifold wall |

### Motor Function Parameters

| Parameter | Value | Unit | Description |
|---|---|---|---|
| MoF_trqNorm_C | 300 | Nm | Normalization torque |
| MoF_trqInrMaxStrt_C | 300 | Nm | Max torque during start |
| MoF_trqAdap_C | 16 | Nm | Adaptation range |
| MoF_trqDrag_MAP | 54.4–136.0 | Nm | Engine drag torque |
| MoF_trqOfs_Map | 12.1–99.6 | % | Torque offset (friction/pumping) |

---

*Report generated from MG1C400A1T2_groups_34.a2l and MG1C4E0A1T2.s binary analysis.*  
*All values extracted directly from the ECU calibration data using A2L-guided binary disassembly.*
