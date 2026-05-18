# Dobby Print — Printer Output Skill

Print physical output via Brother DCP-L2540DW (192.168.2.220:9100).

## HOW TO PRINT (IMPORTANT)

### Method: Standard Documents
For normal files (PDF, DOCX, text, images), use the CUPS wrapper:
```bash
bash scripts/print-standard-doc.sh file.pdf
bash scripts/print-standard-doc.sh file.docx
```

DOCX requires LibreOffice. If it is missing, install:
```bash
sudo apt-get update && sudo apt-get install -y libreoffice-writer
```

### Method: Raw Socket For Generated PostScript Snippets
Use raw TCP socket for hand-written PostScript snippets. This bypasses past CUPS/cups-browsed PostScript rendering problems.
```bash
cat file.ps | nc -q 8 -w 15 192.168.2.220 9100
```

### The dobby-print.sh script
```bash
bash skills/dobby-print/dobby-print.sh card "Franklin"   # Birthday card
bash skills/dobby-print/dobby-print.sh brief            # Morning brief
bash skills/dobby-print/dobby-print.sh reminder "text"   # Reminder
bash skills/dobby-print/dobby-print.sh receipt "task"   # Task receipt
bash skills/dobby-print/dobby-print.sh fun "message"    # Fun print
```

## CRITICAL: PostScript Syntax

### ❌ WRONG (causes stackunderflow/typecheck):
```
/Helvetica findfont 36 setfont        # findfont returns dict, "36" is separate operand
/Helvetica findfont 36 scalefont setfont  # CORRECT: scalefont takes size operand
```

### ✅ CORRECT:
```
/Helvetica-Bold findfont 48 scalefont setfont
/Helvetica findfont 22 scalefont setfont
```

Font names that work on this printer:
- `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-Bold-Oblique`
- `Times-Roman`, `Times-Italic`
- Courier variants

## Design Rules
- B&W only — gray values 0.0 to 1.0
- No hex colors, no RGB
- Paper: Letter (612×792 points)
- Check: `grep -E "#|rgb" file.ps` before printing

## Troubleshooting
- **DOCX fails with document-format-not-supported**: CUPS does not accept DOCX directly. Install LibreOffice and print with `scripts/print-standard-doc.sh`.
- **PDF fails**: Check `lpstat -t`, then try `lp -d Brother_DCP_L2540DW_series file.pdf`.
- **Jobs vanish from CUPS queue**: cups-browsed pausing printer — use raw socket for generated PostScript or stop cups-browsed.
- **Stackunderflow error**: Wrong font syntax — use `findfont N scalefont setfont`
- **Printer shows "not ready"**: Run `python3 -c "import cups; c=cups.Connection(); c.enablePrinter('Brother_DCP_L2540DW_series'); c.acceptJobs('Brother_DCP_L2540DW_series')"`
- **cups-browsed keeps disabling printer**: Stop it with `sudo systemctl stop cups-browsed`

## Files
- `dobby-print.sh` — main script (uses raw socket)
- PS files go to: `/tmp/dobby-print-*.ps`
