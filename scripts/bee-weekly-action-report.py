#!/usr/bin/env python3
"""Build/render weekly Bee actionable reports.

This script does not call AI models. It prepares source digest material and
renders an agent-written actionable-report.md to DOCX/PDF. The OpenClaw cron
agentTurn does the reasoning/synthesis from the source files.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Iterable

from docx import Document
from docx.shared import Pt

ROOT = Path(__file__).resolve().parents[1]


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def first_text(obj: dict, keys: Iterable[str]) -> str:
    for key in keys:
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def strip_md(text: str) -> str:
    text = re.sub(r"[`*_#]", "", text)
    return text.strip()


def digest(args: argparse.Namespace) -> None:
    report_root = Path(args.report_root).resolve()
    source_dir = Path(args.source_dir).resolve()
    report_root.mkdir(parents=True, exist_ok=True)

    window = read_json(report_root / "window.json", {})
    counts = read_json(source_dir / "export-counts.json", {})
    conversations = read_json(source_dir / "conversations-week.json", [])
    facts = read_json(source_dir / "facts-week.json", [])
    todos = read_json(source_dir / "todos-week.json", [])
    journals = read_json(source_dir / "journals-week.json", [])
    daily = read_json(source_dir / "daily-week.json", [])

    lines: list[str] = []
    lines.append(f"# Bee Weekly Source Digest — {window.get('report_date', report_root.name)}")
    lines.append("")
    lines.append(f"Window: {window.get('since_local', '?')} → {window.get('until_local', '?')} {window.get('timezone', 'America/Chicago')}")
    lines.append(f"Counts: {counts}")
    lines.append("")
    lines.append("## Instructions for report synthesis")
    lines.append("Generate ONLY actionable report pages. Do not include a conversation-summary appendix. Do not quote long transcripts. Use transcripts/source files only as evidence.")
    lines.append("")

    lines.append("## Daily summaries")
    for item in daily[:14]:
        date = item.get("date") or item.get("date_time") or item.get("created_at") or item.get("id")
        body = first_text(item, ["summary", "text", "content", "short_summary"])
        lines.append(f"- {date}: {body[:1000]}")
    lines.append("")

    lines.append("## Conversation signals")
    for item in conversations:
        cid = item.get("id")
        short = first_text(item, ["short_summary", "summary"])
        state = item.get("state", "")
        count = item.get("utterances_count", "")
        lines.append(f"- {cid} ({state}, utterances={count}): {short[:900]}")
    lines.append("")

    lines.append("## Facts created/updated in window")
    for item in facts[:250]:
        fid = item.get("id")
        body = first_text(item, ["text", "content", "summary", "title"])
        lines.append(f"- [{fid}] {body[:700]}")
    lines.append("")

    lines.append("## Todos created/alarmed in window")
    for item in todos[:250]:
        tid = item.get("id")
        body = first_text(item, ["text", "content", "title", "summary"])
        status = item.get("status") or item.get("state") or ("completed" if item.get("completed") else "")
        alarm = item.get("alarm_at") or item.get("due_at") or ""
        lines.append(f"- [{tid}] {status} {alarm}: {body[:700]}")
    lines.append("")

    lines.append("## Journals")
    for item in journals[:80]:
        jid = item.get("id")
        body = first_text(item, ["text", "content", "summary", "title"])
        lines.append(f"- [{jid}] {body[:1200]}")
    lines.append("")

    # Include short transcript snippets if markdown files exist. Keep digest bounded.
    transcript_dir = source_dir / "transcripts"
    lines.append("## Transcript files available")
    md_files = sorted(transcript_dir.glob("*.md"))
    lines.append(f"{len(md_files)} transcript markdown files are available under `{transcript_dir}` for evidence checks.")
    for path in md_files[:80]:
        text = path.read_text(errors="replace")
        snippet = " ".join(text.split())[:800]
        lines.append(f"- {path.name}: {snippet}")

    out = report_root / "source-digest.md"
    out.write_text("\n".join(lines) + "\n")

    template = report_root / "actionable-report.md"
    if not template.exists():
        template.write_text(default_report_template(window, counts))

    print(out)
    print(template)


def default_report_template(window: dict, counts: dict) -> str:
    return f"""# Weekly Bee Action Report — {window.get('report_date', '')}

Window: {window.get('since_local', '?')} → {window.get('until_local', '?')} {window.get('timezone', 'America/Chicago')}
Source counts: {counts}

## Executive Summary

## Top Pain Points

## Top 3 Actions This Week

## Family / Home / Relationship Action Plan

## Work / Church / Project Action Plan

## Action Packets, Scripts, and Checklists

## Chris Must Decide or Do

## Assistant Can Do Next Without External Side Effects

## Approval Needed

## Blockers / Caveats

"""


def add_markdown_to_doc(doc: Document, markdown: str) -> None:
    in_code = False
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if not line:
            doc.add_paragraph("")
            continue
        if in_code:
            p = doc.add_paragraph(line)
            for run in p.runs:
                run.font.name = "Courier New"
            continue
        if line.startswith("# "):
            doc.add_heading(strip_md(line[2:]), 1)
        elif line.startswith("## "):
            doc.add_heading(strip_md(line[3:]), 2)
        elif line.startswith("### "):
            doc.add_heading(strip_md(line[4:]), 3)
        elif line.startswith("#### "):
            doc.add_heading(strip_md(line[5:]), 4)
        elif re.match(r"^\s*[-*] ", line):
            doc.add_paragraph(strip_md(re.sub(r"^\s*[-*] ", "", line)), style="List Bullet")
        elif re.match(r"^\s*\d+\. ", line):
            doc.add_paragraph(strip_md(re.sub(r"^\s*\d+\. ", "", line)), style="List Number")
        elif line.startswith("> "):
            doc.add_paragraph(strip_md(line[2:]))
        else:
            doc.add_paragraph(strip_md(line))


def render(args: argparse.Namespace) -> None:
    report_root = Path(args.report_root).resolve()
    report_date = report_root.name
    md_path = report_root / "actionable-report.md"
    if not md_path.exists():
        raise SystemExit(f"Missing {md_path}")
    out_dir = ROOT / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    docx_path = Path(args.docx) if args.docx else out_dir / f"bee-weekly-action-report-{report_date}.docx"
    pdf_path = Path(args.pdf) if args.pdf else out_dir / f"bee-weekly-action-report-{report_date}.pdf"

    doc = Document()
    doc.styles["Normal"].font.name = "Arial"
    doc.styles["Normal"].font.size = Pt(10)
    add_markdown_to_doc(doc, md_path.read_text(errors="replace"))
    doc.save(docx_path)

    # Convert through LibreOffice because Telegram accepts PDFs reliably.
    tmp_out = pdf_path.parent
    tmp_out.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "libreoffice", "--headless", "--convert-to", "pdf", "--outdir", str(tmp_out), str(docx_path)
    ], check=True)
    generated = tmp_out / (docx_path.stem + ".pdf")
    if generated != pdf_path:
        generated.replace(pdf_path)

    print(docx_path)
    print(pdf_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("digest", help="Build source-digest.md and report template")
    p.add_argument("--report-root", required=True)
    p.add_argument("--source-dir", required=True)
    p.set_defaults(func=digest)

    p = sub.add_parser("render", help="Render actionable-report.md to DOCX/PDF")
    p.add_argument("--report-root", required=True)
    p.add_argument("--docx")
    p.add_argument("--pdf")
    p.set_defaults(func=render)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
