#!/usr/bin/env python3
"""
Convert a markdown file to a Google Doc via the Docs API batchUpdate.

Handles:
- # / ## / ### → HEADING_1 / HEADING_2 / HEADING_3
- - bullets → bulleted list
- 1. 2. → numbered list
- **bold** → bold
- *italic* → italic
- [text](url) → hyperlinks
- `code` → monospace inline run
- markdown tables → proper Google Docs tables (header row bold)
- horizontal rule --- → blank line

Usage:
  python3 md_to_gdoc.py <markdown_file> <document_id> [--apply]
"""
import json
import re
import subprocess
import sys
import argparse


def parse_inline(text):
    """Parse inline markdown into a list of (text, style_dict) runs.

    Supports **bold**, *italic*, `code`, [text](url).
    Returns (plain_text, runs) where runs is a list of dicts with:
      - text: the visible text
      - start: index in plain_text
      - end: index in plain_text
      - bold: bool
      - italic: bool
      - code: bool
      - link: url or None
    """
    plain = []
    runs = []

    # Pattern that matches the inline tokens we care about, in order of precedence
    # Order: code (backticks), bold, italic, links
    token_re = re.compile(
        r"`([^`]+)`"           # 1: code
        r"|\*\*([^*]+)\*\*"    # 2: bold
        r"|\*([^*]+)\*"        # 3: italic
        r"|\[([^\]]+)\]\(([^)]+)\)"  # 4: link text, 5: link url
    )

    pos = 0
    for m in token_re.finditer(text):
        # Flush any plain text before this match
        if m.start() > pos:
            chunk = text[pos:m.start()]
            runs.append({
                "text": chunk,
                "start": len("".join(plain)),
                "end": len("".join(plain)) + len(chunk),
                "bold": False,
                "italic": False,
                "code": False,
                "link": None,
            })
            plain.append(chunk)

        if m.group(1) is not None:  # code
            chunk = m.group(1)
            runs.append({
                "text": chunk,
                "start": len("".join(plain)),
                "end": len("".join(plain)) + len(chunk),
                "bold": False,
                "italic": False,
                "code": True,
                "link": None,
            })
            plain.append(chunk)
        elif m.group(2) is not None:  # bold
            chunk = m.group(2)
            runs.append({
                "text": chunk,
                "start": len("".join(plain)),
                "end": len("".join(plain)) + len(chunk),
                "bold": True,
                "italic": False,
                "code": False,
                "link": None,
            })
            plain.append(chunk)
        elif m.group(3) is not None:  # italic
            chunk = m.group(3)
            runs.append({
                "text": chunk,
                "start": len("".join(plain)),
                "end": len("".join(plain)) + len(chunk),
                "bold": False,
                "italic": True,
                "code": False,
                "link": None,
            })
            plain.append(chunk)
        elif m.group(4) is not None:  # link
            chunk = m.group(4)
            url = m.group(5)
            runs.append({
                "text": chunk,
                "start": len("".join(plain)),
                "end": len("".join(plain)) + len(chunk),
                "bold": False,
                "italic": False,
                "code": False,
                "link": url,
            })
            plain.append(chunk)

        pos = m.end()

    # Trailing plain text
    if pos < len(text):
        chunk = text[pos:]
        runs.append({
            "text": chunk,
            "start": len("".join(plain)),
            "end": len("".join(plain)) + len(chunk),
            "bold": False,
            "italic": False,
            "code": False,
            "link": None,
        })
        plain.append(chunk)

    plain_text = "".join(plain)
    return plain_text, runs


def parse_table_row(line):
    """Parse a table row like '| col1 | col2 | col3 |' into ['col1', 'col2', 'col3']."""
    parts = [c.strip() for c in line.strip().strip("|").split("|")]
    return parts


def is_table_separator(line):
    """True if line is a markdown table separator like '| --- | --- |'."""
    return bool(re.match(r"^\|[\s\-:|]+\|$", line.strip()))


def parse_markdown(md_text):
    """Parse markdown into a list of blocks.

    Each block is a dict:
      {"type": "h1"|"h2"|"h3"|"p"|"bullet"|"numbered"|"table"|"hr"|"blank",
       "text": str,            # for non-table blocks
       "runs": [...],           # inline runs (for text blocks)
       "rows": [[str,...]],     # for tables; rows[0] is header
       "level": int,            # heading level (1,2,3)
      }
    """
    lines = md_text.split("\n")
    blocks = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Blank line
        if not stripped:
            blocks.append({"type": "blank"})
            i += 1
            continue

        # Horizontal rule
        if re.match(r"^---+$", stripped):
            blocks.append({"type": "hr"})
            i += 1
            continue

        # Heading
        m = re.match(r"^(#{1,6})\s+(.*)", stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            plain, runs = parse_inline(text)
            blocks.append({"type": f"h{level}", "text": plain, "runs": runs})
            i += 1
            continue

        # Table: header | separator | rows
        if stripped.startswith("|") and i + 1 < len(lines) and is_table_separator(lines[i + 1]):
            header = parse_table_row(line)
            i += 2  # skip header + separator
            rows = [header]
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(parse_table_row(lines[i]))
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue

        # Bullet
        m = re.match(r"^(\s*)[-*]\s+(.*)", line)
        if m:
            text = m.group(2).strip()
            plain, runs = parse_inline(text)
            blocks.append({"type": "bullet", "text": plain, "runs": runs})
            i += 1
            continue

        # Numbered list
        m = re.match(r"^(\s*)\d+\.\s+(.*)", line)
        if m:
            text = m.group(2).strip()
            plain, runs = parse_inline(text)
            blocks.append({"type": "numbered", "text": plain, "runs": runs})
            i += 1
            continue

        # Plain paragraph (collect until blank line)
        para_lines = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(
            r"^(#{1,6}\s|---|\s*[-*]\s|\s*\d+\.\s|\|)", lines[i].strip()
        ):
            para_lines.append(lines[i])
            i += 1
        text = " ".join(l.strip() for l in para_lines)
        plain, runs = parse_inline(text)
        blocks.append({"type": "p", "text": plain, "runs": runs})

    return blocks


def build_requests(blocks):
    """Build a list of batchUpdate requests from parsed blocks.

    Tracks the current end-of-content index. Headings and paragraphs each
    terminate with a newline (which creates a paragraph break in Google Docs).
    """
    requests = []
    # Track the current insertion index. Doc starts with one empty paragraph:
    # the paragraph element spans [1, 2) and contains just "\n" at index 1.
    # So the body text ends at index 2 (endIndex of the only segment).
    # When inserting, the Google Docs API requires the index to be STRICTLY
    # LESS THAN the end index of the segment. So we always insert at
    # (end_index - 1), which is the position of the trailing \n. Inserted
    # text goes BEFORE the \n, pushing it to a later index.
    cur_index = 1
    end_index = 2

    def next_index():
        # The position of the trailing \n. Inserting here pushes the \n out.
        return end_index - 1

    def advance(length_with_newline):
        nonlocal end_index
        end_index += length_with_newline

    NAMED_STYLES = {"h1": "HEADING_1", "h2": "HEADING_2", "h3": "HEADING_3"}

    for block in blocks:
        btype = block["type"]

        if btype == "blank":
            # Add a paragraph break by inserting \n at current end
            requests.append({
                "insertText": {
                    "location": {"index": next_index()},
                    "text": "\n",
                }
            })
            advance(1)
            continue

        if btype == "hr":
            # Insert a divider line as a paragraph
            text = "─" * 40
            requests.append({
                "insertText": {
                    "location": {"index": next_index()},
                    "text": text + "\n",
                }
            })
            # Style as center-aligned gray
            start = next_index()
            end = next_index() + len(text)
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": end + 1},
                    "paragraphStyle": {
                        "alignment": "CENTER",
                    },
                    "fields": "alignment",
                }
            })
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": {
                        "foregroundColor": {"color": {"rgbColor": {"red": 0.6, "green": 0.6, "blue": 0.6}}},
                    },
                    "fields": "foregroundColor",
                }
            })
            advance(len(text) + 1)
            continue

        if btype in NAMED_STYLES:
            text = block["text"]
            if not text:
                continue
            insert_at = next_index()
            requests.append({
                "insertText": {
                    "location": {"index": insert_at},
                    "text": text + "\n",
                }
            })
            # Apply heading style to the inserted text (not the trailing \n)
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": insert_at, "endIndex": insert_at + len(text)},
                    "paragraphStyle": {"namedStyleType": NAMED_STYLES[btype]},
                    "fields": "namedStyleType",
                }
            })
            apply_runs(requests, block["runs"], insert_at)
            advance(len(text) + 1)
            continue

        if btype in ("p", "bullet", "numbered"):
            text = block["text"]
            if not text:
                continue
            insert_at = next_index()
            requests.append({
                "insertText": {
                    "location": {"index": insert_at},
                    "text": text + "\n",
                }
            })
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": insert_at, "endIndex": insert_at + len(text)},
                    "paragraphStyle": {"namedStyleType": "NORMAL_TEXT"},
                    "fields": "namedStyleType",
                }
            })
            if btype == "bullet":
                requests.append({
                    "createParagraphBullets": {
                        "range": {"startIndex": insert_at, "endIndex": insert_at + len(text)},
                        "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
                    }
                })
            elif btype == "numbered":
                requests.append({
                    "createParagraphBullets": {
                        "range": {"startIndex": insert_at, "endIndex": insert_at + len(text)},
                        "bulletPreset": "NUMBERED_DECIMAL_ALPHA_ROMAN",
                    }
                })
            apply_runs(requests, block["runs"], insert_at)
            advance(len(text) + 1)
            continue

        if btype == "table":
            rows = block["rows"]
            if not rows:
                continue
            num_rows = len(rows)
            num_cols = max(len(r) for r in rows)
            # Normalize row lengths
            for r in rows:
                while len(r) < num_cols:
                    r.append("")

            insert_at = next_index()
            # Parse inline formatting for each cell
            cell_data = []
            for r_idx, row in enumerate(rows):
                cell_runs = []
                for cell in row:
                    plain, runs = parse_inline(cell)
                    cell_runs.append({"text": plain, "runs": runs})
                cell_data.append(cell_runs)

            requests.append({
                "insertTable": {
                    "location": {"index": insert_at},
                    "rows": num_rows,
                    "columns": num_cols,
                }
            })

            # After insertTable, the API places the table at insert_at + 1
            # (verified empirically — insertTable at index 6 in mid-paragraph
            # gives table starting at index 7). The table element spans
            # [insert_at + 1, insert_at + 1 + 1 + N*(2*M+1)) and there's
            # a trailing paragraph break at insert_at + 1 + 1 + N*(2*M+1).
            #
            # The cell (i,j) paragraph starts at:
            #   cell_para_start(i,j) = insert_at + 4 + i*(2*M+1) + j*2
            # (verified empirically: insertTable at 1 in [1,2) "\n" gives
            # cell (0,0) at index 5 = 1 + 4 + 0 + 0)
            #
            # When we insertText of length L into a cell, content at
            # indices >= cell_start + 1 shifts by L. Cells in same row at
            # higher column indices, and cells in later rows, all shift.
            # Cells BEFORE in doc order don't shift.
            #
            # Therefore: iterate FORWARD (doc order) and track cumulative
            # shift from prior inserts. Each cell's CURRENT position is
            # its original position + cumulative_shift.

            row_stride = 2 * num_cols + 1  # indices per row in the table
            cell_base = insert_at + 4  # offset to cell (0,0) paragraph start

            total_inserted_text = 0
            cumulative_shift = 0  # shift from all prior inserts

            for flat_idx in range(num_rows * num_cols):
                i = flat_idx // num_cols
                j = flat_idx % num_cols
                cell_text_obj = cell_data[i][j]
                text = cell_text_obj["text"]
                runs = cell_text_obj["runs"]

                # Current cell start = original position + cumulative shift
                cell_start = cell_base + i * row_stride + j * 2 + cumulative_shift

                if text:
                    requests.append({
                        "insertText": {
                            "location": {"index": cell_start},
                            "text": text,
                        }
                    })

                    # Style the header row bold
                    if i == 0:
                        requests.append({
                            "updateTextStyle": {
                                "range": {
                                    "startIndex": cell_start,
                                    "endIndex": cell_start + len(text),
                                },
                                "textStyle": {"bold": True},
                                "fields": "bold",
                            }
                        })

                    # Apply inline runs (bold, italic, links)
                    apply_runs(requests, runs, cell_start)

                    total_inserted_text += len(text)
                    cumulative_shift += len(text)

            # Advance end_index by the table footprint + cell content.
            # Table footprint = 1 (table open) + N*row_stride (rows) + 1
            # (trailing \n inside table). Cell content adds to that.
            # We also add +1 for the trailing "\n" paragraph that
            # insertTable auto-appends when called at the end of the doc.
            table_footprint = 1 + num_rows * row_stride + 1
            advance(table_footprint + total_inserted_text + 1)

            # Add a paragraph break after the table for spacing
            requests.append({
                "insertText": {
                    "location": {"index": next_index()},
                    "text": "\n",
                }
            })
            advance(1)

            continue

    return requests


def apply_runs(requests, runs, base_index):
    """Apply inline styling (bold, italic, code, links) to runs in a block."""
    for run in runs:
        if not run["text"]:
            continue
        start = base_index + run["start"]
        end = base_index + run["end"]
        if end <= start:
            continue

        text_style = {}
        fields = []

        if run["bold"]:
            text_style["bold"] = True
            fields.append("bold")
        if run["italic"]:
            text_style["italic"] = True
            fields.append("italic")
        if run["code"]:
            text_style["weightedFontFamily"] = {
                "fontFamily": "Roboto Mono",
                "weight": 400,
            }
            text_style["backgroundColor"] = {
                "color": {"rgbColor": {"red": 0.95, "green": 0.95, "blue": 0.95}}
            }
            fields.append("weightedFontFamily")
            fields.append("backgroundColor")

        if fields:
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": text_style,
                    "fields": ",".join(fields),
                }
            })

        if run["link"]:
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": {"link": {"url": run["link"]}},
                    "fields": "link",
                }
            })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("md_file")
    parser.add_argument("doc_id")
    parser.add_argument("--apply", action="store_true",
                        help="Apply the requests via gws (default: print JSON)")
    parser.add_argument("--output", help="Write requests JSON to this file")
    parser.add_argument("--batch-size", type=int, default=100,
                        help="Max requests per batchUpdate call")
    args = parser.parse_args()

    with open(args.md_file) as f:
        md_text = f.read()

    blocks = parse_markdown(md_text)
    requests = build_requests(blocks)

    print(f"Parsed {len(blocks)} blocks; built {len(requests)} requests",
          file=sys.stderr)

    # Split into batches to avoid huge payloads
    batches = []
    for i in range(0, len(requests), args.batch_size):
        batches.append(requests[i:i + args.batch_size])

    print(f"Split into {len(batches)} batches (max {args.batch_size} each)",
          file=sys.stderr)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(batches, f, indent=2)
        print(f"Wrote requests to {args.output}", file=sys.stderr)

    if not args.apply:
        # Just print the first batch for inspection
        print(json.dumps(batches[0] if batches else [], indent=2))
        return

    # Apply each batch
    for i, batch in enumerate(batches):
        print(f"Applying batch {i+1}/{len(batches)} ({len(batch)} requests)...",
              file=sys.stderr)
        result = subprocess.run(
            ["gws", "docs", "documents", "batchUpdate",
             "--params", json.dumps({"documentId": args.doc_id}),
             "--json", json.dumps({"requests": batch}),
             "--format", "json"],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"FAILED on batch {i+1}", file=sys.stderr)
            print(result.stdout, file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            sys.exit(1)
        # Brief success indicator
        try:
            data = json.loads(result.stdout)
            replies = data.get("replies", [])
            print(f"  → {len(replies)} replies", file=sys.stderr)
        except json.JSONDecodeError:
            print(f"  → (non-JSON response, len={len(result.stdout)})",
                  file=sys.stderr)

    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
