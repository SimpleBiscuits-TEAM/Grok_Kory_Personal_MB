/**
 * OBD-II Write Engine
 * Implements UDS Services 0x2E (Write Data by Identifier) and 0x3D (Write Memory by Address)
 * for live tuning via standard OBD-II adapters (CAN bus)
 */

export interface WriteRequest {
  type: 'DID' | 'ADDRESS';
  did?: number; // For Service 0x2E (Write Data by Identifier)
  address?: number; // For Service 0x3D (Write Memory by Address)
  length?: number; // Number of bytes to write
  data: Uint8Array;
  timeout?: number; // ms
}

export interface WriteResponse {
  success: boolean;
  did?: number;
  address?: number;
  error?: string;
  timestamp: number;
}

export interface SecurityAccessRequest {
  level: number; // 1-0xFF
  timeout?: number;
}

export interface SecurityAccessResponse {
  seed: Uint8Array;
  level: number;
}

/**
 * OBD-II Write Engine for live tuning
 * Handles UDS write services via CAN bus
 */
export class OBDIIWriteEngine {
  private port: SerialPort | null = null;
  private isConnected = false;
  private securityLevel = 0;

  constructor() {}

  /**
   * Connect to OBD-II adapter via WebSerial
   */
  async connect(baudRate: number = 500000): Promise<void> {
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports.length === 0) {
        throw new Error('No serial ports found');
      }

      const selectedPort = ports[0] as SerialPort;
      await selectedPort.open({ baudRate });
      this.port = selectedPort;
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to OBD-II adapter: ${error}`);
    }
  }

  /**
   * Disconnect from OBD-II adapter
   */
  async disconnect(): Promise<void> {
    if (this.port) {
      await this.port.close();
      this.port = null;
      this.isConnected = false;
      this.securityLevel = 0;
    }
  }

  /**
   * Request security access (UDS Service 0x27)
   * Some ECUs require authentication before write operations
   */
  async requestSecurityAccess(level: number = 1, timeout: number = 5000): Promise<SecurityAccessResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to OBD-II adapter');
    }

    // UDS Service 0x27: Security Access
    // Request: 27 [level]
    // Response: 67 [seed...]
    const request = new Uint8Array([0x27, level]);
    const response = await this.sendRequest(request, timeout);

    if (response[0] !== 0x67) {
      throw new Error(`Security access denied (response: 0x${response[0].toString(16)})`);
    }

    const seed = response.slice(2);
    return { seed, level };
  }

  /**
   * Send security key to unlock write access (UDS Service 0x27)
   */
  async sendSecurityKey(level: number, key: Uint8Array, timeout: number = 5000): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Not connected to OBD-II adapter');
    }

    // UDS Service 0x27: Security Access (Send Key)
    // Request: 27 [level + 0x01] [key...]
    const keyArray = Array.from(key);
    const requestArray: number[] = [0x27, level + 0x01];
    for (let i = 0; i < keyArray.length; i++) {
      requestArray.push(keyArray[i]);
    }
    const request = new Uint8Array(requestArray);
    const response = await this.sendRequest(request, timeout);

    if (response[0] !== 0x67) {
      throw new Error(`Security key rejected (response: 0x${response[0].toString(16)})`);
    }

    this.securityLevel = level;
    return true;
  }

  /**
   * Write data by identifier (UDS Service 0x2E)
   * Used for writing to named parameters (DIDs)
   */
  async writeDataByIdentifier(did: number, data: Uint8Array, timeout: number = 5000): Promise<WriteResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to OBD-II adapter');
    }

    // UDS Service 0x2E: Write Data by Identifier
    // Request: 2E [DID_high] [DID_low] [data...]
    // Response: 6E [DID_high] [DID_low]
    const didHigh = (did >> 8) & 0xFF;
    const didLow = did & 0xFF;
    const requestArray = [0x2E, didHigh, didLow, ...Array.from(data)];
    const request = new Uint8Array(requestArray);

    try {
      const response = await this.sendRequest(request, timeout);

      if (response[0] !== 0x6E) {
        return {
          success: false,
          did,
          error: `Write failed (response: 0x${response[0].toString(16)})`,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        did,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        did,
        error: String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Write memory by address (UDS Service 0x3D)
   * Used for writing directly to RAM addresses
   */
  async writeMemoryByAddress(
    address: number,
    data: Uint8Array,
    addressLength: number = 4,
    timeout: number = 5000
  ): Promise<WriteResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to OBD-II adapter');
    }

    // UDS Service 0x3D: Write Memory by Address
    // Request: 3D [addressAndLength] [address...] [length...] [data...]
    // Response: 7D [addressAndLength] [address...]
    const addressBytes = this.encodeAddress(address, addressLength);
    const lengthBytes = this.encodeLength(data.length, addressLength);
    const addressAndLength = (addressLength << 4) | addressLength; // High nibble = address length, low = length field length
    const requestArray = [0x3D, addressAndLength, ...Array.from(addressBytes), ...Array.from(lengthBytes), ...Array.from(data)];
    const request = new Uint8Array(requestArray);

    try {
      const response = await this.sendRequest(request, timeout);

      if (response[0] !== 0x7D) {
        return {
          success: false,
          address,
          error: `Write failed (response: 0x${response[0].toString(16)})`,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        address,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        address,
        error: String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Test if an address is writable (UDS Service 0x3D with length 0)
   */
  async testWriteAccess(address: number, addressLength: number = 4, timeout: number = 5000): Promise<boolean> {
    try {
      const addressBytes = this.encodeAddress(address, addressLength);
      const lengthBytes = this.encodeLength(0, addressLength); // Zero length = test only
      const addressAndLength = (addressLength << 4) | addressLength;
      const addressArray = Array.from(addressBytes);
      const lengthArray = Array.from(lengthBytes);
      const requestArray: number[] = [0x3D, addressAndLength];
      for (let i = 0; i < addressArray.length; i++) {
        requestArray.push(addressArray[i]);
      }
      for (let i = 0; i < lengthArray.length; i++) {
        requestArray.push(lengthArray[i]);
      }
      const request = new Uint8Array(requestArray);

      const response = await this.sendRequest(request, timeout);
      return response[0] === 0x7D;
    } catch {
      return false;
    }
  }

  /**
   * Send raw UDS request and get response
   */
  private async sendRequest(request: Uint8Array, timeout: number): Promise<Uint8Array> {
    if (!this.port) {
      throw new Error('Port not initialized');
    }

    const writer = this.port.writable?.getWriter();
    if (!writer) {
      throw new Error('Cannot get writer from port');
    }

    try {
      // Send request
      await writer.write(request);

      // Wait for response with timeout
      const response = await this.readResponse(timeout);
      return response;
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * Read response from OBD-II adapter
   */
  private async readResponse(timeout: number): Promise<Uint8Array> {
    if (!this.port?.readable) {
      throw new Error('Port not readable');
    }

    const reader = this.port.readable.getReader();
    const buffer: number[] = [];
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < timeout) {
        const { value, done } = await reader.read();

        if (done) break;

        if (value) {
          const valueArray = Array.from(value);
          for (let i = 0; i < valueArray.length; i++) {
            buffer.push(valueArray[i]);
          }

          // Check if we have a complete response
          if (buffer.length > 0) {
            // Simple heuristic: if we have data and it looks complete, return it
            if (buffer[0] >= 0x60 && buffer.length > 2) {
              return new Uint8Array(buffer);
            }
          }
        }
      }

      if (buffer.length === 0) {
        throw new Error('No response from ECU (timeout)');
      }

      return new Uint8Array(buffer);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Encode address to bytes (big-endian)
   */
  private encodeAddress(address: number, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = (address >> ((length - 1 - i) * 8)) & 0xFF;
    }
    return bytes;
  }

  /**
   * Encode length to bytes (big-endian)
   */
  private encodeLength(length: number, lengthFieldSize: number): Uint8Array {
    const bytes = new Uint8Array(lengthFieldSize);
    for (let i = 0; i < lengthFieldSize; i++) {
      bytes[i] = (length >> ((lengthFieldSize - 1 - i) * 8)) & 0xFF;
    }
    return bytes;
  }
}

/**
 * Helper to build write requests for common Cummins parameters
 */
export function buildCumminsWriteRequest(
  parameterName: string,
  value: number,
  parameterDatabase: Map<string, any>
): WriteRequest | null {
  const param = parameterDatabase.get(parameterName);
  if (!param) return null;

  // Convert value to raw bytes based on parameter type
  const rawValue = valueToBytes(value, param.dataType, param.scale, param.offset);

  return {
    type: 'ADDRESS',
    address: param.ramAddress,
    length: rawValue.length,
    data: new Uint8Array(rawValue),
  };
}

/**
 * Convert physical value to raw bytes
 */
function valueToBytes(value: number, dataType: string, scale: number = 1, offset: number = 0): Uint8Array {
  const rawValue = Math.round((value - offset) / scale);

  switch (dataType) {
    case 'UINT8':
      return new Uint8Array([rawValue & 0xFF]);
    case 'UINT16':
      return new Uint8Array([(rawValue >> 8) & 0xFF, rawValue & 0xFF]);
    case 'UINT32':
      return new Uint8Array([
        (rawValue >> 24) & 0xFF,
        (rawValue >> 16) & 0xFF,
        (rawValue >> 8) & 0xFF,
        rawValue & 0xFF,
      ]);
    case 'INT8':
      return new Uint8Array([rawValue & 0xFF]);
    case 'INT16':
      return new Uint8Array([(rawValue >> 8) & 0xFF, rawValue & 0xFF]);
    case 'INT32':
      return new Uint8Array([
        (rawValue >> 24) & 0xFF,
        (rawValue >> 16) & 0xFF,
        (rawValue >> 8) & 0xFF,
        rawValue & 0xFF,
      ]);
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
}
