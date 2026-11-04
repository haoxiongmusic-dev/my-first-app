# Milestone 1: Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, empty Next.js + TypeScript app with formatting, linting, TypeScript and Python test runners, and a "doctor" that checks the PC has every tool the app needs, so milestones 2–7 have a solid base.

**Architecture:** Next.js (App Router, `src/` layout) at the repo root. Reusable server-side helpers live in `src/lib/` (they will be used by the app later, not only by scripts). Developer commands are small TypeScript scripts in `scripts/` run with `tsx`, wired up as `npm run …` so they work the same in PowerShell and Git Bash. The Python analyzer lives in `analyzer/` with its own virtual environment at `analyzer/.venv`.

**Tech Stack:** Node ≥ 22 (this PC: 26), Next.js 16.4.x via `create-next-app`, TypeScript (strict), Tailwind CSS, ESLint (flat config) + `eslint-config-prettier`, Prettier 3, Vitest 4, tsx, Python 3 + NumPy + pytest, HyperFrames **0.9.10** (exact pin).

**Spec:** `docs/superpowers/specs/2026-11-04-music-visualizer-app-design.md` (§5 Technology/Folder layout, §10 Error handling row "Missing FFmpeg / Python / NumPy", §12 Working practices, §13 milestone 1).

**Before you start:** `main` must contain the approved spec. Merge the `docs/design-spec` branch into `main` (via its pull request), then create this milestone's branch from `main`:

```bash
git switch main
git pull
git switch -c feat/m1-project-skeleton
```

## Global Constraints

- Node.js **≥ 22** (`"engines": { "node": ">=22" }`), npm only (no yarn/pnpm), `package-lock.json` committed.
- TypeScript `"strict": true`.
- HyperFrames pinned **exactly** `0.9.10` (no `^`/`~`).
- Python 3 (≥ 3.10) with NumPy; the venv lives at `analyzer/.venv` and is never committed.
- Never commit `storage/`, `test-renders/`, audio or video files, `.env`. The repo is public.
- Commands must work on **Windows** (PowerShell and Git Bash): no bash-only syntax inside `package.json` scripts; on Windows the system Python command is `python` (`python3` is the Microsoft Store stub).
- Every task ends with all existing checks passing, then a commit on `feat/m1-project-skeleton`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Songs of an hour or more** (spec allows up to 60 min): `formatDuration(3600)` must give `"1:00:00"`, not `"60:00"`. Pinned in Task 2.
2. **Python environment not created yet:** `npm run test:py` must say `Python environment not set up. Run: npm run setup:py` and exit 1, not crash with a path error. Pinned in Task 4.
3. **Windows `python3` stub:** on `win32` the system Python command must be `python`. Pinned in Task 4 (`systemPythonCommand("win32") === "python"`).
4. **FFmpeg installed without ffprobe** (or the other way round): the doctor must report each tool separately with its own fix line. Pinned in Task 5.
5. **Wrong HyperFrames version installed** (e.g. someone ran an upgrade): the doctor must flag any version other than `0.9.10`. Pinned in Task 5.

---

### Task 1: Next.js app with a placeholder page

**Files:**
- Create (from scaffold): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/favicon.ico`
- Create: `src/lib/app-info.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `APP_NAME: string` and `APP_TAGLINE: string` exported from `src/lib/app-info.ts`.

- [ ] **Step 1: Scaffold in a temporary folder** (the repo isn't empty, so `create-next-app` can't run in place)

Run from `C:\dev`:
```bash
npx create-next-app@16.4.5 AppProject-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```
Expected: "Success! Created AppProject-scaffold".

- [ ] **Step 2: Copy the scaffold into the repo**

Copy `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs` and the whole `src/` folder from `C:\dev\AppProject-scaffold` into `C:\dev\AppProject`. Do **not** copy its `README.md`, `.git`, `node_modules` or `public/` (the default SVGs are unused). Add to the repo's `.gitignore` any lines from the scaffold's `.gitignore` that aren't already there (expect `*.tsbuildinfo`, `next-env.d.ts`, `.vercel`, `/.pnp`), plus:
```
# App data (songs, analysis, renders): never commit
storage/
```
Then delete `C:\dev\AppProject-scaffold`.

- [ ] **Step 3: Adjust `package.json`**

Set `"name": "my-first-app"`, keep `"private": true`, add `"engines": { "node": ">=22" }`. Confirm `tsconfig.json` has `"strict": true`.

- [ ] **Step 4: Install and replace the default page**

Run `npm install`. Create `src/lib/app-info.ts` with `APP_NAME = "Music Visualizer"` (working title; the owner will name the app later) and `APP_TAGLINE = "Turn your songs into music-reactive videos."`. Rewrite `src/app/page.tsx` as a centred dark page showing `APP_NAME` as an `<h1>` and `APP_TAGLINE` below it, nothing else. In `src/app/layout.tsx` set `metadata.title` to `APP_NAME` and `metadata.description` to `APP_TAGLINE`.

- [ ] **Step 5: Verify build and dev server**

Run: `npm run build`. Expected: "Compiled successfully" and no type errors.
Run: `npm run dev` (in the background), then open `http://localhost:3000`. Expected: the page shows "Music Visualizer" and the tagline. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs src
git commit -m "feat: scaffold Next.js app with placeholder page"
```

---

### Task 2: Vitest and the first real helper (`formatDuration`)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`
- Modify: `package.json` (scripts, devDependencies)

**Interfaces:**
- Produces: `formatDuration(seconds: number): string` in `src/lib/format.ts` (used later by the export panel, timer and song info).

- [ ] **Step 1: Install Vitest and add scripts**

Run: `npm install --save-dev vitest@4`. Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`. Create `vitest.config.ts` with `test.environment = "node"`, `test.include = ["src/**/*.test.ts", "scripts/**/*.test.ts"]`, and `resolve.alias` mapping `@` to `./src` (via `fileURLToPath(new URL("./src", import.meta.url))`).

- [ ] **Step 2: Write the failing test** `src/lib/format.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format";

describe("formatDuration", () => {
  it("formats under a minute", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
  });
  it("drops fractions of a second", () => {
    expect(formatDuration(252.4)).toBe("4:12");
  });
  it("formats album-length songs in minutes", () => {
    expect(formatDuration(2190)).toBe("36:30");
  });
  it("switches to hours at 60 minutes", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("treats invalid input as zero", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`. Expected: FAIL, cannot resolve `@/lib/format`.

- [ ] **Step 4: Implement `formatDuration(seconds: number): string` in `src/lib/format.ts`**

Floor to whole seconds; non-finite or negative → 0. Under an hour: `m:ss`. An hour or more: `h:mm:ss`.

- [ ] **Step 5: Run tests**

Run: `npm test`. Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add Vitest and formatDuration helper"
```

---

### Task 3: Prettier and ESLint working together

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`
- Modify: `eslint.config.mjs`, `package.json`

**Interfaces:**
- Produces: npm scripts `lint`, `format`, `format:check`.

- [ ] **Step 1: Install**

Run: `npm install --save-dev prettier@3 eslint-config-prettier@10`.

- [ ] **Step 2: Configure**

`.prettierrc.json`: `{ "printWidth": 100 }` (Prettier defaults otherwise). `.prettierignore`: `.next`, `node_modules`, `storage`, `test-renders`, `analyzer/.venv`, `docs`, `package-lock.json`. In `eslint.config.mjs`, append `eslint-config-prettier` (`eslint-config-prettier/flat`) as the **last** config entry and add global ignores for `.next/**`, `storage/**`, `test-renders/**`, `analyzer/**`, `templates/**`. Scripts: `"lint": "eslint ."`, `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.

- [ ] **Step 3: Format everything once and verify**

Run: `npm run format`, then `npm run format:check`. Expected: "All matched files use Prettier code style!"
Run: `npm run lint`. Expected: no errors, no warnings.
Run: `npm test`. Expected: still 5 passed.

- [ ] **Step 4: Commit**

```bash
git add .prettierrc.json .prettierignore eslint.config.mjs package.json package-lock.json src vitest.config.ts
git commit -m "chore: add Prettier and make ESLint defer formatting to it"
```

---

### Task 4: Python environment, pytest and the first analyzer helper

**Files:**
- Create: `analyzer/requirements.txt`, `analyzer/pytest.ini`, `analyzer/bands.py`, `analyzer/tests/test_bands.py`
- Create: `src/lib/python.ts`, `src/lib/python.test.ts`
- Create: `scripts/setup-py.ts`, `scripts/py.ts`
- Modify: `package.json`

**Interfaces:**
- Produces (TypeScript, `src/lib/python.ts`):
  - `systemPythonCommand(platform: NodeJS.Platform): string`: `"python"` on `win32`, otherwise `"python3"`.
  - `venvPythonPath(projectRoot: string, platform: NodeJS.Platform): string`: `<root>\analyzer\.venv\Scripts\python.exe` on `win32` (built with `path.win32.join`), `<root>/analyzer/.venv/bin/python` otherwise (`path.posix.join`).
- Produces (Python, `analyzer/bands.py`): `log_band_edges(n_bands: int = 32, fmin: float = 30.0, fmax: float = 16000.0) -> numpy.ndarray`, used by the analyzer in milestone 2 (spec §7: 32 log-spaced bands, 30 Hz–16 kHz).
- Produces npm scripts: `setup:py`, `test:py`.

- [ ] **Step 1: Write the failing TypeScript test** `src/lib/python.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { systemPythonCommand, venvPythonPath } from "@/lib/python";

describe("systemPythonCommand", () => {
  it("uses python on Windows (python3 is the Store stub)", () => {
    expect(systemPythonCommand("win32")).toBe("python");
  });
  it("uses python3 elsewhere", () => {
    expect(systemPythonCommand("linux")).toBe("python3");
    expect(systemPythonCommand("darwin")).toBe("python3");
  });
});

describe("venvPythonPath", () => {
  it("points into Scripts on Windows", () => {
    expect(venvPythonPath("C:\\dev\\AppProject", "win32")).toBe(
      "C:\\dev\\AppProject\\analyzer\\.venv\\Scripts\\python.exe",
    );
  });
  it("points into bin elsewhere", () => {
    expect(venvPythonPath("/home/me/app", "linux")).toBe("/home/me/app/analyzer/.venv/bin/python");
  });
});
```

- [ ] **Step 2: Run it to see it fail, then implement `src/lib/python.ts`**

Run: `npm test`. Expected: FAIL (module missing). Implement both functions as specified in Interfaces. Run `npm test`. Expected: all pass.

- [ ] **Step 3: Python environment scripts**

`analyzer/requirements.txt`: `numpy>=2,<3` and `pytest>=8`. `analyzer/pytest.ini`: `[pytest]`, `testpaths = tests`, `pythonpath = .`.
`scripts/setup-py.ts`: runs `<systemPythonCommand> -m venv analyzer/.venv` (skips if `venvPythonPath` already exists), then `<venvPython> -m pip install -r analyzer/requirements.txt`, streaming output; exits non-zero on failure with a message naming the step that failed.
`scripts/py.ts`: if `venvPythonPath(process.cwd(), process.platform)` doesn't exist, prints exactly `Python environment not set up. Run: npm run setup:py` and exits 1; otherwise runs that Python with the script's own arguments (stdio inherited) and exits with its exit code.
Install `tsx` (`npm install --save-dev tsx@4`). Scripts: `"setup:py": "tsx scripts/setup-py.ts"`, `"test:py": "tsx scripts/py.ts -m pytest -c analyzer/pytest.ini"`.

- [ ] **Step 4: Check the "not set up" message**

With no `analyzer/.venv` yet, run: `npm run test:py`. Expected: prints `Python environment not set up. Run: npm run setup:py`, exit code 1.

- [ ] **Step 5: Create the environment**

Run: `npm run setup:py`. Expected: venv created, NumPy and pytest installed, exit 0. Confirm `git status` does not list `analyzer/.venv`.

- [ ] **Step 6: Write the failing Python test** `analyzer/tests/test_bands.py`

```python
import numpy as np
from bands import log_band_edges

def test_default_has_33_edges_from_30_to_16000():
    edges = log_band_edges()
    assert len(edges) == 33
    assert edges[0] == 30.0
    assert np.isclose(edges[-1], 16000.0)

def test_edges_are_evenly_spaced_in_log_space():
    edges = log_band_edges(8, 100.0, 25600.0)
    ratios = edges[1:] / edges[:-1]
    assert np.allclose(ratios, 2.0)

def test_rejects_invalid_ranges():
    import pytest
    with pytest.raises(ValueError):
        log_band_edges(0)
    with pytest.raises(ValueError):
        log_band_edges(32, 500.0, 100.0)
```

- [ ] **Step 7: Run it to see it fail, then implement `log_band_edges` in `analyzer/bands.py`**

Run: `npm run test:py`. Expected: FAIL (`ModuleNotFoundError: bands`). Implement with `numpy.geomspace(fmin, fmax, n_bands + 1)`; raise `ValueError` if `n_bands < 1`, `fmin <= 0` or `fmax <= fmin`. Run `npm run test:py`. Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add analyzer src/lib/python.ts src/lib/python.test.ts scripts/setup-py.ts scripts/py.ts package.json package-lock.json
git commit -m "feat: add Python environment, pytest and log band edges helper"
```

---

### Task 5: Doctor: check the PC has every tool, and pin HyperFrames

**Files:**
- Create: `src/lib/doctor.ts`, `src/lib/doctor.test.ts`, `scripts/doctor.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `systemPythonCommand`, `venvPythonPath` from `src/lib/python.ts`.
- Produces (`src/lib/doctor.ts`, reused by the app's startup check in milestone 4):
  ```ts
  export type CommandResult = { code: number; stdout: string; stderr: string };
  export type RunCommand = (cmd: string, args: string[]) => Promise<CommandResult>;
  export type ToolCheck = { name: string; ok: boolean; detail: string; fix?: string };
  export const HYPERFRAMES_VERSION = "0.9.10";
  export async function runDoctor(opts: {
    run: RunCommand;
    platform: NodeJS.Platform;
    nodeVersion: string;      // e.g. process.versions.node
    projectRoot: string;
  }): Promise<ToolCheck[]>;
  ```
- Produces npm script `doctor`.

`runDoctor` returns checks in this order, with these names and fixes:

| name | ok when | fix when not ok |
|---|---|---|
| `Node.js` | major version of `nodeVersion` ≥ 22 | `Install Node.js 22 or newer from https://nodejs.org` |
| `FFmpeg` | `ffmpeg -version` exits 0 and stdout starts with `ffmpeg version` | `winget install Gyan.FFmpeg` |
| `ffprobe` | `ffprobe -version` exits 0 and stdout starts with `ffprobe version` | `winget install Gyan.FFmpeg` |
| `Python` | `<systemPythonCommand> --version` exits 0 and prints `Python 3.<minor>` with minor ≥ 10 | `Install Python 3.10+ from https://www.python.org` |
| `Python environment` | `<venvPythonPath> -c "import numpy; print(numpy.__version__)"` exits 0 | `npm run setup:py` |
| `HyperFrames` | `npx --no-install hyperframes --version` exits 0 and stdout contains exactly `0.9.10` | `npm install --save-dev --save-exact hyperframes@0.9.10` |

`detail` is the version found (e.g. `8.1.1`) or a short reason (`not found`, `found 0.9.11, need 0.9.10`). A thrown error from `run` counts as "not found", never as a crash.

- [ ] **Step 1: Pin HyperFrames**

Run: `npm install --save-dev --save-exact hyperframes@0.9.10`. Expected: `package.json` shows `"hyperframes": "0.9.10"` (no `^`).

- [ ] **Step 2: Write the failing tests** `src/lib/doctor.test.ts`

Build a fake `run` from a map of `"cmd args"` → `CommandResult` (unknown commands reject with an `Error`). Tests:

```ts
it("passes on a fully set-up Windows PC", async () => {
  const checks = await runDoctor({ run: fake(ALL_GOOD), platform: "win32", nodeVersion: "26.2.0", projectRoot: "C:\\dev\\AppProject" });
  expect(checks.map((c) => c.name)).toEqual(["Node.js", "FFmpeg", "ffprobe", "Python", "Python environment", "HyperFrames"]);
  expect(checks.every((c) => c.ok)).toBe(true);
});
it("reports ffprobe separately when only FFmpeg is installed", async () => {
  const checks = await runDoctor({ ...base, run: fake(withoutFfprobe) });
  expect(byName(checks, "FFmpeg").ok).toBe(true);
  expect(byName(checks, "ffprobe")).toMatchObject({ ok: false, detail: "not found", fix: "winget install Gyan.FFmpeg" });
});
it("flags the wrong HyperFrames version", async () => {
  const checks = await runDoctor({ ...base, run: fake(withHyperframes("0.9.11")) });
  expect(byName(checks, "HyperFrames")).toMatchObject({ ok: false, detail: "found 0.9.11, need 0.9.10" });
});
it("rejects Node older than 22", async () => {
  const checks = await runDoctor({ ...base, nodeVersion: "20.11.0" });
  expect(byName(checks, "Node.js").ok).toBe(false);
});
it("rejects Python older than 3.10", async () => {
  const checks = await runDoctor({ ...base, run: fake(withPython("Python 3.8.10")) });
  expect(byName(checks, "Python").ok).toBe(false);
});
it("asks for setup:py when the venv has no NumPy", async () => {
  const checks = await runDoctor({ ...base, run: fake(withoutVenv) });
  expect(byName(checks, "Python environment")).toMatchObject({ ok: false, fix: "npm run setup:py" });
});
it("uses `python` on Windows and `python3` elsewhere", async () => { /* assert the fake saw "python --version" for win32 and "python3 --version" for linux */ });
```
(`ALL_GOOD` maps each command in the table to a successful result; `base` is the all-good Windows options object; `byName` finds a check by name.)

- [ ] **Step 3: Run them to see them fail, then implement `runDoctor` in `src/lib/doctor.ts`**

Run: `npm test`. Expected: FAIL (module missing). Implement per the table; run all checks even when an early one fails. Run `npm test`. Expected: all pass.

- [ ] **Step 4: CLI** `scripts/doctor.ts`

Real `run` built on `child_process.execFile` (with `shell: process.platform === "win32"` so `npx` resolves on Windows), calling `runDoctor` with `process.platform`, `process.versions.node`, `process.cwd()`. Prints one line per check: `✓ FFmpeg  8.1.1` or `✗ ffprobe  not found  →  winget install Gyan.FFmpeg`. Exits 1 if any check failed, else 0. Script: `"doctor": "tsx scripts/doctor.ts"`.

- [ ] **Step 5: Run it on this PC**

Run: `npm run doctor`. Expected: six ✓ lines (Node 26.x, FFmpeg 8.1.1, ffprobe 8.1.1, Python 3.14.x, Python environment with NumPy 2.x, HyperFrames 0.9.10), exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/doctor.ts src/lib/doctor.test.ts scripts/doctor.ts package.json package-lock.json
git commit -m "feat: add doctor tool check and pin HyperFrames 0.9.10"
```

---

### Task 6: One "check everything" command, docs, and the pull request

**Files:**
- Modify: `package.json`, `CLAUDE.md` (Commands + Status sections), `README.md` (Getting started)

**Interfaces:**
- Produces npm script `check` (the command to run before every commit from now on).

- [ ] **Step 1: Add the aggregate script**

`"check": "npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:py"` plus `"typecheck": "tsc --noEmit"`. (`&&` works in npm scripts on Windows too.)

- [ ] **Step 2: Run it**

Run: `npm run check`. Expected: lint clean, Prettier clean, no type errors, all Vitest tests pass, 3 pytest tests pass, exit 0.

- [ ] **Step 3: Document the commands**

Replace the "Commands" section of `CLAUDE.md` with a table of: `npm run dev`, `npm run build`, `npm run check`, `npm test`, `npm run test:py`, `npm run lint`, `npm run format`, `npm run doctor`, `npm run setup:py`, each with one plain-language line. Tick M1 in the Status section. In `README.md`, replace the "Getting started" placeholder with: prerequisites (Node 22+, Python 3.10+, FFmpeg), then `npm install`, `npm run setup:py`, `npm run doctor`, `npm run dev`.

- [ ] **Step 4: Final verification**

Run: `npm run check` and `npm run build`. Expected: both exit 0. Run `git status`. Expected: only `CLAUDE.md`, `README.md`, `package.json` changed; nothing from `analyzer/.venv`, `storage/`, `.next/` listed.

- [ ] **Step 5: Commit, push and open the pull request** (push and PR only with the owner's go-ahead)

```bash
git add package.json CLAUDE.md README.md
git commit -m "docs: document project commands and add npm run check"
git push -u origin feat/m1-project-skeleton
gh pr create --title "Milestone 1: project skeleton" --body "<summary of what M1 adds and how it was verified>"
```
