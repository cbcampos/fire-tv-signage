const els = {
  serverUrl: document.querySelector('#serverUrl'),
  saveState: document.querySelector('#saveState'),
  refreshButton: document.querySelector('#refreshButton'),
  pairForm: document.querySelector('#pairForm'),
  pairCode: document.querySelector('#pairCode'),
  pairLabel: document.querySelector('#pairLabel'),
  pendingPairings: document.querySelector('#pendingPairings'),
  devices: document.querySelector('#devices'),
  displayCount: document.querySelector('#displayCount'),
  displayWorkspace: document.querySelector('#displayWorkspace'),
  emptyWorkspaceTemplate: document.querySelector('#emptyWorkspaceTemplate'),
  liveSummaryTitle: document.querySelector('#liveSummaryTitle'),
  liveSummaryBody: document.querySelector('#liveSummaryBody'),
  scrollToLibrary: document.querySelector('#scrollToLibrary')
};

let state = { devices: [], pendingPairings: [], playlists: [], library: [], baseUrl: '' };
let selectedDeviceId = localStorage.getItem('signage-v2:selectedDeviceId') || '';
let refreshTimer = null;

els.refreshButton.addEventListener('click', () => loadState({ keepStatus: false }));
els.scrollToLibrary.addEventListener('click', () => document.querySelector('#librarySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.pairForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runAction('Pairing screen', async () => {
    await api('/api/admin/pair', { method: 'POST', body: { code: els.pairCode.value, label: els.pairLabel.value } });
    els.pairCode.value = '';
    els.pairLabel.value = '';
    await loadState({ keepStatus: true });
  });
});

loadState();
refreshTimer = window.setInterval(() => loadState({ keepStatus: true, silent: true }), 5000);

async function loadState(options = {}) {
  try {
    state = await api('/api/admin/state');
    if (!state.devices.some((device) => device.id === selectedDeviceId)) {
      selectedDeviceId = state.devices[0]?.id || '';
      persistSelectedDevice();
    }
    render(options);
    if (!options.keepStatus) setStatus('Ready');
  } catch (error) {
    renderError(error);
    setStatus('Offline');
  }
}

function render() {
  els.serverUrl.textContent = state.baseUrl ? `Backend ${state.baseUrl}` : 'Backend unavailable';
  els.displayCount.textContent = String(state.devices.length);
  renderPending();
  renderDevices();
  renderWorkspace();
  renderLiveSummary();
}

function renderPending() {
  if (!state.pendingPairings?.length) {
    els.pendingPairings.innerHTML = '<span class="meta">No waiting receivers</span>';
    return;
  }
  els.pendingPairings.innerHTML = state.pendingPairings.map((pairing) => `
    <button class="pair-chip" type="button" data-pair="${escapeAttr(pairing.code)}">
      <strong>${escapeHtml(pairing.code)}</strong>
      <span class="meta">${escapeHtml(pairing.name || 'Receiver')}</span>
    </button>
  `).join('');
  els.pendingPairings.querySelectorAll('[data-pair]').forEach((button) => {
    button.addEventListener('click', () => {
      els.pairCode.value = button.dataset.pair;
      els.pairLabel.focus();
    });
  });
}

function renderDevices() {
  if (!state.devices?.length) {
    els.devices.innerHTML = '<section class="empty-state">No displays yet.</section>';
    return;
  }
  els.devices.innerHTML = state.devices.map((device) => {
    const status = displayStatus(device.lastSeenAt);
    return `
      <button class="device-card ${device.id === selectedDeviceId ? 'active' : ''}" type="button" data-device="${escapeAttr(device.id)}">
        <div class="device-card-header">
          <div>
            <strong>${escapeHtml(device.label || 'Unnamed Display')}</strong>
            <div class="meta">${escapeHtml(device.location || 'No location')} · ${Number(device.delaySeconds || 10)}s</div>
          </div>
          <span class="badge"><span class="status-dot ${status.className}"></span>${status.label}</span>
        </div>
        <div class="meta">${escapeHtml(liveLabel(device))}</div>
      </button>
    `;
  }).join('');
  els.devices.querySelectorAll('[data-device]').forEach((button) => {
    button.addEventListener('click', () => {
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
  const liveItems = effectiveLiveItems(device);
  els.displayWorkspace.innerHTML = `
    <section class="panel live-stage">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Live control</p>
          <h2>${escapeHtml(device.label || 'Display')}</h2>
          <p class="subtle">${escapeHtml(livePreviewLabel(device))}</p>
        </div>
        <span class="live-pill">${escapeHtml(displayStatus(device.lastSeenAt).label)}</span>
      </div>
      <div class="details-grid">
        <div class="live-hero">${renderHero(liveItems[0])}</div>
        <div class="panel action-card">
          <h3>Display settings</h3>
          <form id="settingsForm" class="stack-form">
            <label>Display name<input id="deviceLabel" value="${escapeAttr(device.label || '')}" placeholder="Lobby TV"></label>
            <label>Location<input id="deviceLocation" value="${escapeAttr(device.location || '')}" placeholder="Front room"></label>
            <label>Slide delay (seconds)<input id="delaySeconds" type="number" min="2" max="3600" value="${Number(device.delaySeconds || 10)}"></label>
            <div class="card-actions">
              <button type="submit">Save settings</button>
              <button type="button" class="danger" id="deleteDisplay">Delete display</button>
            </div>
          </form>
        </div>
      </div>
      <div class="strip">${liveItems.length ? liveItems.slice(0, 12).map(renderThumb).join('') : '<div class="thumb"><span class="meta">Nothing live</span></div>'}</div>
    </section>

    <section class="quick-actions">
      <article class="action-card panel">
        <h3>Go live fast</h3>
        <form id="goLiveForm" class="action-row">
          <label>Source
            <select id="goLiveType">
              <option value="playlist" ${device.liveOverride ? '' : 'selected'}>Playlist</option>
              <option value="library">Single library item</option>
            </select>
          </label>
          <label id="goLivePlaylistWrap">Playlist
            <select id="goLivePlaylistId">${(state.playlists || []).map((playlist) => `<option value="${escapeAttr(playlist.id)}" ${playlist.id === device.activePlaylistId ? 'selected' : ''}>${escapeHtml(playlist.name)}</option>`).join('')}</select>
          </label>
          <label id="goLiveLibraryWrap" style="display:none;">Library item
            <select id="goLiveLibraryId">${(state.library || []).map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select>
          </label>
          <div class="card-actions">
            <button type="submit">Push live</button>
            <button type="button" class="secondary" id="refreshLive">Refresh output</button>
            <button type="button" class="secondary" id="clearOverride" ${device.liveOverride ? '' : 'disabled'}>Clear override</button>
          </div>
        </form>
      </article>

      <article class="action-card panel">
        <h3>Playlist workflow</h3>
        <form id="createPlaylistForm" class="action-row">
          <label>New playlist<input id="newPlaylistName" placeholder="Sunday loop"></label>
          <button type="submit">Create playlist</button>
        </form>
        <form id="playlistAddFromLibraryForm" class="action-row">
          <label>Library item<select id="libraryItemSelect">${(state.library || []).map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
          <label>Playlist<select id="libraryTargetPlaylist">${(state.playlists || []).map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join('')}</select></label>
          <button type="submit" ${state.library?.length && state.playlists?.length ? '' : 'disabled'}>Add to playlist</button>
        </form>
      </article>

      <article class="action-card panel" id="librarySection">
        <h3>Library intake</h3>
        <form id="libraryUploadForm" class="action-row">
          <label>Upload file<input id="libraryUploadFile" type="file" accept="image/*,video/*"></label>
          <button type="submit">Upload</button>
        </form>
        <form id="libraryYoutubeForm" class="action-row">
          <label>YouTube URL<input id="libraryYoutubeUrl" placeholder="https://youtube.com/watch?v=..."></label>
          <label>Name <input id="libraryYoutubeName" placeholder="Optional name"></label>
          <button type="submit">Add YouTube</button>
        </form>
        <form id="libraryWebForm" class="action-row">
          <label>Web URL<input id="libraryWebUrl" placeholder="https://example.com"></label>
          <label>Name <input id="libraryWebName" placeholder="Optional name"></label>
          <button type="submit">Add web page</button>
        </form>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Playlists</p>
          <h2>Reusable publishing lanes</h2>
        </div>
      </div>
      <div class="playlist-grid">${renderPlaylistCards(device)}</div>
    </section>

    <section class="panel" id="librarySection">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Library</p>
          <h2>Upload once, push anywhere</h2>
        </div>
      </div>
      <div class="library-grid">${renderLibraryCards()}</div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Playlist contents</p>
          <h2>Manage items</h2>
        </div>
      </div>
      <div class="library-grid">${renderPlaylistManagers()}</div>
    </section>
  `;
  bindWorkspace(device);
}

function renderLiveSummary() {
  const device = selectedDevice();
  if (!device) {
    els.liveSummaryTitle.textContent = 'No display selected';
    els.liveSummaryBody.textContent = 'Select a screen to preview what’s live.';
    return;
  }
  const items = effectiveLiveItems(device);
  els.liveSummaryTitle.textContent = device.label || 'Selected Display';
  els.liveSummaryBody.innerHTML = `
    <div class="hero-actions"><span class="badge">${escapeHtml(liveLabel(device))}</span><span class="meta">${items.length} item(s)</span></div>
    <div class="strip">${items.length ? items.slice(0, 5).map(renderThumb).join('') : '<div class="thumb"><span class="meta">No live items</span></div>'}</div>
  `;
}

function renderPlaylistCards(device) {
  if (!state.playlists?.length) return '<div class="empty-state">No playlists yet.</div>';
  return state.playlists.map((playlist) => {
    const isLive = playlist.id === device.activePlaylistId && !device.liveOverride;
    return `
      <article class="playlist-card" data-playlist="${escapeAttr(playlist.id)}">
        <div class="panel-head">
          <div>
            <strong>${escapeHtml(playlist.name)}</strong>
            <p class="meta">${(playlist.items || []).length} item(s)</p>
          </div>
          ${isLive ? '<span class="badge">Live</span>' : ''}
        </div>
        <div class="strip">${(playlist.items || []).length ? playlist.items.slice(0, 8).map(renderThumb).join('') : '<div class="thumb"><span class="meta">Empty</span></div>'}</div>
        <div class="card-actions">
          <button type="button" data-make-live="${escapeAttr(playlist.id)}">Go live</button>
          <button type="button" class="danger" data-delete-playlist="${escapeAttr(playlist.id)}">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderLibraryCards() {
  if (!state.library?.length) return '<div class="empty-state">No library items yet.</div>';
  return state.library.map((item) => `
    <article class="media-card" data-library-item="${escapeAttr(item.id)}">
      <div class="media-preview">${renderPreview(item)}</div>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p class="meta">${escapeHtml(String(item.type || 'image').toUpperCase())}</p>
      </div>
      <label>Playlist target
        <select data-library-target="${escapeAttr(item.id)}">
          ${(state.playlists || []).map((playlist) => `<option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join('')}
        </select>
      </label>
      <div class="card-actions">
        <button type="button" data-library-live="${escapeAttr(item.id)}">Push live</button>
        <button type="button" class="secondary" data-library-announce="${escapeAttr(item.id)}">Announce</button>
        <button type="button" class="secondary" data-library-announce-temp="${escapeAttr(item.id)}">30s live</button>
        <button type="button" class="secondary" data-library-add="${escapeAttr(item.id)}" ${(state.playlists || []).length ? '' : 'disabled'}>Add to playlist</button>
        <button type="button" class="danger" data-library-delete="${escapeAttr(item.id)}">Delete</button>
      </div>
    </article>
  `).join('');
}

function renderPlaylistManagers() {
  if (!state.playlists?.length) return '<div class="empty-state">No playlist items to manage yet.</div>';
  return state.playlists.map((playlist) => `
    <article class="media-card">
      <div>
        <strong>${escapeHtml(playlist.name)}</strong>
        <p class="meta">${(playlist.items || []).length} item(s)</p>
      </div>
      <div class="manage-list">
        ${(playlist.items || []).length ? playlist.items.map((item) => `
          <div class="manage-item">
            <div>
              <strong>${escapeHtml(item.name || 'Untitled item')}</strong>
              <div class="meta">${itemLabel(item)}</div>
            </div>
            <button type="button" class="danger" data-playlist-item-delete="${escapeAttr(playlist.id)}::${escapeAttr(item.id)}">Remove</button>
          </div>
        `).join('') : '<div class="empty-state">No items in this playlist.</div>'}
      </div>
    </article>
  `).join('');
}

function bindWorkspace(device) {
  document.querySelector('#settingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runAction('Saving settings', async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, {
        method: 'PATCH',
        body: {
          label: document.querySelector('#deviceLabel').value,
          location: document.querySelector('#deviceLocation').value,
          delaySeconds: Number(document.querySelector('#delaySeconds').value)
        }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#deleteDisplay')?.addEventListener('click', async () => {
    if (!window.confirm(`Delete display "${device.label || device.id}"?`)) return;
    await runAction('Deleting display', async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      await loadState({ keepStatus: true });
    });
  });

  const goLiveType = document.querySelector('#goLiveType');
  const playlistWrap = document.querySelector('#goLivePlaylistWrap');
  const libraryWrap = document.querySelector('#goLiveLibraryWrap');
  const syncLiveType = () => {
    const isLibrary = goLiveType?.value === 'library';
    playlistWrap.style.display = isLibrary ? 'none' : '';
    libraryWrap.style.display = isLibrary ? '' : 'none';
  };
  goLiveType?.addEventListener('change', syncLiveType);
  syncLiveType();

  document.querySelector('#goLiveForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = document.querySelector('#goLiveType').value;
    await runAction('Publishing live content', async () => {
      if (type === 'library') {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override-library`, {
          method: 'POST',
          body: { libraryItemId: document.querySelector('#goLiveLibraryId').value }
        });
      } else {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/live`, {
          method: 'POST',
          body: { playlistId: document.querySelector('#goLivePlaylistId').value }
        });
      }
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#refreshLive')?.addEventListener('click', async () => {
    await runAction('Refreshing live output', async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}/refresh-live`, { method: 'POST', body: {} });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#clearOverride')?.addEventListener('click', async () => {
    await runAction('Clearing override', async () => {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override`, { method: 'DELETE' });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#createPlaylistForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.querySelector('#newPlaylistName').value.trim();
    if (!name) return showToast('Enter a playlist name.');
    await runAction('Creating playlist', async () => {
      await api('/api/admin/playlists', { method: 'POST', body: { name } });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#playlistAddFromLibraryForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runAction('Adding item to playlist', async () => {
      await api(`/api/admin/playlists/${encodeURIComponent(document.querySelector('#libraryTargetPlaylist').value)}/items/from-library`, {
        method: 'POST',
        body: { libraryItemId: document.querySelector('#libraryItemSelect').value }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#libraryUploadForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = document.querySelector('#libraryUploadFile').files[0];
    if (!file) return showToast('Choose a file first.');
    await runAction('Uploading to library', async () => {
      const form = new FormData();
      form.append('file', file);
      await fetch('/api/admin/library', { method: 'POST', body: form });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#libraryYoutubeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runAction('Adding YouTube link', async () => {
      await api('/api/admin/library/youtube', {
        method: 'POST',
        body: { url: document.querySelector('#libraryYoutubeUrl').value, name: document.querySelector('#libraryYoutubeName').value }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelector('#libraryWebForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runAction('Adding web page', async () => {
      await api('/api/admin/library/web', {
        method: 'POST',
        body: { url: document.querySelector('#libraryWebUrl').value, name: document.querySelector('#libraryWebName').value }
      });
      await loadState({ keepStatus: true });
    });
  });

  document.querySelectorAll('[data-make-live]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runAction('Publishing playlist', async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/live`, { method: 'POST', body: { playlistId: button.dataset.makeLive } });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-delete-playlist]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this playlist?')) return;
      await runAction('Deleting playlist', async () => {
        await api(`/api/admin/playlists/${encodeURIComponent(button.dataset.deletePlaylist)}`, { method: 'DELETE' });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-library-live]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runAction('Pushing library item live', async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override-library`, { method: 'POST', body: { libraryItemId: button.dataset.libraryLive } });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-library-announce]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runAction('Announcing library item', async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override-library`, { method: 'POST', body: { libraryItemId: button.dataset.libraryAnnounce } });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-library-announce-temp]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runAction('Running 30-second announcement', async () => {
        await api(`/api/admin/devices/${encodeURIComponent(device.id)}/override-library-temporary`, { method: 'POST', body: { libraryItemId: button.dataset.libraryAnnounceTemp, durationSeconds: 30 } });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-library-add]').forEach((button) => {
    button.addEventListener('click', async () => {
      const playlistId = document.querySelector(`[data-library-target="${button.dataset.libraryAdd}"]`)?.value;
      if (!playlistId) return showToast('Create a playlist first.');
      await runAction('Adding item to playlist', async () => {
        await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items/from-library`, { method: 'POST', body: { libraryItemId: button.dataset.libraryAdd } });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-library-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this library item?')) return;
      await runAction('Deleting library item', async () => {
        await api(`/api/admin/library/${encodeURIComponent(button.dataset.libraryDelete)}`, { method: 'DELETE' });
        await loadState({ keepStatus: true });
      });
    });
  });

  document.querySelectorAll('[data-playlist-item-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const [playlistId, itemId] = button.dataset.playlistItemDelete.split('::');
      await runAction('Removing playlist item', async () => {
        await api(`/api/admin/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
        await loadState({ keepStatus: true });
      });
    });
  });
}

function renderHero(item) {
  if (!item) return '<div class="hero-label"><span class="meta">No live content</span></div>';
  if (item.isWeb || item.type === 'web' || item.type === 'wyze') return `<iframe class="hero-frame" src="${escapeAttr(item.webUrl || '')}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  if (item.isYouTube || item.type === 'youtube') return `<div class="hero-label"><strong>${escapeHtml(item.name || 'YouTube')}</strong><p class="meta">YouTube source</p></div>`;
  if (item.isVideo || item.type === 'video') return `<video src="${escapeAttr(item.path)}" muted playsinline preload="metadata"></video>`;
  return `<img src="${escapeAttr(item.path)}" alt="${escapeAttr(item.name || 'Live item')}">`;
}

function renderPreview(item) {
  if (item.type === 'youtube') return '<div class="hero-label"><strong>YT</strong></div>';
  if (item.type === 'web' || item.type === 'wyze') return `<iframe src="${escapeAttr(item.webUrl || '')}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  if (item.type === 'video') return `<video src="${escapeAttr(item.path)}" muted playsinline preload="metadata"></video>`;
  return `<img src="${escapeAttr(item.path)}" alt="${escapeAttr(item.name || 'Library item')}">`;
}

function renderThumb(item) {
  const label = item.isWeb || item.type === 'web' || item.type === 'wyze' ? 'WEB' : item.isYouTube || item.type === 'youtube' ? 'YT' : item.isVideo || item.type === 'video' ? 'VIDEO' : 'IMAGE';
  return `<div class="thumb">${renderPreview(item)}<span class="thumb-tag">${label}</span></div>`;
}

function selectedDevice() {
  return state.devices.find((device) => device.id === selectedDeviceId) || null;
}

function effectiveLiveItems(device) {
  if (device.liveOverride) return [device.liveOverride];
  if (device.activePlaylistId) return state.playlists.find((playlist) => playlist.id === device.activePlaylistId)?.items || [];
  return [];
}

function livePreviewLabel(device) {
  if (device.liveOverride) return 'Single-item override is live';
  if (device.activePlaylistId) return `${state.playlists.find((playlist) => playlist.id === device.activePlaylistId)?.name || 'Playlist'} is live`;
  return 'No live content';
}

function liveLabel(device) {
  if (device.liveOverride) return `Single item: ${device.liveOverride.name || 'Override'}`;
  if (device.activePlaylistId) return `Playlist: ${state.playlists.find((playlist) => playlist.id === device.activePlaylistId)?.name || 'Unknown'}`;
  return 'Nothing live';
}

function itemLabel(item) {
  if (item.isWeb || item.type === 'web' || item.type === 'wyze') return 'WEB';
  if (item.isYouTube || item.type === 'youtube') return 'YOUTUBE';
  if (item.isVideo || item.type === 'video') return 'VIDEO';
  return 'IMAGE';
}

function displayStatus(lastSeenAt) {
  const diff = Date.now() - Number(new Date(lastSeenAt || 0));
  if (!lastSeenAt || Number.isNaN(diff)) return { label: 'Offline', className: 'status-offline' };
  if (diff < 90_000) return { label: 'Online', className: 'status-online' };
  if (diff < 15 * 60_000) return { label: 'Recently seen', className: 'status-recent' };
  return { label: 'Offline', className: 'status-offline' };
}

function persistSelectedDevice() {
  localStorage.setItem('signage-v2:selectedDeviceId', selectedDeviceId || '');
}

async function api(url, options = {}) {
  const init = { method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function runAction(label, fn) {
  setStatus(label + '…');
  try {
    await fn();
    setStatus('Done');
  } catch (error) {
    showToast(error.message);
    setStatus('Error');
  }
}

function setStatus(text) {
  els.saveState.textContent = text;
}

function showToast(message) {
  window.alert(message);
}

function renderError(error) {
  els.displayWorkspace.innerHTML = `<section class="panel empty-workspace"><h2>Backend unavailable</h2><p>${escapeHtml(error.message || 'Unknown error')}</p></section>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttr(value = '') { return escapeHtml(value); }
