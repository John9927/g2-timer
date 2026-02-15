import qrcode from 'qrcode-terminal';
import { networkInterfaces } from 'os';

// Get local IP address
function getLocalIP() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const port = process.env.PORT || 5173;
const localIP = getLocalIP();
const url = `http://${localIP}:${port}`;

console.log('\n📱 QR Code for G2 Timer app:');
console.log(`   URL: ${url}\n`);
qrcode.generate(url, { small: true });
console.log('\n💡 Scan this QR code with the Even app on your phone to connect your G2 glasses.\n');
