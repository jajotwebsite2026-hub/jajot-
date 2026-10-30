// Serves PWA icons, generated at startup (no binary files needed in the repo).
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Blue square with white "SH" built from blocks, size s x s (RGB PNG)
function makeIcon(s) {
  const u = s / 12;
  const blocks = [[2,3,5,4],[2,3,3,6],[2,5,5,6],[4,5,5,8],[2,7,5,8],[7,3,8,8],[10,3,11,8],[7,5,11,6]];
  const raw = Buffer.alloc((s * 3 + 1) * s);
  for (let y = 0; y < s; y++) {
    const row = y * (s * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < s; x++) {
      const white = blocks.some(([x0, y0, x1, y1]) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u);
      const o = row + 1 + x * 3;
      raw[o] = white ? 255 : 0x24; raw[o + 1] = white ? 255 : 0x47; raw[o + 2] = white ? 255 : 0xd6;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ICONS = { 192: makeIcon(192), 512: makeIcon(512) };

module.exports = function (app) {
  app.get('/icon-:size.png', (req, res) => {
    const img = ICONS[req.params.size];
    if (!img) return res.status(404).end();
    res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(img);
  });
};
