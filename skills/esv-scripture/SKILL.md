# ESV Scripture Skill

Fetch accurate ESV Bible passages for use in documents, home group guides, and study materials.

## Setup

API token stored in `~/.openclaw/.secrets/esv.env` as `ESV_API_TOKEN`.

## Usage

```
@esv John 1:18
@esv Exodus 34:6-7
@esv Romans 8:28-39
@esv "Show me your glory" — pull the key verses from Exodus 33-34
```

## What It Does

1. **Single verses** — Returns the verse text with reference and (ESV) copyright
2. **Ranges** — Returns full passage, poetry-indented, with verse numbers
3. **Searches** — Can search for passages matching a phrase
4. **HTML output** — Returns clean HTML `<p>` tags suitable for embedding in PDFs and web pages

## Output Options

- `--text` — Plain text (default for console)
- `--html` — HTML fragments (best for PDF/website embedding)
- `--full` — Include passage metadata, copyright, chapter context

## Output Format

```
Romans 8:38-39 (ESV)
[38] For I am convinced that neither death nor life, nor angels nor rulers, nor things present nor things to come, nor powers, [39] nor height nor depth, nor anything else in all creation, will be able to separate us from the love of God in Christ Jesus our Lord.
```

## Copyright

Always include `(ESV)` at the end of quotes. For formal documents, optionally append full copyright: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved."

## API Details

- Endpoint: `GET https://api.esv.org/v3/passage/text/`
- Auth: `Authorization: Token <token>`
- Params: `q=<passage>`, `include-passage-references=true`, `include-verse-numbers=true`, `include-short-copyright=true`

## Notes

- Passages with poetry (Psalms, Isaiah, etc.) will be properly indented in text output
- Section headings can be included with `include-headings=true`
- Footnotes are excluded by default (`include-footnotes=false`) for clean embedding
- Long ranges (entire chapters) may return large payloads — use wisely