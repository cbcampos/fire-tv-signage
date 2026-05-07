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

let state = { devices: [], pendingPairings: [], playlists: [], baseUrl: "" };
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
  // Skip workspace re-render while the user is actively editing form fields.
  // Background polling runs every 5s and would otherwise reset in-progress edits.
  const active = document.activeElement;
  const isTypingInWorkspace =
    !!active &&
    els.displayWorkspace.contains(active) &&
    ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
  if (!activeEditImageId && !isTypingInWorkspace) {
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
      <div class="display-row-wrap${active}">
        <button class="display-row${active}" type="button" data-device="${escapeHtml(device.id)}">
          <span class="display-name">
            <strong>${escapeHtml(device.label || "Signage Display")}</strong>
            <span class="meta">${liveLabel(device)} - ${Number(device.delaySeconds || 10)}s</span>
          </span>
          <span class="status-pill ${status.className}"><span aria-hidden="true"></span>${status.label}</span>
        </button>
        <button class="danger display-delete-button" type="button" data-delete-device="${escapeHtml(device.id)}" title="Delete display">Delete</button>
      </div>
    `;
  }).join("");

  els.devices.querySelectorAll("[data-device]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDeviceId = button.dataset.device;
      persistSelectedDevice();
      render();
    });
  });

  els.devices.querySelectorAll("[data-delete-device]").forEach((button) => {
    button.addEventListener("click", async () => {
      const deviceId = button.dataset.deleteDevice;
      const device = state.devices.find((entry) => entry.id === deviceId);
      if (!device) return;
      const ok = window.confirm(`Delete display "${device.label || device.id}"?\n\nThis removes the device record and any direct-uploaded items.`);
      if (!ok) return;
      await runAction("Deleting display", async () => {
        await api(`/api/admin/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
        await loadState({ keepStatus: true });
      });
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

    <section class="playlist live-preview-top" aria-labelledby="livePreviewTitle">
      <div class="playlist-head">
        <h2 id="livePreviewTitle">Live Preview</h2>
        <span class="meta">${escapeHtml(livePreviewLabel(device))} - ${effectiveLiveItems(device).length} item(s)</span>
      </div>
      <div class="live-preview live-preview-compact">
        ${renderLivePreviewHero(device)}
        <div class="playlist-strip">
          ${renderLivePreviewItems(device)}
        </div>
      </div>
    </section>

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
    <div class="danger-zone">
      <button id="deleteDisplayButton" class="danger" type="button">Delete This Display</button>
      <span class="meta">Use this to remove stale or retired displays.</span>
    </div>

    <section class="playlist-manager" aria-labelledby="playlistManagerTitle">
      <div class="playlist-manager-head">
        <div>
          <h2 id="playlistManagerTitle">Live Playlists</h2>
          <p class="meta">Create reusable playlists, choose what is live, or override the screen with one item.</p>
        </div>
        <span class="live-badge">${escapeHtml(liveLabel(device))}</span>
      </div>

      <div class="playlist-controls">
        <form id="createPlaylistForm" class="compact-form">
          <label>
            New playlist
            <input id="newPlaylistName" placeholder="Morning playlist">
          </label>
          <button type="submit">Create</button>
        </form>

        <form id="pushLiveForm" class="compact-form override-form">
          <label>
            Push live source
            <select id="pushLiveType">
              <option value="playlist" ${device.liveOverride ? "" : "selected"}>Playlist</option>
              <option value="library">Single library item</option>
            </select>
          </label>
          <label id="pushLivePlaylistWrap">
            Playlist
            <select id="pushLivePlaylistId">
              ${state.playlists.map((playlist) => `<option value="${escapeAttr(playlist.id)}" ${playlist.id === device.activePlaylistId ? "selected" : ""}>${escapeHtml(playlist.name)}</option>`).join("")}
            </select>
          </label>
          <label id="pushLiveLibraryWrap" style="display:none;">
            Library item
            <select id="pushLiveLibraryId">
              ${state.library.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Push Live</button>
          <button id="clearOverrideButton" class="secondary" type="button" ${device.liveOverride ? "" : "disabled"}>Clear Override</button>
        </form>

        <form id="playlistUploadForm" class="compact-form">
          <label>
            Add content to playlist
            <select id="playlistUploadTarget">
              ${state.playlists.map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            File
            <input id="playlistUploadFile" type="file" accept="image/*,video/mp4,video/webm,video/mkv,video/x-matroska,video/quicktime,video/x-msvideo">
          </label>
          <button type="submit" ${state.playlists.length ? "" : "disabled"}>Add</button>
        </form>

        <form id="playlistCopyForm" class="compact-form">
          <label>
            Copy existing content
            <select id="playlistCopySource">
              ${state.playlists.map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            Item
            <select id="playlistCopyItem"></select>
          </label>
          <label>
            To playlist
            <select id="playlistCopyTarget">
              ${state.playlists.map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit" ${state.playlists.length ? "" : "disabled"}>Copy</button>
        </form>

      </div>

      <div class="playlist-library">
        ${renderPlaylistCards(device)}
      </div>
      <div class="playlist-library">
        ${renderPlaylistItemManagers()}
      </div>
    </section>

    <section class="playlist-manager" aria-labelledby="libraryTitle">
      <div class="playlist-manager-head">
        <div>
          <h2 id="libraryTitle">Library</h2>
          <p class="meta">Upload once, then add items from library to any playlist.</p>
        </div>
      </div>
      <div class="playlist-controls">
        <form id="libraryUploadForm" class="compact-form">
          <label>
            Upload to library
            <input id="libraryUploadFile" type="file" accept="image/*,video/mp4,video/webm,video/mkv,video/x-matroska,video/quicktime,video/x-msvideo">
          </label>
          <button type="submit">Upload</button>
        </form>
        <form id="libraryYoutubeForm" class="compact-form">
          <label>
            Add YouTube URL to library
            <input id="libraryYoutubeUrl" placeholder="https://www.youtube.com/watch?v=..." inputmode="url">
          </label>
          <label>
            Name (optional)
            <input id="libraryYoutubeName" placeholder="YouTube Video">
          </label>
          <button type="submit">Add URL</button>
        </form>
        <form id="libraryToPlaylistForm" class="compact-form">
          <label>
            Library item
            <select id="libraryItemSelect">
              ${state.library.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            To playlist
            <select id="libraryTargetPlaylist">
              ${state.playlists.map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit" ${state.library.length && state.playlists.length ? "" : "disabled"}>Add to Playlist</button>
        </form>
      </div>
      <div class="playlist-library">
        ${renderLibraryCards()}
      </div>
    </section>
  `;

  bindWorkspace(device);
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
    handle.textContent = "::";
    handle.title = "Drag to reorder";

    // Preview
    const preview = document.createElement("div");
    preview.className = `asset-preview${image.isVideo ? " video-thumb" : ""}`;
    if (image.isVideo) {
      preview.innerHTML = `<div class="video-icon">PLAY</div><span class="video-label">${escapeHtml(image.name)}</span>`;
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
    delayClear.textContent = "X";
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

function renderPlaylistCards(device) {
  if (!state.playlists.length) {
    return `<div class="empty-list"><p>No reusable playlists yet.</p></div>`;
  }
  return state.playlists.map((playlist) => {
    const isLive = playlist.id === device.activePlaylistId && !device.liveOverride;
    const items = playlist.items || [];
    return `
      <article class="playlist-card ${isLive ? "is-live" : ""}" data-playlist="${escapeAttr(playlist.id)}">
        <div class="playlist-card-head">
          <div>
            <strong>${escapeHtml(playlist.name)}</strong>
            <span class="meta">${items.length} item${items.length === 1 ? "" : "s"}</span>
          </div>
          ${isLive ? `<span class="live-badge">Live</span>` : ""}
        </div>
        <div class="playlist-strip">
          ${items.slice(0, 5).map(renderPlaylistThumb).join("") || `<span class="playlist-empty-thumb"></span>`}
        </div>
        <div class="playlist-card-actions">
          <button type="button" class="make-live">Go Live</button>
          <button type="button" class="danger delete-playlist">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPlaylistThumb(item) {
  if (item.isYouTube) return `<span class="playlist-thumb text-thumb">YT</span>`;
  if (item.isVideo) return `<video class="playlist-thumb video-thumb-preview" src="${escapeAttr(item.path)}" muted playsinline preload="metadata"></video>`;
  return `<img class="playlist-thumb" src="${escapeAttr(item.path)}" alt="">`;
}

function effectiveLiveItems(device) {
  if (device.liveOverride) return [device.liveOverride];
  if (device.activePlaylistId) {
    const playlist = state.playlists.find((item) => item.id === device.activePlaylistId);
    return playlist?.items || [];
  }
  return [];
}

function livePreviewLabel(device) {
  if (device.liveOverride) return "Single-item override is live";
  if (device.activePlaylistId) {
    const playlist = state.playlists.find((item) => item.id === device.activePlaylistId);
    return playlist ? `${playlist.name} playlist is live` : "Playlist is live";
  }
  return "No live content";
}

function renderLivePreviewItems(device) {
  const items = effectiveLiveItems(device);
  if (!items.length) return `<span class="playlist-empty-thumb"></span>`;
  return items.slice(0, 12).map(renderPlaylistThumb).join("");
}

function renderLivePreviewHero(device) {
  const [item] = effectiveLiveItems(device);
  if (!item) {
    return `<div class="empty-list"><p>No live content.</p></div>`;
  }
  if (item.isYouTube) {
    return `<div class="asset-preview video-thumb live-hero"><div class="video-icon">PLAY</div><span class="video-label">${escapeHtml(item.name || "YouTube")}</span></div>`;
  }
  if (item.isVideo) {
    return `<div class="asset-preview video-thumb live-hero"><div class="video-icon">VID</div><span class="video-label">${escapeHtml(item.name || "Video")}</span></div>`;
  }
  return `<div class="asset-preview live-hero"><img src="${escapeAttr(item.path)}" alt="${escapeAttr(item.name || "Live item")}"></div>`;
}

function renderLibraryCards() {
  if (!state.library.length) {
    return `<div class="empty-list"><p>No library items yet.</p></div>`;
  }
  return state.library.map((item) => `
    <article class="playlist-card" data-library-item="${escapeAttr(item.id)}">
      <div class="playlist-card-head">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span class="meta">${escapeHtml(String(item.type || "image").toUpperCase())}</span>
        </div>
      </div>
      <div class="playlist-strip">
        ${item.type === "youtube"
          ? `<span class="playlist-thumb text-thumb">YT</span>`
          : item.type === "video"
          ? `<video class="playlist-thumb video-thumb-preview" src="${escapeAttr(item.path)}" muted playsinline preload="metadata"></video>`
          : `<img class="playlist-thumb" src="${escapeAttr(item.path)}" alt="">`}
      </div>
      <div class="playlist-card-actions">
        <button type="button" class="secondary add-library-to-playlist">Add</button>
        <button type="button" class="secondary rename-library-item">Rename</button>
        <button type="button" class="danger delete-library-item">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderPlaylistItemManagers() {
  if (!state.playlists.length) {
    return "";
  }
  return state.playlists.map((playlist) => {
    const items = playlist.items || [];
    return `
      <article class="playlist-card" data-playlist-manage="${escapeAttr(playlist.id)}">
        <div class="playlist-card-head">
          <div>
            <strong>${escapeHtml(playlist.name)} items</strong>
            <span class="meta">${items.length} item${items.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="playlist-manage-list">
          ${items.length ? items.map((item) => `
            <div class="asset-info-row" data-playlist-item="${escapeAttr(item.id)}">
              <div class="asset-name-col">
                <strong>${escapeHtml(item.name || "Untitled item")}</strong>
                <span class="meta">${item.isYouTube ? "YOUTUBE" : item.isVideo ? "VIDEO" : "IMAGE"}</span>
              </div>
              <div class="asset-actions">
                <button type="button" class="danger delete-playlist-item">Remove</button>
              </div>
            </div>
          `).join("") : `<div class="empty-list"><p>No items in this playlist.</p></div>`}
        </div>
      </article>
    `;
  }).join("");
}

function bindWorkspace(device) {
  const sf = document.querySelector("#settingsForm");
  if (!sf) { console.error("settings form missing:", { sf, workspaceChildren: els.displayWorkspace.children.length }); return; }
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

  document.querySelector("#deleteDisplayButton")?.addEventListener("click", async () => {
    const ok = window.confirm(`Delete display "${device.label || device.id}"?\n\nThis action removes the display and its direct-uploaded files.`);
    if (!ok) return;
    await runAction("Deleting display", async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      await loadState({ keepStatus: true });
    });
  });

  const createPlaylistForm = document.querySelector("#createPlaylistForm");
  createPlaylistForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.querySelector("#newPlaylistName")?.value.trim();
    if (!name) { showToast("Enter a playlist name."); return; }
    await runAction("Creating playlist", async () => {
      await api("/api/admin/playlists", { method: "POST", body: { name } });
      await loadState({ keepStatus: true });
    });
  });

  const pushLiveType = document.querySelector("#pushLiveType");
  const pushLivePlaylistWrap = document.querySelector("#pushLivePlaylistWrap");
  const pushLiveLibraryWrap = document.querySelector("#pushLiveLibraryWrap");
  const syncPushLiveMode = () => {
    const mode = pushLiveType?.value || "playlist";
    if (pushLivePlaylistWrap) pushLivePlaylistWrap.style.display = mode === "playlist" ? "" : "none";
    if (pushLiveLibraryWrap) pushLiveLibraryWrap.style.display = mode === "library" ? "" : "none";
  };
  pushLiveType?.addEventListener("change", syncPushLiveMode);
  syncPushLiveMode();

  const pushLiveForm = document.querySelector("#pushLiveForm");
  pushLiveForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = pushLiveType?.value || "playlist";
    if (mode === "playlist") {
      const playlistId = document.querySelector("#pushLivePlaylistId")?.value;
      if (!playlistId) { showToast("Choose a playlist to push live."); return; }
      await runAction("Pushing playlist live", async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/live`, {
          method: "POST",
          body: { playlistId }
        });
        await loadState({ keepStatus: true });
      });
      return;
    }
    const libraryItemId = document.querySelector("#pushLiveLibraryId")?.value;
    if (!libraryItemId) { showToast("Choose a library item to push live."); return; }
    await runAction("Pushing library item live", async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override-library`, {
        method: "POST",
        body: { libraryItemId }
      });
      await loadState({ keepStatus: true });
    });
  });

  const playlistUploadForm = document.querySelector("#playlistUploadForm");
  playlistUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const playlistId = document.querySelector("#playlistUploadTarget")?.value;
    const file = document.querySelector("#playlistUploadFile")?.files?.[0];
    if (!playlistId) { showToast("Create a playlist first."); return; }
    if (!file) { showToast("Choose a file to add."); return; }
    await runAction("Adding content to playlist", async () => {
      await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: "POST",
        body: { name: file.name, dataUrl: await readFileAsDataUrl(file) }
      });
      await loadState({ keepStatus: true });
    });
  });

  const copySourceSelect = document.querySelector("#playlistCopySource");
  const copyItemSelect = document.querySelector("#playlistCopyItem");
  const copyTargetSelect = document.querySelector("#playlistCopyTarget");
  const refreshCopyItems = () => {
    if (!copySourceSelect || !copyItemSelect) return;
    const items = state.playlists.find((playlist) => playlist.id === copySourceSelect.value)?.items || [];
    copyItemSelect.innerHTML = items.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name || "Untitled item")}</option>`).join("");
    copyItemSelect.disabled = !items.length;
  };
  copySourceSelect?.addEventListener("change", refreshCopyItems);
  refreshCopyItems();

  const playlistCopyForm = document.querySelector("#playlistCopyForm");
  playlistCopyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sourcePlaylistId = copySourceSelect?.value;
    const sourceItemId = copyItemSelect?.value;
    const targetPlaylistId = copyTargetSelect?.value;
    if (!sourcePlaylistId || !targetPlaylistId) { showToast("Choose source and target playlists."); return; }
    if (!sourceItemId) { showToast("Choose an item to copy."); return; }
    if (sourcePlaylistId === targetPlaylistId) { showToast("Source and target playlists cannot be the same."); return; }
    await runAction("Copying item to playlist", async () => {
      await api(`/api/admin/playlists/${encodeURIComponent(targetPlaylistId)}/items/copy`, {
        method: "POST",
        body: { sourcePlaylistId, sourceItemId }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector("#clearOverrideButton")?.addEventListener("click", async () => {
    await runAction("Clearing override", async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override`, { method: "DELETE" });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelectorAll(".playlist-card").forEach((card) => {
    const playlistId = card.dataset.playlist;
    card.querySelector(".make-live")?.addEventListener("click", async () => {
      await runAction("Changing live playlist", async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/live`, {
          method: "POST",
          body: { playlistId }
        });
        await loadState({ keepStatus: true });
      });
    });
    card.querySelector(".delete-playlist")?.addEventListener("click", async () => {
      await runAction("Deleting playlist", async () => {
        await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}`, { method: "DELETE" });
        await loadState({ keepStatus: true });
      });
    });
  });

  const libraryUploadForm = document.querySelector("#libraryUploadForm");
  libraryUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.querySelector("#libraryUploadFile")?.files?.[0];
    if (!file) { showToast("Choose a library file."); return; }
    await runAction("Uploading to library", async () => {
      await api("/api/admin/library", {
        method: "POST",
        body: { name: file.name, dataUrl: await readFileAsDataUrl(file) }
      });
      await loadState({ keepStatus: true });
    });
  });

  const libraryToPlaylistForm = document.querySelector("#libraryToPlaylistForm");
  libraryToPlaylistForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const libraryItemId = document.querySelector("#libraryItemSelect")?.value;
    const playlistId = document.querySelector("#libraryTargetPlaylist")?.value;
    if (!libraryItemId || !playlistId) { showToast("Choose a library item and playlist."); return; }
    await runAction("Adding library item to playlist", async () => {
      await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items/from-library`, {
        method: "POST",
        body: { libraryItemId }
      });
      await loadState({ keepStatus: true });
    });
  });

  const libraryYoutubeForm = document.querySelector("#libraryYoutubeForm");
  libraryYoutubeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const youtubeUrl = document.querySelector("#libraryYoutubeUrl")?.value?.trim();
    const name = document.querySelector("#libraryYoutubeName")?.value?.trim();
    if (!youtubeUrl) { showToast("Enter a YouTube URL."); return; }
    await runAction("Adding YouTube URL to library", async () => {
      await api("/api/admin/library/youtube", {
        method: "POST",
        body: { youtubeUrl, name }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelectorAll("[data-library-item]").forEach((card) => {
    const libraryItemId = card.dataset.libraryItem;
    card.querySelector(".rename-library-item")?.addEventListener("click", async () => {
      const currentName = card.querySelector(".playlist-card-head strong")?.textContent?.trim() || "";
      const name = window.prompt("Rename library item:", currentName);
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) { showToast("Name cannot be empty."); return; }
      await runAction("Renaming library item", async () => {
        await api(`/api/admin/library/${encodeURIComponent(libraryItemId)}`, {
          method: "PATCH",
          body: { name: trimmed }
        });
        await loadState({ keepStatus: true });
      });
    });
    card.querySelector(".add-library-to-playlist")?.addEventListener("click", async () => {
      const playlistId = document.querySelector("#libraryTargetPlaylist")?.value;
      if (!playlistId) { showToast("Choose a target playlist first."); return; }
      await runAction("Adding library item to playlist", async () => {
        await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items/from-library`, {
          method: "POST",
          body: { libraryItemId }
        });
        await loadState({ keepStatus: true });
      });
    });
    card.querySelector(".delete-library-item")?.addEventListener("click", async () => {
      await runAction("Deleting library item", async () => {
        await api(`/api/admin/library/${encodeURIComponent(libraryItemId)}`, { method: "DELETE" });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll("[data-playlist-manage]").forEach((card) => {
    const playlistId = card.dataset.playlistManage;
    card.querySelectorAll(".delete-playlist-item").forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest("[data-playlist-item]");
        const itemId = row?.dataset.playlistItem;
        if (!itemId) return;
        await runAction("Removing playlist item", async () => {
          await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`, {
            method: "DELETE"
          });
          await loadState({ keepStatus: true });
        });
      });
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

function liveLabel(device) {
  if (device.liveOverride) return "Override live";
  const playlist = state.playlists.find((item) => item.id === device.activePlaylistId);
  if (playlist) return `${playlist.name} live`;
  return "No live playlist";
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
