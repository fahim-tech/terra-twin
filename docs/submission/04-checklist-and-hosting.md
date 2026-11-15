# TerraTwin — Submission checklist and hosting

Deadline: **15 November 2026, 11:59 PM, local time of the team owner's event** (Bangladesh: UTC+6).
Submit on the AstroSUST team page → Project tab → Edit → fill every field → accept the terms → Submit for Judging.

## Files in this folder

| File | What | Where it is hosted (after `scripts/deploy-web.sh`) |
|---|---|---|
| `01-submission-form.md` | Paste-ready text for every form field | — |
| `02-methodology-and-evidence.md` | Method, algorithm, evidence, limitations, references | link from the README or attach |
| `03-data-and-references.md` | NASA data, partner data, software, literature | — |
| `slides/index.html` + `assets/` | 7-slide deck, keyboard navigation | https://terratwin-five.vercel.app/deck/ |
| `TerraTwin-slides.pdf` | The same deck, 7 pages, 1920 × 1080 | https://terratwin-five.vercel.app/deck/TerraTwin-slides.pdf |
| `TerraTwin-demo-30s.mp4` | 28.5-second screen recording of the live app with captions (1080p, silent) | https://terratwin-five.vercel.app/deck/TerraTwin-demo-30s.mp4, and upload to YouTube (unlisted or public) |

To publish the deck and video with the app, copy them into the web app's static folder and deploy:

```bash
rm -rf apps/web/public/deck && mkdir -p apps/web/public/deck && cp -R docs/submission/slides/. apps/web/public/deck/ && cp docs/submission/TerraTwin-slides.pdf docs/submission/TerraTwin-demo-30s.mp4 apps/web/public/deck/
```

```bash
git add apps/web/public/deck docs/submission && git commit -m "Add the submission deck, 30-second demo and submission documents"
```

```bash
scripts/deploy-web.sh
```

Then open each link in a private window (no login) and confirm it loads.

## Checklist

| # | Item | Status |
|---|---|---|
| 1 | Team AstroSUST and the challenge *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars* selected | team to confirm on the form |
| 2 | All members registered at the same Local Event and listed (≤ 6) | team to confirm |
| 3 | Project name, high-level summary, detailed description | `01-submission-form.md` |
| 4 | Project demonstration link: 7-slide deck **or** ≤ 30-second video, public, no login | deck at /deck/ (7 slides) and video 28.5 s; use one (both are under the limits) |
| 5 | Final project link: public, no login | https://terratwin-five.vercel.app (verified HTTP 200 anonymously) |
| 6 | Actual Earth analog results documented | Jezero → tie Kunlun–Altun / Qaidam (live), Atacama Yungay (pool); 29/39 zones named leaders |
| 7 | At least one eligible NASA dataset used and referenced | 12 NASA products, `03-data-and-references.md` |
| 8 | All third-party datasets, libraries, media and code credited | `03-data-and-references.md`; in-app Evidence §10 and Report §12 |
| 9 | Use of Super Intelligence (AI) disclosed accurately | `01-submission-form.md` §SI, README "AI assistance", deck slide 7, video end card |
| 10 | Scientific limitations and uncertainties explained | form, deck slides 5–6, app Relevance/Evidence/Report, `02-methodology-and-evidence.md` §5 |
| 11 | Local Event submission requirements checked | team: check the Sylhet / local organiser instructions |
| 12 | NASA submission confirmed before the deadline; checkboxes (terms, original work, no minors' images) | team |

## Preserve the judged version

After submitting, tag the commit that was deployed and leave `main`/the deployed build untouched:

```bash
git tag -a spaceapps-2026-submitted -m "Version submitted to NASA Space Apps 2026" && git push origin spaceapps-2026-submitted
```

Further UI work goes on a separate branch or deployment.

## Notes for the demo link

- The GitHub repository is private at the time of writing; either make it public before linking it, or link
  only the app and the deck.
- The README states "ahead of the classic Atacama Yungay analog (S 0.613, 9th of 90 refined windows)" for a run
  that includes the research pool; the cached runs on production currently list the 40-window run
  (`533a52bdf72b`), in which both tie members score above Atacama's pool record (0.614). The deck and video use the
  40-window run, which anyone can reopen from the app.
- The discovery service allows 2 concurrent runs and 12 per hour; judges who click "Run global discovery" at the
  same time see "Queued — server busy". Cached runs reopen instantly.
