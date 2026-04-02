/**
 * Vehicle Telemetry Engine
 * Real-time bidirectional communication with connected vehicles
 * Streams live vehicle data to clients via WebSocket
 */

import { EventEmitter } from 'events';

export interface VehicleDataPoint {
  pid: string;
  name: string;
  value: number | string | boolean;
  unit: string;
  timestamp: Date;
  quality: 'good' | 'fair' | 'poor';
}

export interface VehicleStatus {
  vin: string;
  isConnected: boolean;
  engineRunning: boolean;
  speed: number;
  rpm: number;
  fuelLevel: number;
  coolantTemp: number;
  oilTemp: number;
  oilPressure: number;
  boostPressure: number;
  faultCount: number;
  lastUpdate: Date;
  dataPoints: Map<string, VehicleDataPoint>;
}

export interface TelemetrySubscription {
  clientId: string;
  vehicleId: string;
  pids: string[];
  updateInterval: number; // milliseconds
  isActive: boolean;
}

/**
 * Vehicle Telemetry Engine - Manages real-time vehicle data streaming
 */
export class VehicleTelemetryEngine extends EventEmitter {
  private vehicleStates: Map<string, VehicleStatus> = new Map();
  private subscriptions: Map<string, TelemetrySubscription> = new Map();
  private dataStreams: Map<string, ReturnType<typeof setInterval>> = new Map();
  private bufferSize = 1000; // Keep last 1000 data points per PID

  constructor() {
    super();
    this.initializeDataCollection();
  }

  /**
   * Initialize data collection from connected vehicles
   */
  private initializeDataCollection(): void {
    // This will be triggered when OBD connection is established
    // Collects data from all active PIDs
  }

  /**
   * Register a vehicle for telemetry
   */
  registerVehicle(vin: string): VehicleStatus {
    const status: VehicleStatus = {
      vin,
      isConnected: true,
      engineRunning: false,
      speed: 0,
      rpm: 0,
      fuelLevel: 0,
      coolantTemp: 0,
      oilTemp: 0,
      oilPressure: 0,
      boostPressure: 0,
      faultCount: 0,
      lastUpdate: new Date(),
      dataPoints: new Map(),
    };

    this.vehicleStates.set(vin, status);
    this.emit('vehicle:registered', { vin });
    return status;
  }

  /**
   * Unregister a vehicle
   */
  unregisterVehicle(vin: string): void {
    this.vehicleStates.delete(vin);
    this.emit('vehicle:unregistered', { vin });
  }

  /**
   * Subscribe to vehicle telemetry
   */
  subscribe(clientId: string, vehicleId: string, pids: string[], updateInterval: number = 100): TelemetrySubscription {
    const subscriptionId = `${clientId}_${vehicleId}`;
    
    const subscription: TelemetrySubscription = {
      clientId,
      vehicleId,
      pids,
      updateInterval,
      isActive: true,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Start data stream for this subscription
    this.startDataStream(subscriptionId, subscription);

    return subscription;
  }

  /**
   * Unsubscribe from vehicle telemetry
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.isActive = false;
      this.subscriptions.delete(subscriptionId);
      this.stopDataStream(subscriptionId);
    }
  }

  /**
   * Start data stream for a subscription
   */
  private startDataStream(subscriptionId: string, subscription: TelemetrySubscription): void {
    const interval = setInterval(() => {
      if (!subscription.isActive) {
        const intervalId = this.dataStreams.get(subscriptionId);
        if (intervalId !== undefined) clearInterval(intervalId);
        return;
      }

      const vehicleStatus = this.vehicleStates.get(subscription.vehicleId);
      if (!vehicleStatus) return;

      // Collect requested PIDs
      const data = subscription.pids
        .map((pid) => vehicleStatus.dataPoints.get(pid))
        .filter((point) => point !== undefined) as VehicleDataPoint[];

      if (data.length > 0) {
        this.emit('telemetry:update', {
          subscriptionId,
          clientId: subscription.clientId,
          vehicleId: subscription.vehicleId,
          data,
          timestamp: new Date(),
        });
      }
    }, subscription.updateInterval);

    this.dataStreams.set(subscriptionId, interval);
  }

  /**
   * Stop data stream for a subscription
   */
  private stopDataStream(subscriptionId: string): void {
    const interval = this.dataStreams.get(subscriptionId);
    if (interval !== undefined) {
      clearInterval(interval);
      this.dataStreams.delete(subscriptionId);
    }
  }

  /**
   * Update vehicle data point
   */
  updateDataPoint(vin: string, dataPoint: VehicleDataPoint): void {
    const vehicleStatus = this.vehicleStates.get(vin);
    if (!vehicleStatus) return;

    vehicleStatus.dataPoints.set(dataPoint.pid, dataPoint);
    vehicleStatus.lastUpdate = new Date();

    // Keep buffer size under control
    if (vehicleStatus.dataPoints.size > this.bufferSize) {
      const firstKey = vehicleStatus.dataPoints.keys().next().value as string | undefined;
      if (firstKey) {
        vehicleStatus.dataPoints.delete(firstKey);
      }
    }

    this.emit('datapoint:updated', { vin, dataPoint });
  }

  /**
   * Update multiple data points at once
   */
  updateDataPoints(vin: string, dataPoints: VehicleDataPoint[]): void {
    dataPoints.forEach((point) => this.updateDataPoint(vin, point));
  }

  /**
   * Update vehicle status
   */
  updateVehicleStatus(vin: string, status: Partial<VehicleStatus>): void {
    const vehicleStatus = this.vehicleStates.get(vin);
    if (!vehicleStatus) return;

    Object.assign(vehicleStatus, status, { lastUpdate: new Date() });
    this.emit('vehicle:status-updated', { vin, status: vehicleStatus });
  }

  /**
   * Get current vehicle status
   */
  getVehicleStatus(vin: string): VehicleStatus | undefined {
    return this.vehicleStates.get(vin);
  }

  /**
   * Get all active vehicles
   */
  getActiveVehicles(): VehicleStatus[] {
    return Array.from(this.vehicleStates.values()).filter((v) => v.isConnected);
  }

  /**
   * Get data points for a vehicle
   */
  getDataPoints(vin: string, pids?: string[]): VehicleDataPoint[] {
    const vehicleStatus = this.vehicleStates.get(vin);
    if (!vehicleStatus) return [];

    if (pids && pids.length > 0) {
      return pids
        .map((pid) => vehicleStatus.dataPoints.get(pid))
        .filter((point) => point !== undefined) as VehicleDataPoint[];
    }

    return Array.from(vehicleStatus.dataPoints.values());
  }

  /**
   * Get subscription info
   */
  getSubscription(subscriptionId: string): TelemetrySubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all subscriptions for a client
   */
  getClientSubscriptions(clientId: string): TelemetrySubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => s.clientId === clientId);
  }

  /**
   * Get all subscriptions for a vehicle
   */
  getVehicleSubscriptions(vehicleId: string): TelemetrySubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => s.vehicleId === vehicleId);
  }

  /**
   * Clear all data for a vehicle
   */
  clearVehicleData(vin: string): void {
    const vehicleStatus = this.vehicleStates.get(vin);
    if (vehicleStatus) {
      vehicleStatus.dataPoints.clear();
      this.emit('vehicle:data-cleared', { vin });
    }
  }

  /**
   * Get telemetry statistics
   */
  getStatistics() {
    return {
      activeVehicles: this.vehicleStates.size,
      activeSubscriptions: this.subscriptions.size,
      activeStreams: this.dataStreams.size,
      vehicles: Array.from(this.vehicleStates.entries()).map(([vin, status]) => ({
        vin,
        isConnected: status.isConnected,
        dataPointCount: status.dataPoints.size,
        lastUpdate: status.lastUpdate,
      })),
    };
  }
}

// Export singleton instance
export const vehicleTelemetry = new VehicleTelemetryEngine();
