# Brother Print Pipeline Diagnostic - 2026-05-18

## Current State

- CUPS is running.
- Printer queue: `Brother_DCP_L2540DW_series`.
- Device URI: `socket://192.168.2.220:9100`.
- Printer is accepting jobs and enabled.
- `cups-browsed` is installed but inactive, so it is not currently pausing or recreating the queue.
- User default destination is now set to `Brother_DCP_L2540DW_series`.
- User default options now include Letter, grayscale, and simplex output.

## Root Cause

CUPS accepts PDF/PostScript/text/image input for the local queue, but it does not accept DOCX directly. The failing log entry was:

`client-error-document-format-not-supported`

The physical printer itself advertises only raw/octet-stream, URF, and PWG raster support. For normal documents, the local CUPS queue must receive PDF or another supported format and perform filtering before sending the final raster data to the printer.

## Verified

- `lpstat -t` showed the queue idle/enabled/accepting jobs.
- `ipptool` against the local queue showed support for `application/pdf`, `application/postscript`, `image/png`, `text/plain`, and related CUPS formats.
- `ipptool` against the printer showed hardware support for `application/octet-stream`, `image/urf`, and `image/pwg-raster`.
- Generated a one-page PDF and sent it through CUPS as job `Brother_DCP_L2540DW_series-16`; CUPS accepted it with `Send-Document successful-ok`.

## Remaining Blocker

`libreoffice-writer` is not installed, and `sudo -n true` reports that a password is required. DOCX printing needs a system install:

```bash
sudo apt-get update && sudo apt-get install -y libreoffice-writer
```

After that, use:

```bash
scripts/print-standard-doc.sh some-file.docx
scripts/print-standard-doc.sh some-file.pdf
```

The script converts DOCX/office files to PDF with LibreOffice, then submits the PDF to CUPS.
