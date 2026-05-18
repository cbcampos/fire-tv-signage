# Bee Week Scan Action Packets — 2026-05-18

Built from Bee conversations, todos, journals, facts, and full transcripts for 2026-05-11 → 2026-05-18.

## 1) Amanda Claire Support / Medical Logistics Brief

### What Bee surfaced
- Repeated distress around work, medication/psychiatric support, rash/side effects, and emotional overload.
- Several related Bee todos remain open/unclear, even though one psychiatry-search item appears completed.

### Best next move
Do **not** take over. Offer operational help with choices.

### Text/script Chris can use
> I know this has been heavy. Do you want me to handle logistics, sit with you while you call, or just cover the kids so you can handle it? I’m not trying to take over — I want to make the next step easier.

### Appointment note template
- Main concern:
- Medication currently taking / recent changes:
- What feels worse lately:
- Physical symptoms/rash details:
- Sleep/appetite/energy:
- Work/family stressors affecting symptoms:
- What Amanda wants from the appointment:
- Questions to ask:
  - Is this medication still the right fit?
  - Could the rash/side effects be related?
  - What should change if symptoms spike?
  - What follow-up interval is appropriate?

### Public UAB contact info found
- UAB Psychiatry Services: https://www.uabmedicine.org/specialties/psychiatry-services/
- UAB Adult Ambulatory Psychiatry page lists Center for Psychiatric Medicine, 1713 6th Ave S, Birmingham, AL 35294-0018, phone 205-934-7008.

## 2) Marriage Repair / Weekly Check-in Packet

### Pattern Bee surfaced
Tone/accountability fights are recurring. The productive move is not “solve the marriage in the fight.” It is: repair impact, then schedule calmer structure.

### 10-minute weekly check-in agenda
1. What felt heavy this week?
2. What helped this week?
3. What is one concrete ask for next week?

Rules:
- No rebuttals during the first answer.
- Reflect back what you heard before explaining.
- End with one action each person can actually do.

### Repair script
> I see how that landed as criticism/annoyance. I was trying to handle the logistics, but the impact was that you felt talked down to. I’m sorry. Next time I’m going to slow down and ask instead of narrating what needs to happen.

### If things escalate
> I want to stay connected, but I’m getting defensive. I’m going to pause and come back in 20 minutes so I don’t make this worse.

## 3) Franklin Summer Coverage / VBS Packet

### Open thread
Bee captured a reminder to sign Franklin up for VBS/camp and repeated summer-coverage uncertainty.

### Known public option found
- Gardendale First Baptist VBS 2026: June 1–5, 8:45 AM–Noon, North Campus, K3–5th grade.
- Registration page surfaced: https://www.gfbc.com/vbs and Lifeway KidEvent page in search results.

### Summer matrix to fill
| Week | Morning coverage | Afternoon coverage | Registration status | Transport | Notes |
|---|---|---|---|---|---|
| Jun 1–5 | GFBC VBS? | TBD | Needs confirmation | TBD | 8:45–Noon |
| Jun 8–12 | TBD | TBD | TBD | TBD | |
| Jun 15–19 | TBD | TBD | TBD | TBD | |
| Jun 22–26 | TBD | TBD | TBD | TBD | |
| Jun 29–Jul 3 | TBD | TBD | TBD | TBD | |

### Franklin morning checklist
- Get dressed
- Breakfast
- Brush teeth
- Shoes
- Backpack
- Water bottle
- Sunscreen/shorts if hot

### Behavior script
One instruction → one warning → one consequence → repair/reconnect.

Example:
> Franklin, shoes on now. If shoes are not on when I count to ten, I will help your body and we will lose one song in the car. I love you; this is the job right now.

## 4) Home Reset Queue

### Safety first
- Check garage gasoline smell.
- Do a May-safe floor sweep: marbles, strings, choking-size toy parts.
- Confirm dryer vent airflow if still questionable.

### 15-minute queue
Day 1:
- Put grill away / assess rust.
- Remove warm-weather jackets from Franklin backpack/hamper.
- Find Franklin water bottle.

Day 2:
- Restock diapers, trash bags, cat food, Italian seasoning.
- Pantry/kitchen 15-minute reset.

Day 3:
- Weed eater string / lawn supplies.
- May hand-me-down sort: one box only, stop after 30 minutes.

### Neutral load list language
Use: “visible / invisible / blocked / owner / next step.”
Avoid: “you never” or “I always.”

## 5) Church Venue Move / AV Walkthrough Packet

### Bee surfaced
The new church facility launch needs structure: access time, sound contact, storage, volunteer roles, wireless gear, teardown compression.

### Text to Brandon
> Hey Brandon — for the Fulton Springs walkthrough, who is the actual sound/AV contact, and what is our earliest Sunday access time? Also, can any gear stay stored on site week to week, or does everything have to load in/out?

### Walkthrough checklist
- Venue contact / sound contact
- Earliest access time
- Load-in path
- What doors are unlocked / who has keys
- Stage layout
- Power locations
- Existing house sound: usable or avoid?
- Speaker placement
- Wireless mic compatibility
- In-ear/wedge plan
- Storage location
- Cable paths / trip hazards
- Children/classroom signage
- Teardown deadline

### Sunday setup roles
- Load-in lead
- Stage/cables lead
- Soundboard lead
- Lyrics/slides lead
- Kids/signage lead
- Teardown lead

## 6) Sermon USB-to-Live Runbook Draft

### Goal
Make sermon publishing repeatable: plug in USB → extract sermon → normalize → review → publish → verify.

### Current known local workflow
Use the existing sermon tool noted in TOOLS.md:

```bash
python3 scripts/sermon_audio_extract.py <service-audio> --transcribe auto --output-dir outputs/sermons
```

If first export sounds quiet, create a louder MP3 from the confirmed sermon-only WAV:

```bash
ffmpeg -y -i outputs/sermons/<basename>.sermon-only.wav \
  -af "highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=20:release=200:makeup=3,loudnorm=I=-14:TP=-1.0:LRA=10" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/<basename>.sermon-only.full-louder.mp3
```

### Checklist
1. Copy USB audio into `outputs/sermons/raw/`.
2. Run extraction script.
3. Review sermon start/end.
4. If trim is off, refine before sharing.
5. Treat WAV as master.
6. Export shareable MP3.
7. Verify duration.
8. Build metadata:
   - Title:
   - Speaker:
   - Scripture:
   - Date:
   - Description:
9. Upload review file to Drive if needed.
10. Publish only after approval.
11. Verify final share URL and published timestamp.

## 7) Work / HEAL / AI Follow-up Packet

### GIMPOP AI next steps memo skeleton
- What we heard:
  - Need practical AI training.
  - Need safe sandbox/infrastructure.
  - Need governance/data-risk guidance.
  - Need low-friction examples faculty can copy.
- Proposed next steps:
  1. One 30-minute “AI Tapas” session.
  2. Shared folder for demos/prompts/screenshots.
  3. Intake form for faculty pain points.
  4. Micro-prototype list: citation highlighter, infographic generator, onboarding chatbot, faculty expertise map.

### HEAL newsletter checklist
- Confirm June 5 content deadline.
- Confirm June 22 launch target.
- Confirm School of Medicine comms turnaround.
- Confirm sender/byline constraints.
- Build repository content template:
  - Resource title
  - 2-sentence blurb
  - Link
  - Owner/contact
  - Review status

## 8) Message Drafts Chris Can Send

### Cindy thank-you
> Cindy, thank you again for everything around May’s birthday. It meant a lot to us, and I know it took time and energy. We’re grateful.

### Aubrey cupcake follow-up
> Hey Aubrey — thank you again for the cupcakes. They were a hit, and the kids loved them.

### Amanda serious Spain conversation opener
> I don’t want to dismiss the Spain idea or treat it like a joke. Can we set aside time to talk through what problem it solves, what it would cost, and what a realistic first step would be?

## What I should not do without Chris approval
- Contact Amanda Claire, Cindy, Aubrey, Brandon, church staff, providers, or schools directly.
- Register Franklin for anything involving payment, child data, or consent.
- Create/modify shared calendar events unless explicitly approved.
- Publish sermon audio externally without approval.
