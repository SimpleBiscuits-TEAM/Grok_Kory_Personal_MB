// AUTO-GENERATED from 2024 GM 24OBDG06C HD ECM Summary Tables
// Source: https://gsitlc.ext.gm.com/gmspo/mode6/pdf/2024/24OBDG06C%20HD.pdf
// 292 DTC codes covering all ECM-monitored systems on the 2024 GM HD Duramax

export interface GmDtcEntry {
  code: string;
  title: string;
  system: string;
  description: string;
  threshold: string;
  severity: "critical" | "warning" | "info";
  mil: string;
  related_pids: string[];
  datalog_check: boolean;
}

export const GM_HD_DTCS: GmDtcEntry[] = 
[
  {
    "code": "P0016",
    "title": "Crankshaft/Camshaft Position Correlation Bank 1 Sensor A",
    "system": "Engine - Timing",
    "description": "Detects cam to crank misalignment by monitoring if cam sensor A occurs during the incorrect crank position. 4 cam sensor pulses less than or greater than nominal position in one cam revolution.",
    "threshold": "-10.0 to 10.0 Crank Degrees",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0046",
    "title": "Turbocharger Boost Control Solenoid Circuit Performance",
    "system": "Turbocharger",
    "description": "Detects failures in the boost control solenoid circuit. The actual boost pressure does not respond correctly to the commanded boost control duty cycle.",
    "threshold": "Boost pressure tracking error",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "boost",
      "boostDesired",
      "turboVane",
      "turboVaneDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P0071",
    "title": "Outside Air Temperature (OAT) Sensor Circuit Performance",
    "system": "Engine - Sensors",
    "description": "Detects an OAT sensor stuck in range. If IAT >= OAT: IAT - OAT > 20.0 deg C. If IAT < OAT: OAT - IAT > 20.0 deg C.",
    "threshold": "20.0 deg C delta between IAT and OAT",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0072",
    "title": "Outside Air Temperature Sensor Circuit Low",
    "system": "Engine - Sensors",
    "description": "OAT sensor circuit voltage below threshold. Sensor output < 0.1V indicating short to ground.",
    "threshold": "< 0.1V sensor output",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0073",
    "title": "Outside Air Temperature Sensor Circuit High",
    "system": "Engine - Sensors",
    "description": "OAT sensor circuit voltage above threshold. Sensor output > 4.9V indicating open circuit or short to voltage.",
    "threshold": "> 4.9V sensor output",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0074",
    "title": "Outside Air Temperature Sensor Circuit Intermittent",
    "system": "Engine - Sensors",
    "description": "Intermittent OAT sensor circuit fault detected.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0087",
    "title": "Fuel Rail/System Pressure Too Low",
    "system": "Fuel System",
    "description": "Determines if rail pressure is too low. Rail pressure is less than desired for an extended period. On the Duramax, this indicates a fuel supply restriction, failing lift pump, clogged fuel filter, or worn injection pump. Deceleration events are excluded from this monitor.",
    "threshold": "Rail pressure < desired by >= 3,000 psi (0-145 MPa range) for > 2 seconds",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "rpm"
    ],
    "datalog_check": true
  },
  {
    "code": "P0088",
    "title": "Fuel Rail/System Pressure Too High",
    "system": "Fuel System",
    "description": "Determines if rail pressure is too high. Rail pressure exceeds desired by a significant margin. On the Duramax, this can indicate a stuck-open fuel pressure regulator, faulty PCV solenoid, or high-pressure pump over-delivery.",
    "threshold": "Rail pressure > desired by >= 1,500 psi for > 2 seconds",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "pcvDuty"
    ],
    "datalog_check": true
  },
  {
    "code": "P0089",
    "title": "Fuel Pressure Regulator Performance",
    "system": "Fuel System",
    "description": "Fuel pressure regulator is not controlling rail pressure within expected range. The regulator is not responding correctly to commanded pressure changes.",
    "threshold": "Rail pressure oscillation > 1,500 psi amplitude",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "pcvDuty"
    ],
    "datalog_check": true
  },
  {
    "code": "P0090",
    "title": "Fuel Pressure Regulator Control Circuit",
    "system": "Fuel System",
    "description": "Open or short in the fuel pressure regulator (PCV) control circuit.",
    "threshold": "Circuit voltage out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "pcvDuty"
    ],
    "datalog_check": false
  },
  {
    "code": "P0091",
    "title": "Fuel Pressure Regulator Control Circuit Low",
    "system": "Fuel System",
    "description": "Fuel pressure regulator control circuit voltage is too low (short to ground).",
    "threshold": "< 5% duty cycle when commanded higher",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "pcvDuty"
    ],
    "datalog_check": false
  },
  {
    "code": "P0092",
    "title": "Fuel Pressure Regulator Control Circuit High",
    "system": "Fuel System",
    "description": "Fuel pressure regulator control circuit voltage is too high (short to voltage).",
    "threshold": "> 95% duty cycle when commanded lower",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "pcvDuty"
    ],
    "datalog_check": false
  },
  {
    "code": "P0096",
    "title": "Intake Air Temperature Sensor 2 Circuit Performance",
    "system": "Engine - Sensors",
    "description": "Intake air temperature sensor 2 (charge air cooler outlet) performance fault. IAT2 does not correlate with expected values.",
    "threshold": "IAT2 deviation > 20 deg C from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0097",
    "title": "Intake Air Temperature Sensor 2 Circuit Low",
    "system": "Engine - Sensors",
    "description": "IAT2 sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0098",
    "title": "Intake Air Temperature Sensor 2 Circuit High",
    "system": "Engine - Sensors",
    "description": "IAT2 sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0099",
    "title": "Intake Air Temperature Sensor 2 Circuit Intermittent",
    "system": "Engine - Sensors",
    "description": "Intermittent IAT2 sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0101",
    "title": "Mass Air Flow (MAF) Sensor Circuit Range/Performance",
    "system": "Engine - Air",
    "description": "MAF sensor output does not match expected airflow model. Checks for drift high (MAF reads higher than expected) and drift low (MAF reads lower than expected) based on speed density model. Idle MAF should be 2-6 lb/min; at WOT should scale with RPM and boost.",
    "threshold": "MAF vs speed-density model error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "rpm",
      "boost"
    ],
    "datalog_check": true
  },
  {
    "code": "P0102",
    "title": "Mass Air Flow Sensor Circuit Low",
    "system": "Engine - Air",
    "description": "MAF sensor circuit voltage too low. Sensor output below minimum threshold.",
    "threshold": "< 0.3V sensor output",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "maf"
    ],
    "datalog_check": true
  },
  {
    "code": "P0103",
    "title": "Mass Air Flow Sensor Circuit High",
    "system": "Engine - Air",
    "description": "MAF sensor circuit voltage too high. Sensor output above maximum threshold.",
    "threshold": "> 4.9V sensor output",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "maf"
    ],
    "datalog_check": true
  },
  {
    "code": "P0106",
    "title": "Manifold Absolute Pressure (MAP) Sensor Circuit Range/Performance",
    "system": "Engine - Air",
    "description": "MAP sensor output does not correlate with expected pressure based on engine operating conditions.",
    "threshold": "MAP deviation > calibration limit from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P0107",
    "title": "MAP Sensor Circuit Low",
    "system": "Engine - Air",
    "description": "MAP sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P0108",
    "title": "MAP Sensor Circuit High",
    "system": "Engine - Air",
    "description": "MAP sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P0111",
    "title": "Intake Air Temperature Sensor Circuit Performance",
    "system": "Engine - Sensors",
    "description": "IAT sensor performance fault. IAT does not change as expected with engine operation.",
    "threshold": "IAT deviation from expected > 20 deg C",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0112",
    "title": "Intake Air Temperature Sensor Circuit Low",
    "system": "Engine - Sensors",
    "description": "IAT sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0113",
    "title": "Intake Air Temperature Sensor Circuit High",
    "system": "Engine - Sensors",
    "description": "IAT sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0114",
    "title": "Intake Air Temperature Sensor Circuit Intermittent",
    "system": "Engine - Sensors",
    "description": "Intermittent IAT sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0116",
    "title": "Engine Coolant Temperature Sensor Circuit Performance",
    "system": "Engine - Cooling",
    "description": "ECT sensor performance fault. Coolant temperature does not warm up at expected rate or stays at implausible value.",
    "threshold": "ECT < 60 deg C after 20 min of operation",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": true
  },
  {
    "code": "P0117",
    "title": "Engine Coolant Temperature Sensor Circuit Low",
    "system": "Engine - Cooling",
    "description": "ECT sensor circuit voltage too low.",
    "threshold": "< 0.1V (> 150 deg C indicated)",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0118",
    "title": "Engine Coolant Temperature Sensor Circuit High",
    "system": "Engine - Cooling",
    "description": "ECT sensor circuit voltage too high.",
    "threshold": "> 4.9V (< -40 deg C indicated)",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0119",
    "title": "Engine Coolant Temperature Sensor Circuit Intermittent",
    "system": "Engine - Cooling",
    "description": "Intermittent ECT sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0128",
    "title": "Coolant Temperature Below Thermostat Regulating Temperature",
    "system": "Engine - Cooling",
    "description": "Engine coolant temperature does not reach normal operating temperature. Indicates a stuck-open thermostat or thermostat failure. Coolant should reach at least 75-80 deg C within 20 minutes of operation.",
    "threshold": "ECT < 75 deg C after 20 min of operation",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": true
  },
  {
    "code": "P0171",
    "title": "System Too Lean (Bank 1)",
    "system": "Fuel System",
    "description": "Long-term fuel trim correction is at maximum lean limit. Indicates insufficient fuel delivery, air leak, or MAF sensor under-reading. On Duramax, often indicates a boost leak, air intake leak, or failing lift pump.",
    "threshold": "Long-term fuel trim at maximum lean correction limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "boost",
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P0172",
    "title": "System Too Rich (Bank 1)",
    "system": "Fuel System",
    "description": "Long-term fuel trim correction is at maximum rich limit. Indicates excessive fuel delivery or air restriction.",
    "threshold": "Long-term fuel trim at maximum rich correction limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P0181",
    "title": "Fuel Temperature Sensor A Circuit Range/Performance",
    "system": "Fuel System",
    "description": "Fuel temperature sensor performance fault. Fuel temperature does not correlate with expected values based on coolant temperature and ambient conditions.",
    "threshold": "Fuel temp deviation > 20 deg C from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0182",
    "title": "Fuel Temperature Sensor A Circuit Low",
    "system": "Fuel System",
    "description": "Fuel temperature sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0183",
    "title": "Fuel Temperature Sensor A Circuit High",
    "system": "Fuel System",
    "description": "Fuel temperature sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0184",
    "title": "Fuel Temperature Sensor A Circuit Intermittent",
    "system": "Fuel System",
    "description": "Intermittent fuel temperature sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0186",
    "title": "Fuel Temperature Sensor B Circuit Range/Performance",
    "system": "Fuel System",
    "description": "Fuel temperature sensor B (secondary) performance fault.",
    "threshold": "Deviation > 20 deg C from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0191",
    "title": "Fuel Rail Pressure Sensor Circuit Range/Performance",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor performance fault. Sensor output does not correlate with expected pressure based on injection pump command and engine load. Indicates a failing FRP sensor or wiring issue.",
    "threshold": "FRP sensor drift > calibration limit from expected",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P0192",
    "title": "Fuel Rail Pressure Sensor Circuit Low",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor circuit voltage too low (< 4.0% of supply voltage). Short to ground or open circuit.",
    "threshold": "< 4.0% of supply voltage",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P0193",
    "title": "Fuel Rail Pressure Sensor Circuit High",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor circuit voltage too high (> 96.0% of supply voltage). Short to voltage.",
    "threshold": "> 96.0% of supply voltage",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P0194",
    "title": "Fuel Rail Pressure Sensor Circuit Intermittent",
    "system": "Fuel System",
    "description": "Intermittent fuel rail pressure sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P0201",
    "title": "Injector Circuit/Open - Cylinder 1",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 1 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0202",
    "title": "Injector Circuit/Open - Cylinder 2",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 2 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0203",
    "title": "Injector Circuit/Open - Cylinder 3",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 3 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0204",
    "title": "Injector Circuit/Open - Cylinder 4",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 4 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0205",
    "title": "Injector Circuit/Open - Cylinder 5",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 5 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0206",
    "title": "Injector Circuit/Open - Cylinder 6",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 6 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0207",
    "title": "Injector Circuit/Open - Cylinder 7",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 7 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0208",
    "title": "Injector Circuit/Open - Cylinder 8",
    "system": "Fuel - Injectors",
    "description": "Open circuit detected in cylinder 8 injector circuit.",
    "threshold": "Circuit resistance out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0216",
    "title": "Injection Timing Control Circuit",
    "system": "Fuel - Injectors",
    "description": "Injection timing control circuit fault. Timing is not responding correctly to commanded values.",
    "threshold": "Timing deviation > calibration limit",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0234",
    "title": "Turbocharger/Supercharger Overboost Condition",
    "system": "Turbocharger",
    "description": "Boost pressure exceeds maximum calibrated limit. Indicates a stuck-closed VGT vane, boost control solenoid failure, or ECM calibration issue. On the Duramax LML/L5P, overboost can damage the intercooler, charge pipes, and engine.",
    "threshold": "Boost pressure > maximum calibrated limit for > calibration time",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "boost",
      "boostDesired",
      "turboVane",
      "turboVaneDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P0261",
    "title": "Cylinder 1 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 1 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0262",
    "title": "Cylinder 1 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 1 injector circuit voltage too high.",
    "threshold": "> maximum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0264",
    "title": "Cylinder 2 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 2 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0265",
    "title": "Cylinder 2 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 2 injector circuit voltage too high.",
    "threshold": "> maximum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0267",
    "title": "Cylinder 3 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 3 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0268",
    "title": "Cylinder 3 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 3 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0270",
    "title": "Cylinder 4 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 4 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0271",
    "title": "Cylinder 4 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 4 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0273",
    "title": "Cylinder 5 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 5 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0274",
    "title": "Cylinder 5 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 5 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0276",
    "title": "Cylinder 6 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 6 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0277",
    "title": "Cylinder 6 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 6 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0279",
    "title": "Cylinder 7 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 7 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0280",
    "title": "Cylinder 7 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 7 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0282",
    "title": "Cylinder 8 Injector Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Cylinder 8 injector circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0283",
    "title": "Cylinder 8 Injector Circuit High",
    "system": "Fuel - Injectors",
    "description": "Cylinder 8 injector circuit voltage too high.",
    "threshold": "> minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0299",
    "title": "Turbocharger/Supercharger Underboost Condition",
    "system": "Turbocharger",
    "description": "Boost pressure is significantly below desired. Indicates a boost leak, failing VGT turbocharger, stuck-open vane position, worn turbo, or intercooler leak. The Duramax VGT turbo uses variable geometry vanes to control boost; a lazy or stuck vane will cause underboost at high RPM.",
    "threshold": "Boost tracking error > calibration limit (actual < desired by > 5 PSIG for > 3 seconds)",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "boost",
      "boostDesired",
      "turboVane",
      "turboVaneDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P0300",
    "title": "Random/Multiple Cylinder Misfire Detected",
    "system": "Engine - Combustion",
    "description": "Random misfires detected across multiple cylinders. On the Duramax, this can indicate injector issues, low compression, air/fuel delivery problems, or glow plug failures.",
    "threshold": "Misfire rate exceeds calibration threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm",
      "maf"
    ],
    "datalog_check": false
  },
  {
    "code": "P0301",
    "title": "Cylinder 1 Misfire Detected",
    "system": "Engine - Combustion",
    "description": "Misfire detected in cylinder 1.",
    "threshold": "Misfire rate > calibration threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0302",
    "title": "Cylinder 2 Misfire Detected",
    "system": "Engine - Combustion",
    "description": "Misfire detected in cylinder 2.",
    "threshold": "Misfire rate > calibration threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0303",
    "title": "Cylinder 3 Misfire Detected",
    "system": "Engine - Combustion",
    "description": "Misfire detected in cylinder 3.",
    "threshold": "Misfire rate > calibration threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0308",
    "title": "Cylinder 8 Misfire Detected",
    "system": "Engine - Combustion",
    "description": "Misfire detected in cylinder 8.",
    "threshold": "Misfire rate > calibration threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0315",
    "title": "Crankshaft Position System Variation Not Learned",
    "system": "Engine - Timing",
    "description": "Crankshaft position sensor variation values have not been learned. Requires a relearn procedure.",
    "threshold": "Variation values not stored",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0335",
    "title": "Crankshaft Position Sensor A Circuit",
    "system": "Engine - Timing",
    "description": "No signal from crankshaft position sensor A.",
    "threshold": "No signal detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0336",
    "title": "Crankshaft Position Sensor A Circuit Range/Performance",
    "system": "Engine - Timing",
    "description": "CKP sensor A signal is erratic or out of range.",
    "threshold": "Signal error rate > calibration limit",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0340",
    "title": "Camshaft Position Sensor A Circuit (Bank 1)",
    "system": "Engine - Timing",
    "description": "No signal from camshaft position sensor A Bank 1.",
    "threshold": "No signal detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0341",
    "title": "Camshaft Position Sensor A Circuit Range/Performance (Bank 1)",
    "system": "Engine - Timing",
    "description": "CMP sensor A Bank 1 signal is erratic or out of range.",
    "threshold": "Signal error rate > calibration limit",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0381",
    "title": "Glow Plug/Heater Indicator Circuit",
    "system": "Engine - Starting",
    "description": "Glow plug indicator circuit fault. Glow plug system not functioning correctly.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0401",
    "title": "Exhaust Gas Recirculation (EGR) Flow Insufficient Detected",
    "system": "EGR",
    "description": "EGR flow is less than expected. The mean residual error (difference between commanded and actual EGR position/flow) is negative. Indicates a stuck-closed EGR valve, clogged EGR cooler, or EGR pipe restriction.",
    "threshold": "Mean residual error < 0 (EGR flow below commanded)",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0402",
    "title": "Exhaust Gas Recirculation Flow Excessive Detected",
    "system": "EGR",
    "description": "EGR flow is more than expected. Indicates a stuck-open EGR valve.",
    "threshold": "Mean residual error > calibration limit (EGR flow above commanded)",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0403",
    "title": "Exhaust Gas Recirculation Control Circuit",
    "system": "EGR",
    "description": "EGR control circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0404",
    "title": "Exhaust Gas Recirculation Control Circuit Range/Performance",
    "system": "EGR",
    "description": "EGR valve position does not match commanded position.",
    "threshold": "Position error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0405",
    "title": "Exhaust Gas Recirculation Sensor A Circuit Low",
    "system": "EGR",
    "description": "EGR position sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0406",
    "title": "Exhaust Gas Recirculation Sensor A Circuit High",
    "system": "EGR",
    "description": "EGR position sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0421",
    "title": "Warm Up Catalyst Efficiency Below Threshold (Bank 1)",
    "system": "Emissions",
    "description": "Catalyst efficiency below threshold after warm-up.",
    "threshold": "Catalyst efficiency < calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0480",
    "title": "Cooling Fan 1 Control Circuit",
    "system": "Engine - Cooling",
    "description": "Cooling fan 1 control circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0483",
    "title": "Cooling Fan Rationality Check",
    "system": "Engine - Cooling",
    "description": "Cooling fan operation does not match expected behavior based on coolant temperature.",
    "threshold": "Fan speed vs temperature rationality error",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0489",
    "title": "Exhaust Gas Recirculation Control Circuit Low",
    "system": "EGR",
    "description": "EGR control circuit voltage too low.",
    "threshold": "< minimum voltage threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0490",
    "title": "Exhaust Gas Recirculation Control Circuit High",
    "system": "EGR",
    "description": "EGR control circuit voltage too high.",
    "threshold": "> maximum voltage threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0495",
    "title": "Cooling Fan Speed High",
    "system": "Engine - Cooling",
    "description": "Cooling fan speed is higher than expected for current conditions.",
    "threshold": "Fan speed > expected for coolant temp",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0506",
    "title": "Idle Control System RPM Too Low",
    "system": "Engine - Idle",
    "description": "Engine idle speed is lower than the desired idle RPM. Indicates a vacuum leak, throttle body deposit, or idle control system issue.",
    "threshold": "Actual idle RPM < desired idle RPM - 100 RPM for > 10 seconds",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": true
  },
  {
    "code": "P0507",
    "title": "Idle Control System RPM Too High",
    "system": "Engine - Idle",
    "description": "Engine idle speed is higher than the desired idle RPM. Indicates a sticking throttle, vacuum leak, or idle control system issue.",
    "threshold": "Actual idle RPM > desired idle RPM + 200 RPM for > 10 seconds",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": true
  },
  {
    "code": "P0545",
    "title": "Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 1)",
    "system": "Exhaust",
    "description": "EGT sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P0546",
    "title": "Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 1)",
    "system": "Exhaust",
    "description": "EGT sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P0562",
    "title": "System Voltage Low",
    "system": "Electrical",
    "description": "System voltage is below minimum threshold. Indicates a failing alternator, battery, or charging system issue.",
    "threshold": "< 11.0V for > 10 seconds",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0563",
    "title": "System Voltage High",
    "system": "Electrical",
    "description": "System voltage is above maximum threshold. Indicates a faulty voltage regulator or alternator.",
    "threshold": "> 16.0V for > 10 seconds",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0600",
    "title": "Serial Communication Link",
    "system": "ECM",
    "description": "Serial communication link fault between ECM and other modules.",
    "threshold": "Communication error detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0615",
    "title": "Starter Relay Circuit",
    "system": "Electrical",
    "description": "Starter relay circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0616",
    "title": "Starter Relay Circuit Low",
    "system": "Electrical",
    "description": "Starter relay circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0617",
    "title": "Starter Relay Circuit High",
    "system": "Electrical",
    "description": "Starter relay circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0641",
    "title": "Sensor Reference Voltage A Circuit/Open",
    "system": "ECM",
    "description": "5V reference voltage A circuit is open or out of range. Multiple sensors share this reference voltage.",
    "threshold": "Reference voltage < 4.5V or > 5.5V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0651",
    "title": "Sensor Reference Voltage B Circuit/Open",
    "system": "ECM",
    "description": "5V reference voltage B circuit is open or out of range.",
    "threshold": "Reference voltage < 4.5V or > 5.5V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0652",
    "title": "Sensor Reference Voltage B Circuit Low",
    "system": "ECM",
    "description": "5V reference voltage B circuit too low.",
    "threshold": "< 4.5V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0657",
    "title": "Actuator Supply Voltage A Circuit/Open",
    "system": "ECM",
    "description": "Actuator supply voltage A circuit open or out of range.",
    "threshold": "Voltage out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0658",
    "title": "Actuator Supply Voltage A Circuit Low",
    "system": "ECM",
    "description": "Actuator supply voltage A circuit too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0659",
    "title": "Actuator Supply Voltage A Circuit High",
    "system": "ECM",
    "description": "Actuator supply voltage A circuit too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0671",
    "title": "Cylinder 1 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 1 glow plug circuit fault. Open or short detected.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0672",
    "title": "Cylinder 2 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 2 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0673",
    "title": "Cylinder 3 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 3 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0674",
    "title": "Cylinder 4 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 4 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0675",
    "title": "Cylinder 5 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 5 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0676",
    "title": "Cylinder 6 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 6 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0677",
    "title": "Cylinder 7 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 7 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0678",
    "title": "Cylinder 8 Glow Plug Circuit",
    "system": "Engine - Starting",
    "description": "Cylinder 8 glow plug circuit fault.",
    "threshold": "Circuit resistance out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0685",
    "title": "ECM/PCM Power Relay Control Circuit/Open",
    "system": "Electrical",
    "description": "ECM power relay control circuit open.",
    "threshold": "Circuit open detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0686",
    "title": "ECM/PCM Power Relay Control Circuit Low",
    "system": "Electrical",
    "description": "ECM power relay control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0687",
    "title": "ECM/PCM Power Relay Control Circuit High",
    "system": "Electrical",
    "description": "ECM power relay control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0689",
    "title": "ECM/PCM Power Relay Sense Circuit Low",
    "system": "Electrical",
    "description": "ECM power relay sense circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0690",
    "title": "ECM/PCM Power Relay Sense Circuit High",
    "system": "Electrical",
    "description": "ECM power relay sense circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0691",
    "title": "Cooling Fan 1 Control Circuit Low",
    "system": "Engine - Cooling",
    "description": "Cooling fan 1 control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0692",
    "title": "Cooling Fan 1 Control Circuit High",
    "system": "Engine - Cooling",
    "description": "Cooling fan 1 control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0697",
    "title": "Sensor Reference Voltage C Circuit/Open",
    "system": "ECM",
    "description": "5V reference voltage C circuit open or out of range.",
    "threshold": "Reference voltage < 4.5V or > 5.5V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0703",
    "title": "Brake Switch B Circuit",
    "system": "Transmission",
    "description": "Brake switch B circuit fault. Brake switch signal does not correlate with expected operation.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0706",
    "title": "Transmission Range Sensor Circuit Range/Performance",
    "system": "Transmission",
    "description": "Transmission range sensor (PRNDL) signal does not match expected values.",
    "threshold": "Range sensor error",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0708",
    "title": "Transmission Range Sensor Circuit High",
    "system": "Transmission",
    "description": "Transmission range sensor circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0711",
    "title": "Transmission Fluid Temperature Sensor A Circuit Range/Performance",
    "system": "Transmission",
    "description": "Transmission fluid temperature sensor performance fault. TFT does not correlate with expected values.",
    "threshold": "TFT deviation > 20 deg C from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "transTemp"
    ],
    "datalog_check": true
  },
  {
    "code": "P0712",
    "title": "Transmission Fluid Temperature Sensor A Circuit Low",
    "system": "Transmission",
    "description": "TFT sensor circuit voltage too low.",
    "threshold": "< 0.1V (> 150 deg C indicated)",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "transTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0713",
    "title": "Transmission Fluid Temperature Sensor A Circuit High",
    "system": "Transmission",
    "description": "TFT sensor circuit voltage too high.",
    "threshold": "> 4.9V (< -40 deg C indicated)",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "transTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P0715",
    "title": "Input/Turbine Speed Sensor A Circuit",
    "system": "Transmission",
    "description": "Transmission input speed sensor circuit fault.",
    "threshold": "No signal or erratic signal",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0716",
    "title": "Input/Turbine Speed Sensor A Circuit Range/Performance",
    "system": "Transmission",
    "description": "Transmission input speed sensor signal is erratic.",
    "threshold": "Signal error rate > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0717",
    "title": "Input/Turbine Speed Sensor A Circuit No Signal",
    "system": "Transmission",
    "description": "No signal from transmission input speed sensor.",
    "threshold": "No signal detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0720",
    "title": "Output Speed Sensor Circuit",
    "system": "Transmission",
    "description": "Transmission output speed sensor circuit fault.",
    "threshold": "No signal or erratic signal",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "speed"
    ],
    "datalog_check": false
  },
  {
    "code": "P0721",
    "title": "Output Speed Sensor Circuit Range/Performance",
    "system": "Transmission",
    "description": "Transmission output speed sensor signal is erratic.",
    "threshold": "Signal error rate > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed"
    ],
    "datalog_check": false
  },
  {
    "code": "P0722",
    "title": "Output Speed Sensor Circuit No Signal",
    "system": "Transmission",
    "description": "No signal from transmission output speed sensor.",
    "threshold": "No signal detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "speed"
    ],
    "datalog_check": false
  },
  {
    "code": "P0729",
    "title": "Gear 6 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 6th gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm",
      "converterSlip"
    ],
    "datalog_check": false
  },
  {
    "code": "P0731",
    "title": "Gear 1 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 1st gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0732",
    "title": "Gear 2 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 2nd gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0733",
    "title": "Gear 3 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 3rd gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0734",
    "title": "Gear 4 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 4th gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0735",
    "title": "Gear 5 Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in 5th gear does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0736",
    "title": "Reverse Incorrect Ratio",
    "system": "Transmission",
    "description": "Transmission gear ratio in reverse does not match expected ratio.",
    "threshold": "Ratio error > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0741",
    "title": "Torque Converter Clutch (TCC) System Stuck Off",
    "system": "Transmission",
    "description": "The torque converter clutch is not engaging when commanded. TCC slip >= 80 RPM for >= 15 seconds when TCC should be locked. Indicates a worn TCC, low transmission fluid, or TCC solenoid failure. On the Allison transmission, excessive TCC slip causes heat buildup and accelerated fluid degradation.",
    "threshold": "TCC slip >= 80 RPM for >= 15 seconds when TCC commanded on",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "converterSlip",
      "rpm",
      "speed"
    ],
    "datalog_check": true
  },
  {
    "code": "P0742",
    "title": "Torque Converter Clutch (TCC) System Stuck On",
    "system": "Transmission",
    "description": "The torque converter clutch is engaging when it should not be. TCC is locked at low speed or when not commanded. Indicates a stuck TCC solenoid or valve body issue.",
    "threshold": "TCC slip < -20 RPM when TCC commanded off",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "converterSlip",
      "rpm",
      "speed"
    ],
    "datalog_check": true
  },
  {
    "code": "P0751",
    "title": "Shift Solenoid A Performance or Stuck Off",
    "system": "Transmission",
    "description": "Shift solenoid A is not performing correctly or is stuck in the off position.",
    "threshold": "Gear ratio error when solenoid A commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0752",
    "title": "Shift Solenoid A Stuck On",
    "system": "Transmission",
    "description": "Shift solenoid A is stuck in the on position.",
    "threshold": "Gear ratio error when solenoid A not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0756",
    "title": "Shift Solenoid B Performance or Stuck Off",
    "system": "Transmission",
    "description": "Shift solenoid B is not performing correctly or is stuck off.",
    "threshold": "Gear ratio error when solenoid B commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0757",
    "title": "Shift Solenoid B Stuck On",
    "system": "Transmission",
    "description": "Shift solenoid B is stuck in the on position.",
    "threshold": "Gear ratio error when solenoid B not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0761",
    "title": "Shift Solenoid C Performance or Stuck Off",
    "system": "Transmission",
    "description": "Shift solenoid C is not performing correctly or is stuck off.",
    "threshold": "Gear ratio error when solenoid C commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0762",
    "title": "Shift Solenoid C Stuck On",
    "system": "Transmission",
    "description": "Shift solenoid C is stuck in the on position.",
    "threshold": "Gear ratio error when solenoid C not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "speed",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P0776",
    "title": "Pressure Control Solenoid B Performance or Stuck Off",
    "system": "Transmission",
    "description": "Pressure control solenoid B performance fault or stuck off.",
    "threshold": "Pressure error when solenoid B commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0777",
    "title": "Pressure Control Solenoid B Stuck On",
    "system": "Transmission",
    "description": "Pressure control solenoid B stuck in on position.",
    "threshold": "Pressure error when solenoid B not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0842",
    "title": "Transmission Fluid Pressure Sensor/Switch A Circuit Low",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor A circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0843",
    "title": "Transmission Fluid Pressure Sensor/Switch A Circuit High",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor A circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0847",
    "title": "Transmission Fluid Pressure Sensor/Switch B Circuit Low",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor B circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0848",
    "title": "Transmission Fluid Pressure Sensor/Switch B Circuit High",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor B circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0872",
    "title": "Transmission Fluid Pressure Sensor/Switch C Circuit Low",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor C circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0873",
    "title": "Transmission Fluid Pressure Sensor/Switch C Circuit High",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor C circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0877",
    "title": "Transmission Fluid Pressure Sensor/Switch D Circuit Low",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor D circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0878",
    "title": "Transmission Fluid Pressure Sensor/Switch D Circuit High",
    "system": "Transmission",
    "description": "Transmission fluid pressure sensor D circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0960",
    "title": "Pressure Control Solenoid A Control Circuit/Open",
    "system": "Transmission",
    "description": "Pressure control solenoid A control circuit open.",
    "threshold": "Circuit open detected",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0961",
    "title": "Pressure Control Solenoid A Control Circuit Range/Performance",
    "system": "Transmission",
    "description": "Pressure control solenoid A performance fault.",
    "threshold": "Solenoid response out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0962",
    "title": "Pressure Control Solenoid A Control Circuit Low",
    "system": "Transmission",
    "description": "Pressure control solenoid A circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0963",
    "title": "Pressure Control Solenoid A Control Circuit High",
    "system": "Transmission",
    "description": "Pressure control solenoid A circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0964",
    "title": "Pressure Control Solenoid B Control Circuit/Open",
    "system": "Transmission",
    "description": "Pressure control solenoid B control circuit open.",
    "threshold": "Circuit open detected",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0965",
    "title": "Pressure Control Solenoid B Control Circuit Range/Performance",
    "system": "Transmission",
    "description": "Pressure control solenoid B performance fault.",
    "threshold": "Solenoid response out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0966",
    "title": "Pressure Control Solenoid B Control Circuit Low",
    "system": "Transmission",
    "description": "Pressure control solenoid B circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0967",
    "title": "Pressure Control Solenoid B Control Circuit High",
    "system": "Transmission",
    "description": "Pressure control solenoid B circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0973",
    "title": "Shift Solenoid A Control Circuit Low",
    "system": "Transmission",
    "description": "Shift solenoid A control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0974",
    "title": "Shift Solenoid A Control Circuit High",
    "system": "Transmission",
    "description": "Shift solenoid A control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0976",
    "title": "Shift Solenoid B Control Circuit Low",
    "system": "Transmission",
    "description": "Shift solenoid B control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0977",
    "title": "Shift Solenoid B Control Circuit High",
    "system": "Transmission",
    "description": "Shift solenoid B control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0979",
    "title": "Shift Solenoid C Control Circuit Low",
    "system": "Transmission",
    "description": "Shift solenoid C control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P0980",
    "title": "Shift Solenoid C Control Circuit High",
    "system": "Transmission",
    "description": "Shift solenoid C control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1002",
    "title": "Fuel Delivery System Performance",
    "system": "Fuel System",
    "description": "Fuel delivery system performance fault. Fuel pressure does not respond correctly to commanded changes.",
    "threshold": "Fuel pressure response error > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P1007",
    "title": "Fuel Rail Pressure Too Low During Engine Start",
    "system": "Fuel System",
    "description": "Fuel rail pressure is too low during engine cranking/start. Indicates a failing lift pump, clogged fuel filter, or high-pressure pump issue.",
    "threshold": "Rail pressure < minimum start threshold during cranking",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1048",
    "title": "Turbocharger Boost Pressure Sensor A Circuit Low",
    "system": "Turbocharger",
    "description": "Boost pressure sensor A circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P1049",
    "title": "Turbocharger Boost Pressure Sensor A Circuit High",
    "system": "Turbocharger",
    "description": "Boost pressure sensor A circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "boost"
    ],
    "datalog_check": false
  },
  {
    "code": "P1089",
    "title": "Fuel Rail Pressure High During Deceleration",
    "system": "Fuel System",
    "description": "Fuel rail pressure is higher than expected during deceleration fuel cut. Indicates a stuck-open high-pressure pump or faulty pressure relief valve.",
    "threshold": "Rail pressure > maximum decel threshold",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "rpm"
    ],
    "datalog_check": true
  },
  {
    "code": "P1103",
    "title": "Mass Air Flow Sensor Performance - High",
    "system": "Engine - Air",
    "description": "MAF sensor reading is higher than expected based on speed density model. Indicates a contaminated MAF sensor or air leak downstream of the MAF.",
    "threshold": "MAF > speed density model + calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "boost",
      "rpm"
    ],
    "datalog_check": true
  },
  {
    "code": "P1160",
    "title": "NOx Sensor Upstream Circuit",
    "system": "Emissions",
    "description": "NOx sensor upstream of SCR catalyst circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1192",
    "title": "Fuel Rail Pressure Sensor Circuit Low (Alternate)",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor circuit voltage too low (alternate circuit).",
    "threshold": "< 4.0% of supply voltage",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1193",
    "title": "Fuel Rail Pressure Sensor Circuit High (Alternate)",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor circuit voltage too high (alternate circuit).",
    "threshold": "> 96.0% of supply voltage",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1194",
    "title": "Fuel Rail Pressure Sensor Performance (Alternate)",
    "system": "Fuel System",
    "description": "Alternate fuel rail pressure sensor performance fault.",
    "threshold": "Sensor drift > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1196",
    "title": "Fuel Rail Pressure Sensor Correlation",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensors A and B do not correlate. Indicates a failing sensor or wiring issue.",
    "threshold": "Sensor A vs B delta > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1197",
    "title": "Fuel Rail Pressure Too Low (Extended)",
    "system": "Fuel System",
    "description": "Extended fuel rail pressure too low condition. Rail pressure is below desired for an extended period beyond P0087 threshold.",
    "threshold": "Rail pressure < desired for extended duration",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P1198",
    "title": "Fuel Rail Pressure Too High (Extended)",
    "system": "Fuel System",
    "description": "Extended fuel rail pressure too high condition.",
    "threshold": "Rail pressure > desired for extended duration",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P1199",
    "title": "Fuel Rail Pressure Sensor Stuck",
    "system": "Fuel System",
    "description": "Fuel rail pressure sensor output is stuck (not changing with engine operation).",
    "threshold": "Sensor output change < minimum expected",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual"
    ],
    "datalog_check": false
  },
  {
    "code": "P1248",
    "title": "Injection Pump Fuel Metering Control A High",
    "system": "Fuel System",
    "description": "Fuel metering control A is at maximum high position. Indicates maximum fuel delivery demand.",
    "threshold": "Metering control at maximum",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "pcvDuty"
    ],
    "datalog_check": true
  },
  {
    "code": "P1249",
    "title": "Injection Pump Fuel Metering Control A Low",
    "system": "Fuel System",
    "description": "Fuel metering control A is at minimum position. Indicates minimum fuel delivery.",
    "threshold": "Metering control at minimum",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired",
      "pcvDuty"
    ],
    "datalog_check": true
  },
  {
    "code": "P1402",
    "title": "EGR System Performance - Stuck Open",
    "system": "EGR",
    "description": "EGR valve is stuck in the open position. Causes rough idle, excessive smoke, and reduced power.",
    "threshold": "EGR position > commanded when commanded closed",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "maf",
      "rpm"
    ],
    "datalog_check": false
  },
  {
    "code": "P1407",
    "title": "EGR Temperature Sensor Circuit",
    "system": "EGR",
    "description": "EGR temperature sensor circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1413",
    "title": "Secondary Air Injection System Monitor Circuit Low",
    "system": "Emissions",
    "description": "Secondary air injection monitor circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1414",
    "title": "Secondary Air Injection System Monitor Circuit High",
    "system": "Emissions",
    "description": "Secondary air injection monitor circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1425",
    "title": "EVAP System Leak Detection Pump Circuit",
    "system": "Emissions",
    "description": "EVAP leak detection pump circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1428",
    "title": "EVAP System Leak Detection Pump Sense Circuit",
    "system": "Emissions",
    "description": "EVAP leak detection pump sense circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1438",
    "title": "EVAP System Flow During Non-Purge",
    "system": "Emissions",
    "description": "EVAP system flow detected when purge should not be active.",
    "threshold": "Flow detected when not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1473",
    "title": "Fan Secondary High with Fan Off",
    "system": "Engine - Cooling",
    "description": "Secondary cooling fan is on when it should be off.",
    "threshold": "Fan speed > 0 when commanded off",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P1475",
    "title": "Auxiliary 5-Volt Reference Circuit",
    "system": "ECM",
    "description": "Auxiliary 5V reference circuit fault.",
    "threshold": "Reference voltage out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1476",
    "title": "Too Little Secondary Air",
    "system": "Emissions",
    "description": "Secondary air injection flow is less than expected.",
    "threshold": "Flow < minimum expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1477",
    "title": "Too Much Secondary Air",
    "system": "Emissions",
    "description": "Secondary air injection flow is more than expected.",
    "threshold": "Flow > maximum expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1478",
    "title": "Cooling Fan Clutch Solenoid Circuit",
    "system": "Engine - Cooling",
    "description": "Cooling fan clutch solenoid circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P1497",
    "title": "Turbocharger Vane Control Solenoid Circuit Low",
    "system": "Turbocharger",
    "description": "VGT vane control solenoid circuit voltage too low. Indicates a short to ground or open circuit in the VGT solenoid wiring.",
    "threshold": "< minimum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "turboVane",
      "turboVaneDesired"
    ],
    "datalog_check": false
  },
  {
    "code": "P1498",
    "title": "Turbocharger Vane Control Solenoid Circuit High",
    "system": "Turbocharger",
    "description": "VGT vane control solenoid circuit voltage too high. Indicates a short to voltage in the VGT solenoid wiring.",
    "threshold": "> maximum voltage threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "turboVane",
      "turboVaneDesired"
    ],
    "datalog_check": false
  },
  {
    "code": "P1682",
    "title": "Ignition 1 Switch Circuit 2",
    "system": "Electrical",
    "description": "Ignition 1 switch circuit 2 fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2002",
    "title": "Diesel Particulate Filter Efficiency Below Threshold (Bank 1)",
    "system": "Emissions - DPF",
    "description": "DPF filtration efficiency is below minimum threshold. Indicates a cracked, missing, or melted DPF substrate. On the Duramax, this is often triggered after a failed regeneration or DPF removal.",
    "threshold": "DPF efficiency < minimum threshold",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2032",
    "title": "Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 2)",
    "system": "Exhaust",
    "description": "EGT sensor 2 (post-DPF) circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2033",
    "title": "Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 2)",
    "system": "Exhaust",
    "description": "EGT sensor 2 (post-DPF) circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2047",
    "title": "Reductant Injector Circuit/Open (Bank 1 Unit 1)",
    "system": "Emissions - DEF",
    "description": "DEF injector circuit open. No DEF injection possible.",
    "threshold": "Circuit open detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2048",
    "title": "Reductant Injector Circuit Low (Bank 1 Unit 1)",
    "system": "Emissions - DEF",
    "description": "DEF injector circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2049",
    "title": "Reductant Injector Circuit High (Bank 1 Unit 1)",
    "system": "Emissions - DEF",
    "description": "DEF injector circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2080",
    "title": "Exhaust Gas Temperature Sensor Circuit Range/Performance (Bank 1 Sensor 1)",
    "system": "Exhaust",
    "description": "EGT sensor 1 performance fault. Temperature does not correlate with expected values.",
    "threshold": "EGT deviation > calibration limit from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": true
  },
  {
    "code": "P2081",
    "title": "Exhaust Gas Temperature Sensor Circuit Intermittent (Bank 1 Sensor 1)",
    "system": "Exhaust",
    "description": "Intermittent EGT sensor 1 fault.",
    "threshold": "Intermittent signal",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2084",
    "title": "Exhaust Gas Temperature Sensor Circuit Range/Performance (Bank 1 Sensor 2)",
    "system": "Exhaust",
    "description": "EGT sensor 2 performance fault.",
    "threshold": "EGT deviation > calibration limit from expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": true
  },
  {
    "code": "P2085",
    "title": "Exhaust Gas Temperature Sensor Circuit Intermittent (Bank 1 Sensor 2)",
    "system": "Exhaust",
    "description": "Intermittent EGT sensor 2 fault.",
    "threshold": "Intermittent signal",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2122",
    "title": "Throttle/Pedal Position Sensor/Switch D Circuit Low",
    "system": "Engine - Throttle",
    "description": "Accelerator pedal position sensor D circuit voltage too low.",
    "threshold": "< 0.2V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2123",
    "title": "Throttle/Pedal Position Sensor/Switch D Circuit High",
    "system": "Engine - Throttle",
    "description": "Accelerator pedal position sensor D circuit voltage too high.",
    "threshold": "> 4.8V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2127",
    "title": "Throttle/Pedal Position Sensor/Switch E Circuit Low",
    "system": "Engine - Throttle",
    "description": "Accelerator pedal position sensor E circuit voltage too low.",
    "threshold": "< 0.2V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2128",
    "title": "Throttle/Pedal Position Sensor/Switch E Circuit High",
    "system": "Engine - Throttle",
    "description": "Accelerator pedal position sensor E circuit voltage too high.",
    "threshold": "> 4.8V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2138",
    "title": "Throttle/Pedal Position Sensor/Switch D/E Voltage Correlation",
    "system": "Engine - Throttle",
    "description": "Accelerator pedal position sensors D and E do not correlate. Indicates a failing pedal position sensor.",
    "threshold": "Sensor D vs E delta > 0.5V",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2147",
    "title": "Fuel Injector Group A Supply Voltage Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Injector bank A supply voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2148",
    "title": "Fuel Injector Group A Supply Voltage Circuit High",
    "system": "Fuel - Injectors",
    "description": "Injector bank A supply voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2150",
    "title": "Fuel Injector Group B Supply Voltage Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Injector bank B supply voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2151",
    "title": "Fuel Injector Group B Supply Voltage Circuit High",
    "system": "Fuel - Injectors",
    "description": "Injector bank B supply voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2153",
    "title": "Fuel Injector Group C Supply Voltage Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Injector bank C supply voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2154",
    "title": "Fuel Injector Group C Supply Voltage Circuit High",
    "system": "Fuel - Injectors",
    "description": "Injector bank C supply voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2156",
    "title": "Fuel Injector Group D Supply Voltage Circuit Low",
    "system": "Fuel - Injectors",
    "description": "Injector bank D supply voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2157",
    "title": "Fuel Injector Group D Supply Voltage Circuit High",
    "system": "Fuel - Injectors",
    "description": "Injector bank D supply voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2201",
    "title": "NOx Sensor Circuit Range/Performance (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor Bank 1 performance fault.",
    "threshold": "NOx sensor deviation > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2202",
    "title": "NOx Sensor Circuit Low (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor Bank 1 circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2203",
    "title": "NOx Sensor Circuit High (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor Bank 1 circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2205",
    "title": "NOx Sensor Heater Control Circuit/Open (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor heater Bank 1 circuit open.",
    "threshold": "Circuit open detected",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2206",
    "title": "NOx Sensor Heater Control Circuit Low (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor heater Bank 1 circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2207",
    "title": "NOx Sensor Heater Control Circuit High (Bank 1)",
    "system": "Emissions",
    "description": "NOx sensor heater Bank 1 circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2208",
    "title": "NOx Sensor Circuit Range/Performance (Bank 2)",
    "system": "Emissions",
    "description": "NOx sensor Bank 2 performance fault.",
    "threshold": "NOx sensor deviation > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2209",
    "title": "NOx Sensor Circuit Low (Bank 2)",
    "system": "Emissions",
    "description": "NOx sensor Bank 2 circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2210",
    "title": "NOx Sensor Circuit High (Bank 2)",
    "system": "Emissions",
    "description": "NOx sensor Bank 2 circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2211",
    "title": "NOx Sensor Circuit Intermittent (Bank 2)",
    "system": "Emissions",
    "description": "Intermittent NOx sensor Bank 2 fault.",
    "threshold": "Intermittent signal",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2227",
    "title": "Barometric Pressure Sensor A Circuit Range/Performance",
    "system": "Engine - Sensors",
    "description": "Barometric pressure sensor performance fault. Baro does not correlate with expected values.",
    "threshold": "Baro deviation > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2228",
    "title": "Barometric Pressure Sensor A Circuit Low",
    "system": "Engine - Sensors",
    "description": "Barometric pressure sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2229",
    "title": "Barometric Pressure Sensor A Circuit High",
    "system": "Engine - Sensors",
    "description": "Barometric pressure sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2230",
    "title": "Barometric Pressure Sensor A Circuit Intermittent",
    "system": "Engine - Sensors",
    "description": "Intermittent barometric pressure sensor fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2293",
    "title": "Fuel Pressure Regulator 2 Performance",
    "system": "Fuel System",
    "description": "Fuel pressure regulator 2 performance fault. Regulator is not controlling pressure within expected range.",
    "threshold": "Pressure error > calibration limit",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "railPressureActual",
      "railPressureDesired"
    ],
    "datalog_check": true
  },
  {
    "code": "P2294",
    "title": "Fuel Pressure Regulator 2 Control Circuit/Open",
    "system": "Fuel System",
    "description": "Fuel pressure regulator 2 control circuit open.",
    "threshold": "Circuit open detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2295",
    "title": "Fuel Pressure Regulator 2 Control Circuit Low",
    "system": "Fuel System",
    "description": "Fuel pressure regulator 2 control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2296",
    "title": "Fuel Pressure Regulator 2 Control Circuit High",
    "system": "Fuel System",
    "description": "Fuel pressure regulator 2 control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2297",
    "title": "O2 Sensor Out of Range During Deceleration (Bank 1 Sensor 1)",
    "system": "Emissions",
    "description": "O2 sensor reading is out of expected range during deceleration fuel cut.",
    "threshold": "O2 sensor out of range during decel",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2452",
    "title": "Diesel Particulate Filter Pressure Sensor A Circuit",
    "system": "Emissions - DPF",
    "description": "DPF differential pressure sensor A circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2453",
    "title": "Diesel Particulate Filter Pressure Sensor A Circuit Range/Performance",
    "system": "Emissions - DPF",
    "description": "DPF differential pressure sensor A performance fault. Pressure does not correlate with expected soot load.",
    "threshold": "Pressure deviation > calibration limit",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2454",
    "title": "Diesel Particulate Filter Pressure Sensor A Circuit Low",
    "system": "Emissions - DPF",
    "description": "DPF pressure sensor A circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2455",
    "title": "Diesel Particulate Filter Pressure Sensor A Circuit High",
    "system": "Emissions - DPF",
    "description": "DPF pressure sensor A circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2456",
    "title": "Diesel Particulate Filter Pressure Sensor A Circuit Intermittent",
    "system": "Emissions - DPF",
    "description": "Intermittent DPF pressure sensor A fault.",
    "threshold": "Intermittent signal",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2457",
    "title": "Exhaust Gas Recirculation Cooling System Performance",
    "system": "EGR",
    "description": "EGR cooler performance fault. EGR coolant temperature does not drop as expected through the cooler.",
    "threshold": "EGR cooler delta T < minimum expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P2459",
    "title": "Diesel Particulate Filter Regeneration Frequency",
    "system": "Emissions - DPF",
    "description": "DPF regeneration is occurring too frequently. Indicates excessive soot loading, oil consumption, or short trip driving.",
    "threshold": "Regen interval < minimum expected",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2463",
    "title": "Diesel Particulate Filter Restriction - Soot Accumulation",
    "system": "Emissions - DPF",
    "description": "DPF is restricted due to excessive soot accumulation. Regeneration has not been able to clear the soot load. Indicates a failed regeneration, short trip driving pattern, or DPF issue.",
    "threshold": "DPF soot load > maximum threshold",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2470",
    "title": "Exhaust Gas Temperature Sensor Circuit (Bank 1 Sensor 3)",
    "system": "Exhaust",
    "description": "EGT sensor 3 circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2471",
    "title": "Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 3)",
    "system": "Exhaust",
    "description": "EGT sensor 3 circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2472",
    "title": "Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 3)",
    "system": "Exhaust",
    "description": "EGT sensor 3 circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "egt"
    ],
    "datalog_check": false
  },
  {
    "code": "P2481",
    "title": "Coolant Temperature Sensor Circuit (Alternate)",
    "system": "Engine - Cooling",
    "description": "Alternate coolant temperature sensor circuit fault.",
    "threshold": "Circuit voltage out of range",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P2482",
    "title": "Coolant Temperature Sensor Circuit Low (Alternate)",
    "system": "Engine - Cooling",
    "description": "Alternate coolant temperature sensor circuit voltage too low.",
    "threshold": "< 0.1V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P2484",
    "title": "Coolant Temperature Sensor Circuit High (Alternate)",
    "system": "Engine - Cooling",
    "description": "Alternate coolant temperature sensor circuit voltage too high.",
    "threshold": "> 4.9V",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "coolantTemp"
    ],
    "datalog_check": false
  },
  {
    "code": "P2494",
    "title": "Exhaust Gas Recirculation Flow Insufficient - Cold",
    "system": "EGR",
    "description": "EGR flow is insufficient during cold engine operation.",
    "threshold": "EGR flow < minimum during cold operation",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp",
      "maf"
    ],
    "datalog_check": false
  },
  {
    "code": "P2495",
    "title": "Exhaust Gas Recirculation Flow Excessive - Cold",
    "system": "EGR",
    "description": "EGR flow is excessive during cold engine operation.",
    "threshold": "EGR flow > maximum during cold operation",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "coolantTemp",
      "maf"
    ],
    "datalog_check": false
  },
  {
    "code": "P2534",
    "title": "Ignition Switch Run/Start Position Circuit Low",
    "system": "Electrical",
    "description": "Ignition switch run/start position circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2627",
    "title": "O2 Sensor Pumping Current Trim Circuit/Open (Bank 1 Sensor 1)",
    "system": "Emissions",
    "description": "O2 sensor pumping current trim circuit open.",
    "threshold": "Circuit open detected",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2628",
    "title": "O2 Sensor Pumping Current Trim Circuit Low (Bank 1 Sensor 1)",
    "system": "Emissions",
    "description": "O2 sensor pumping current trim circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2669",
    "title": "Actuator Supply Voltage B Circuit/Open",
    "system": "ECM",
    "description": "Actuator supply voltage B circuit open or out of range.",
    "threshold": "Voltage out of range",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2670",
    "title": "Actuator Supply Voltage B Circuit Low",
    "system": "ECM",
    "description": "Actuator supply voltage B circuit too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2671",
    "title": "Actuator Supply Voltage B Circuit High",
    "system": "ECM",
    "description": "Actuator supply voltage B circuit too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2690",
    "title": "Shift Solenoid D Control Circuit Low",
    "system": "Transmission",
    "description": "Shift solenoid D control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2691",
    "title": "Shift Solenoid D Control Circuit High",
    "system": "Transmission",
    "description": "Shift solenoid D control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2692",
    "title": "Shift Solenoid E Control Circuit Low",
    "system": "Transmission",
    "description": "Shift solenoid E control circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2693",
    "title": "Shift Solenoid E Control Circuit High",
    "system": "Transmission",
    "description": "Shift solenoid E control circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2723",
    "title": "Pressure Control Solenoid E Performance or Stuck Off",
    "system": "Transmission",
    "description": "Pressure control solenoid E performance fault or stuck off.",
    "threshold": "Pressure error when solenoid E commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2724",
    "title": "Pressure Control Solenoid E Stuck On",
    "system": "Transmission",
    "description": "Pressure control solenoid E stuck in on position.",
    "threshold": "Pressure error when solenoid E not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2727",
    "title": "Pressure Control Solenoid F Performance or Stuck Off",
    "system": "Transmission",
    "description": "Pressure control solenoid F performance fault or stuck off.",
    "threshold": "Pressure error when solenoid F commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2728",
    "title": "Pressure Control Solenoid F Stuck On",
    "system": "Transmission",
    "description": "Pressure control solenoid F stuck in on position.",
    "threshold": "Pressure error when solenoid F not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2729",
    "title": "Pressure Control Solenoid G Performance or Stuck Off",
    "system": "Transmission",
    "description": "Pressure control solenoid G performance fault or stuck off.",
    "threshold": "Pressure error when solenoid G commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2730",
    "title": "Pressure Control Solenoid G Stuck On",
    "system": "Transmission",
    "description": "Pressure control solenoid G stuck in on position.",
    "threshold": "Pressure error when solenoid G not commanded",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2761",
    "title": "Torque Converter Clutch Pressure Control Solenoid Control Circuit/Open",
    "system": "Transmission",
    "description": "TCC pressure control solenoid circuit open. No TCC engagement possible.",
    "threshold": "Circuit open detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "converterSlip"
    ],
    "datalog_check": false
  },
  {
    "code": "P2762",
    "title": "Torque Converter Clutch Pressure Control Solenoid Control Circuit Range/Performance",
    "system": "Transmission",
    "description": "TCC pressure control solenoid performance fault.",
    "threshold": "Solenoid response out of range",
    "severity": "critical",
    "mil": "Type B, 2 Trips",
    "related_pids": [
      "converterSlip"
    ],
    "datalog_check": true
  },
  {
    "code": "P2763",
    "title": "Torque Converter Clutch Pressure Control Solenoid Control Circuit High",
    "system": "Transmission",
    "description": "TCC pressure control solenoid circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "converterSlip"
    ],
    "datalog_check": false
  },
  {
    "code": "P2764",
    "title": "Torque Converter Clutch Pressure Control Solenoid Control Circuit Low",
    "system": "Transmission",
    "description": "TCC pressure control solenoid circuit voltage too low.",
    "threshold": "< minimum threshold",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [
      "converterSlip"
    ],
    "datalog_check": false
  },
  {
    "code": "P2771",
    "title": "Four Wheel Drive (4WD) Low Switch Circuit High",
    "system": "Drivetrain",
    "description": "4WD low switch circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "info",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2957",
    "title": "Transmission Range Sensor B Circuit Range/Performance",
    "system": "Transmission",
    "description": "Transmission range sensor B performance fault.",
    "threshold": "Range sensor error",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "P2958",
    "title": "Transmission Range Sensor B Circuit High",
    "system": "Transmission",
    "description": "Transmission range sensor B circuit voltage too high.",
    "threshold": "> maximum threshold",
    "severity": "warning",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0074",
    "title": "Control Module Communication Bus A Off",
    "system": "Network",
    "description": "CAN bus A communication fault. Multiple modules may be affected.",
    "threshold": "Bus off condition detected",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0100",
    "title": "Lost Communication With ECM/PCM A",
    "system": "Network",
    "description": "Lost CAN communication with the ECM/PCM. Indicates a wiring fault, module failure, or power supply issue.",
    "threshold": "No communication for > calibration time",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0601",
    "title": "Lost Communication With Fuel Injector Control Module",
    "system": "Network",
    "description": "Lost communication with the fuel injector control module.",
    "threshold": "No communication for > calibration time",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0620",
    "title": "Lost Communication With Fuel Pump Control Module",
    "system": "Network",
    "description": "Lost communication with the fuel pump control module.",
    "threshold": "No communication for > calibration time",
    "severity": "critical",
    "mil": "Type A, 1 Trip",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0654",
    "title": "Lost Communication With Barometric Pressure Sensor Module",
    "system": "Network",
    "description": "Lost communication with the barometric pressure sensor module.",
    "threshold": "No communication for > calibration time",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  },
  {
    "code": "U0696",
    "title": "Lost Communication With Diesel Exhaust Fluid Control Module",
    "system": "Network",
    "description": "Lost communication with the DEF control module.",
    "threshold": "No communication for > calibration time",
    "severity": "warning",
    "mil": "Type B, 2 Trips",
    "related_pids": [],
    "datalog_check": false
  }
];

// Build lookup map for O(1) access by code
export const GM_HD_DTC_MAP: Record<string, GmDtcEntry> = Object.fromEntries(
  GM_HD_DTCS.map(d => [d.code, d])
);
