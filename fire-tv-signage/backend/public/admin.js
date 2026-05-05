const els = {
  serverUrl: document.querySelector("#serverUrl"),
  saveState: document.querySelector("#saveState"),
  refreshButton: document.querySelector("#refreshButton"),
  pairForm: document.querySelector("#pairForm"),
  pairCode: document.querySelector("#pairCode"),
  pairLabel: document.querySelector("#pairLabel"),
  pendingPairings: document.querySelector("#pendingPairings"),
  devices: document.querySelector("#devices"),
  displayCount: document.querySelector("#displayCount"),
  displayWorkspace: document.querySelector("#displayWorkspace"),
  emptyWorkspaceTemplate: document.querySelector("#emptyWorkspaceTemplate")
};

let state = { devices: [], pendingPairings: [], baseUrl: "" };
let selectedDeviceId = localStorage.getItem("selectedDeviceId") || "";
let refreshTimer = null;
let activeEditImageId = null;
let pendingDeviceLabel = "";
let pendingDeviceLocation = "";
let pendingDeviceDelay = 0;
let dragImageId = null;

els.refreshButton.addEventListener("click", () => loadState({ keepStatus: false }));

els.pairForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction("Pairing display", async () => {
    await api("/api/admin/pair", {
      method: "POST",
      body: {
        code: els.pairCode.value,
        label: els.pairLabel.value
      }
    });
    els.pairCode.value = "";
    els.pairLabel.value = "";
    await loadState();
  });
});

async function loadState(options = {}) {
  try {
    state = await api("/api/admin/state");
    if (!state.devices.some((device) => device.id === selectedDeviceId)) {
      selectedDeviceId = state.devices[0]?.id || "";
      persistSelectedDevice();
    }
    render();
    if (!options.keepStatus) {
      setStatus("Ready");
    }
  } catch (error) {
    showToast(error.message);
    setStatus("Offline");
  }
}

function render() {
  els.serverUrl.textContent = state.baseUrl ? `Backend ${state.baseUrl}` : "Backend unavailable";
  els.displayCount.textContent = String(state.devices.length);
  document.body.dataset.hasDisplays = state.devices.length ? "true" : "false";
  renderPending();
  renderDevices();
  // Only re-render workspace if not mid-edit (to avoid wiping inputs)
  if (!activeEditImageId && !document.querySelector(".edit-image-name[name='saving']")) {
    renderWorkspace();
  }
}

function renderPending() {
  if (!state.pendingPairings.length) {
    els.pendingPairings.innerHTML = `<span class="empty-text">No waiting receivers</span>`;
    return;
  }

  els.pendingPairings.innerHTML = state.pendingPairings.map((pairing) => `
    <span class="pairing-chip">
      <strong>${escapeHtml(pairing.code)}</strong>
      <span class="meta">${escapeHtml(pairing.name || "Receiver")}</span>
      <button type="button" data-pair="${escapeHtml(pairing.code)}">Use</button>
    </span>
  `).join("");

  els.pendingPairings.querySelectorAll("[data-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      els.pairCode.value = button.dataset.pair;
      els.pairLabel.focus();
    });
  });
}

function renderDevices() {
  if (!state.devices.length) {
    els.devices.innerHTML = `<div class="empty-list"><p>No paired displays</p></div>`;
    return;
  }

  els.devices.innerHTML = state.devices.map((device) => {
    const status = displayStatus(device.lastSeenAt);
    const active = device.id === selectedDeviceId ? " active" : "";
    return `
      <button class="display-row${active}" type="button" data-device="${escapeHtml(device.id)}">
        <span class="display-name">
          <strong>${escapeHtml(device.label || "Signage Display")}</strong>
          <span class="meta">${Number(device.images?.length || 0)} images - ${Number(device.delaySeconds || 10)}s</span>
        </span>
        <span class="status-pill ${status.className}"><span aria-hidden="true"></span>${status.label}</span>
      </button>
    `;
  }).join("");

  els.devices.querySelectorAll("[data-device]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDeviceId = button.dataset.device;
      persistSelectedDevice();
      render();
    });
  });
}

function renderWorkspace() {
  const device = selectedDevice();
  if (!device) {
    els.displayWorkspace.replaceChildren(els.emptyWorkspaceTemplate.content.cloneNode(true));
    return;
  }

  const status = displayStatus(device.lastSeenAt);
  els.displayWorkspace.innerHTML = `
    <div class="detail-head">
      <div class="detail-title">
        <h2>${escapeHtml(device.label || "Signage Display")}</h2>
        ${device.location ? `<span class="location-tag">${escapeHtml(device.location)}</span>` : ""}
      </div>
      <div class="meta-row">
        ${device.location ? `<span class="meta">${escapeHtml(device.location)}</span>` : ""}
        <span class="meta">${escapeHtml(device.id)}</span>
      </div>
      <span class="status-pill ${status.className}"><span aria-hidden="true"></span>${status.label}</span>
    </div>

    <form id="settingsForm" class="settings-grid">
      <label>
        Display name
        <input id="deviceLabel" value="${escapeAttr(device.label || "")}" placeholder="Lobby Display">
      </label>
      <label>
        Location
        <input id="deviceLocation" value="${escapeAttr(device.location || "")}" placeholder="Living Room">
      </label>
      <label>
        Slide delay (seconds)
        <input id="delaySeconds" type="number" min="2" max="3600" value="${Number(device.delaySeconds || 10)}">
      </label>
      <button type="submit">Save</button>
    </form>

    <form id="uploadForm" class="upload-zone">
      <label>
        Images & Video
        <input id="imageUpload" type="file" accept="image/*,video/mp4,video/webm,video/mkv,video/x-matroska,video/quicktime,video/x-msvideo" multiple>
      </label>
      <button type="submit">Push to Display</button>
    </form>

    <section class="playlist" aria-labelledby="playlistTitle">
      <div class="playlist-head">
        <h2 id="playlistTitle">Playlist</h2>
        <span class="meta">${device.images?.length || 0} items - ${Number(device.delaySeconds || 10)}s delay</span>
      </div>
      <div id="playlistContainer"></div>
    </section>
  `;

  bindWorkspace(device);
  const playlistContainer = document.querySelector("#playlistContainer");
  if (playlistContainer) {
    const playlist = renderPlaylist(device);
    playlistContainer.replaceWith(playlist);
  }
}

function renderPlaylist(device) {
  if (!device.images?.length) {
    return `<div class="empty-list playlist-empty"><span class="empty-visual" aria-hidden="true"></span><p>No images on this display</p></div>`;
  }
  const globalDelay = Number(device.delaySeconds || 10);
  const wrap = document.createElement("div");
  wrap.className = "asset-grid";
  wrap.id = "assetGrid";

  device.images.forEach((image, index) => {
    const article = document.createElement("article");
    article.className = `asset${image.isVideo ? " asset-video" : ""}`;
    article.dataset.image = image.id;
    article.draggable = true;

    // Drag handle
    const handle = document.createElement("div");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";

    // Preview
    const preview = document.createElement("div");
    preview.className = `asset-preview${image.isVideo ? " video-thumb" : ""}`;
    if (image.isVideo) {
      preview.innerHTML = `<div class="video-icon">▶</div><span class="video-label">${escapeHtml(image.name)}</span>`;
    } else {
      const img = document.createElement("img");
      img.src = image.path;
      img.alt = image.name;
      preview.appendChild(img);
    }

    // Info row
    const infoRow = document.createElement("div");
    infoRow.className = "asset-info-row";

    const nameCol = document.createElement("div");
    nameCol.className = "asset-name-col";
    const nameSpan = document.createElement("strong");
    nameSpan.className = "slide-name-display";
    nameSpan.textContent = image.name;
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "slide-name-input";
    nameInput.value = image.name;
    nameInput.style.display = "none";
    nameCol.append(nameSpan, nameInput);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = image.isVideo ? "VIDEO" : `Slide ${index + 1}`;
    nameCol.append(meta);

    // Delay override row
    const delayRow = document.createElement("div");
    delayRow.className = "asset-delay-row";
    const delayLabel = document.createElement("span");
    delayLabel.className = "delay-label";
    delayLabel.textContent = image.delaySeconds ? `${image.delaySeconds}s` : `${globalDelay}s auto`;
    const delayInput = document.createElement("input");
    delayInput.type = "number";
    delayInput.className = "slide-delay-input";
    delayInput.min = "2";
    delayInput.max = "3600";
    delayInput.value = image.delaySeconds || globalDelay;
    delayInput.title = "Override delay (seconds)";
    const delayClear = document.createElement("button");
    delayClear.type = "button";
    delayClear.className = "delay-clear";
    delayClear.textContent = "×";
    delayClear.title = "Use global delay";
    delayRow.append(delayLabel, delayInput, delayClear);

    const actionsCol = document.createElement("div");
    actionsCol.className = "asset-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary edit-image-name";
    editBtn.textContent = "Edit name";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger delete-image";
    deleteBtn.textContent = "Remove";

    actionsCol.append(editBtn, deleteBtn);
    infoRow.append(nameCol, delayRow, actionsCol);

    article.append(handle, preview, infoRow);
    wrap.appendChild(article);
  });

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "secondary reset-delays";
  resetBtn.textContent = "Reset all to global delay";
  resetBtn.style.marginTop = "8px";
  wrap.appendChild(resetBtn);

  // Attach drag events after appending (edit/delete handled inside device.images.forEach above)
  const assets = wrap.querySelectorAll(".asset");
  assets.forEach((article) => {
    article.addEventListener("dragstart", (e) => {
      dragImageId = article.dataset.image;
      e.dataTransfer.effectAllowed = "move";
      article.style.opacity = "0.4";
    });
    article.addEventListener("dragend", () => {
      dragImageId = null;
      article.style.opacity = "";
    });
    article.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    article.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (!dragImageId || dragImageId === article.dataset.image) return;
      const ids = Array.from(wrap.querySelectorAll(".asset")).map((a) => a.dataset.image);
      const fromIdx = ids.indexOf(dragImageId);
      const toIdx = ids.indexOf(article.dataset.image);
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragImageId);
      await runAction("Reordering...", async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images/reorder`, {
          method: "POST",
          body: { order: ids }
        });
        await loadState({ keepStatus: true });
      });
    });
  });

  // Reset all delays
  resetBtn.addEventListener("click", async () => {
    await runAction("Resetting delays...", async () => {
      for (const img of device.images) {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images/${img.id}`, {
          method: "PATCH",
          body: { delaySeconds: null }
        });
      }
      await loadState({ keepStatus: true });
    });
  });

  return wrap;
}

function bindWorkspace(device) {
  const sf = document.querySelector("#settingsForm");
  const uf = document.querySelector("#uploadForm");
  if (!sf || !uf) { console.error("forms missing:", { sf, uf, workspaceChildren: els.displayWorkspace.children.length }); return; }
  // Restore pending values if user is mid-edit
  const savedLabel = pendingDeviceLabel || device.label || "";
  const savedLocation = pendingDeviceLocation || device.location || "";
  const savedDelay = pendingDeviceDelay || device.delaySeconds || 10;
  const labelInput = sf.querySelector("#deviceLabel");
  const locationInput = sf.querySelector("#deviceLocation");
  const delayInput = sf.querySelector("#delaySeconds");
  if (labelInput) labelInput.value = savedLabel;
  if (locationInput) locationInput.value = savedLocation;
  if (delayInput) delayInput.value = savedDelay;

  sf.addEventListener("submit", async (event) => {
    event.preventDefault();
    // Persist current values so re-render doesn't wipe them
    const l = sf.querySelector("#deviceLabel")?.value;
    const loc = sf.querySelector("#deviceLocation")?.value;
    const d = Number(sf.querySelector("#delaySeconds")?.value);
    if (l !== undefined) pendingDeviceLabel = l;
    if (loc !== undefined) pendingDeviceLocation = loc;
    if (!isNaN(d)) pendingDeviceDelay = d;
    await runAction("Saving settings", async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, {
        method: "PATCH",
        body: {
          label: pendingDeviceLabel,
          location: pendingDeviceLocation,
          delaySeconds: pendingDeviceDelay
        }
      });
      pendingDeviceLabel = "";
      pendingDeviceLocation = "";
      pendingDeviceDelay = 0;
      await loadState({ keepStatus: true });
    });
  });

  uf.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = Array.from(document.querySelector("#imageUpload").files || []);
    if (!files.length) {
      showToast("Choose one or more images.");
      return;
    }
    await runAction(`Pushing ${files.length} image${files.length === 1 ? "" : "s"}`, async () => {
      for (const file of files) {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images`, {
          method: "POST",
          body: {
            name: file.name,
            dataUrl: await readFileAsDataUrl(file)
          }
        });
      }
      await loadState({ keepStatus: true });
    });
  });

  document.querySelectorAll(".edit-image-name").forEach((button) => {
    button.addEventListener("click", () => {
      const article = button.closest("[data-image]");
      const nameSpan = article.querySelector(".slide-name-display");
      const nameInput = article.querySelector(".slide-name-input");
      if (button.textContent === "Edit name") {
        activeEditImageId = article.dataset.image;
        nameSpan.style.display = "none";
        nameInput.style.display = "block";
        nameInput.focus();
        button.textContent = "Save";
      } else {
        activeEditImageId = null;
        const newName = nameInput.value.trim();
        if (!newName) { showToast("Name cannot be empty."); return; }
        const imageId = article.dataset.image;
        runAction("Saving name", async () => {
          const result = await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images/${encodeURIComponent(imageId)}`, {
            method: "PATCH",
            body: { name: newName }
          });
          if (result?.image) {
            nameSpan.textContent = result.image.name;
          } else if (result?.ok) {
            nameSpan.textContent = newName;
          }
          nameSpan.style.display = "";
          nameInput.style.display = "none";
          button.textContent = "Edit name";
        });
      }
    });
  });

  document.querySelectorAll(".delete-image").forEach((button) => {
    button.addEventListener("click", async () => {
      const imageId = button.closest("[data-image]").dataset.image;
      await runAction("Removing image", async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images/${encodeURIComponent(imageId)}`, {
          method: "DELETE"
        });
        await loadState({ keepStatus: true });
      });
    });
  });
}

async function runAction(label, action) {
  setStatus(label);
  disableButtons(true);
  try {
    await action();
    setStatus("Saved");
    window.setTimeout(() => setStatus("Ready"), 1400);
  } catch (error) {
    setStatus("Error");
    showToast(error.message);
  } finally {
    disableButtons(false);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function selectedDevice() {
  return state.devices.find((device) => device.id === selectedDeviceId) || null;
}

function displayStatus(lastSeenAt) {
  const lastSeen = Date.parse(lastSeenAt || "");
  if (!Number.isFinite(lastSeen)) {
    return { label: "Offline", className: "status-offline" };
  }
  const ageMs = Date.now() - lastSeen;
  if (ageMs < 20_000) {
    return { label: "Online", className: "status-online" };
  }
  if (ageMs < 120_000) {
    return { label: "Stale", className: "status-stale" };
  }
  return { label: "Offline", className: "status-offline" };
}

function disableButtons(disabled) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

function setStatus(text) {
  els.saveState.textContent = text;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function persistSelectedDevice() {
  if (selectedDeviceId) {
    localStorage.setItem("selectedDeviceId", selectedDeviceId);
  } else {
    localStorage.removeItem("selectedDeviceId");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

loadState();
refreshTimer = window.setInterval(() => loadState({ keepStatus: true }), 5000);
window.addEventListener("beforeunload", () => window.clearInterval(refreshTimer));
