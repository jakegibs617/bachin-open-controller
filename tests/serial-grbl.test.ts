import { EventEmitter } from 'events';
import { GRBLController, SerialTransport, parseGRBLResponse, parseGRBLStatus } from '../src/core/serial-grbl';

class FakeTransport extends EventEmitter implements SerialTransport {
  private openState = false;
  public writes: Array<string | Buffer> = [];

  async open(): Promise<void> {
    this.openState = true;
  }

  async close(): Promise<void> {
    this.openState = false;
    this.emit('close');
  }

  async write(data: string | Buffer): Promise<void> {
    this.writes.push(data);
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : data;

    if (text === '?') {
      setTimeout(() => this.emit('line', '<Idle|MPos:1.000,2.000,0.000|FS:0,0>'), 0);
      return;
    }

    setTimeout(() => this.emit('line', 'ok'), 0);
  }

  isOpen(): boolean {
    return this.openState;
  }
}

describe('GRBL response parsing', () => {
  it('parses ok, error, alarm, and status responses', () => {
    expect(parseGRBLResponse('ok')).toEqual({ type: 'ok', message: 'ok' });
    expect(parseGRBLResponse('error:20')).toEqual({ type: 'error', message: 'error:20', errorCode: 20 });
    expect(parseGRBLResponse('ALARM:2')).toEqual({ type: 'alarm', message: 'ALARM:2', errorCode: 2 });

    expect(parseGRBLStatus('<Run|MPos:10.000,20.500,0.000|FS:1200,0>')).toEqual({
      state: 'run',
      position: { x: 10, y: 20.5 },
      feedRate: 1200,
      spindleSpeed: 0
    });
  });
});

describe('GRBLController', () => {
  it('opens, sends a command, queries status, and closes through a transport', async () => {
    const fake = new FakeTransport();
    const controller = new GRBLController(() => fake);

    await controller.openPort('FAKE', 115200);
    expect(controller.isPortConnected()).toBe(true);

    await expect(controller.sendCommand('G21')).resolves.toEqual({ type: 'ok', message: 'ok' });
    await expect(controller.queryStatus()).resolves.toMatchObject({
      state: 'idle',
      position: { x: 1, y: 2 }
    });

    await controller.closePort();
    expect(controller.isPortConnected()).toBe(false);
  });

  it('sends a soft reset byte when cancelling', async () => {
    const fake = new FakeTransport();
    const controller = new GRBLController(() => fake);

    await controller.openPort('FAKE', 115200);
    await controller.cancel();

    const resetWrite = fake.writes.find((write) => Buffer.isBuffer(write));
    expect(resetWrite).toEqual(Buffer.from([0x18]));
  });
});
