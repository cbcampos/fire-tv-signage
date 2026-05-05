#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = process.env.SIGNAGE_URL || "http://127.0.0.1:3002";
const LIBRARY_DIR = path.join(process.env.SIGNAGE_DATA_DIR || join("~/.openclaw/workspace/fire-tv-signage/backend", "data"), "library");

const args = process.argv.slice(2);

async function main() {
  const global = parseGlobalArgs(args);
  const [command, ...rest] = global.args;
  const client = new Client(global.url);

  switch (command) {
    case "help":
    case undefined:
      printHelp();
      return;
    case "health":
      await health(client);
      return;
    case "pending":
      await pending(client);
      return;
    case "devices":
    case "list":
      await devices(client);
      return;
    case "show":
      await show(client, rest);
      return;
    case "pair":
      await pair(client, rest);
      return;
    case "set":
      await setDevice(client, rest);
      return;
    case "upload":
    case "push":
      await push(client, rest, global);
      return;
    case "remove-image":
    case "rm-image":
      await removeImage(client, rest);
      return;
    case "clear":
      await clearPlaylist(client, rest, global);
      return;
    case "delete-device":
    case "rm-device":
      await deleteDevice(client, rest);
      return;
    case "reorder":
      await reorder(client, rest);
      return;
    case "set-delay":
      await setSlideDelay(client, rest);
      return;
    case "reset-delays":
      await resetDelays(client, rest);
      return;
    case "rename":
      await renameImage(client, rest);
      return;
    case "library":
      await library(client, rest);
      return;
    case "youtube-push":
      await youtubePush(client, rest, global);
      return;
    default:
      throw new Error(`Unknown command "${command}". Run "signage help".`);
  }
}

// ─── Push ───────────────────────────────────────────────────────────────────────

async function push(client, rest, global) {
  const parsed = parseOptions(rest);
  const pos = parsed.positionals;

  // --all push
  if (parsed.options.all) {
    const state = await client.state();
    if (!state.devices.length) throw new Error("No devices paired.");
    const files = pos.filter((a) => !a.startsWith("--"));
    if (!files.length && !parsed.options.fromLibrary && !parsed.options.fromYoutube && !parsed.options.fromUrl) {
      throw new Error("push --all requires a file path, --from-library, --from-youtube, or --from-url");
    }
    const source = await resolveSource(client, files, parsed.options, global.url);
    for (const dev of state.devices) {
      await addToDevice(client, dev.id, source);
      console.log(`→ ${dev.label || dev.id}`);
    }
    console.log(`Pushed to ${state.devices.length} device(s).`);
    return;
  }

  // Single device push
  const deviceId = parsed.options.device || pos[0];
  if (!deviceId) throw new Error("push requires a device id (or --device DEVICE_ID)");
  const files = pos.slice(1).filter((a) => !a.startsWith("--"));

  if (parsed.options.fromLibrary) {
    const item = await findLibraryItem(client, parsed.options.fromLibrary);
    await addToDevice(client, deviceId, item);
    console.log(`✓ Added "${item.name}" from library to playlist.`);
    return;
  }

  if (parsed.options.fromYoutube) {
    const file = await downloadYoutube(parsed.options.fromYoutube, global.url);
    const item = await uploadFile(client, deviceId, file, { saveLibrary: parsed.options.saveLibrary });
    console.log(`✓ YouTube video pushed to playlist.`);
    return;
  }

  if (parsed.options.fromUrl) {
    const file = await downloadUrl(parsed.options.fromUrl);
    await uploadFile(client, deviceId, file, { saveLibrary: parsed.options.saveLibrary });
    console.log(`✓ URL content pushed to playlist.`);
    return;
  }

  if (!files.length) throw new Error("push requires a file path, --from-library, --from-youtube, or --from-url");

  // Clear playlist if --clear
  if (parsed.options.clear) {
    const dev = await findDevice(client, deviceId);
    for (const img of dev.images || []) {
      await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(img.id)}`);
    }
    console.log(`Cleared ${dev.images?.length || 0} item(s).`);
  }

  for (const file of files) {
    await uploadFile(client, deviceId, file, { saveLibrary: parsed.options.saveLibrary });
    console.log(`✓ ${path.basename(file)} → playlist.`);
  }
}

// ─── Library ──────────────────────────────────────────────────────────────────

async function library(client, rest) {
  const [action, ...args] = rest;
  const parsed = parseOptions(args);

  if (!action || action === "list") {
    await libList(client);
    return;
  }
  if (action === "add") {
    const file = parsed.positionals[0];
    if (!file) throw new Error("library add <file>");
    const tags = parsed.options.tag ? [parsed.options.tag].flat() : [];
    const item = await uploadFile(client, null, file, { libraryOnly: true, tags });
    console.log(`✓ Saved to library: ${item.id}`);
    return;
  }
  if (action === "remove") {
    const id = parsed.positionals[0] || parsed.options.id;
    if (!id) throw new Error("library remove <id>");
    await client.delete(`/api/admin/library/${encodeURIComponent(id)}`);
    console.log(`✓ Removed from library.`);
    return;
  }
  if (action === "search") {
    const q = parsed.positionals[0] || parsed.options.q || parsed.options.query;
    if (!q) throw new Error("library search <query>");
    await libSearch(client, q);
    return;
  }
  throw new Error(`Unknown library command: ${action}`);
}

async function libList(client) {
  const state = await client.state();
  const lib = state.library || [];
  if (!lib.length) { console.log("Library is empty."); return; }
  for (const item of lib) {
    const tags = item.tags?.length ? `#${item.tags.join(" #")}` : "";
    console.log(`${item.id}  ${item.name}  ${item.type}  ${tags}`);
  }
}

async function libSearch(client, query) {
  const state = await client.state();
  const q = query.toLowerCase();
  const results = (state.library || []).filter((item) =>
    item.name.toLowerCase().includes(q) ||
    item.tags?.some((t) => t.toLowerCase().includes(q))
  );
  if (!results.length) { console.log("No matches."); return; }
  for (const item of results) {
    console.log(`${item.id}  ${item.name}  #${item.tags?.join(" #")}`);
  }
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

async function youtubePush(client, rest, global) {
  const parsed = parseOptions(rest);
  const url = parsed.positionals[0] || parsed.options.url;
  if (!url) throw new Error("youtube-push <url>");
  const deviceId = parsed.options.device || parsed.positionals[1];
  if (!deviceId) throw new Error("youtube-push <url> <deviceId>");
  const file = await downloadYoutube(url, global.url);
  const item = await uploadFile(client, deviceId, file, { saveLibrary: parsed.options.saveLibrary });
  console.log(`✓ YouTube video pushed to ${deviceId}.`);
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

async function reorder(client, rest) {
  const parsed = parseOptions(rest);
  const deviceId = parsed.positionals[0];
  const order = parsed.options.order?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!deviceId) throw new Error("reorder <deviceId> [--order=id1,id2,...]");
  if (!order?.length) throw new Error("reorder requires --order=id1,id2,...");
  await client.post(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/reorder`, { order });
  console.log(`✓ Playlist reordered.`);
}

// ─── Per-slide delay ──────────────────────────────────────────────────────────

async function setSlideDelay(client, rest) {
  const parsed = parseOptions(rest);
  const deviceId = parsed.positionals[0];
  const imageId = parsed.positionals[1];
  if (!deviceId || !imageId) throw new Error("set-delay <deviceId> <imageId> [--seconds=N] [--clear]");
  const body = {};
  if (parsed.options.clear) {
    body.delaySeconds = null;
  } else if (parsed.options.seconds || parsed.options.sec) {
    body.delaySeconds = clamp(Number(parsed.options.seconds || parsed.options.sec), 2, 3600);
  } else {
    throw new Error("set-delay requires --seconds=N or --clear");
  }
  await client.patch(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(imageId)}`, body);
  console.log(`✓ Delay updated.`);
}

// ─── Reset all delays ─────────────────────────────────────────────────────────

async function resetDelays(client, rest) {
  const deviceId = rest[0];
  if (!deviceId) throw new Error("reset-delays <deviceId>");
  const dev = await findDevice(client, deviceId);
  for (const img of dev.images || []) {
    await client.patch(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(img.id)}`, { delaySeconds: null });
  }
  console.log(`✓ Reset all ${dev.images?.length || 0} delays to global.`);
}

// ─── Rename slide ──────────────────────────────────────────────────────────────

async function renameImage(client, rest) {
  const parsed = parseOptions(rest);
  const deviceId = parsed.positionals[0];
  const imageId = parsed.positionals[1];
  const newName = parsed.options.name;
  if (!deviceId || !imageId || !newName) throw new Error("rename <deviceId> <imageId> --name='New Name'");
  await client.patch(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(imageId)}`, { name: newName });
  console.log(`✓ Renamed to "${newName}".`);
}

// ─── Clear ─────────────────────────────────────────────────────────────────────

async function clearPlaylist(client, rest, global) {
  const parsed = parseOptions(rest);
  const deviceId = parsed.options.device || parsed.positionals[0];
  if (!deviceId) throw new Error("clear <deviceId>");
  const dev = await findDevice(client, deviceId);
  for (const img of dev.images || []) {
    await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(img.id)}`);
  }
  console.log(`Cleared ${dev.images?.length || 0} item(s) from playlist.`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function resolveSource(client, files, options, baseUrl) {
  if (options.fromLibrary) {
    return findLibraryItem(client, options.fromLibrary);
  }
  return null;
}

async function findLibraryItem(client, query) {
  const state = await client.state();
  const lib = state.library || [];
  const exact = lib.find((item) => item.id === query || item.tags?.includes(query));
  if (!exact) throw new Error(`Library item not found: ${query}`);
  return exact;
}

async function findDevice(client, deviceId) {
  const state = await client.state();
  const dev = state.devices.find((d) => d.id === deviceId);
  if (!dev) throw new Error(`Device not found: ${deviceId}`);
  return dev;
}

async function addToDevice(client, deviceId, item) {
  // item is a library object — upload from path or re-add via saved data
  await client.post(`/api/admin/devices/${encodeURIComponent(deviceId)}/images`, {
    name: item.name,
    dataUrl: null,
    libraryId: item.id  // server-side: copy from library
  });
}

async function uploadFile(client, deviceId, file, opts = {}) {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const ext = path.extname(file).toLowerCase();
  const isVideo = [".mp4", ".mkv", ".mov", ".webm", ".avi", ".3gp"].includes(ext);
  const mime = isVideo
    ? "video/mp4"
    : { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" }[ext] || "application/octet-stream";

  // Restructure video if needed
  let finalFile = file;
  if (isVideo) {
    finalFile = await restructureVideo(file);
  }

  const data = await fs.readFile(finalFile);
  const dataUrl = `data:${mime};base64,${data.toString("base64")}`;
  const name = path.basename(file);

  if (opts.libraryOnly || opts.saveLibrary) {
    await client.post("/api/admin/library", { name, dataUrl, tags: opts.tags || [] });
    if (opts.libraryOnly) return { id: name, name, path: file };
  }

  if (deviceId) {
    await client.post(`/api/admin/devices/${encodeURIComponent(deviceId)}/images`, { name, dataUrl });
  }
  return { name, path: file };
}

async function restructureVideo(file) {
  const tmp = file + ".restructured.mp4";
  await runFFmpeg(file, ["-c", "copy", "-movflags", "+faststart", tmp]);
  await fs.rename(tmp, file.replace(/\.[^.]+$/, "_restructured.mp4"));
  return file.replace(/\.[^.]+$/, "_restructured.mp4");
}

async function downloadYoutube(url, baseUrl) {
  const tmpDir = await fs.mkdtemp(path.join("/tmp", "signage-yt-"));
  const outFile = path.join(tmpDir, "video.mp4");
  await new Promise((resolve, reject) => {
    const cmd = spawn("yt-dlp", [
      "-f", "best[height<=720]/best",
      "--no-playlist",
      "-o", outFile,
      url
    ], { stdio: "pipe" });
    cmd.on("close", (code) => code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}`)));
  });
  // Restructure
  const restructured = outFile + ".mp4";
  await runFFmpeg(outFile, ["-c", "copy", "-movflags", "+faststart", restructured]);
  return restructured;
}

async function downloadUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "download");
  const ext = path.extname(name) || ".bin";
  const tmp = path.join("/tmp", `signage-url-${Date.now()}${ext}`);
  await fs.writeFile(tmp, Buffer.from(buffer));
  return tmp;
}

function runFFmpeg(input, args) {
  return new Promise((resolve, reject) => {
    const cmd = spawn("ffmpeg", ["-y", "-i", input, ...args]);
    let stderr = "";
    cmd.stderr.on("data", (d) => { stderr += d.toString(); });
    cmd.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-500))));
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ─── Original CLI commands (unchanged) ───────────────────────────────────────

async function health(client) {
  const result = await client.get("/api/health");
  console.log(`ok: ${result.ok}`);
  console.log(`devices: ${result.devices}`);
  console.log(`pendingPairings: ${result.pendingPairings}`);
}

async function pending(client) {
  const state = await client.state();
  if (!state.pendingPairings.length) { console.log("No pending receivers."); return; }
  printRows(["code", "name", "deviceId", "lastSeenAt"],
    state.pendingPairings.map((item) => ({ code: item.code, name: item.name || "", deviceId: item.deviceId || "", lastSeenAt: item.lastSeenAt || "" })));
}

async function devices(client) {
  const state = await client.state();
  if (!state.devices.length) { console.log("No paired displays."); return; }
  printRows(["id", "label", "status", "images", "delay", "lastSeenAt"],
    state.devices.map((d) => ({ id: d.id, label: d.label || "", status: statusLabel(d.lastSeenAt), images: String(d.images?.length || 0), delay: `${d.delaySeconds || 10}s`, lastSeenAt: d.lastSeenAt || "" })));
}

async function show(client, rest) {
  const deviceId = required(rest[0], "show requires a device id");
  const device = await findDevice(client, deviceId);
  console.log(`id: ${device.id}`);
  console.log(`label: ${device.label || ""}`);
  console.log(`status: ${statusLabel(device.lastSeenAt)}`);
  console.log(`delaySeconds: ${device.delaySeconds || 10}`);
  console.log(`lastSeenAt: ${device.lastSeenAt || ""}`);
  console.log(`images: ${device.images?.length || 0}`);
  if (device.images?.length) {
    printRows(["id", "name", "type", "delay", "path"],
      device.images.map((image) => ({ id: image.id, name: image.name, type: image.isVideo ? "VIDEO" : "IMAGE", delay: image.delaySeconds ? `${image.delaySeconds}s` : "global", path: image.path })));
  }
}

async function pair(client, rest) {
  const parsed = parseOptions(rest);
  const code = required(parsed.positionals[0], "pair requires a pairing code");
  const label = parsed.options.name || parsed.options.label || parsed.positionals.slice(1).join(" ");
  await client.post("/api/admin/pair", { code, label });
  console.log(`Paired code ${code.toUpperCase()}.`);
}

async function setDevice(client, rest) {
  const deviceId = required(rest[0], "set requires a device id");
  const parsed = parseOptions(rest.slice(1));
  const body = {};
  if (parsed.options.name || parsed.options.label) body.label = parsed.options.name || parsed.options.label;
  if (parsed.options.location) body.location = parsed.options.location;
  if (parsed.options.delay) body.delaySeconds = Number(parsed.options.delay);
  if (!Object.keys(body).length) throw new Error("set requires --name, --location, or --delay");
  await client.patch(`/api/admin/devices/${encodeURIComponent(deviceId)}`, body);
  console.log(`Updated ${deviceId}.`);
}

async function removeImage(client, rest) {
  const parsed = parseOptions(rest);
  const deviceId = parsed.options.device || parsed.positionals[0];
  const imageId = parsed.positionals[1];
  if (!deviceId || !imageId) throw new Error("remove-image <deviceId> <imageId>");
  await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(imageId)}`);
  console.log(`Removed image ${imageId}.`);
}

async function deleteDevice(client, rest) {
  const deviceId = required(rest[0], "delete-device requires a device id");
  await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}`);
  console.log(`Deleted display ${deviceId}.`);
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function parseOptions(input) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < input.length; i++) {
    const arg = input[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        options[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        options[arg.slice(2)] = input[++i] ?? true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { options, positionals };
}

function parseGlobalArgs(input) {
  const next = [];
  let url = DEFAULT_BASE_URL;
  for (let i = 0; i < input.length; i++) {
    const arg = input[i];
    if (arg === "--url") url = required(input[++i], "--url requires a value");
    else if (arg.startsWith("--url=")) url = arg.slice("--url=".length);
    else next.push(arg);
  }
  return { url: url.replace(/\/$/, ""), args: next };
}

function statusLabel(lastSeenAt) {
  const ageMs = Date.now() - Date.parse(lastSeenAt || "");
  if (ageMs < 20_000) return "online";
  if (ageMs < 120_000) return "stale";
  return "offline";
}

function printRows(headers, rows) {
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length)));
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join("  "));
  console.log(headers.map((h, i) => "-".repeat(widths[i])).join("  "));
  rows.forEach((row) => console.log(headers.map((h, i) => String(row[h] ?? "").padEnd(widths[i])).join("  ")));
}

function required(v, msg) { if (!v) throw new Error(msg); return v; }

function join(...parts) { return path.join(...parts); }

// ─── Client ────────────────────────────────────────────────────────────────────

class Client {
  constructor(baseUrl) { this.baseUrl = baseUrl; }
  state() { return this.get("/api/admin/state"); }
  get(pathname) { return this.request("GET", pathname); }
  post(pathname, body) { return this.request("POST", pathname, body); }
  patch(pathname, body) { return this.request("PATCH", pathname, body); }
  delete(pathname) { return this.request("DELETE", pathname); }
  async request(method, pathname, body) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${method} ${pathname} → ${response.status}`);
    return payload;
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`Fire TV Signage CLI

Usage:
  signage [--url http://...] <command>

Commands:
  health                          Check backend health
  devices                         List paired displays
  pending                         List waiting receivers
  show <deviceId>                 Show playlist and settings
  pair <code> [--name NAME]       Pair a receiver
  set <deviceId> --name N --delay S   Rename or set delay

  push <deviceId> <file>          Push image/video to display
  push --all <file>                Push to all paired devices
  push <deviceId> --from-library "tag"   Push from library
  push <deviceId> --from-url "url"       Push from URL
  push <deviceId> --from-youtube "url"   Download + push YouTube

  clear <deviceId>                 Clear playlist
  remove-image <deviceId> <imgId>  Remove one item

  reorder <deviceId> --order=id1,id2,...   Reorder playlist
  set-delay <deviceId> <imgId> --seconds N  Set per-slide delay
  set-delay <deviceId> <imgId> --clear      Reset to global delay
  reset-delays <deviceId>          Reset all slides to global delay
  rename <deviceId> <imgId> --name "Title"  Rename a slide

  library list                     Show library
  library add <file> --tag NAME    Add to library
  library remove <id>              Remove from library
  library search <query>           Search library

  youtube-push <url> <deviceId>    Download YouTube and push
`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});