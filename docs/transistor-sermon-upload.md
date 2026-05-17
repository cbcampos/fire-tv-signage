# Transistor Sermon Upload Workflow

## What this does
Uploads a local sermon audio file to Transistor.fm and creates a **draft** episode.

Script:
- `scripts/transistor_sermon_upload.py`

## API flow
1. Call `GET /v1/episodes/authorize_upload?filename=...`
2. Upload the MP3 to the returned presigned `upload_url` with HTTP `PUT`
3. Create the episode draft with `POST /v1/episodes` using `episode[audio_url]`

This matches the Transistor API reference at `https://developers.transistor.fm/`.

## Secrets/config
Store credentials in:
- `~/.openclaw/.secrets/transistor.env`

Recommended contents:

```bash
TRANSISTOR_API_KEY=your_api_key_here
TRANSISTOR_SHOW_ID=your_show_id_here
TRANSISTOR_DEFAULT_AUTHOR=Trinity Church
TRANSISTOR_DEFAULT_SUMMARY=
TRANSISTOR_DEFAULT_DESCRIPTION=
```

Create it with:

```bash
mkdir -p ~/.openclaw/.secrets
cat > ~/.openclaw/.secrets/transistor.env <<'EOF'
TRANSISTOR_API_KEY=your_api_key_here
TRANSISTOR_SHOW_ID=your_show_id_here
TRANSISTOR_DEFAULT_AUTHOR=Trinity Church
TRANSISTOR_DEFAULT_SUMMARY=
TRANSISTOR_DEFAULT_DESCRIPTION=
EOF
chmod 600 ~/.openclaw/.secrets/transistor.env
```

## Safe default
This script creates **draft episodes only**. That is deliberate.

Publishing should remain a separate explicit action.

## Example usage

Dry run:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --title "The Sermon Title" \
  --dry-run
```

Real upload:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --title "The Sermon Title" \
  --summary "Sunday sermon at Trinity Church" \
  --author "Trinity Church"
```

With transcript:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --title "The Sermon Title" \
  --transcript-file outputs/sermons/R_20260517-100404.fulltranscript.txt
```

## Recommended future metadata
Useful fields to standardize later:
- title format
- speaker name
- sermon date
- scripture passage
- summary template
- description template
- transcript attachment

## Notes
- Transistor rate limit: 10 requests per 10 seconds
- The audio upload URL is temporary and expires quickly
- The script uses Python standard library only
