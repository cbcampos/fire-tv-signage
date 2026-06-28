# Trinity Sermon Tagging — Sub-agent Prompt Template

## Mission

You are tagging a batch of 10 Trinity Fellowship sermon transcripts against the 55-topic taxonomy defined in `topics-proposed-2026-06-28.md`. Your job is to assign 1-7 doctrinal/topical tags per sermon.

## Inputs

For each sermon, you receive:
1. The sermon's metadata (date, title, scripture reference if known)
2. The sermon's transcript text (paragraphs, no timestamps)
3. The 55-topic taxonomy with descriptions

## Output

For each sermon, output a JSON object:
```json
{
  "date": "2024-09-23",
  "title": "Why We're Here",
  "primary_passage": "Ephesians 1:3-14",  // if identifiable
  "topics": [
    "doctrine-of-god",      // primary 1-3 topics
    "salvation",
    "worship"
  ],
  "secondary_topics": [
    "prayer",
    "gospel"
  ],
  "series": "Firm Foundation",  // if part of a series, name it
  "confidence_notes": "Series opener laying out the church's vision; primary topics clear, secondary topics inferred from opening prayer."
}
```

## Rules

1. **Read the entire transcript before tagging.** Don't skim.
2. **Aim for 3-7 topics per sermon.** Fewer than 3 means you missed something; more than 7 means you're being too generous.
3. **Order topics by prominence** in the sermon. The first topic should be the dominant one.
4. **Use exact taxonomy slug names.** No invented topics. If the sermon doesn't fit any topic, that's a finding — note it.
5. **Be conservative on "secondary_topics"** — only tag if the topic gets at least 2-3 minutes of airtime.
6. **Series detection**: if the title contains a series name prefix (e.g., "Firm Foundation: What We Believe About..."), populate the `series` field.

## Verification

Before submitting each batch:
- Count tags per sermon — any with 0 or >7? Fix.
- Verify topic slugs match the taxonomy exactly. No abbreviations.
- Make sure every sermon in the batch has output.

## Deliverable

Save your output as a single JSON array at `tagging-batch-NN-results.json` in the project directory.
