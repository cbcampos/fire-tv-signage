# Trinity Fellowship Sermon Corpus — Session Summary

**Date:** 2026-06-28  
**Status:** ✅ COMPLETE — corpus ready for Phase 2 (LLM-assisted tagging)

## Deliverables

| Artifact | Path | Size |
|---|---|---|
| Topic taxonomy (55 topics, 6 buckets) | `topics-proposed-2026-06-28.md` + `.docx` | Word doc for review |
| Two-track tagging plan | `tagging-plan-2026-06-28.md` + `.docx` | Word doc for review |
| Phase 2 Codex prompt template | `tagging-pilot-prompt.md` | Ready |
| Full episode inventory (78) | `sermon-inventory-2026-06-28.json` | 78 entries |
| amp-api breakthrough data | `amp-api-trinity-full.json` | 246 KB raw |
| Clean structured index | `amp-api-trinity-inventory.json` | 113 KB |
| Apple-ID mapping (77/78) | `apple-id-mapping.json` | Title-matched |
| RSS-fed transcripts (10) | `transcripts/2025-12-21_*.txt` through `2026-06-14_*.txt` | ~285 KB |
| Whisper transcripts (68) | `transcripts/whisper/*.txt` | ~2 MB |
| Reusable extractor script | `scripts/amp_api_sync.py` | Tested, works |
| Path A/B post-mortem | `PATH-A-B-STATUS.md` | RESOLVED |
| Skill proposal | `amp-api-podcast-transcripts-...` | Pending approval |

## Corpus stats

- **78 of 78 sermons transcribed** (100%)
- **2.3 MB total text** / **16,646 lines**
- **Average 213 lines per sermon** (35-50 min sermons)
- **Date range:** Sept 23, 2024 → Jun 21, 2026 (~21 months)

## Key breakthrough

The undocumented `extend[transcripts]=snippet` parameter in amp-api's sync endpoint unlocks 77 of 78 transcript snippets per show. Without this param, `include[podcast-episodes]=transcripts` returns empty data silently.

This was the user's intuition made concrete: "I know you can get transcripts from podcasts app."

## Next steps

1. **Phase 2 pilot:** Run `tagging-pilot-prompt.md` via Codex sub-agent on 10 sermons
2. **Chris reviews** Codex output, refines prompt if needed
3. **Scale to 78:** Run in batches of 10, ~3-4 hours total
4. **Generate topic index page** linking sermons to taxonomy (~55 topics)
5. **Deploy** as static page for public consumption

## Risk register

- Bearer JWT expires 2026-07-28 (re-extract before any re-runs)
- Whisper transcripts are imperfect (medium model) — for critical quotes, verify against audio
- Topic taxonomy may need refinement after pilot tagging (Phase 1B is feedback loop)
