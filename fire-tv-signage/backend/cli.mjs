#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = process.env.SIGNAGE_URL || "http://127.0.0.1:3002";
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
      await upload(client, rest);
      return;
    case "remove-image":
    case "rm-image":
      await removeImage(client, rest);
      return;
    case "clear":
      await clearPlaylist(client, rest);
      return;
    case "delete-device":
    case "rm-device":
      await deleteDevice(client, rest);
      return;
    default:
      throw new Error(`Unknown command "${command}". Run "signage help".`);
  }
}

function parseGlobalArgs(input) {
  const next = [];
  let url = DEFAULT_BASE_URL;
  for (let i = 0; i < input.length; i++) {
    const arg = input[i];
    if (arg === "--url") {
      url = required(input[++i], "--url requires a value");
    } else if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
    } else {
      next.push(arg);
    }
  }
  return { url: url.replace(/\/$/, ""), args: next };
}

async function health(client) {
  const result = await client.get("/api/health");
  console.log(`ok: ${result.ok}`);
  console.log(`devices: ${result.devices}`);
  console.log(`pendingPairings: ${result.pendingPairings}`);
}

async function pending(client) {
  const state = await client.state();
  if (!state.pendingPairings.length) {
    console.log("No pending receivers.");
    return;
  }
  printRows(["code", "name", "deviceId", "lastSeenAt"], state.pendingPairings.map((item) => ({
    code: item.code,
    name: item.name || "",
    deviceId: item.deviceId || "",
    lastSeenAt: item.lastSeenAt || ""
  })));
}

async function devices(client) {
  const state = await client.state();
  if (!state.devices.length) {
    console.log("No paired displays.");
    return;
  }
  printRows(["id", "label", "status", "images", "delay", "lastSeenAt"], state.devices.map((device) => ({
    id: device.id,
    label: device.label || "",
    status: statusLabel(device.lastSeenAt),
    images: String(device.images?.length || 0),
    delay: `${device.delaySeconds || 10}s`,
    lastSeenAt: device.lastSeenAt || ""
  })));
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
    printRows(["id", "name", "path"], device.images.map((image) => ({
      id: image.id,
      name: image.name,
      path: image.path
    })));
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
  if (parsed.options.name || parsed.options.label) {
    body.label = parsed.options.name || parsed.options.label;
  }
  if (parsed.options.delay) {
    body.delaySeconds = Number(parsed.options.delay);
  }
  if (!Object.keys(body).length) {
    throw new Error("set requires --name or --delay");
  }
  await client.patch(`/api/admin/devices/${encodeURIComponent(deviceId)}`, body);
  console.log(`Updated ${deviceId}.`);
}

async function upload(client, rest) {
  const deviceId = required(rest[0], "upload requires a device id");
  const files = rest.slice(1);
  if (!files.length) {
    throw new Error("upload requires at least one image path");
  }
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    await client.post(`/api/admin/devices/${encodeURIComponent(deviceId)}/images`, {
      name: path.basename(file),
      dataUrl
    });
    console.log(`Uploaded ${file}.`);
  }
}

async function removeImage(client, rest) {
  const deviceId = required(rest[0], "remove-image requires a device id");
  const imageId = required(rest[1], "remove-image requires an image id");
  await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(imageId)}`);
  console.log(`Removed image ${imageId}.`);
}

async function clearPlaylist(client, rest) {
  const deviceId = required(rest[0], "clear requires a device id");
  const device = await findDevice(client, deviceId);
  for (const image of device.images || []) {
    await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}/images/${encodeURIComponent(image.id)}`);
    console.log(`Removed image ${image.id}.`);
  }
  console.log(`Cleared playlist for ${deviceId}.`);
}

async function deleteDevice(client, rest) {
  const deviceId = required(rest[0], "delete-device requires a device id");
  await client.delete(`/api/admin/devices/${encodeURIComponent(deviceId)}`);
  console.log(`Deleted display ${deviceId}.`);
}

async function findDevice(client, deviceId) {
  const state = await client.state();
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }
  return device;
}

function parseOptions(input) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < input.length; i++) {
    const arg = input[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      options[key] = inline ?? required(input[++i], `--${key} requires a value`);
    } else {
      positionals.push(arg);
    }
  }
  return { options, positionals };
}

async function fileToDataUrl(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  }[ext];
  if (!mime) {
    throw new Error(`Unsupported image type for ${file}`);
  }
  const data = await fs.readFile(file);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function statusLabel(lastSeenAt) {
  const lastSeen = Date.parse(lastSeenAt || "");
  if (!Number.isFinite(lastSeen)) {
    return "offline";
  }
  const ageMs = Date.now() - lastSeen;
  if (ageMs < 20_000) {
    return "online";
  }
  if (ageMs < 120_000) {
    return "stale";
  }
  return "offline";
}

function printRows(headers, rows) {
  const widths = headers.map((header) => Math.max(header.length, ...rows.map((row) => String(row[header] ?? "").length)));
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "));
  console.log(headers.map((header, index) => "-".repeat(widths[index])).join("  "));
  for (const row of rows) {
    console.log(headers.map((header, index) => String(row[header] ?? "").padEnd(widths[index])).join("  "));
  }
}

function required(value, message) {
  if (value === undefined || value === "") {
    throw new Error(message);
  }
  return value;
}

function printHelp() {
  console.log(`Fire TV Signage CLI

Usage:
  signage [--url http://127.0.0.1:3002] <command>

Commands:
  health                         Check backend health
  pending                        List receivers waiting for pairing
  devices                        List paired displays
  show <deviceId>                Show display settings and playlist
  pair <code> [--name NAME]      Pair a receiver code
  set <deviceId> --name NAME     Rename a display
  set <deviceId> --delay SEC     Set slide delay in seconds
  upload <deviceId> <files...>   Upload images to a display
  remove-image <deviceId> <id>   Remove one image from a display
  clear <deviceId>               Remove all images from a display
  delete-device <deviceId>       Delete a display and its uploaded images

Environment:
  SIGNAGE_URL                    Default backend URL
`);
}

class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  state() {
    return this.get("/api/admin/state");
  }

  get(pathname) {
    return this.request("GET", pathname);
  }

  post(pathname, body) {
    return this.request("POST", pathname, body);
  }

  patch(pathname, body) {
    return this.request("PATCH", pathname, body);
  }

  delete(pathname) {
    return this.request("DELETE", pathname);
  }

  async request(method, pathname, body) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `${method} ${pathname} failed with ${response.status}`);
    }
    return payload;
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
