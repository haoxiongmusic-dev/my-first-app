# Full online version: options (paused)

Date: 2026-11-09. Status: **brainstorm paused before any design choice.** The owner hasn't
decided who the full online version is for. Resume from here with the brainstorming step
(architectural path: questions → design → written spec → plan).

## Where things stand

- Version 1 (the PC app, M1–M7) is done.
- The online test version works on RunPod. The first session (2026-11-09) covered login,
  upload and export, and rendering used the graphics chip. A 30 s Final section took
  ≈ 5 min, about the same as the PC.
- The test version is one shared space, logins come from the `ACCOUNTS` setting, it runs one
  export at a time, and the pod is started by hand.

## The key cost idea

The live preview runs in the visitor's own browser, so the web server needs no GPU (a small
always-on server ≈ $5–20/month). Only exports need a GPU. A pay-per-export GPU service (for
example RunPod Serverless) is switched on just for each render: a 4-minute song ≈ 5–10 cents.
For comparison, the test pod left on all month ≈ $150. All prices are rough estimates, to be
checked when designing.

## The three options (each builds on the one before)

| Stage | Who | Adds | Rough cost |
|---|---|---|---|
| 1 | The owner + invited friends | Always available (no hand-started pod); a private space per person; renders on a pay-per-export GPU | ≈ $10–25/month + cents per video; about 2–3 milestones to build |
| 2 | Public, free | Sign-up with email checks; per-person limits (song length, exports/day); terms + privacy pages; copyright takedown handling | Grows with users; the owner pays all of it |
| 3 | Paying users | Plans and payments (e.g. Stripe, ideally a service that handles sales tax), receipts, refunds, support email, probably a registered business | Payment fees ≈ 3–5 %; users cover rendering |

**Recommendation given:** build stage 1 first. It is the foundation of stages 2 and 3, it is
useful on its own, and it shows real costs before strangers can spend money. Each stage gets
its own spec and plan.

## Open questions for when this resumes

- Who is it for (stage 1, 2 or 3 as the goal)?
- Does the installable desktop app (the roadmap's step before this) still come first?
