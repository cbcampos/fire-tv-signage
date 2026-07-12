#!/usr/bin/python3
import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

API_BASE = "https://api.transistor.fm/v1"
DEFAULT_ENV = Path.home() / ".openclaw" / ".secrets" / "transistor.env"
DEFAULT_BULLETIN_SCRIPT = Path.home() / ".openclaw" / "workspace" / "scripts" / "transistor_bulletin_metadata.py"


def load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_request(method: str, path: str, api_key: str, params=None, form=None):
    url = API_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {
        "x-api-key": api_key,
        "Accept": "application/json",
    }
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def upload_file(upload_url: str, content_type: str, audio_path: Path):
    with audio_path.open("rb") as handle:
        data = handle.read()
    req = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={"Content-Type": content_type},
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def get_shows(api_key: str):
    return api_request("GET", "/shows", api_key).get("data", [])


def load_bulletin_metadata(script_path: Path):
    if not script_path.exists():
        return {}
    result = subprocess.run(
        ["python3", str(script_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def has_manual_metadata(args):
    return bool(
        args.title
        or args.author
        or args.speaker
        or args.scripture
        or args.description
        or args.summary
        or args.service_date
    )


def resolve_show_id(api_key: str, configured_show_id: Optional[str]):
    if configured_show_id:
        return configured_show_id
    shows = get_shows(api_key)
    if len(shows) == 1:
        return shows[0]["id"]
    if not shows:
        print("No Transistor shows available for this API key", file=sys.stderr)
        raise SystemExit(2)
    print("Multiple Transistor shows found; set TRANSISTOR_SHOW_ID explicitly.", file=sys.stderr)
    for show in shows:
        print(f"- {show['id']}: {show.get('attributes', {}).get('title', '(untitled)')}", file=sys.stderr)
    raise SystemExit(2)


def main():
    parser = argparse.ArgumentParser(
        description="Upload a sermon MP3 to Transistor and create a draft episode"
    )
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV))
    parser.add_argument("--show-id")
    parser.add_argument("--title")
    parser.add_argument("--summary")
    parser.add_argument("--description")
    parser.add_argument("--author")
    parser.add_argument("--speaker", help="Alias for --author, matching sermon bulletin language")
    parser.add_argument("--scripture", help="Scripture reference to use in the episode description")
    parser.add_argument("--service-date", help="Service date for dry-run/reporting metadata")
    parser.add_argument("--season", type=int)
    parser.add_argument("--number", type=int)
    parser.add_argument("--episode-type", default="full", choices=["full", "trailer", "bonus"])
    parser.add_argument("--transcript-file")
    parser.add_argument("--episode-id", help="Existing Transistor episode id to update/publish")
    parser.add_argument(
        "--replace-audio",
        action="store_true",
        help="Replace the audio file on an existing episode (requires --episode-id). "
             "Re-uploads the audio to S3 and PATCHes the episode with the new audio_url. "
             "Title/author/description/scripture metadata is preserved unless also passed.",
    )
    parser.add_argument("--publish", action="store_true", help="Publish the episode after creation or publish an existing draft")
    parser.add_argument("--use-bulletin", dest="use_bulletin", action="store_true", default=None)
    parser.add_argument("--no-bulletin", dest="use_bulletin", action="store_false")
    parser.add_argument("--bulletin-script", default=str(DEFAULT_BULLETIN_SCRIPT))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env_file(Path(args.env_file).expanduser())
    api_key = os.environ.get("TRANSISTOR_API_KEY")
    configured_show_id = args.show_id or os.environ.get("TRANSISTOR_SHOW_ID")

    if not api_key:
        print("Missing TRANSISTOR_API_KEY", file=sys.stderr)
        return 2

    show_id = resolve_show_id(api_key, configured_show_id)

    audio_path = Path(args.audio).expanduser()
    if not args.episode_id and not audio_path.exists():
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        return 2

    use_bulletin = args.use_bulletin
    if use_bulletin is None:
        use_bulletin = not has_manual_metadata(args)

    bulletin = {}
    if use_bulletin:
        bulletin = load_bulletin_metadata(Path(args.bulletin_script).expanduser())

    title = args.title or bulletin.get("title") or audio_path.stem
    summary = args.summary if args.summary is not None else os.environ.get("TRANSISTOR_DEFAULT_SUMMARY", "")
    description = args.description if args.description is not None else os.environ.get("TRANSISTOR_DEFAULT_DESCRIPTION", "")
    scripture = args.scripture or bulletin.get("scripture")
    scripture_header = f"Scripture Passage: {scripture}" if scripture else None
    if scripture_header:
        if description:
            # Workflow requires 'Scripture Passage: ___' at the top of the description.
            # Older Trinity episodes wrap in <p>...</p> so podcast players render
            # paragraph breaks. Plain-text \n\n collapses to a single line in
            # Apple Podcasts and most players.
            #
            # Normalize: convert </p><p> (or </p>\n<p>) into a paragraph
            # separator, strip remaining <p>/</p> wrappers, then strip any
            # leading 'Scripture Passage:'/'Scripture Reading:' header line
            # (idempotent re-prepend). Re-wrap in <p>...</p>.
            normalized = re.sub(r"</p>\s*<p>", "\n\n", description, flags=re.IGNORECASE)
            normalized = re.sub(r"</?p>", "", normalized, flags=re.IGNORECASE).strip()
            normalized = re.sub(
                r"^\s*(scripture\s+(passage|reading):\s+[^\n]+?)\s*(?:\n+|$)",
                "",
                normalized,
                flags=re.IGNORECASE,
            ).strip()
            if normalized:
                description = f"<p>{scripture_header}</p><p>{normalized}</p>"
            else:
                description = f"<p>{scripture_header}</p>"
        else:
            description = f"<p>{scripture_header}</p>"
    author = (
        args.author
        if args.author is not None
        else args.speaker
        if args.speaker is not None
        else bulletin.get("speaker")
        or os.environ.get("TRANSISTOR_DEFAULT_AUTHOR", "")
    )

    transcript_text = None
    if args.transcript_file:
        transcript_text = Path(args.transcript_file).expanduser().read_text()

    mime_type = mimetypes.guess_type(str(audio_path))[0] or "audio/mpeg"

    if args.dry_run:
        print(json.dumps({
            "audio": str(audio_path),
            "episode_id": args.episode_id,
            "publish": args.publish,
            "show_id": show_id,
            "title": title,
            "summary": summary,
            "description": description,
            "author": author,
            "season": args.season,
            "number": args.number,
            "episode_type": args.episode_type,
            "transcript_attached": bool(transcript_text),
            "mime_type": mime_type,
            "scripture": scripture,
            "service_date": args.service_date or bulletin.get("service_date"),
            "use_bulletin": use_bulletin,
            "bulletin": bulletin,
        }, indent=2))
        return 0

    form = {
        "episode[title]": title,
        "episode[type]": args.episode_type,
    }
    if summary:
        form["episode[summary]"] = summary
    if description:
        form["episode[description]"] = description
    if author:
        form["episode[author]"] = author
    if args.season is not None:
        form["episode[season]"] = str(args.season)
    if args.number is not None:
        form["episode[number]"] = str(args.number)
    if transcript_text:
        form["episode[transcript_text]"] = transcript_text

    if args.episode_id:
        episode_id = args.episode_id

        # --replace-audio: upload a new audio file to S3, then PATCH the episode
        # with the new audio_url. Replaces audio on the existing episode in place
        # — the share URL and published status survive. Metadata (title, author,
        # description, scripture) is NOT touched unless corresponding CLI flags
        # are also passed in this run.
        if args.replace_audio:
            if not audio_path.exists():
                print(f"--replace-audio given but audio file not found: {audio_path}", file=sys.stderr)
                return 2
            new_auth = api_request(
                "GET",
                "/episodes/authorize_upload",
                api_key,
                params={"filename": audio_path.name},
            )
            new_attrs = new_auth["data"]["attributes"]
            new_upload_url = new_attrs["upload_url"]
            new_audio_url = new_attrs["audio_url"]
            new_content_type = new_attrs.get("content_type") or mime_type

            print(f"Uploading {audio_path} ({audio_path.stat().st_size} bytes) to S3...", file=sys.stderr)
            status = upload_file(new_upload_url, new_content_type, audio_path)
            if status not in (200, 201):
                print(f"Audio upload failed with status {status}", file=sys.stderr)
                return 1
            print(f"Upload OK. New audio_url: {new_audio_url}", file=sys.stderr)

            # PATCH the audio_url. Other metadata fields are only PATCHed if
            # explicitly passed — see the safety note below.
            patch_form = {"episode[audio_url]": new_audio_url}
        else:
            patch_form = {}

        # SAFETY: in --episode-id (update) mode, only PATCH the fields the user
        # explicitly passed via CLI flags. Do NOT auto-fall-back to the bulletin
        # here. Otherwise a call like `--episode-id 12345 --publish` (just to
        # flip a draft to published) would silently PATCH the episode with
        # bulletin-derived title/author/description and blow away any metadata
        # set on a previous run. If the user wants to update metadata, they
        # pass the corresponding flag (e.g. --author "Brandon Nelson").
        if not args.replace_audio:
            if args.title is not None:
                patch_form["episode[title]"] = args.title
            if args.summary is not None:
                patch_form["episode[summary]"] = args.summary
            if args.description is not None:
                patch_form["episode[description]"] = args.description
            if args.author is not None or args.speaker is not None:
                patch_form["episode[author]"] = args.author if args.author is not None else args.speaker
            if args.season is not None:
                patch_form["episode[season]"] = str(args.season)
            if args.number is not None:
                patch_form["episode[number]"] = str(args.number)
            if transcript_text:
                patch_form["episode[transcript_text]"] = transcript_text

        if not patch_form and not args.publish:
            print(
                f"--episode-id {episode_id} given without --publish, --replace-audio, or metadata flags; "
                f"nothing to do. Pass --author/--title/--description/etc. to update fields.",
                file=sys.stderr,
            )
            episode = api_request("GET", f"/episodes/{episode_id}", api_key)
        else:
            episode = api_request("PATCH", f"/episodes/{episode_id}", api_key, form=patch_form)

        if args.publish:
            episode = api_request(
                "PATCH",
                f"/episodes/{episode_id}/publish",
                api_key,
                form={"episode[status]": "published"},
            )
    else:
        auth = api_request("GET", "/episodes/authorize_upload", api_key, params={"filename": audio_path.name})
        attrs = auth["data"]["attributes"]
        upload_url = attrs["upload_url"]
        audio_url = attrs["audio_url"]
        content_type = attrs.get("content_type") or mime_type

        status = upload_file(upload_url, content_type, audio_path)
        if status not in (200, 201):
            print(f"Upload failed with status {status}", file=sys.stderr)
            return 1

        create_form = dict(form)
        create_form["episode[show_id]"] = show_id
        create_form["episode[audio_url]"] = audio_url
        episode = api_request("POST", "/episodes", api_key, form=create_form)
        episode_id = episode["data"]["id"]
        if args.publish:
            episode = api_request(
                "PATCH",
                f"/episodes/{episode_id}/publish",
                api_key,
                form={"episode[status]": "published"},
            )

    print(json.dumps({
        "episode_id": episode["data"]["id"],
        "status": episode["data"]["attributes"].get("status"),
        "title": episode["data"]["attributes"].get("title"),
        "share_url": episode["data"]["attributes"].get("share_url"),
        "audio_processing": episode["data"]["attributes"].get("audio_processing"),
        "published_at": episode["data"]["attributes"].get("published_at"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
