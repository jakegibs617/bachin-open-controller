const { SerialPort } = require('serialport');

SerialPort.list()
  .then((ports) => {
    if (ports.length === 0) {
      console.log('No serial ports found.');
      return;
    }

    for (const port of ports) {
      const details = [
        port.manufacturer,
        port.friendlyName,
        port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : undefined
      ].filter(Boolean);

      console.log(`${port.path}${details.length ? ` - ${details.join(' - ')}` : ''}`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
