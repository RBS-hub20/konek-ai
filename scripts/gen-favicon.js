/* Wraps a rendered PNG of the mark into public/favicon.ico */
const fs = require('fs');
const { execSync } = require('child_process');

const SIZE = 64;
const png = fs.readFileSync('public/favicon-src.png');

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // reserved
header.writeUInt16LE(1, 2);   // type: icon
header.writeUInt16LE(1, 4);   // image count

const entry = Buffer.alloc(16);
entry[0] = SIZE;              // width
entry[1] = SIZE;              // height
entry[2] = 0;                 // palette
entry[3] = 0;                 // reserved
entry.writeUInt16LE(1, 4);    // color planes
entry.writeUInt16LE(32, 6);   // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);  // offset

fs.writeFileSync('public/favicon.ico', Buffer.concat([header, entry, png]));
fs.unlinkSync('public/favicon-src.png');
console.log('  ✓ public/favicon.ico', SIZE + 'x' + SIZE);
