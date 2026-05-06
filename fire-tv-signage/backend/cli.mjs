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
    case "weather":
      await weatherCard(client, rest);
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

async function weatherCard(client, rest) {
  const parsed = parseOptions(rest);
  const city = parsed.options.city || "Birmingham,AL";
  const deviceId = parsed.positionals[0];
  if (!deviceId) throw new Error("weather <deviceId> [--city CITY]");
  const serverUrl = client.baseUrl.replace("/api/", "");
  // Generate the card via Playwright script
  const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let weather = null;
  try {
    const res = await page.request.get('${serverUrl}/api/weather?city=${encodeURIComponent(city)}', { timeout: 8000 });
    if (res.ok()) weather = await res.json();
  } catch (e) {}
  const now = new Date();
  const h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  const timeStr = hour12 + ':' + String(now.getMinutes()).padStart(2,'0');
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const w = weather || {};
  const loc = (w.location || city).toUpperCase().split(',').slice(0,2).join(', ');
  const fc = w.forecast || [];
  const days = fc.length >= 7 ? fc : [
    {maxTempF:84,minTempF:56,weatherCode:'116'},
    {maxTempF:76,minTempF:64,weatherCode:'266'},
    {maxTempF:73,minTempF:58,weatherCode:'176'},
    {maxTempF:80,minTempF:60,weatherCode:'116'},
    {maxTempF:82,minTempF:62,weatherCode:'119'},
    {maxTempF:78,minTempF:59,weatherCode:'176'},
    {maxTempF:75,minTempF:57,weatherCode:'119'},
  ];
  const dayAbbrev=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const today = new Date();
  let fcHtml = '';
  for(let i=0;i<7;i++){
    const d = days[i];
    const dn = new Date(today); dn.setDate(today.getDate()+i);
    const label = i===0 ? 'TODAY' : dayAbbrev[dn.getDay()];
    fcHtml += '<div class="day-card"><div class="day-name'+(i===0?' today':'')+'">'+label+'</div><div class="weather-icon"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#FFD93D" stroke="#FFB800" stroke-width="2"/><line x1="32" y1="6" x2="32" y2="14" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="32" y1="50" x2="32" y2="58" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="32" x2="14" y2="32" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="50" y1="32" x2="58" y2="32" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="13.5" y1="13.5" x2="19.3" y2="19.3" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="44.7" y1="44.7" x2="50.5" y2="50.5" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="13.5" y1="50.5" x2="19.3" y2="44.7" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="44.7" y1="19.3" x2="50.5" y2="13.5" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/></svg></div><div class="temp-high">'+Math.round(d.maxTempF)+'°</div><div class="temp-low">'+Math.round(d.minTempF)+'°</div></div>';
  }
  const iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>';
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;width:1920px;height:1080px;overflow:hidden;background:#0a1628;position:relative}.sky-bg{position:absolute;inset:0;background:linear-gradient(180deg,#0d1b2a 0%,#1b263b 15%,#1e3a5f 30%,#2d6a4f 50%,#40916c 65%,#74a57f 78%,#b5c99a 90%,#e9c46a 100%)}.grid-overlay{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:60px 60px}.glass-card{position:absolute;bottom:40px;left:40px;right:40px;background:rgba(10,22,40,0.72);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12);border-radius:28px;padding:36px 48px;display:flex;flex-direction:column;gap:28px}.top-row{display:flex;align-items:flex-start;gap:48px}.current-block{display:flex;flex-direction:column;gap:6px;min-width:260px}.location{font-size:20px;font-weight:700;color:#fff;letter-spacing:0.1em;text-transform:uppercase;opacity:0.95}.date-time-row{font-size:14px;font-weight:400;color:rgba(255,255,255,0.55)}.temp-row{display:flex;align-items:baseline;gap:12px;margin-top:6px}.temp-main{font-size:112px;font-weight:700;color:#fff;line-height:1;letter-spacing:-4px;text-shadow:0 4px 24px rgba(0,0,0,0.35)}.deg{font-size:56px;font-weight:300;letter-spacing:-2px;vertical-align:top}.condition-row{display:flex;align-items:center;gap:10px;margin-top:4px}.condition-text{font-size:19px;font-weight:400;color:rgba(255,255,255,0.85)}.feels-like{font-size:13px;font-weight:400;color:rgba(255,255,255,0.45);margin-top:3px}.forecast-row{display:flex;gap:0;flex:1;align-items:stretch}.day-card{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 10px;border-right:1px solid rgba(255,255,255,0.07)}.day-card:last-child{border-right:none}.day-name{font-size:12px;font-weight:500;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em}.day-name.today{color:#fff;font-weight:600}.weather-icon{width:44px;height:44px}.weather-icon svg{width:100%;height:100%}.temp-high{font-size:17px;font-weight:600;color:#fff}.temp-low{font-size:13px;font-weight:400;color:rgba(255,255,255,0.38)}.metrics-row{display:flex;gap:0;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08)}.metric{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 12px;border-right:1px solid rgba(255,255,255,0.07)}.metric:last-child{border-right:none}.metric-label{font-size:10px;font-weight:500;color:rgba(255,255,255,0.38);text-transform:uppercase;letter-spacing:0.1em}.metric-value{font-size:20px;font-weight:600;color:#fff;display:flex;align-items:center;gap:6px}.metric-value .unit{font-size:12px;font-weight:400;color:rgba(255,255,255,0.5)}.metric-icon{width:20px;height:20px;opacity:0.65}.time-badge{position:absolute;top:40px;left:40px;display:flex;flex-direction:column;gap:4px}.time-display{font-size:44px;font-weight:300;color:#fff;line-height:1;text-shadow:0 2px 16px rgba(0,0,0,0.5);letter-spacing:-1px}.ampm{font-size:18px;font-weight:500;vertical-align:super;opacity:0.7}.date-display{font-size:13px;font-weight:400;color:rgba(255,255,255,0.6);letter-spacing:0.04em}</style></head><body><div class="sky-bg"></div><div class="grid-overlay"></div><div class="time-badge"><div class="time-display">'+timeStr+' <span class="ampm">'+ampm+'</span></div><div class="date-display">'+dateStr+'</div></div><div class="glass-card"><div class="top-row"><div class="current-block"><div class="location">'+loc+'</div><div class="date-time-row">'+dateStr+'</div><div class="temp-row"><div class="temp-main">'+(w.tempF||72)+'<span class="deg">°</span></div></div><div class="condition-row"><span class="condition-text">'+(w.condition||'Partly Cloudy')+'</span></div><div class="feels-like">Feels like '+(w.feelsLikeF||70)+'°F</div></div><div class="forecast-row">'+fcHtml+'</div></div><div class="metrics-row"><div class="metric"><div class="metric-label">Humidity</div><div class="metric-value">'+iconSvg+(w.humidity||55)+'<span class="unit">%</span></div></div><div class="metric"><div class="metric-label">Wind</div><div class="metric-value"><svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>'+(w.windmph||9)+' <span class="unit">mph '+(w.windDir||'S')+'</span></div></div><div class="metric"><div class="metric-label">UV Index</div><div class="metric-value"><svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'+(w.uvIndex||0)+'</div></div><div class="metric"><div class="metric-label">Visibility</div><div class="metric-value"><svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+(w.visibility||9)+' <span class="unit">mi</span></div></div><div class="metric"><div class="metric-label">Pressure</div><div class="metric-value">'+iconSvg+(w.pressure?Number(w.pressure).toFixed(1):'30.0')+' <span class="unit">in</span></div></div></div></div></body></html>';
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/weather_card.png', fullPage: true });
  await browser.close();
  console.log('DONE:' + timeStr);
  process.exit(0);
})();
`;
  const tmp = '/tmp/pdf-build/weather_render_cli.js';
  await import('node:fs').then(fs => fs.writeFileSync(tmp, script));
  const render = spawn('node', [tmp], { stdio: 'pipe', cwd: '/tmp/pdf-build' });
  let output = '';
  render.stdout.on('data', d => { output += d; process.stdout.write(d); });
  render.stderr.on('data', d => process.stderr.write(d));
  await new Promise(r => render.on('close', r));
  if (!output.includes('DONE:')) throw new Error('Render failed');
  // Upload to device
  const png = await import('node:fs').then(fs => fs.readFileSync('/tmp/weather_card.png'));
  const base64 = png.toString('base64');
  await client.post(`/api/admin/devices/${encodeURIComponent(deviceId)}/images`, {
    name: 'Weather Card',
    dataUrl: `data:image/png;base64,${base64}`
  });
  console.log(`✓ Weather card pushed to ${deviceId}`);
}

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