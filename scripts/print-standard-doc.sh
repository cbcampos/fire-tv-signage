#!/usr/bin/env bash
set -euo pipefail

# Print common local document formats to the Brother DCP-L2540DW.
# PDFs/text/images go through CUPS. Office documents are first converted to PDF
# with LibreOffice, because CUPS does not accept DOCX directly.

PRINTER="${PRINTER:-Brother_DCP_L2540DW_series}"
DEFAULT_OPTS=(
  -o PageSize=Letter
  -o ColorModel=Gray
  -o print-color-mode=monochrome
  -o Duplex=None
)

usage() {
  cat <<'EOF'
Usage: print-standard-doc.sh [--convert-only] FILE

Prints PDF, text, image, PostScript, and LibreOffice-supported office files.

Environment:
  PRINTER=Brother_DCP_L2540DW_series   CUPS destination to use

Notes:
  DOCX/DOC/ODT/RTF require libreoffice-writer:
    sudo apt-get update && sudo apt-get install -y libreoffice-writer
EOF
}

die() {
  echo "print-standard-doc.sh: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

find_office() {
  command -v libreoffice 2>/dev/null ||
    command -v soffice 2>/dev/null ||
    command -v lowriter 2>/dev/null ||
    true
}

convert_office_to_pdf() {
  local input="$1"
  local outdir="$2"
  local office
  office="$(find_office)"
  if [[ -z "$office" ]]; then
    die "DOCX/office printing needs LibreOffice. Install with: sudo apt-get update && sudo apt-get install -y libreoffice-writer"
  fi

  "$office" --headless --convert-to pdf --outdir "$outdir" "$input" >/tmp/print-standard-doc-libreoffice.log 2>&1 ||
    die "LibreOffice conversion failed; see /tmp/print-standard-doc-libreoffice.log"

  local pdf="$outdir/$(basename "${input%.*}").pdf"
  [[ -s "$pdf" ]] || die "LibreOffice did not create expected PDF: $pdf"
  printf '%s\n' "$pdf"
}

print_pdf() {
  local pdf="$1"
  need_cmd lp
  lp -d "$PRINTER" "${DEFAULT_OPTS[@]}" -t "$(basename "$pdf")" "$pdf"
}

convert_only=false
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
elif [[ "${1:-}" == "--convert-only" ]]; then
  convert_only=true
  shift
fi

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
input="$1"
[[ -f "$input" ]] || die "file not found: $input"

ext="${input##*.}"
ext="${ext,,}"
tmpdir="$(mktemp -d /tmp/print-standard-doc-XXXXXX)"
trap 'rm -rf "$tmpdir"' EXIT

case "$ext" in
  pdf)
    pdf="$input"
    ;;
  docx|doc|odt|rtf|ppt|pptx|xls|xlsx)
    pdf="$(convert_office_to_pdf "$input" "$tmpdir")"
    ;;
  txt|text|md|png|jpg|jpeg|gif|tif|tiff|ps)
    if "$convert_only"; then
      echo "$input"
      exit 0
    fi
    need_cmd lp
    lp -d "$PRINTER" "${DEFAULT_OPTS[@]}" -t "$(basename "$input")" "$input"
    exit 0
    ;;
  *)
    die "unsupported extension .$ext. Convert to PDF first, or install LibreOffice for office files."
    ;;
esac

if "$convert_only"; then
  if [[ "$pdf" == "$input" ]]; then
    realpath "$pdf"
  else
    cp "$pdf" .
    echo "$(pwd)/$(basename "$pdf")"
  fi
else
  print_pdf "$pdf"
fi
