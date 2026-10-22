// US-52: builds the .ico (Windows) and .icns (macOS) containers from PNG buffers. Pure functions,
// no I/O, so generate-icons.cjs uses them and icon-containers.test.ts checks them.
// Both formats accept PNG-compressed entries, so each entry is just the PNG as rasterized.

/** Sizes stored in icon.ico. 256 is the largest ICO entry (encoded as 0 in the directory). */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** OSType → pixel size of each PNG entry stored in icon.icns (the @2x types reuse a bigger PNG). */
const ICNS_TYPES = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024], // 512@2x
  ["ic11", 32], // 16@2x
  ["ic12", 64], // 32@2x
  ["ic13", 256], // 128@2x
  ["ic14", 512], // 256@2x
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width/height from a PNG's IHDR chunk (throws if the buffer isn't a PNG). */
function readPngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Not a PNG buffer");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * ICO file: 6-byte header (reserved 0, type 1, count), one 16-byte directory entry per image, then
 * the PNG data. `entries` = [{ size, png }], size 1..256.
 */
function buildIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  let offset = headerSize;
  entries.forEach(({ size, png }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`Invalid ICO size: ${size}`);
    const e = 6 + i * 16;
    header.writeUInt8(size === 256 ? 0 : size, e); // width (0 means 256)
    header.writeUInt8(size === 256 ? 0 : size, e + 1); // height
    header.writeUInt8(0, e + 2); // palette colors
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // color planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8); // data size
    header.writeUInt32LE(offset, e + 12); // data offset
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((x) => x.png)]);
}

/** Inverse of buildIco, for tests: [{ width, height, size, offset, data }]. */
function parseIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error("Not an ICO file");
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const width = buf.readUInt8(e) || 256;
    const height = buf.readUInt8(e + 1) || 256;
    const size = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    entries.push({ width, height, size, offset, data: buf.subarray(offset, offset + size) });
  }
  return entries;
}

/**
 * ICNS file: 'icns' + total length (big-endian), then per entry its OSType + entry length
 * (8-byte entry header included) + PNG data. `entries` = [{ type, png }].
 */
function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    if (typeof type !== "string" || type.length !== 4) throw new Error(`Invalid ICNS type: ${type}`);
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...chunks]);
}

/** Inverse of buildIcns, for tests: [{ type, data }]. */
function parseIcns(buf) {
  if (buf.toString("ascii", 0, 4) !== "icns") throw new Error("Not an ICNS file");
  const total = buf.readUInt32BE(4);
  if (total !== buf.length) throw new Error("ICNS length mismatch");
  const entries = [];
  let pos = 8;
  while (pos < total) {
    const type = buf.toString("ascii", pos, pos + 4);
    const len = buf.readUInt32BE(pos + 4);
    if (len < 8 || pos + len > total) throw new Error("Corrupt ICNS entry");
    entries.push({ type, data: buf.subarray(pos + 8, pos + len) });
    pos += len;
  }
  return entries;
}

module.exports = { ICO_SIZES, ICNS_TYPES, readPngSize, buildIco, parseIco, buildIcns, parseIcns };
