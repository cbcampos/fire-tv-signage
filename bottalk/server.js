// Bottalk Web Server - Static file server + WebSocket bridge for Bee stream
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const PORT = 4280;
const WS_PORT = 4281;

// ─── MIME Types ────────────────────────────────────────────────────────────────
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

// ─── HTTP Server with WS Upgrade + Summarize Proxy ──────────────────────────
const server = http.createServer((req, res) => {
  // Bottalk Summarize Proxy — routes to OpenClaw AI
  if (req.method === "POST" && req.url === "/api/summarize") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { prompt } = JSON.parse(body);
        const openclawResp = await fetch("http://localhost:18789/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer f88ea9b522db7d31888442c8c1bfa3ee3c084279ebefd5d6",
          },
          body: JSON.stringify({
            model: "openclaw/main",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
          }),
        });
        const data = await openclawResp.json();
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(data));
      } catch(e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error: " + e.message);
      }
    });
    return;
  }

  if (req.url === "/" || req.url === "/index.html") req.url = "/index.html";
  const filePath = path.join(__dirname, req.url);
  const ext = path.extname(filePath);
  const mime = mimeTypes[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

// ─── WebSocket on port 4281 (direct/local) ─────────────────────────────────
const directWsServer = new WebSocket.Server({ port: WS_PORT });
setupWsServer(directWsServer);

// ─── WebSocket on same HTTP server via /ws path ──────────────────────────────
const wsServer = new WebSocket.Server({ noServer: true });
setupWsServer(wsServer);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ─── Bee Stream ─────────────────────────────────────────────────────────────
let beeProc = null;
let beeBuffer = "";
const clients = new Set();

function setupWsServer(wsServer) {
  wsServer.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[Bottalk] Client connected (${clients.size})`);
    ws.send(JSON.stringify({ type: "connected", message: "Bottalk bridge active" }));
    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[Bottalk] Client disconnected (${clients.size} remain)`);
    });
  });
}

function startBeeStream() {
  if (beeProc) {
    try { beeProc.kill(); } catch(e) {}
  }
  console.log("[Bottalk] Starting Bee stream...");
  beeProc = spawn("bee", ["stream", "--types", "new-utterance", "--json"]);

  beeProc.stdout.on("data", (chunk) => {
    beeBuffer += chunk.toString();
    const lines = beeBuffer.split("\n");
    beeBuffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "new-utterance") {
          const payload = JSON.stringify({
            type: "utterance",
            text: data.utterance?.text ?? "",
            speaker: data.utterance?.speaker?.label || data.utterance?.speaker || "unknown",
            conversationUuid: data.conversation_uuid ?? "",
            timestamp: new Date().toISOString(),
          });
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          }
        }
      } catch(e) {}
    }
  });

  beeProc.stderr.on("data", (chunk) => {
    console.error("[Bottalk bee stderr]:", chunk.toString().trim());
  });

  beeProc.on("error", (err) => {
    console.error("[Bottalk] Bee error:", err.message);
  });

  beeProc.on("exit", (code) => {
    console.log(`[Bottalk] Bee stream exited (${code}), restarting in 3s...`);
    setTimeout(startBeeStream, 3000);
  });
}

startBeeStream();

setInterval(() => {
  if (!beeProc || !beeProc.pid) {
    console.log("[Bottalk] Bee process gone, restarting...");
    startBeeStream();
  }
}, 60000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Bottalk] http://localhost:${PORT}`);
  console.log(`[Bottalk] ws://localhost:${WS_PORT} (direct)`);
  console.log(`[Bottalk] ws://localhost:${PORT}/ws (same-origin)`);
  console.log(`[Bottalk] LAN: http://192.168.2.90:${PORT}`);
  console.log(`[Bottalk] Tailscale: https://memory-sync.tail8b5d2e.ts.net`);
  console.log(`[Bottalk] Run: tailscale serve --bg ${PORT}`);
});
