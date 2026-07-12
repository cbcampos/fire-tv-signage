# Transistor Sermon Upload Workflow

## What this does
Uploads a local sermon audio file to Transistor.fm, creates a **draft** episode, and can now **publish** an approved draft.

For the weekly church workflow, the intended source audio is now the standardized sermon delivery MP3 rendered from the confirmed sermon-only WAV master.

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

If manual metadata is provided with `--title`, `--speaker`, `--author`, `--scripture`, `--description`, `--summary`, or `--service-date`, the uploader skips bulletin lookup by default. Use `--use-bulletin` to force bulletin lookup anyway.

Manual metadata mapping:
- `--title` -> Transistor episode title
- `--speaker` or `--author` -> Transistor author
- `--scripture` -> Prepends `<p>Scripture Passage: <passage></p>` to the description. Older Trinity episodes follow this format with `<p>` HTML wrapping so podcast players (Apple Podcasts, Spotify, Overcast) render the header on its own line. If BOTH `--scripture` and `--description` are passed, the result is `<p>Scripture Passage: <passage></p><p>...</p>`. Re-running with the same args is idempotent — the existing header (with or without `<p>` wrap) is detected and replaced cleanly (no double-header). Plain-text `\n\n` collapses to a single line in most players; HTML `<p>` is what renders breaks.
- `--service-date` -> dry-run/reporting metadata only

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
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3
```

Real draft upload with Chris-provided details:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3 \
  --title "From Glory To Glory" \
  --speaker "Brandon Nelson" \
  --scripture "Exodus 34:29-35; 2 Corinthians 3:7-18" \
  --service-date "2026-05-31"
```

With transcript:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3 \
  --transcript-file outputs/sermons/R_20260517-100404.fulltranscript.txt
```

Publish an existing approved draft:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3 \
  --episode-id 3265346 \
  --publish
```

Replace the audio file on an existing episode (re-cut, re-loudness, etc.):

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260607-094531.sermon.v2.mp3 \
  --episode-id 3313586 \
  --replace-audio
```

The share URL and published status survive; only the audio changes. Title/author/description/scripture metadata is preserved unless corresponding flags are also passed.

## Real-world verified draft shape
From the first live run, the correct draft pattern is:

- title: sermon title only
- author: speaker from worship guide
- description: `Scripture Passage: <references>`
- audio: standardized final sermon-only MP3 rendered from the confirmed WAV master

Example:
- title: `From Glory To Glory`
- author: `Brandon Nelson`
- description: `Scripture Passage: Exodus 34:29-35; 2 Corinthians 3:7-18`

## Cut rules (read FIRST before generating audio)

See `docs/sermon-audio.md` → "Cut rules — what to include / exclude" for the full ruleset. Short version:

- **Include:** Opening Scripture (if present) + sermon proper + closing pastoral prayer.
- **Exclude:** Communion rite (invitation, exhortation, consecration prayer, words of institution, distribution), opening/communion/closing hymns, announcements, benedictions.
- **Cut end:** at the breath BEFORE "we're going to come now to the Lord's table".
- **Cut start:** at the first word of Opening Scripture or sermon start (whichever comes first after the kids' dismissal).

The auto-pick from `sermon_audio_extract.py` is rarely correct on the first try for Trinity. Always review the transcript of the post-cut region and re-cut if the auto-pick ends mid-sentence.

## Recommended weekly publishing baseline
For consistency across weeks:
- keep the sermon-only WAV as the master
- render the delivery MP3 from that WAV every time
- prefer a conservative spoken-word profile over aggressive boost
- use the standard delivery file as the default upload target
- only create hotter alternates as comparison files when a specific recording needs it

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
- Bulletin lookup depends on Google Workspace CLI access plus either `pdftotext` or macOS `swift`/`PDFKit`

## `--episode-id` safety: no silent metadata overwrite (2026-06-07)

**Bug history:** Calling `transistor_sermon_upload.py --episode-id <id> --publish` to flip a draft to published also rebuilt the metadata form from the bulletin lookup and PATCHed the episode. If the bulletin lookup was wrong (e.g. parser picked up a song title as the speaker), this silently overwrote any correct metadata that had been set on a previous run.

**Fix:** In `--episode-id` mode the script now ONLY PATCHes fields the user explicitly passes via CLI flags. The bulletin is still loaded (for dry-run context) but never written to the episode.

Behavior matrix after the fix:
- `--episode-id 12345 --publish` → flips status to published, no metadata change.
- `--episode-id 12345 --author "X"` → only updates author; title/description/summary untouched.
- `--episode-id 12345 --author "X" --publish` → updates author, then publishes.
- `--episode-id 12345` (no metadata, no `--publish`) → prints a warning and fetches the current state (no-op).

## Bulletin parser: known conventions (2026-06-07)

The Trinity bulletin uses three conventions for the line after `THE WORD OF THE LORD PREACHED`:

1. **Same-line dash** (newest style): `Numbers 13:17-31; 14:19-25 - Brandon Nelson`
2. **Same-line bullet**: `Exodus 33:18-34:9 • Brandon Nelson`
3. **Bullet at end of line, speaker on next line**: `Exodus 34:29-35; 2 Corinthians 3:7-18 •\nBrandon Nelson`

The parser handles all three. Single-chapter references without a colon (e.g. `Exodus 32 - Caleb Cleveland`) are also handled.

**Anti-pattern (DON'T fall through to "next line is the speaker"):** In the printed order of service, the line after the scripture+pastor line is typically the FIRST post-sermon song title in ALL CAPS (e.g. `LIVING HOPE`, `GOODNESS OF GOD`). The original parser used to grab that as the speaker, which is how a Phil Wickham song title ended up in a Transistor `author` field. The fixed parser only takes a name from the next line if it actually looks like a person name (1-3 title-cased words, optional Roman numeral suffix, no digits/ampersands/parens).

## Test cases for the parser

```python
from transistor_bulletin_metadata import parse_bulletin
# 1. Dash, same line — Trinity's newest style
parse_bulletin('THE WORD OF THE LORD PREACHED\n"Numbers"\nJohn 3:16 - Brandon Nelson\nLIVING HOPE\nB. Johnson')
# → {scripture: 'John 3:16', speaker: 'Brandon Nelson'}
# 2. Bullet, same line
parse_bulletin('THE WORD OF THE LORD PREACHED\n"Title"\nExodus 33:18-34:9 • Brandon Nelson')
# → {scripture: 'Exodus 33:18-34:9', speaker: 'Brandon Nelson'}
# 3. Bullet at end of line, speaker on next line
parse_bulletin('THE WORD OF THE LORD PREACHED\n"Title"\nExodus 34:29-35 •\nBrandon Nelson')
# → {scripture: 'Exodus 34:29-35', speaker: 'Brandon Nelson'}
# 4. Bare scripture, no speaker — MUST NOT pick up post-sermon song
parse_bulletin('THE WORD OF THE LORD PREACHED\n"Title"\nJohn 3:16\nLIVING HOPE\nB. Johnson & P. Wickham')
# → {scripture: 'John 3:16', speaker: None}
```
- Publish support uses a separate API endpoint from ordinary draft edits

## Replacing audio on a published episode (2026-06-07)

**Lesson:** `transistor_sermon_upload.py --episode-id <id> --publish` does NOT re-upload the audio file. It only PATCHes the metadata (if any was passed) and flips the status. If you pass a new `audio` path with `--episode-id` and no metadata, the script silently treats it as a no-op and the old audio on the CDN stays live.

**The fix when you need to swap the audio file on an existing episode** (e.g. re-cut a published episode to remove a bad intro): use `--replace-audio`. The script then:

1. Calls `GET /v1/episodes/authorize_upload?filename=<name>` to get a fresh S3 presigned `upload_url` and the resulting `audio_url`.
2. `PUT`s the new audio file to the presigned URL (HTTP 200/201 = success).
3. `PATCH /v1/episodes/:id` with `episode[audio_url]=<new_url>`. Only the audio URL changes — title/author/description/scripture are preserved.

Important behaviors:
- The episode's `status` (published vs draft), share URL, and Transistor episode id are unchanged.
- The new audio goes through Transistor's normal processing pipeline (`audio_processing: true` briefly). Verify after ~30s.
- To verify the swap reached the CDN: download `https://media.transistor.fm/<show_hash>/<file_hash>.mp3` and check the file's duration with `ffprobe`. The audio_url field on the episode object will return `null` until processing completes — that's expected.
- Combine with `--publish` only if the episode is in draft state (e.g. recovering from a re-cut that was never published). Don't add `--publish` when re-cutting a published episode — it stays published automatically.

**Caveat for the next re-cut:** the same fix loop applies to any structural problem in the cut (wrong start, wrong end, hot audio, etc.) — re-cut the WAV with `ffmpeg -ss <in_sec> -t <duration> -i <orig> <new>.wav`, normalize, encode to MP3, then call `--replace-audio`. The published CDN URL changes, the share URL stays the same, listeners automatically pick up the new audio on their next fetch.
