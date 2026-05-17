#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

DEFAULT_FOLDER_ID = "1XkOCXpiKurlBjDlaMnWymIgfrhtRQ5m1"


def run(cmd):
    return subprocess.run(cmd, check=True, text=True, capture_output=True)


def list_folder_files(folder_id: str):
    cmd = [
        "gws", "drive", "files", "list",
        "--params",
        json.dumps({
            "q": f"\"{folder_id}\" in parents and trashed=false",
            "fields": "files(id,name,mimeType,createdTime,modifiedTime)",
            "orderBy": "modifiedTime desc",
        }),
        "--format", "json",
    ]
    data = json.loads(run(cmd).stdout)
    return data.get("files", [])


def download_file(file_id: str, out_path: Path):
    cmd = [
        "gws", "drive", "files", "get",
        "--params",
        json.dumps({"fileId": file_id, "alt": "media"}),
        "--output", str(out_path),
    ]
    run(cmd)


def extract_text(pdf_path: Path):
    cmd = ["pdftotext", str(pdf_path), "-"]
    return run(cmd).stdout


def parse_bulletin(text: str, fallback_name: str = ""):
    lines = [line.strip() for line in text.splitlines()]
    joined = "\n".join(lines)

    date_match = re.search(r"\b([A-Z][a-z]+ \d{1,2}, \d{4})\b", joined)
    service_date = date_match.group(1) if date_match else None

    title = None
    passage = None
    speaker = None

    for i, line in enumerate(lines):
        if line.upper() == "THE WORD OF THE LORD PREACHED":
            window = [l for l in lines[i+1:i+6] if l]
            if window:
                title_line = window[0]
                title = title_line.strip('"“”')
            for candidate in window[1:]:
                if re.search(r"\b[A-Za-z]+ \d+:\d+", candidate):
                    if "•" in candidate:
                        left, right = candidate.split("•", 1)
                        passage = left.strip()
                        speaker = right.strip()
                    else:
                        passage = candidate.strip()
                    break
            if passage and not speaker:
                passage_line_index = None
                for idx, candidate in enumerate(window[1:], start=1):
                    if candidate == passage or candidate.startswith(passage):
                        passage_line_index = idx
                        break
                if passage_line_index is not None and passage_line_index + 1 < len(window):
                    next_line = window[passage_line_index + 1].strip()
                    if next_line and not re.search(r"\d+:\d+", next_line):
                        speaker = next_line
            if not speaker:
                for candidate in window:
                    if "•" in candidate:
                        speaker = candidate.split("•", 1)[1].strip()
                        break
            break

    return {
        "service_date": service_date,
        "title": title,
        "scripture": passage,
        "speaker": speaker,
        "source_name": fallback_name,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch latest Trinity bulletin metadata from Google Drive")
    parser.add_argument("--folder-id", default=os.environ.get("TRINITY_BULLETIN_FOLDER_ID", DEFAULT_FOLDER_ID))
    parser.add_argument("--file-id")
    parser.add_argument("--latest", action="store_true", help="Use latest PDF in folder (default behavior)")
    parser.add_argument("--workdir", default="/home/ccampos/.openclaw/workspace/tmp")
    args = parser.parse_args()

    chosen = None
    if args.file_id:
        chosen = {"id": args.file_id, "name": args.file_id}
    else:
        files = list_folder_files(args.folder_id)
        pdfs = [f for f in files if f.get("mimeType") == "application/pdf"]
        if not pdfs:
            raise SystemExit("No PDF bulletins found in folder")
        chosen = pdfs[0]

    workdir = Path(args.workdir).expanduser()
    workdir.mkdir(parents=True, exist_ok=True)
    pdf_path = workdir / "latest-trinity-bulletin.pdf"
    download_file(chosen["id"], pdf_path)
    text = extract_text(pdf_path)

    meta = parse_bulletin(text, fallback_name=chosen.get("name", ""))
    meta["file_id"] = chosen["id"]
    meta["file_name"] = chosen.get("name")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
