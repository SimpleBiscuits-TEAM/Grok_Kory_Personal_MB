# Architecture Diagram Notes

The rendered Mermaid diagram successfully shows:
- USER/VEHICLE layer at top (OBD port, CSV files, PEAK device)
- HARDWARE BRIDGE LAYER (ELM327, PCAN Bridge, Protocol Stack with OBD-II/UDS/Raw CAN)
- TRANSPORT LAYER (OBD Connection, UDS Transport)
- DATA LAYER (PID Database 366 PIDs, UDS Reference Library, Module Database, VIN Decoder, DTC Database)
- ACTIVE TOOL MODULES (Live Datalogger, DTC Reader, CAN-am VIN Changer, Service Procedures, Module Scanner, Vehicle Coding, IntelliSpy)
- AI ANALYSIS ENGINE (CSV Parser, Diagnostics Engine, Reasoning Engine, Health Report, Drag Analyzer)
- ERIKA AI ASSISTANT (Knowledge Base, LLM Engine, Chat Interface)
- OUTPUT & REPORTING (PDF Export, Interactive Charts, Diagnostic Report, Drag Timeslip, CSV Export)

The diagram is readable but large. Some edge labels are slightly small. Overall it communicates the system architecture well.
The diagram needs to be converted to PDF for delivery.
