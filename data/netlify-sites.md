# Netlify Site Registry

**Purpose:** Before any Netlify deploy, cross-reference this list. NEVER overwrite a site unless its identity matches your project.

## Rules (NON-NEGOTIABLE)
- **`--create-site` → always safe, use for any new project**
- `netlify deploy` (no `--site`) → always creates a NEW site, safe
- `netlify deploy --prod --site=<id>` → BLOCKED unless site ID is confirmed same project in this registry
- When in doubt → `--create-site`, never guess

## Registered Sites

| Site Name | Site ID | URL | Project | Notes |
|-----------|---------|-----|---------|-------|
| franklin-mountain-mission | `f67cdd6d-d27a-44a0-ae6c-a5aa05bb2682` | franklin-mountain-mission.netlify.app | Franklin Birthday RSVP | Superman hero image, Formspree |
| flipoff-display | `36775d88-34df-4572-902b-d612e441d89d` | flipoff.camposfamily.com | Flip tile display caster | Split-flap board web caster |
| boston-marathon-strategy | `ccb44157-7440-4fe4-baf6-6d0e2a1e1c7d` | boston-marathon-strategy.netlify.app | Boston Marathon race plan | Training strategy docs |
| boston-is-weak | `e85ea7bf-39c1-446c-b7bc-1bf88891a6ce` | boston-is-weak.netlify.app | Boston Marathon parody/joke site | Dr. Steven divine playbook |
| confetti-closet | `5e41c0b7-726f-44c7-9137-73f03a298e09` | confetti-closet.netlify.app | Amanda's closet styling business | Main business site |
| confetti-closet-v2 | `d295bee9-fdf6-4b75-9bca-375cbe085310` | confetti-closet-v2.netlify.app | Amanda's closet styling business | staging/rebuild |
| fettiflare | `7b908cf8-4668-436b-bc5d-cb94d00e973e` | fettiflare.netlify.app | Amanda's Client Intake Form | Confetti Closet client onboarding |

## Personal / Miscellaneous

| Site Name | Site ID | URL | Project |
|-----------|---------|-----|---------|
| planningcenterevents | `f0b452cc-d0da-4976-a616-ec014650ad78` | planningcenterevents.netlify.app | Trinity Fellowship events from Planning Center |
| trinitydigitalguide | `5846b85a-d54d-40df-8704-f77b86f320b9` | trinitydigitalguide.netlify.app | Digital worship guide (Planning Center) |
| taskmastergtasks | `f772b809-7773-446b-8c2b-498cba69a4d5` | taskmastergtasks.netlify.app | Google Tasks list management |
| nymarathon25 | `4a7bb914-d127-4f58-80e2-33a6a4998c7a` | nymarathon25.netlify.app | NYC Marathon 2025 fundraising |
| quicknudge | `9686d475-2dbd-480d-b2c6-21ce635e4acb` | quicknudge.app | Send fast reminders — dormant but live |

## Recipe Card Site (DEDICATED — LOCKED)
- **Site ID:** `519158f8-469e-4151-ae4e-bf35e3ef6ec6`
- **URL:** `https://stupendous-gnome-5797cf.netlify.app`
- **Purpose:** Daily recipe card ONLY — always deploy here, never `--create-site`
- **⚠️ NEVER overwrite:** `frog-countdown` (Franklin bday), `flipoff`, `confetti-closet`, any other registered site

## All Other Projects
Deploy to a fresh site (new site ID). Never reuse existing IDs.

## Confetti Closet Redesign (Apr 2026)
| Site Name | Site ID | URL | Project |
|-----------|---------|-----|---------|
| sage-gnome-96d215 | `NEW` | sage-gnome-96d215.netlify.app | Confetti Closet redesign (Apr 2026) | Fresh site, clean deploy |

**NOTE:** Previous attempts mistakenly used `--prod --site=ccb44157` which belonged to boston-marathon. The .netlify.toml in project dirs causes this. Always `rm -rf .netlify/` before deploying a fresh project.

## Franklin Birthday Countdown
| Site Name | Site ID | URL | Project |
|-----------|---------|-----|---------|
| frog-countdown | `ccb44157-7440-4fe4-baf6-6d0e2a1e1c7d` | frog-countdown.netlify.app | Franklin Birthday Countdown | NOTE: `frog-countdown` was mistakenly overwritten with recipe cards in the past — treat as FRANKLIN COUNTDOWN ONLY

## Franklin's Quest (NFC scavenger hunt PWA)
| franklin-quest | `371fd0cb-3d1f-45c9-b88e-dbe4eb770cdb` | franklin-quest.netlify.app | Franklin's Quest PWA | **Deploy with `--site=371fd0cb-…` (UUID), NOT `--site=franklin-quest` (404s)**. Repo: `projects/franklin-quest/`. SW version in `web/sw.js` and `web/app.js` must match. Voice: `en-IE-ConnorNeural` for all stations.

## Recipe Card Sites (LEGACY — IGNORE)
Old recipe sites are stale/overwritten. All new recipe cards go to:
- **DEDICATED:** `stupendous-gnome-5797cf.netlify.app` (Site ID: `519158f8-469e-4151-ae4e-bf35e3ef6ec6`)

## Cloudflare Pages Sites
- **Project:** `chris-campos-profile`
- **URL:** `https://chris.camposfamily.cloud`
- **Fallback:** `https://chris-campos-profile.pages.dev`
- **Source copy:** `/home/ccampos/.openclaw/workspace/chris-campos-landing` copied from Mac `/Users/ccampos/CascadeProjects/chris-campos-landing`
- **Purpose:** Chris Campos profile / landing page
