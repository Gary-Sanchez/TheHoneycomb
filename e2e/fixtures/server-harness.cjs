// Test harness for e2e/shutdown.spec.ts: runs the built server (dist/server.cjs) and lets the
// test drive it through stdin, since on Windows a real SIGINT/SIGTERM can't be delivered to a
// child process — writing "SIGTERM\n" invokes the server's handler via process.emit().
//
// US15_SLOW_WRITE_MS=<ms> delays every lowdb file write by that long and prints
// "[harness] write started" when one begins, so a test can start shutdown mid-write.
const fsPromises = require("node:fs/promises");
const { syncBuiltinESMExports } = require("node:module");

const slowWriteMs = Number(process.env.US15_SLOW_WRITE_MS || 0);
if (slowWriteMs > 0) {
  const writeFile = fsPromises.writeFile;
  fsPromises.writeFile = async (...args) => {
    console.log("[harness] write started");
    await new Promise(resolve => setTimeout(resolve, slowWriteMs));
    return writeFile(...args);
  };
  // lowdb/steno import writeFile as an ESM named export; push the patch through to it.
  syncBuiltinESMExports();
}

require("../../dist/server.cjs");

process.stdin.on("data", data => {
  for (const line of String(data).split(/\r?\n/)) {
    if (line === "SIGINT" || line === "SIGTERM") process.emit(line);
  }
});
