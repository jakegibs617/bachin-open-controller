import { GRBLController, listSerialPorts } from '../src/core/serial-grbl';

const hardwarePort = process.env.GRBL_HARDWARE_PORT;
const describeHardware = hardwarePort ? describe : describe.skip;

describeHardware('GRBLController hardware', () => {
  jest.setTimeout(15000);

  it('opens the configured hardware port and reads a status report without motion', async () => {
    const ports = await listSerialPorts();
    expect(ports.map((port) => port.path)).toContain(hardwarePort);

    const controller = new GRBLController();
    await controller.openPort(hardwarePort as string, Number(process.env.GRBL_HARDWARE_BAUD ?? 115200));

    try {
      const status = await controller.queryStatus();
      expect(status.state).toMatch(/idle|run|hold|jog|alarm|door|check|home|sleep/);
      expect(Number.isFinite(status.position.x)).toBe(true);
      expect(Number.isFinite(status.position.y)).toBe(true);
    } finally {
      await controller.closePort();
    }
  });
});
