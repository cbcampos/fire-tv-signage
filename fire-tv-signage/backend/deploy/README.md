# Deploying the Backend on an Always-On LAN Machine

Use one of these paths on the machine that runs OpenClaw.

## Option A: Docker Compose

From the backend directory:

```sh
docker compose up -d --build
```

The admin UI will be available at:

```text
http://192.168.2.90:3002
```

Runtime state is stored in `backend/data` on the host and mounted into the container.

## Option B: systemd

Copy the project to `/opt/fire-tv-signage`, then run:

```sh
sudo useradd --system --home /var/lib/fire-tv-signage --shell /usr/sbin/nologin signage || true
sudo mkdir -p /var/lib/fire-tv-signage/uploads
sudo chown -R signage:signage /var/lib/fire-tv-signage
sudo cp /opt/fire-tv-signage/backend/signage-backend.service /etc/systemd/system/signage-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now signage-backend
```

Check it:

```sh
systemctl status signage-backend
curl http://127.0.0.1:3002/api/admin/state
```

## CLI

The backend includes a CLI for local administration on the OpenClaw machine.

From the `backend` directory:

```sh
npm run signage -- health
npm run signage -- pending
npm run signage -- devices
npm run signage -- pair ABC123 --name "Lobby Display"
npm run signage -- set DEVICE_ID --delay 15
npm run signage -- upload DEVICE_ID /path/to/image-1.jpg /path/to/image-2.png
npm run signage -- show DEVICE_ID
npm run signage -- remove-image DEVICE_ID IMAGE_ID
npm run signage -- clear DEVICE_ID
npm run signage -- playlists list
npm run signage -- playlists create "Morning Playlist"
npm run signage -- playlist-item-add PLAYLIST_ID /path/to/slide.png
npm run signage -- library add /path/to/asset.png --tag menu
npm run signage -- playlist-item-add-library PLAYLIST_ID LIBRARY_ITEM_ID
npm run signage -- live DEVICE_ID --playlist PLAYLIST_ID
npm run signage -- override DEVICE_ID /path/to/urgent.png
npm run signage -- override-clear DEVICE_ID
```

For full command coverage, run:

```sh
npm run signage -- help
```

If you deploy with Docker Compose, run the CLI inside the container:

```sh
docker compose exec signage-backend node cli.mjs devices
docker compose exec signage-backend node cli.mjs upload DEVICE_ID /data/uploads/local-file.png
docker compose exec signage-backend node cli.mjs playlists list
```

If the backend is not on `http://127.0.0.1:3002`, pass `--url` or set `SIGNAGE_URL`:

```sh
SIGNAGE_URL=http://192.168.2.90:3002 npm run signage -- devices
```

To install a short `signage` command:

```sh
sudo ln -sf /opt/fire-tv-signage/backend/cli.mjs /usr/local/bin/signage
signage devices
```

## OpenClaw Agent Skill

The repository includes an OpenClaw-optimized skill file at:

```text
SKILL.md
```

Use it as the operational guide for deploy, verification, and CLI/API workflows.

## APK Build URL

Once the backend is running, rebuild the APK with the OpenClaw machine's LAN IP:

```sh
cd receiver-android
./gradlew assembleDebug -PsignageServerUrl=http://192.168.2.90:3002
```
