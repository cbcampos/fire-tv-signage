# Transistor Sermon Upload Workflow

## What this does
Uploads a local sermon audio file to Transistor.fm, creates a **draft** episode, and can now **publish** an approved draft.

Scripts:
- `scripts/transistor_sermon_upload.py`
- `scripts/transistor_bulletin_metadata.py`

## API flow
1. Call `GET /v1/episodes/authorize_upload?filename=...`
2. Upload the MP3 to the returned presigned `upload_url` with HTTP `PUT`
3. Create the episode draft with `POST /v1/episodes` using `episode[audio_url]`
4. Update existing draft metadata with `PATCH /v1/episodes/:id`
5. Publish an approved draft with `PATCH /v1/episodes/:id/publish`

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

## Metadata defaults
By default, the uploader now calls `scripts/transistor_bulletin_metadata.py` and uses the latest bulletin in Google Drive to prefill episode fields.

Current mapping:
- bulletin `title` -> Transistor episode title
- bulletin `speaker` -> Transistor author
- bulletin `scripture` -> Transistor description as `Scripture Passage: <passage>`

This matches the church's current publishing pattern.

## Safe default
The script still creates **draft episodes by default**.

Publishing is a separate explicit action via `--publish`.

## Example usage

Dry run:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --title "The Sermon Title" \
  --dry-run
```

Real draft upload using bulletin defaults:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3
```

With transcript:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --transcript-file outputs/sermons/R_20260517-100404.fulltranscript.txt
```

Publish an existing approved draft:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3 \
  --episode-id 3265346 \
  --publish
```

## Real-world verified draft shape
From the first live run, the correct draft pattern is:

- title: sermon title only
- author: speaker from worship guide
- description: `Scripture Passage: <references>`
- audio: louder final sermon-only MP3

Example:
- title: `From Glory To Glory`
- author: `Brandon Nelson`
- description: `Scripture Passage: Exodus 34:29-35; 2 Corinthians 3:7-18`

## Recommended future metadata
Useful fields to standardize later:
- sermon date in summary or notes if desired
- transcript attachment
- series name if Trinity starts using one consistently
- episode artwork override if ever needed

## Notes
- Transistor rate limit: 10 requests per 10 seconds
- The audio upload URL is temporary and expires quickly
- The uploader uses Python standard library only
- Bulletin lookup depends on Google Workspace CLI access plus `pdftotext`
- Publish support uses a separate API endpoint from ordinary draft edits
