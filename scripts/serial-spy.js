/**
 * Serial spy proxy — bridges a virtual COM port to the real machine port,
 * logging all traffic in both directions.
 *
 * Usage:
 *   node scripts/serial-spy.js <real-port> <virtual-port> [baud]
 *   node scripts/serial-spy.js COM3 COM6 115200
 *
 * Connect BachinMaker to <virtual-port>. All bytes flow through here
 * and are logged with timestamps and direction arrows.
 */

const { SerialPort } = require('serialport');
const fs = require('fs');
const path = require('path');

const [,, realPort, virtualPort, baudStr] = process.argv;
const baud = Number(baudStr ?? 115200);

if (!realPort || !virtualPort) {
  console.error('Usage: node serial-spy.js <real-port> <virtual-port> [baud]');
  console.error('  e.g. node serial-spy.js COM3 COM6 115200');
  process.exit(1);
}

const logFile = path.join(
  __dirname,
  `../logs/serial-spy-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(direction, data) {
  const hex = Buffer.from(data).toString('hex').replace(/../g, '$& ').trimEnd();
  const ascii = Buffer.from(data).toString('ascii').replace(/[^\x20-\x7e]/g, '.');
  const line = `${new Date().toISOString()} ${direction} ${hex}  |  ${ascii}`;
  console.log(line);
  logStream.write(line + '\n');
}

console.log(`Serial spy starting`);
console.log(`  Real machine : ${realPort} @ ${baud}`);
console.log(`  Virtual port : ${virtualPort} @ ${baud}  <-- point BachinMaker here`);
console.log(`  Log file     : ${logFile}`);
console.log('');

const machine = new SerialPort({ path: realPort, baudRate: baud, autoOpen: false });
const virtual = new SerialPort({ path: virtualPort, baudRate: baud, autoOpen: false });

machine.open(err => {
  if (err) { console.error('Failed to open real port:', err.message); process.exit(1); }
  console.log(`[open] ${realPort}`);

  virtual.open(err => {
    if (err) { console.error('Failed to open virtual port:', err.message); process.exit(1); }
    console.log(`[open] ${virtualPort}`);
    console.log('');
    console.log('Waiting for BachinMaker traffic...');
    console.log('>> = BachinMaker -> machine');
    console.log('<< = machine -> BachinMaker');
    console.log('');
  });
});

// BachinMaker -> machine
virtual.on('data', data => {
  log('>>', data);
  machine.write(data);
});

// machine -> BachinMaker
machine.on('data', data => {
  log('<<', data);
  virtual.write(data);
});

machine.on('error', e => console.error('[machine error]', e.message));
virtual.on('error', e => console.error('[virtual error]', e.message));

process.on('SIGINT', () => {
  console.log('\nClosing...');
  machine.close();
  virtual.close();
  logStream.end();
  process.exit(0);
});
