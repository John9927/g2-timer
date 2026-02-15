import qrcode from 'qrcode-terminal';

const vercelUrl = 'https://g2-timer.vercel.app/';

console.log('\n📱 QR Code per installazione app G2 Timer su Even G2:');
console.log(`   URL: ${vercelUrl}\n`);
qrcode.generate(vercelUrl, { small: true });
console.log('\n💡 Istruzioni:');
console.log('   1. Apri l\'app Even sul telefono');
console.log('   2. Vai a Impostazioni → Apps → "Install from URL"');
console.log('   3. Scansiona questo QR Code oppure inserisci l\'URL sopra');
console.log('   4. L\'app G2 Timer sarà disponibile nella lista delle app\n');
