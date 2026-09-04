const { app, BrowserWindow } = require("electron");
const path = require("path");

// package.json's "name" ("react-example", the AI Studio scaffold default) would
// otherwise be used for app.getPath("userData") in dev runs (`electron .`);
// the packaged build already gets this from electron-builder's productName.
app.setName("The Honeycomb");

const PORT = process.env.PORT || "3000";
process.env.PORT = String(PORT);
process.env.NODE_ENV = "production";
process.env.HONEYCOMB_CONFIG_PATH = path.join(
  app.getPath("userData"),
  "honeycomb-config.json"
);
process.env.HONEYCOMB_DB_PATH = path.join(
  app.getPath("userData"),
  "honeycomb-data.json"
);

const MAX_LOAD_ATTEMPTS = 15;
const RETRY_DELAY_MS = 400;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "The Honeycomb",
  });

  const url = `http://localhost:${PORT}`;
  let attempts = 0;
  let loaded = false;

  const tryLoad = () => {
    if (loaded || win.isDestroyed()) return;
    attempts += 1;
    win.loadURL(url).catch(() => {
      scheduleRetry();
    });
  };

  const scheduleRetry = () => {
    if (loaded || win.isDestroyed()) return;
    if (attempts >= MAX_LOAD_ATTEMPTS) return;
    setTimeout(tryLoad, RETRY_DELAY_MS);
  };

  win.webContents.on("did-finish-load", () => {
    loaded = true;
  });

  win.webContents.on("did-fail-load", () => {
    scheduleRetry();
  });

  tryLoad();
}

app.whenReady().then(() => {
  // Starting the server in-process, as a side effect of require(): the
  // bundled server.cjs calls startServer() unconditionally at module load.
  require(path.join(__dirname, "..", "dist", "server.cjs"));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
