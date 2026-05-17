#!/usr/bin/env python3
import argparse
import json
import mimetypes
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

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


def resolve_show_id(api_key: str, configured_show_id: str | None):
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
    parser.add_argument("--season", type=int)
    parser.add_argument("--number", type=int)
    parser.add_argument("--episode-type", default="full", choices=["full", "trailer", "bonus"])
    parser.add_argument("--transcript-file")
    parser.add_argument("--episode-id", help="Existing Transistor episode id to update/publish")
    parser.add_argument("--publish", action="store_true", help="Publish the episode after creation or publish an existing draft")
    parser.add_argument("--use-bulletin", action="store_true", default=True)
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

    bulletin = {}
    if args.use_bulletin:
        bulletin = load_bulletin_metadata(Path(args.bulletin_script).expanduser())

    title = args.title or bulletin.get("title") or audio_path.stem
    summary = args.summary if args.summary is not None else os.environ.get("TRANSISTOR_DEFAULT_SUMMARY", "")
    description = args.description if args.description is not None else os.environ.get("TRANSISTOR_DEFAULT_DESCRIPTION", "")
    if not description and bulletin.get("scripture"):
        description = f"Scripture Passage: {bulletin['scripture']}"
    author = args.author if args.author is not None else bulletin.get("speaker") or os.environ.get("TRANSISTOR_DEFAULT_AUTHOR", "")

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
        episode = api_request("PATCH", f"/episodes/{episode_id}", api_key, form=form)
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
