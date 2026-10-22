import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  ICNS_TYPES,
  ICO_SIZES,
  buildIcns,
  buildIco,
  parseIcns,
  parseIco,
  readPngSize,
} from "./icon-containers.cjs";

// US-52: .ico/.icns containers built by scripts/generate-icons.cjs, and the committed icons.

/** Minimal buffer that passes as a PNG of the given size (signature + IHDR) plus a marker byte. */
function fakePng(size: number, marker = size % 256): Buffer {
  const buf = Buffer.alloc(8 + 4 + 4 + 13 + 4 + 1);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(size, 16);
  buf.writeUInt32BE(size, 20);
  buf.writeUInt8(marker, buf.length - 1);
  return buf;
}

const readIcon = (name: string) => readFileSync(new URL(`../electron/icons/${name}`, import.meta.url));

describe("readPngSize", () => {
  it("reads width/height from IHDR", () => {
    expect(readPngSize(fakePng(48))).toEqual({ width: 48, height: 48 });
  });

  it("rejects non-PNG buffers", () => {
    expect(() => readPngSize(Buffer.from("not a png at all, really not"))).toThrow();
  });
});

describe("buildIco", () => {
  const entries = [16, 32, 256].map((size) => ({ size, png: fakePng(size) }));
  const ico = buildIco(entries);

  it("writes the header: reserved 0, type 1, image count", () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
  });

  it("writes one directory entry per image, 256 encoded as 0", () => {
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + i * 16))).toEqual([16, 32, 0]);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + i * 16 + 1))).toEqual([16, 32, 0]);
    expect(ico.readUInt16LE(6 + 4)).toBe(1); // planes
    expect(ico.readUInt16LE(6 + 6)).toBe(32); // bpp
  });

  it("has consistent offsets and sizes pointing at each PNG", () => {
    const parsed = parseIco(ico);
    expect(parsed[0].offset).toBe(6 + 3 * 16);
    for (let i = 0; i < parsed.length; i++) {
      expect(parsed[i].size).toBe(entries[i].png.length);
      expect(parsed[i].data.equals(entries[i].png)).toBe(true);
      if (i > 0) expect(parsed[i].offset).toBe(parsed[i - 1].offset + parsed[i - 1].size);
    }
    const last = parsed[parsed.length - 1];
    expect(last.offset + last.size).toBe(ico.length);
    expect(parsed.map((e) => e.width)).toEqual([16, 32, 256]);
  });

  it("rejects sizes an ICO can't hold", () => {
    expect(() => buildIco([{ size: 512, png: fakePng(512) }])).toThrow();
  });
});

describe("buildIcns", () => {
  const entries = [
    { type: "icp4", png: fakePng(16) },
    { type: "ic10", png: fakePng(1024) },
  ];
  const icns = buildIcns(entries);

  it("writes 'icns' + total length big-endian", () => {
    expect(icns.toString("ascii", 0, 4)).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
  });

  it("writes each entry as OSType + length (header included) + PNG", () => {
    expect(icns.toString("ascii", 8, 12)).toBe("icp4");
    expect(icns.readUInt32BE(12)).toBe(entries[0].png.length + 8);
    const parsed = parseIcns(icns);
    expect(parsed.map((e) => e.type)).toEqual(["icp4", "ic10"]);
    expect(parsed[1].data.equals(entries[1].png)).toBe(true);
  });

  it("rejects malformed OSTypes", () => {
    expect(() => buildIcns([{ type: "ic1", png: fakePng(16) }])).toThrow();
  });
});

describe("committed icons (electron/icons/)", () => {
  it("icon.png is a 512×512 PNG with transparent corners", () => {
    const png = readIcon("icon.png");
    expect(readPngSize(png)).toEqual({ width: 512, height: 512 });
    // IHDR color type 6 = RGBA (needed for the transparent rounded corners).
    expect(png.readUInt8(25)).toBe(6);
  });

  it("icon.ico holds the expected sizes as PNGs", () => {
    const entries = parseIco(readIcon("icon.ico"));
    expect(entries.map((e) => e.width)).toEqual(ICO_SIZES);
    for (const e of entries) expect(readPngSize(e.data)).toEqual({ width: e.width, height: e.width });
  });

  it("icon.icns holds the expected OSTypes and sizes", () => {
    const entries = parseIcns(readIcon("icon.icns"));
    expect(entries.map((e) => e.type)).toEqual(ICNS_TYPES.map(([type]) => type));
    entries.forEach((e, i) => {
      const size = ICNS_TYPES[i][1];
      expect(readPngSize(e.data)).toEqual({ width: size, height: size });
    });
  });
});
