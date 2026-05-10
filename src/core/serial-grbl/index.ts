/**
 * GRBL Serial Connection Controller
 * Phase 1: Handles USB serial communication with GRBL machines
 *
 * Features:
 * - Port detection and connection
 * - Line-by-line G-code streaming with backpressure
 * - Status polling and response parsing
 * - Pause/resume/cancel with safe tool-off
 * - Error and alarm handling
 *
 * TODO (Phase 1):
 * - Implement openPort(), closePort()
 * - Implement sendCommand() with line buffering
 * - Implement queryStatus()
 * - Implement pause/resume/cancel
 * - Create test coverage with FakeGRBLServer
 */

import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { GRBLStatus, GRBLResponse } from '../../types';

export interface SerialTransport extends EventEmitter {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string | Buffer): Promise<void>;
  isOpen(): boolean;
}

type SerialTransportFactory = (portName: string, baudRate: number) => SerialTransport;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class NodeSerialTransport extends EventEmitter implements SerialTransport {
  private port: SerialPort;
  private lineBuffer = '';

  constructor(portName: string, baudRate: number) {
    super();
    this.port = new SerialPort({ path: portName, baudRate, autoOpen: false });
    this.port.on('data', (chunk: Buffer) => this.handleData(chunk));
    this.port.on('error', (error) => this.emit('error', error));
    this.port.on('close', () => this.emit('close'));
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port.isOpen) {
        resolve();
        return;
      }

      this.port.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  write(data: string | Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.write(data, (error) => {
        if (error) {
          reject(error);
          return;
        }

        this.port.drain((drainError) => {
          if (drainError) {
            reject(drainError);
            return;
          }
          resolve();
        });
      });
    });
  }

  isOpen(): boolean {
    return this.port.isOpen;
  }

  private handleData(chunk: Buffer): void {
    this.lineBuffer += chunk.toString('utf8');

    let newlineIndex = this.lineBuffer.search(/[\r\n]/);
    while (newlineIndex >= 0) {
      const line = this.lineBuffer.slice(0, newlineIndex).trim();
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (line) {
        this.emit('line', line);
      }
      newlineIndex = this.lineBuffer.search(/[\r\n]/);
    }
  }
}

export class GRBLController extends EventEmitter {
  private portName: string = '';
  private baudRate: number = 115200;
  private isConnected: boolean = false;
  private transport?: SerialTransport;
  private pendingResponses: Array<{
    resolve: (response: GRBLResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private pendingStatus?: {
    resolve: (status: GRBLStatus) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    interval: NodeJS.Timeout;
  };
  private readonly transportFactory: SerialTransportFactory;

  constructor(transportFactory: SerialTransportFactory = (portName, baudRate) => new NodeSerialTransport(portName, baudRate)) {
    super();
    this.transportFactory = transportFactory;
  }

  async openPort(portName: string, baudRate: number = 115200): Promise<void> {
    this.portName = portName;
    this.baudRate = baudRate;
    this.transport = this.transportFactory(portName, baudRate);
    this.transport.on('line', (line: string) => this.handleLine(line));
    this.transport.on('error', (error) => this.emit('error', error));
    this.transport.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });

    await this.transport.open();
    await this.transport.write('\r\n\r\n');
    await delay(2000);
    this.isConnected = true;
    this.emit('connected', { portName, baudRate });
  }

  async closePort(): Promise<void> {
    if (!this.transport) {
      return;
    }

    await this.transport.close();
    this.transport = undefined;
    this.isConnected = false;
  }

  async sendCommand(gcode: string): Promise<GRBLResponse> {
    const transport = this.requireTransport();
    const command = gcode.trim();

    const responsePromise = new Promise<GRBLResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses = this.pendingResponses.filter((pending) => pending.timer !== timer);
        reject(new Error(`Timed out waiting for response to command: ${command}`));
      }, 5000);

      this.pendingResponses.push({ resolve, reject, timer });
    });

    await transport.write(`${command}\n`);
    return responsePromise;
  }

  async queryStatus(): Promise<GRBLStatus> {
    const transport = this.requireTransport();

    const statusPromise = new Promise<GRBLStatus>((resolve, reject) => {
      const sendStatusQuery = () => {
        transport.write('?').catch((error) => {
          if (this.pendingStatus) {
            clearTimeout(this.pendingStatus.timer);
            clearInterval(this.pendingStatus.interval);
            this.pendingStatus = undefined;
          }
          reject(error);
        });
      };

      const interval = setInterval(sendStatusQuery, 1000);
      const timer = setTimeout(() => {
        clearInterval(interval);
        this.pendingStatus = undefined;
        reject(new Error('Timed out waiting for GRBL status report'));
      }, 5000);

      this.pendingStatus = { resolve, reject, timer, interval };
      sendStatusQuery();
    });
    return statusPromise;
  }

  async pause(): Promise<void> {
    // Phase 1: Implement pause
    // 1. Stop sending new lines
    // 2. Hold streaming queue
    console.log(`[GRBLController] pause - NOT YET IMPLEMENTED`);
    throw new Error('Phase 1: Not yet implemented');
  }

  async resume(): Promise<void> {
    // Phase 1: Implement resume
    // 1. Continue sending queued lines
    console.log(`[GRBLController] resume - NOT YET IMPLEMENTED`);
    throw new Error('Phase 1: Not yet implemented');
  }

  async cancel(): Promise<void> {
    const transport = this.requireTransport();
    this.pendingResponses.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error('Command cancelled'));
    });
    this.pendingResponses = [];
    await transport.write(Buffer.from([0x18]));
  }

  isPortConnected(): boolean {
    return this.isConnected;
  }

  private requireTransport(): SerialTransport {
    if (!this.transport || !this.isConnected || !this.transport.isOpen()) {
      throw new Error('GRBL serial port is not connected');
    }

    return this.transport;
  }

  private handleLine(line: string): void {
    this.emit('line', line);

    if (line.startsWith('<') && line.endsWith('>')) {
      const status = parseGRBLStatus(line);
      if (this.pendingStatus) {
        clearTimeout(this.pendingStatus.timer);
        clearInterval(this.pendingStatus.interval);
        this.pendingStatus.resolve(status);
        this.pendingStatus = undefined;
      }
      this.emit('status', status);
      return;
    }

    const response = parseGRBLResponse(line);
    if (!response) {
      this.emit('message', line);
      return;
    }

    const pending = this.pendingResponses.shift();
    if (!pending) {
      this.emit('response', response);
      return;
    }

    clearTimeout(pending.timer);
    pending.resolve(response);
  }
}

export async function listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string }>> {
  const ports = await SerialPort.list();
  return ports.map((port) => ({
    path: port.path,
    manufacturer: port.manufacturer,
    serialNumber: port.serialNumber
  }));
}

export function parseGRBLResponse(line: string): GRBLResponse | null {
  if (line === 'ok') {
    return { type: 'ok', message: line };
  }

  if (line.startsWith('error:')) {
    return { type: 'error', message: line, errorCode: Number(line.slice('error:'.length)) };
  }

  if (line.startsWith('ALARM:')) {
    return { type: 'alarm', message: line, errorCode: Number(line.slice('ALARM:'.length)) };
  }

  return null;
}

export function parseGRBLStatus(report: string): GRBLStatus {
  const body = report.replace(/^</, '').replace(/>$/, '');
  const parts = body.split('|');
  const state = parts[0].toLowerCase() as GRBLStatus['state'];
  const positionPart = parts.find((part) => part.startsWith('MPos:') || part.startsWith('WPos:'));
  const feedPart = parts.find((part) => part.startsWith('FS:'));
  const coordinates = positionPart ? positionPart.split(':')[1].split(',').map(Number) : [0, 0, 0];
  const feedSpindle = feedPart ? feedPart.split(':')[1].split(',').map(Number) : [0, 0];

  return {
    state,
    position: {
      x: coordinates[0] ?? 0,
      y: coordinates[1] ?? 0
    },
    feedRate: feedSpindle[0] ?? 0,
    spindleSpeed: feedSpindle[1] ?? 0
  };
}

export class StreamingQueue {
  /**
   * Phase 1: Manages G-code queue with progress tracking
   * - Tracks sent/accepted/failed lines
   * - Handles backpressure to avoid serial buffer overflow
   * - Emits progress events
   */
  
  private lines: string[] = [];
  private sentCount: number = 0;
  private acceptedCount: number = 0;

  constructor() {
    // Phase 1: Initialize queue
  }

  push(gcode: string[]): void {
    // Phase 1: Add lines to queue
  }

  async sendNext(): Promise<void> {
    // Phase 1: Send next line with backpressure
  }

  getProgress(): { sent: number; accepted: number; total: number } {
    // Phase 1: Return progress stats
    return { sent: this.sentCount, accepted: this.acceptedCount, total: this.lines.length };
  }

  clear(): void {
    // Phase 1: Clear queue on cancel
    this.lines = [];
  }
}
