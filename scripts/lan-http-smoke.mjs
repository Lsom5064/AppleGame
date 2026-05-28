import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const PORT = 5173;
const HOST = "0.0.0.0";
const STARTUP_TIMEOUT_MS = 12000;

function getLanAddress() {
  const interfaces = networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  throw new Error("LAN IPv4 주소를 찾지 못했습니다.");
}

async function waitForOk(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD" });

      if (response.ok) {
        return;
      }

      lastError = new Error(`${url} responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError instanceof Error ? lastError : new Error(`${url} did not respond in time.`);
}

async function main() {
  const lanAddress = getLanAddress();
  const vite = spawn("./node_modules/.bin/vite", ["--host", HOST, "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";

  vite.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  vite.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForOk(`http://127.0.0.1:${PORT}/`);
    await waitForOk(`http://${lanAddress}:${PORT}/`);
    console.log(`LAN smoke passed: http://${lanAddress}:${PORT}/`);
  } catch (error) {
    if (output.trim()) {
      console.error(output.trim());
    }

    throw error;
  } finally {
    vite.kill();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
