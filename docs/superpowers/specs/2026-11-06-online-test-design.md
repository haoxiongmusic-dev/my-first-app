# Online test version (cloud GPU, invited logins): Design Spec

Date: 2026-11-06
Status: **design approved in chat on 2026-11-06; awaiting the owner's review of this written version**
Builds on: the main spec
([`2026-11-04-music-visualizer-app-design.md`](2026-11-04-music-visualizer-app-design.md)) and
the export pipeline (M5).

## 1. Summary

Make the app reachable online for a few test sessions:
- It runs on a **rented cloud GPU machine** (RunPod or similar). The machine is switched on only
  while testing and billed by the second.
- **Only invited people can use it:** each person logs in with their own username and password.
- **Files are kept between sessions** on a separate storage disk.

The owner's PC version keeps working exactly as today.

## 2. Shared understanding

**What the owner chose (2026-11-06):**

| Choice | Decision |
|---|---|
| Who uses it | **The owner and a few invited people**, with logins. No payments and no public sign-up |
| Where it renders | **All in the cloud**, so it works with the owner's PC switched off |
| Purpose and budget | **Very cheap: try it 3–4 times to prove it works**, then stop |
| Approach | **A rented GPU machine, switched on only while testing** (not a no-GPU server, not a full product) |
| Files | **Kept between sessions** on a storage disk |
| Users | **Share one space**: they can see each other's songs and exports |

**Assumed:**
- RunPod is the provider: per-second billing, an HTTPS link per machine, persistent "network
  volumes", custom container images.
- The owner creates the account and adds payment (Claude can't). Claude writes everything else.

**Success:** the owner, from a phone, opens the link and logs in. They:
1. upload a song
2. pick a template
3. export
4. download the video

An invited friend does the same with their own login. Each session costs well under $1. When
testing ends, the owner terminates the machine and deletes the storage disk, and charges go to
$0.

## 3. Scope

**In:**
- Linux support, verified by running the full test suite on Linux in GitHub Actions.
- A storage-location setting (`STORAGE_DIR`).
- Logins.
- A container image, built and smoke-tested by GitHub Actions and published to the GitHub
  Container Registry.
- A start-up GPU check, shown in the editor.
- A step-by-step owner guide.

**Out:**
- payments and public sign-up
- per-user privacy
- an always-on service
- chunked uploads for very large files
- several exports at once
- moving rendering to HeyGen's hosted `hyperframes cloud render` (a later option, §9)

## 4. Linux support

The app already has Linux branches for the Python path (`src/lib/python.ts`) and for stopping
an export's process tree (`src/lib/exports/processes.ts`).

- **New CI workflow**, `.github/workflows/ci.yml`. On every push and pull request, on
  `ubuntu-latest`, it:
  - installs Node (the version in `package.json` engines, or 22+), FFmpeg and Python 3 + NumPy
  - runs `npm ci`, `npm run setup:py` and `npm run check`
- **Fixing failures:** anything that fails on Linux and not on Windows is fixed in the code, never
  skipped. Likely spots:
  - path joins with backslashes
  - case-sensitive file names
  - the `npx` shell flag
  - tests that assume Windows
- **`npm run doctor`** keeps working on both platforms.

## 5. Storage location

- A single helper `storageRoot(projectRoot = process.cwd())` in `src/lib/storage-root.ts`
  returns `process.env.STORAGE_DIR` when set (made absolute), else `<projectRoot>/storage`.
- Every place that builds `path.join(…, "storage")` uses it instead:
  - the API routes for songs, images and backgrounds
  - the preview route
  - the export manager
  - `run-export`
  - `sample-song-id`
  - `template-assets`
  - `scripts/analyze.ts`
- On the cloud machine `STORAGE_DIR=/workspace/storage`, on the network volume.

## 6. Logins

**Accounts**
- They come from the environment variable `ACCOUNTS`: a comma-separated list of
  `username:scrypt$<salt>$<hash>` entries.
- Passwords are never stored or logged in plain text.
- `npm run add-user -- <username>` asks for a password (hidden) and prints the line to add.

**Sessions**
- **Sign-in:** after a correct login, the server sets an `HttpOnly`, `Secure` (when served over
  HTTPS), `SameSite=Lax` cookie. Its value is `username.expiry.signature`: an HMAC-SHA256 with
  `SESSION_SECRET`.
- **Lifetime:** 7 days.
- **No server-side session store:** the cookie carries the session, so a restart doesn't log
  anyone out.

**What is locked**
- Next.js `middleware.ts` protects every page and every `/api/*` and `/preview/*` route, except
  `/login`, `/api/auth/*` and static assets.
- Pages redirect to `/login?next=…`; API calls get `401` JSON.

**When logins are on**
- They are switched on when `ACCOUNTS` is set.
- With no `ACCOUNTS`, the app runs with no login exactly as today (the owner's PC), and the
  middleware passes everything through.
- If `ACCOUNTS` is set but `SESSION_SECRET` is missing or shorter than 32 characters, the server
  refuses every request with a clear setup error. It never quietly runs unprotected.

**Attempts and log out**
- Wrong passwords answer with the same message and timing for unknown and known users
  (constant-time compare).
- After 10 failures from one IP in 10 minutes, that IP waits 10 minutes.
- A **Log out** item clears the cookie (on the editor's icon rail and the home page).

**Exact copy**
- Login errors: `Wrong username or password.` and `Too many attempts: try again in 10 minutes.`
- Setup error: `This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.`

## 7. The container image

**What's inside**
- **`Dockerfile`** (multi-stage) on a CUDA-capable Ubuntu base, so the NVIDIA driver libraries
  the host injects are usable. It contains:
  - Node 22+
  - FFmpeg
  - Python 3 with the analyzer's virtual environment (NumPy)
  - Chrome for HyperFrames (`npx hyperframes browser ensure` at build time)
  - the Vulkan loader and EGL libraries
  - the app's production build (`npm run build`)
- **Start-up:** `next start -p 3000`.
- **Environment variables:** `ACCOUNTS`, `SESSION_SECRET`, `STORAGE_DIR`.
- **Template sample assets:** generated at build time (`npm run template:assets`).

**Rendering options**
- Renders pass the HyperFrames flags that let Chrome use the NVIDIA GPU (`--browser-gpu`, with
  the Vulkan/ANGLE settings found in the experiment, §9) only when the variable `RENDER_GPU=1`
  is set.
- Otherwise HyperFrames' own auto-detection is used, as today.

**Build and publish**
- `.github/workflows/image.yml`, on pushes to `main` and manual runs:
  1. builds the image
  2. **smoke-tests it** without a GPU: the container starts, `/login` answers 200, `/api/health`
     reports, and a 2-second Draft render of the sample song in software mode produces a
     playable MP4
  3. pushes it to `ghcr.io/haoxiongmusic-dev/my-first-app:latest` and `:sha-<commit>`
- The image is public, like the repo. It contains no songs and no secrets.

## 8. GPU check

- **At start-up** the server runs one quick check in the background: a 1-second render of the
  sample song with Halo Rings. It records whether HyperFrames reported `hardware gpu` or
  `software gpu`, and how long it took.
- **`GET /api/health`** (signed in) returns:

  ```json
  {
    "gpu": "hardware" | "software" | "checking" | "failed",
    "seconds": 12.3,
    "storage": "/workspace/storage",
    "freeBytes": 123
  }
  ```

- **In the editor** a small status line reads one of:
  - `Rendering: graphics chip`
  - `Rendering: software (slow)`
  - `Rendering: checking…`

## 9. The first session doubles as the experiment

The known risk is that Chrome inside a container may not reach the NVIDIA GPU. Without the
right drivers it silently falls back to software (SwiftShader).

1. **First session:** the owner starts the machine and opens `/api/health`, or reads the
   editor's status line.
2. **If it says software:** exports still work, only slower. Claude adjusts the image (driver
   libraries, Chrome flags) and the next session tries again.
3. **If the GPU can't be used after two attempts:** fall back to rendering in software for the
   short test videos. Or, as an option, try HeyGen's hosted `hyperframes cloud render`; that
   needs a HeyGen account and credits, and its price per render is unconfirmed.

## 10. The owner's guide

`docs/online-test-guide.md` covers, step by step and in plain words:
1. creating the RunPod account and adding about $10 of credit
2. creating a ~20 GB network volume (about $1.40/month)
3. deploying a pod from `ghcr.io/haoxiongmusic-dev/my-first-app:latest`, with:
   - a cheap GPU (RTX A4000 class)
   - port 3000 over HTTP
   - the network volume at `/workspace`
   - the environment variables
4. creating the accounts with `npm run add-user`, and the secret
5. opening the link, logging in, and running a test export
6. **stopping or terminating the pod** after each session
7. **deleting the network volume** when testing is over

Each step says what it costs.

## 11. Testing

| What | How |
|---|---|
| Linux | The CI workflow runs `npm run check` (lint, formatting, types, all Vitest and pytest tests) on Ubuntu for every change |
| Storage setting | Vitest: `storageRoot()` with and without `STORAGE_DIR`; relative values are made absolute; a route resolves files under the configured root |
| Passwords | Vitest: hash then verify succeeds, a wrong password fails, a malformed entry is rejected, `ACCOUNTS` parsing (spaces, empty entries) |
| Sessions | Vitest: sign then verify; a tampered, expired or wrong-secret cookie is rejected |
| Middleware | Vitest on the pure decision function: login off when there are no `ACCOUNTS`; pages redirect, API calls get 401; `/login` and assets are open; a missing or short secret gives the setup error |
| Rate limit | Vitest: the 11th failure within 10 minutes is refused, and it clears after 10 minutes (fake clock) |
| Image | GitHub Actions smoke test (§7) |
| GPU check | Vitest: parsing HyperFrames' summary line into `hardware` / `software`; the health payload |
| App | Locally, with `ACCOUNTS`/`SESSION_SECRET` set: log in, use the editor, log out, and a wrong password; then the real RunPod session following the guide |

## 12. Risks

| Risk | Plan |
|---|---|
| The GPU isn't reachable from Chrome in the container | §9: detect it, show it, fix it over sessions; software still works |
| RunPod's HTTPS link limits upload size or time | Test with MP3s or short songs first; chunked uploads are out of scope until needed |
| No cheap GPU free in the volume's data centre | The guide says to pick the volume's region by GPU availability, and lists two fallback GPU types |
| Secrets leak into the public repo or image | Secrets live only in RunPod's environment settings; a test checks the Dockerfile copies no `.env`; `.dockerignore` excludes `storage/`, `test-renders/` and `.env*` |
| The image is large (Chrome, CUDA base) | Acceptable: pulled once per session; the multi-stage build keeps build tools out |
| Charges keep running | The guide stresses stopping pods and deleting the volume; the app's status line shows the GPU type, so it's obvious a paid machine is on |

## 13. Working practices

- **Branch** `feat/online-test`, then a plan, native execution, a fresh final reviewer, a pull
  request, and a merge when the owner says so.
- **Commit rule:** never commit songs, renders, `storage/`, secrets, or real account lines.
- **CLAUDE.md:**
  - add the online test version to the status and roadmap
  - add the new env variables, `npm run add-user`, and the CI and image workflows to Commands
  - note that the login is off when `ACCOUNTS` is unset
