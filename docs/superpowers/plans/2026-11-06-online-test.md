# Online test version: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app runnable on a rented Linux GPU machine for a few test sessions:
- invited logins
- a configurable storage location on a kept disk
- a container image built and smoke-tested by GitHub
- a GPU status line
- a step-by-step guide for the owner

**Architecture:** The app stays one Next.js server.
- **Linux:** the full suite runs on GitHub's Ubuntu runners.
- **Storage:** every storage path goes through one `storageRoot()` helper.
- **Logins:** a Next 16 `src/proxy.ts` (Node runtime) gates every request when `ACCOUNTS` is set:
  - scrypt password hashes
  - an HMAC-signed session cookie
  - an in-memory rate limit
- **The image:** a Dockerfile on a CUDA Ubuntu base; GitHub Actions builds it, smoke-tests it
  without a GPU, and pushes it to GHCR.
- **GPU check:** one tiny render at start-up records whether HyperFrames used `hardware` or
  `software` GPU; `/api/health` reports it.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`), TypeScript strict, Vitest, Node `crypto`
(scrypt, HMAC), Docker, GitHub Actions, GHCR.

**Spec:** `docs/superpowers/specs/2026-11-06-online-test-design.md`

## Global Constraints

- **No new npm dependencies.** Crypto is Node's built-in. HyperFrames stays at **0.9.10**.
- **No login without `ACCOUNTS`:** with `ACCOUNTS` unset, behaviour is exactly as today (no
  login).
- **Never fail open:** with `ACCOUNTS` set and `SESSION_SECRET` missing or shorter than 32
  characters, every request gets 500 with
  `This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.`
- **Exact copy:**
  - `Wrong username or password.`
  - `Too many attempts: try again in 10 minutes.`
  - `Rendering: graphics chip` / `Rendering: software (slow)` / `Rendering: checking…` /
    `Rendering: check failed`
- **Sessions:** last 7 days. The cookie is `mv_session`, `HttpOnly`, `SameSite=Lax`, and
  `Secure` when the request is HTTPS (directly or through `x-forwarded-proto: https`).
- **Rate limit:** 10 failures per IP in 10 minutes, then a 10-minute wait. The IP is taken from
  the first `x-forwarded-for` entry, else `"local"`.
- **Never commit or bake into the image:** secrets, `.env*`, `storage/`, `test-renders/`, songs.
- **Image name:** `ghcr.io/haoxiongmusic-dev/my-first-app` (`:latest`, `:sha-<short>`).
- **Before every commit:** run `npm run check`. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Login bypass through paths the editor uses:** `/preview/*` pages loaded inside the
   player's iframe, `/api/images/*` thumbnails, `/_next/*` chunks, `favicon`. Only `/login`,
   `/api/auth/*`, `/_next/static/*`, `/_next/image*` and `/favicon.ico` may be open. (Task 3
   test: the decision function on each of those paths.)
2. **The login redirect's `next=` parameter:** it must only lead to a path on this site.
   `next=https://evil.example` or `//evil.example` must go to `/`. (Task 3 test.)
3. **A long upload or export behind the gate:** the proxy must not read request bodies (so a
   1 GB upload streams through), and polling `/api/exports` with a valid cookie must keep
   working all through a render. (Task 3: the proxy never touches `request.body`; step 6 does
   an upload with the server running locally.)
4. **`ACCOUNTS` typed by hand in RunPod's settings:** extra spaces, a trailing comma, or a
   username with a colon must parse or be rejected clearly, never crash the server. (Task 3
   test.)
5. **Running on the owner's Windows PC after this change:** no `ACCOUNTS`, no `STORAGE_DIR`.
   Storage stays at `<project>/storage`, there is no login, and nothing changes. (Task 2 test,
   plus the Task 3 decision test for no accounts.)

---

### Task 1: Linux CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: whatever fails on Linux (found by the run)

- [ ] **Step 1:** Write `ci.yml`, run on `push` and `pull_request`, job `check` on
  `ubuntu-latest`:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with node 22 and npm cache
  3. `sudo apt-get update && sudo apt-get install -y ffmpeg`
  4. `actions/setup-python@v5` with Python 3.12
  5. `npm ci`
  6. `npm run setup:py`
  7. `npm run check`
- [ ] **Step 2:** Push the branch and read the run (`gh run watch`).
  Expected: either green, or failures that only happen on Linux.
- [ ] **Step 3: For each Linux-only failure:**
  - Reproduce it in a test that fails on Linux, so CI is the red.
  - Fix the code. Never skip the test or mark it Windows-only, unless it really tests Windows
    behaviour (then guard it on `process.platform` and add the Linux twin).
  - Push again until CI is green.
- [ ] **Step 4: Commit:** `ci: run the full check on Linux` (with any fixes as their own
  `fix:` commits).

### Task 2: Storage location setting

**Files:**
- Create: `src/lib/storage-root.ts`, `src/lib/storage-root.test.ts`
- Modify: every `path.join(<root>, "storage")`:
  - `src/app/api/backgrounds/route.ts`
  - `src/app/api/images/route.ts`
  - `src/app/api/images/[id]/[file]/route.ts`
  - `src/app/api/songs/route.ts`
  - `src/app/api/songs/[id]/route.ts`
  - `src/app/preview/[templateId]/[songId]/[...path]/route.ts`
  - `src/lib/exports/manager.ts`
  - `src/lib/exports/run-export.ts`
  - `src/lib/sample-song-id.ts`
  - `src/lib/template-assets.ts`
  - `scripts/analyze.ts`

**Interfaces:**
- Produces:
  `storageRoot(projectRoot?: string, env?: NodeJS.ProcessEnv): string`
  - returns `path.resolve(env.STORAGE_DIR)` when it is set and not blank
  - otherwise `path.join(projectRoot ?? process.cwd(), "storage")`
  - the defaults are `process.cwd()` and `process.env`

- [ ] **Step 1: Write the tests** (`storage-root.test.ts`):
  - unset gives `<root>/storage`
  - blank or whitespace gives `<root>/storage`
  - an absolute value comes back as is
  - a relative value is resolved against the cwd
  - a grep-style test: no file under `src/` or `scripts/` except `storage-root.ts` contains
    `, "storage")` (read the files with `fs`)
- [ ] **Step 2:** Run `npx vitest run src/lib/storage-root.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the helper and replace every call site. Where a function already
  takes a `projectRoot` (manager, run-export, template-assets), pass `storageRoot(projectRoot)`.
- [ ] **Step 4:** Run `npm run check`. Expected: all green.
- [ ] **Step 5: Commit:** `feat: STORAGE_DIR setting for where the app keeps its files`.

### Task 3: Logins

**Files:**
- Create:
  - `src/lib/auth/passwords.ts` (+ test)
  - `src/lib/auth/session.ts` (+ test)
  - `src/lib/auth/rate-limit.ts` (+ test)
  - `src/lib/auth/gate.ts` (+ test)
  - `src/proxy.ts`
  - `src/app/login/page.tsx`
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/logout/route.ts`
  - `scripts/add-user.ts`
- Modify:
  - `src/components/IconRail.tsx`: a "Log out" item, shown only when logins are on
  - `src/app/page.tsx`: a "Log out" link when logins are on
  - `package.json`: `"add-user": "tsx scripts/add-user.ts"`
  - `.env.example`: document `ACCOUNTS`, `SESSION_SECRET`, `STORAGE_DIR`, `RENDER_GPU`

**Interfaces (produced):**
- `passwords.ts`:
  - `hashPassword(password: string): string`: `scrypt$<salt b64url>$<hash b64url>`, N=16384,
    r=8, p=1, a 16-byte salt and a 32-byte key
  - `verifyPassword(password: string, stored: string): boolean`: constant-time, false for
    malformed entries
  - `parseAccounts(env: string | undefined): Map<string, string>`:
    - splits on commas and trims each entry
    - skips empty entries
    - splits each entry at the **first** `:` into username and stored hash
    - throws `Error("ACCOUNTS entry N is not username:scrypt$…")` for an entry without `:` or
      with a hash that doesn't start with `scrypt$`
    - usernames are lower-cased and must match `/^[a-z0-9._-]{1,32}$/`
  - `DUMMY_HASH`: a fixed valid hash. Unknown users are verified against it, so their timing
    matches known users.
- `session.ts`:
  - `signSession(user: string, secret: string, now = Date.now()): string`: `user.expiry.sigB64url`
  - `readSession(cookie: string | undefined, secret: string, now = Date.now()): string | null`
  - `SESSION_COOKIE = "mv_session"`, `SESSION_DAYS = 7`
  - `cookieOptions(secure: boolean)`
- `rate-limit.ts`: `createRateLimiter({ max: 10, windowMs: 600_000, blockMs: 600_000 })` returns
  `{ check(ip, now): boolean, fail(ip, now): void, succeed(ip): void }`
- `gate.ts`: a pure function

  ```ts
  decide(input: {
    path: string;
    accounts: string | undefined;
    secret: string | undefined;
    cookie: string | undefined;
    now: number;
  }): { kind: "pass" } | { kind: "redirect"; to: string } | { kind: "unauthorized" } | { kind: "misconfigured"; message: string }
  ```

  - `isOpenPath(path)` covers the open list in Review Focus 1.
  - `safeNext(next: string | null): string` returns `next` only when it starts with `/`, not
    `//` and not `/\`; otherwise `/`.
- `src/proxy.ts`:
  - calls `decide`
  - maps redirects to `NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(path + search), request.url))`
  - maps `unauthorized` to a 401 JSON `{error:"Please log in."}` for `/api/*` and `/preview/*`
    paths
  - maps `misconfigured` to a 500 with the message
  - `config.matcher`: everything except `_next/static`, `_next/image` and `favicon.ico`
- `POST /api/auth/login` takes JSON `{ username, password, next }` and returns 200 `{ next }`
  with the cookie set, or 401/429 with the exact copy. `POST /api/auth/logout` clears the cookie
  and returns 200.
- `GET /api/auth/status` returns `{ loginEnabled: boolean, user: string | null }`. It is open,
  so the UI can decide whether to show "Log out".

- [ ] **Step 1: Write the failing tests:**
  - **passwords:** a hash then verify works and a wrong password fails; a salt differs between
    hashes; `verifyPassword("x", "garbage")` is false.
  - **`parseAccounts`:** `" ana:scrypt$a$b , ,BOB:scrypt$c$d,"` gives `ana` and `bob`; an
    entry without `:` throws a message naming entry 1; `"a:b"` throws; an empty or undefined
    value gives an empty map. (Review Focus 4)
  - **sessions:** a sign then read gives the user; a changed user, signature or secret gives
    null; expired after 7 days + 1 ms gives null; malformed gives null.
  - **rate limit:** 10 fails are allowed and the 11th check is false; true again after 10
    minutes; `succeed` resets the count.
  - **`decide`:**
    - no accounts → pass for every path (Review Focus 5)
    - accounts plus a short or missing secret → misconfigured with the exact copy
    - open paths pass without a cookie (`/login`, `/api/auth/login`, `/_next/static/x.js`,
      `/favicon.ico`)
    - `/`, `/edit/halo-rings` → redirect to `/login?next=…`
    - `/api/songs`, `/api/images/<id>/square.jpg`, `/preview/halo-rings/sample/index.html`,
      `/_next/data/x.json` → unauthorized (Review Focus 1)
    - a valid cookie → pass
  - **`safeNext`:** `"/edit/x?y=1"` is kept; `"https://evil.example"`, `"//evil.example"`,
    `"/\\evil"` and `null` give `/`. (Review Focus 2)
  - **`proxy.ts` source:** contains no `request.body`, `.json(` or `.formData(` (Review Focus 3).
- [ ] **Step 2:** Run the auth tests. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules, then the proxy, the routes and the pages.
  - **The login page:**
    - username and password fields, with a **Log in** button
    - posts with `fetch`; on 200 it navigates to `next`
    - shows the error copy
    - styled like the editor (dark, amber button)
  - **The rate limiter:** a single module-level instance on `globalThis`, like the export
    manager.
- [ ] **Step 4: `scripts/add-user.ts`:**
  - reads the username from argv
  - reads the password twice from stdin, without echoing it (raw mode); they must match and be
    at least 8 characters
  - prints `username:scrypt$…`, and a reminder to set `SESSION_SECRET` to 48 random characters
    with a command that generates one (`node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`)
  - test the pure part (`formatAccountLine(user, hash)`) in Vitest
- [ ] **Step 5:** Run `npm run check`. Expected: green.
- [ ] **Step 6: Local app check:**
  - Run `next build && next start` with `ACCOUNTS` (one test user) and `SESSION_SECRET` set, in
    the built-in browser:
    - `/` redirects to the login page
    - a wrong password shows the copy
    - a right one goes to the editor
    - the editor previews (iframe and thumbnails load)
    - upload a 10 MB file, then **Log out**
    - after log out, `/api/songs` gives 401
  - Then without `ACCOUNTS`: no login at all.
- [ ] **Step 7: Commit:** `feat: invited logins (ACCOUNTS, SESSION_SECRET, add-user)`.

### Task 4: GPU check and health

**Files:**
- Create: `src/lib/gpu-check.ts` (+ test), `src/app/api/health/route.ts`,
  `src/components/RenderStatus.tsx`, `src/instrumentation.ts`
- Modify: `src/components/Editor.tsx` (status line in the top bar),
  `src/lib/exports/run-export.ts` (pass the GPU flags when `RENDER_GPU=1`)

**Interfaces:**
- `parseGpuMode(renderLog: string): "hardware" | "software" | null`: reads HyperFrames'
  summary line, `… · hardware gpu · …` or `… · software gpu · …`.
- `startGpuCheck(opts: { projectRoot, storageRoot, run: RunCommand })` runs once:
  - it renders 1 s of the sample song with Halo Rings, through `prepareJob` and the same render
    command as exports (Draft)
  - it stores `{ gpu, seconds, at }` on `globalThis`
- `getGpuStatus(): { gpu: "checking" | "hardware" | "software" | "failed"; seconds: number | null }`
- `GET /api/health` returns
  `{ gpu, seconds, storage: storageRoot(), freeBytes }`. It sits behind the gate like
  everything else.
- **`src/instrumentation.ts` `register()`:** when `process.env.NEXT_RUNTIME === "nodejs"` and
  `GPU_CHECK !== "0"`, call `startGpuCheck` without awaiting it. Set `GPU_CHECK=0` in CI and in
  local dev scripts.
- **GPU flags:** `renderGpuArgs(env): string[]` returns `[]` unless `RENDER_GPU === "1"`; then
  the flags settled in the first session (start with `["--browser-gpu"]`). `run-export` adds
  them to the HyperFrames render command.

- [ ] **Step 1: Write the tests:**
  - `parseGpuMode` on the real summary lines from this repo's render logs (copy one hardware
    line; write one software line); garbage gives null.
  - `getGpuStatus` is `checking` before the check finishes; `failed` after a run that throws.
    Use a fake `run`.
  - `renderGpuArgs({})` gives `[]`; `({RENDER_GPU:"1"})` contains `--browser-gpu`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** `RenderStatus` polls `/api/health` every 10 s until the status
  isn't `checking`, then shows the exact copy.
- [ ] **Step 4:** Run `npm run check`, and look at the status line in the local app (with
  `GPU_CHECK` unset it should say `graphics chip` on this PC).
- [ ] **Step 5: Commit:** `feat: start-up GPU check and /api/health`.

### Task 5: The container image

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `.github/workflows/image.yml`,
  `scripts/smoke-image.sh`, `src/lib/repo-hygiene.test.ts` additions

**Dockerfile** (multi-stage):
- **Base:** `nvidia/cuda:12.4.1-runtime-ubuntu22.04`, with
  `ENV NVIDIA_DRIVER_CAPABILITIES=all`.
- **Packages:**
  - Node 22 from NodeSource
  - `ffmpeg` and `python3-venv`
  - `libvulkan1`, `libegl1` and `libgles2`
  - the fonts HyperFrames needs (`fonts-liberation`)
  - Chrome's runtime libraries (or `npx hyperframes browser ensure` with `--with-deps` if the
    CLI offers it; otherwise install Chrome's dependencies from the apt list)
- **Build stage:** `npm ci`, `npm run setup:py`, `npm run template:assets`, `npm run build`.
- **Final stage:** copies the app with `node_modules`, the venv and the Chrome cache. It runs as
  a non-root user, with `ENV STORAGE_DIR=/workspace/storage PORT=3000`, `EXPOSE 3000`, and
  `CMD ["npm","start"]`.
- **`.dockerignore`:** `.git`, `node_modules`, `.next`, `storage`, `test-renders`, `.env*`,
  `.superpowers`, `analyzer/.venv`, `**/*.wav`, `**/*.mp4`, `**/*.mp3`.

**`image.yml`**, on push to `main`, `workflow_dispatch` and push to `feat/online-test` (while
building):
1. `docker/setup-buildx-action`
2. `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN` (`permissions: packages: write`)
3. build with the GitHub Actions cache
4. run `scripts/smoke-image.sh`
5. push `latest` (main only) and `sha-<short>`

**`smoke-image.sh`:**
1. starts the container with `ACCOUNTS` (a test account hashed in the script), `SESSION_SECRET`
   and `GPU_CHECK=0`
2. waits for port 3000
3. checks:
   - `/login` gives 200
   - `/api/songs` without a cookie gives 401
   - logging in through `/api/auth/login` gives 200, and the cookie works on `/api/health`
4. inside the container, runs `npm run render -- halo-rings <generated 3 s tone wav> --start 0 --end 2 --quality draft`
   and checks the MP4 with `ffprobe` (duration ≈ 2 s)
5. exits non-zero on any failure

- [ ] **Step 1: Write the failing test** in `repo-hygiene.test.ts`:
  - `.dockerignore` exists and lists `storage`, `test-renders`, `.env*` and `.git`
  - the Dockerfile contains no `COPY .env` and no `ARG` or `ENV` named like `*SECRET*` or
    `ACCOUNTS`
- [ ] **Step 2:** Run it. Expected: FAIL. Then write the files.
- [ ] **Step 3:** Push and read the `image` workflow run.
  - Expected: the build passes, the smoke test passes, and the `sha-` tag is pushed.
  - Fix and push until it does. Ledger the image size.
- [ ] **Step 4: Commit:** `feat: container image built and smoke-tested by GitHub`.

### Task 6: The owner's guide and docs

**Files:**
- Create: `docs/online-test-guide.md`
- Modify: `CLAUDE.md`, `README.md` (if it lists commands)

- [ ] **Step 1:** Write the guide, following spec §10 step by step. Each step says what it
  costs. Include:
  - **Making the image public:** GitHub → your profile → Packages → `my-first-app` → Package
    settings → Change visibility → Public. If the owner prefers it private, the guide gives
    RunPod's registry-credentials route instead.
  - **The RunPod pod settings:**
    - image `ghcr.io/haoxiongmusic-dev/my-first-app:latest`
    - expose HTTP port 3000
    - network volume mounted at `/workspace`
    - env `ACCOUNTS`, `SESSION_SECRET`, `RENDER_GPU=1`
  - **The link format:** `https://<pod-id>-3000.proxy.runpod.net`.
  - **The first-session check:** the status line or `/api/health`.
  - **What to send Claude if it says software.**
  - **Stop vs terminate, and deleting the volume.**
- [ ] **Step 2: CLAUDE.md:**
  - the status line: the online test version, with its spec and plan
  - Commands: `npm run add-user`, the env variables, CI and the image workflow
  - Key decisions: the login is off without `ACCOUNTS`; `STORAGE_DIR`; secrets only in RunPod's
    settings
- [ ] **Step 3:** Run `npm run check`. **Commit:** `docs: online test guide`.
