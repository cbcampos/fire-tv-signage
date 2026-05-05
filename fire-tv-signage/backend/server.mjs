import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.SIGNAGE_DATA_DIR || path.join(__dirname, "data"));
const UPLOAD_DIR = path.resolve(process.env.SIGNAGE_UPLOAD_DIR || path.join(DATA_DIR, "uploads"));
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db = loadDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, publicBase(req));
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    if (url.pathname.startsWith("/uploads/")) {
      const uploadName = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ""));
      const filePath = path.join(UPLOAD_DIR, uploadName);
      const rangeHeader = req.headers["range"];
      if (rangeHeader) {
        const parts = rangeHeader.replace(/^bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : undefined;
        serveFile(res, filePath, start, end);
      } else {
        serveFile(res, filePath);
      }
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Signage backend listening on http://${HOST}:${PORT}`);
  console.log(`Runtime data: ${DATA_DIR}`);
});

async function routeApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && parts[1] === "health") {
    sendJson(res, 200, {
      ok: true,
      devices: Object.keys(db.devices).length,
      pendingPairings: Object.values(db.pairingCodes).filter((pairing) => !pairing.paired).length
    });
    return;
  }

  if (req.method === "GET" && parts[1] === "receiver" && parts[2] === "pairing" && parts[3]) {
    handleReceiverPairing(req, res, url, parts[3]);
    return;
  }

  if (req.method === "GET" && parts[1] === "receiver" && parts[2] === "devices" && parts[3] && parts[4] === "playlist") {
    handleReceiverPlaylist(req, res, url, parts[3]);
    return;
  }

  if (req.method === "GET" && parts[1] === "admin" && parts[2] === "state") {
    sendJson(res, 200, adminState(req));
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "pair") {
    const body = await readJson(req);
    const code = cleanPairingCode(body.code);
    if (!code) {
      sendJson(res, 400, { error: "Pairing code is required." });
      return;
    }
    const label = String(body.label || "Fire TV Signage").trim();
    const existing = db.pairingCodes[code] || {};
    db.pairingCodes[code] = {
      ...existing,
      code,
      label,
      paired: true,
      token: existing.token || token(),
      approvedAt: new Date().toISOString()
    };
    saveDb();
    sendJson(res, 200, { ok: true, code });
    return;
  }

  // ── Library ────────────────────────────────────────────────────────────────
  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "library") {
    const body = await readJson(req);
    if (!body.dataUrl) { sendJson(res, 400, { error: "dataUrl required" }); return; }
    const image = saveDataUrlImage(body.name || "library-item", body.dataUrl);
    const item = {
      id: image.id,
      name: image.name,
      type: image.isVideo ? "video" : "image",
      tags: Array.isArray(body.tags) ? body.tags : [],
      path: image.path,
      size: fs.statSync(path.join(UPLOAD_DIR, `${image.id}.${image.path.split(".").pop()}`)).size,
      addedAt: new Date().toISOString()
    };
    db.library.push(item);
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "library" && parts[3]) {
    const id = parts[3];
    const idx = db.library.findIndex((i) => i.id === id);
    if (idx === -1) { sendJson(res, 404, { error: "Not found" }); return; }
    const item = db.library[idx];
    // Remove actual file
    try {
      const filePath = path.join(UPLOAD_DIR, path.basename(item.path));
      if (existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    db.library.splice(idx, 1);
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && parts[1] === "admin" && parts[2] === "library" && parts[3]) {
    const item = db.library.find((i) => i.id === parts[3]);
    if (!item) { sendJson(res, 404, { error: "Not found" }); return; }
    sendJson(res, 200, { ok: true, item });
    return;
  }

  // ── Health ────────────────────────────────────────────────────────────────
  if (req.method === "GET" && parts[1] === "api" && parts[2] === "health") {
    sendJson(res, 200, { ok: true, devices: Object.keys(db.devices).length, pendingPairings: Object.keys(db.pairingCodes).filter((k) => !db.pairingCodes[k].paired).length });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && !parts[4]) {
    const body = await readJson(req);
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    if (body.label !== undefined) device.label = String(body.label).trim() || device.label;
    if (body.location !== undefined) device.location = String(body.location).trim();
    if (body.delaySeconds !== undefined) device.delaySeconds = clamp(Number(body.delaySeconds), 2, 3600);
    saveDb();
    sendJson(res, 200, { ok: true, device });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts.length === 4) {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    for (const image of device.images || []) {
      if (image?.path) {
        try {
          fs.unlinkSync(uploadFilePath(image.path));
        } catch {
          // Ignore missing upload files; the device record is the source of truth.
        }
      }
    }
    delete db.devices[parts[3]];
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images") {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    const body = await readJson(req, 30 * 1024 * 1024);
    const image = saveDataUrlImage(body.name, body.dataUrl);
    device.images.push(image);
    saveDb();
    sendJson(res, 200, { ok: true, image });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5]) {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const image = device.images.find((item) => item.id === parts[5]);
    if (!image) { sendJson(res, 404, { error: "Image not found." }); return; }
    const body = await readJson(req);
    if (body.name !== undefined) image.name = String(body.name).trim().slice(0, 120) || image.name;
    if (body.delaySeconds !== undefined) image.delaySeconds = body.delaySeconds === null ? null : clamp(Number(body.delaySeconds), 2, 3600);
    if (body.order !== undefined && Array.isArray(body.order)) {
      const reorderMap = new Map(body.order.map((id, i) => [id, i]));
      device.images.sort((a, b) => (reorderMap.get(a.id) ?? 999) - (reorderMap.get(b.id) ?? 999));
    }
    saveDb();
    sendJson(res, 200, { ok: true, image });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5] === "reorder") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req);
    if (!Array.isArray(body.order)) { sendJson(res, 400, { error: "order must be an array of image ids" }); return; }
    const reorderMap = new Map(body.order.map((id, i) => [id, i]));
    device.images.sort((a, b) => (reorderMap.get(a.id) ?? 999) - (reorderMap.get(b.id) ?? 999));
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5]) {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    const image = device.images.find((item) => item.id === parts[5]);
    device.images = device.images.filter((item) => item.id !== parts[5]);
    saveDb();
    if (image?.path) {
      try {
        fs.unlinkSync(uploadFilePath(image.path));
      } catch {
        // Ignore missing upload files; the playlist state is the source of truth.
      }
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function handleReceiverPairing(req, res, url, codeParam) {
  const code = cleanPairingCode(codeParam);
  const deviceId = String(url.searchParams.get("deviceId") || "").trim();
  const name = String(url.searchParams.get("name") || "Fire TV Receiver").trim();
  if (!code || !deviceId) {
    sendJson(res, 400, { error: "Pairing code and deviceId are required." });
    return;
  }

  const pairing = db.pairingCodes[code] || {
    code,
    paired: false,
    seenAt: new Date().toISOString(),
    deviceId,
    name
  };
  pairing.deviceId = deviceId;
  pairing.name = name;
  pairing.lastSeenAt = new Date().toISOString();
  db.pairingCodes[code] = pairing;

  if (!pairing.paired) {
    saveDb();
    sendJson(res, 200, { paired: false });
    return;
  }

  const device = db.devices[deviceId] || {
    id: deviceId,
    label: pairing.label || name,
    token: pairing.token || token(),
    delaySeconds: 10,
    images: [],
    createdAt: new Date().toISOString()
  };
  device.label = pairing.label || device.label;
  device.name = name;
  device.token = pairing.token || device.token;
  device.lastSeenAt = new Date().toISOString();
  db.devices[deviceId] = device;
  pairing.token = device.token;
  saveDb();
  sendJson(res, 200, { paired: true, deviceId, token: device.token });
}

function handleReceiverPlaylist(req, res, url, deviceId) {
  const device = db.devices[deviceId];
  const requestToken = String(url.searchParams.get("token") || "");
  if (!device || requestToken !== device.token) {
    sendJson(res, 401, { error: "Unauthorized." });
    return;
  }
  device.lastSeenAt = new Date().toISOString();
  saveDb();
  sendJson(res, 200, {
    delaySeconds: device.delaySeconds,
    images: device.images.map((image) => ({
      id: image.id,
      name: image.name,
      url: image.path
    }))
  });
}

function adminState(req) {
  return {
    baseUrl: publicBase(req),
    pendingPairings: Object.values(db.pairingCodes)
      .filter((pairing) => !pairing.paired)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
    devices: Object.values(db.devices)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
    library: db.library
  };
}

function saveDataUrlImage(name, dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif)|video\/(?:mp4|webm|mkv|x-matroska|quicktime|x-msvideo));base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Upload must be an image (PNG, JPG, WEBP, GIF) or video (MP4, WEBM, MKV, MOV, AVI) data URL.");
  }
  const mime = match[1].toLowerCase();
  const isVideo = mime.startsWith("video/");
  const ext = isVideo
    ? mime.includes("mkv") ? "mkv" : mime.includes("webm") ? "webm" : mime.includes("mov") ? "mov" : mime.includes("avi") ? "avi" : "mp4"
    : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return {
    id,
    name: String(name || filename).replace(/[^\w .-]/g, "").slice(0, 120) || filename,
    mime,
    path: `/uploads/${filename}`,
    isVideo,
    delaySeconds: null,
    createdAt: new Date().toISOString()
  };
}

function loadDb() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!data.library) data.library = [];
    return data;
  } catch {
    return { pairingCodes: {}, devices: {}, library: [] };
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function cleanPairingCode(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function token() {
  return crypto.randomBytes(24).toString("base64url");
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function publicBase(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host || `localhost:${PORT}`}`;
}

function uploadFilePath(publicPath) {
  return path.join(UPLOAD_DIR, String(publicPath).replace(/^\/uploads\//, ""));
}

async function readJson(req, maxBytes = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
}

function serveStatic(res, requestPath) {
  const clean = requestPath === "/" ? "/index.html" : requestPath;
  serveFile(res, path.join(PUBLIC_DIR, decodeURIComponent(clean)));
}

function serveFile(res, filePath, start, end) {
  const resolved = path.resolve(filePath);
  const allowed = [PUBLIC_DIR, UPLOAD_DIR].some((root) => resolved.startsWith(path.resolve(root)));
  if (!allowed || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const stat = fs.statSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  }[ext] || "application/octet-stream";

  if (start !== undefined && end !== undefined) {
    const length = end - start + 1;
    res.writeHead(206, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": length,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`
    });
    fs.createReadStream(resolved, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": stat.size });
    fs.createReadStream(resolved).pipe(res);
  }
}
