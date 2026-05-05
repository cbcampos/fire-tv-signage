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
  renderWorkspace();
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
      ${renderPlaylist(device)}
    </section>
  `;

  bindWorkspace(device);
}

function renderPlaylist(device) {
  if (!device.images?.length) {
    return `<div class="empty-list playlist-empty"><span class="empty-visual" aria-hidden="true"></span><p>No images on this display</p></div>`;
  }

  return `
    <div class="asset-grid">
      ${device.images.map((image, index) => `
        <article class="asset ${image.isVideo ? 'asset-video' : ''}" data-image="${escapeHtml(image.id)}">
          <div class="asset-preview ${image.isVideo ? 'video-thumb' : ''}">
            ${image.isVideo
              ? `<div class="video-icon">▶</div><span class="video-label">${escapeHtml(image.name)}</span>`
              : `<img src="${escapeAttr(image.path)}" alt="${escapeHtml(image.name)}">`
            }
          </div>
          <div class="asset-row">
            <span class="asset-name">
              <strong class="slide-name-display">${escapeHtml(image.name)}</strong>
              <input class="slide-name-input" type="text" value="${escapeAttr(image.name)}" style="display:none;width:100%;font-size:13px;">
              <span class="meta">${image.isVideo ? 'VIDEO' : 'Slide ' + (index + 1)}</span>
            </span>
            <button class="secondary edit-image-name" type="button">Edit name</button>
            <button class="danger delete-image" type="button">Remove</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function bindWorkspace(device) {
  document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAction("Saving settings", async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, {
        method: "PATCH",
        body: {
          label: document.querySelector("#deviceLabel").value,
          location: document.querySelector("#deviceLocation").value,
          delaySeconds: Number(document.querySelector("#delaySeconds").value)
        }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector("#uploadForm").addEventListener("submit", async (event) => {
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
        nameSpan.style.display = "none";
        nameInput.style.display = "block";
        nameInput.focus();
        button.textContent = "Save";
      } else {
        const newName = nameInput.value.trim();
        if (!newName) { showToast("Name cannot be empty."); return; }
        const imageId = article.dataset.image;
        runAction("Saving name", async () => {
          const result = await api(`/api/admin/devices/${encodeURIComponent(device.id)}/images/${encodeURIComponent(imageId)}`, {
            method: "PATCH",
            body: { name: newName }
          });
          nameSpan.textContent = result.image.name;
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
