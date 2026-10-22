// US-52: generates the app icons (electron/icons/icon.png 512px, icon.ico, icon.icns) from an SVG.
// Runs under Electron (devDependency), so no extra npm dependency is needed to rasterize:
//   npm run icons                  -> uses public/favicon.svg
//   npm run icons -- path/to.svg   -> uses another SVG (e.g. an official logo)
// Each size is rendered straight from the SVG in a hidden offscreen window (crisper small sizes
// than downscaling one big PNG). Text in the SVG uses the fonts installed on this machine.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { ICO_SIZES, ICNS_TYPES, buildIco, buildIcns, readPngSize } = require("./icon-containers.cjs");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "electron", "icons");
const PNG_SIZE = 512;
const RENDER_SIZES = [...new Set([PNG_SIZE, ...ICO_SIZES, ...ICNS_TYPES.map(([, size]) => size)])].sort((a, b) => a - b);

// 1 CSS px = 1 image px whatever the display scaling, so a capture of an N×N window is N×N pixels.
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.disableHardwareAcceleration();

// argv = [electron, script, ...args]; skip Chromium/Electron switches.
const svgArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const svgPath = path.resolve(svgArg || path.join(ROOT, "public", "favicon.svg"));

async function render(svgDataUrl, size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    win.setContentSize(size, size);
    const html =
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}` +
      `img{display:block;width:${size}px;height:${size}px}</style></head>` +
      `<body><img id="i" src="${svgDataUrl}"></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Wait until the SVG is decoded and two frames have been painted before capturing.
    await win.webContents.executeJavaScript(
      `document.getElementById("i").decode().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`,
    );
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const got = image.getSize();
    if (got.width !== size || got.height !== size) {
      image = image.resize({ width: size, height: size, quality: "best" });
    }
    const png = image.toPNG();
    const { width, height } = readPngSize(png);
    if (width !== size || height !== size) throw new Error(`Rendered ${width}x${height}, expected ${size}x${size}`);
    return png;
  } finally {
    win.destroy();
  }
}

async function main() {
  if (!fs.existsSync(svgPath)) throw new Error(`SVG not found: ${svgPath}`);
  const svg = fs.readFileSync(svgPath);
  const svgDataUrl = `data:image/svg+xml;base64,${svg.toString("base64")}`;

  const pngs = new Map();
  for (const size of RENDER_SIZES) pngs.set(size, await render(svgDataUrl, size));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outputs = {
    "icon.png": pngs.get(PNG_SIZE),
    "icon.ico": buildIco(ICO_SIZES.map((size) => ({ size, png: pngs.get(size) }))),
    "icon.icns": buildIcns(ICNS_TYPES.map(([type, size]) => ({ type, png: pngs.get(size) }))),
  };
  for (const [name, buf] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(OUT_DIR, name), buf);
    console.log(`[icons] ${path.relative(ROOT, path.join(OUT_DIR, name))} (${buf.length} bytes)`);
  }
  console.log(`[icons] Generated from ${path.relative(ROOT, svgPath) || svgPath}`);
}

app.on("window-all-closed", () => {
  // Keep running between renders; main() decides when to exit.
});

app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (err) => {
      console.error("[icons] Failed:", err && err.message ? err.message : err);
      app.exit(1);
    },
  );
