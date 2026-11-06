# Online test version: step-by-step guide

This puts the app on a rented cloud computer with a graphics chip (RunPod). You and the people
you invite can then use it from any browser, including a phone. It costs money only while the
machine is switched on, plus a little for the storage disk that keeps your files.

You do the account and payment steps (Claude can't). Everything else is ready.

**What it costs, roughly:**
- **The machine:** an RTX A4000-class GPU is about $0.17–0.25 per hour while it's on, billed by
  the second.
- **The storage disk:** about $1–2 per month for 20 GB (RunPod shows the exact price when you
  create it).
- **3–4 test sessions of an hour each:** about $1–2 for the machine.

RunPod usually wants a small prepaid top-up first (often $10). Whatever you don't spend stays in
your account.

---

## 0. Before the first session (once)

### 0.1 Make the app's package public (GitHub)

GitHub builds the app's package (a "container image") automatically. RunPod can download it
only when it's public. It holds just the app's code, which is already public; your songs and
passwords are never in it.

1. Open github.com, click your profile picture → **Your profile** → the **Packages** tab.
2. Open **my-first-app**, then **Package settings** (bottom of the right-hand side).
3. Under **Danger Zone**, choose **Change visibility** → **Public**, and confirm.

The image name is `ghcr.io/haoxiongmusic-dev/my-first-app:latest`. The `latest` tag appears once
this work is merged into `main`. Before that, use the `sha-…` tag Claude gives you (also listed
on the package page).

### 0.2 RunPod account

1. Sign up at runpod.io.
2. Add credit under **Billing**. The minimum is usually $10.

### 0.3 Your accounts and secret (on your PC)

In a terminal in the project folder, make one line per person:

```bash
npm run add-user -- yourname
```

- It asks for a password twice. The password isn't shown, stored, or printed.
- It prints a line like `yourname:scrypt$…`.
- Do the same for each friend (their own username and password), and send them their password
  privately.
- Join the lines with commas: `you:scrypt$…,friend:scrypt$…`. That whole thing is your
  **ACCOUNTS** value.

Then make the session secret (a random text that protects logins):

```bash
node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
```

That's your **SESSION_SECRET**.

Keep both somewhere private (a password manager). **Never put them in the repo:** it's public.

### 0.4 The storage disk (keeps your files between sessions)

1. In RunPod: **Storage** → **New Network Volume**.
2. **Data centre:** pick one that lists **RTX A4000** (or RTX A5000 / RTX 4000 Ada) as
   available. The machine must later run in the same data centre.
3. **Size:** 20 GB. **Name:** `visualizer`. Create it. RunPod shows the monthly price.

---

## 1. Start a session

1. RunPod → **Pods** → **Deploy**.
2. **Network volume:** choose `visualizer`. RunPod then only offers GPUs in that data centre.
3. **GPU:** RTX A4000 (or the cheapest of RTX A5000 / RTX 4000 Ada if it's busy). One GPU.
4. **Template / Container image:** choose **Custom** (or "Edit template") and set:
   - **Container image:** `ghcr.io/haoxiongmusic-dev/my-first-app:latest`
   - **Container disk:** 30 GB
   - **Expose HTTP ports:** `3000`
   - **Volume mount path:** `/workspace`
   - **Environment variables:**

     | Name | Value |
     |---|---|
     | `ACCOUNTS` | your accounts line from 0.3 |
     | `SESSION_SECRET` | your secret from 0.3 |
     | `RENDER_GPU` | `1` |

5. **Deploy.** The first start downloads the package (a few GB), which can take a few minutes.
6. When the pod is **Running**, click **Connect** → **HTTP Service [Port 3000]**. Or open
   `https://<pod-id>-3000.proxy.runpod.net`, where `<pod-id>` is shown on the pod.
   - A **502** error just means the app is still starting. Wait a minute and reload.
7. Log in. Send your friends the same link.

### First session only: is the graphics chip being used?

**The answer:**
- About a minute after starting, the editor's top bar shows
  **Rendering: graphics chip** (good) or **Rendering: software (slow)**.
- You can also open `https://<pod-id>-3000.proxy.runpod.net/api/health` (while logged in).

**If it says software:**
- Exports still work, just more slowly.
- Tell Claude, and paste what `/api/health` shows. Claude adjusts the package for next time.

### Good to know

- **Songs:** use songs **under about 10 minutes** for these tests. The upload waits for the
  song's analysis, and RunPod's web link may give up on requests that take longer than about
  100 seconds (a 60-minute song takes about 2 minutes to analyse). Exports run in the
  background, so long exports are fine.
- **Uploads:** MP3s upload faster than WAVs.
- **Shared space:** everyone shares one space and one export at a time, like on your PC.

---

## 2. End a session (stop paying for the machine)

On the pod, choose **Terminate**, not just Stop.
- **Terminate** removes the machine and stops all GPU charges. Your files stay on the
  `visualizer` storage disk.
- **Stop** keeps the machine reserved and can still cost a little.

The next session starts again at step 1, with the same volume.

---

## 3. When testing is over (stop paying for storage)

1. Download any videos you want to keep: Export panel → download, during a session.
2. RunPod → **Storage** → `visualizer` → **Delete**. This permanently removes your uploaded
   songs and exports from RunPod.
3. Check **Billing**: nothing should be running.
4. Optional: make the GitHub package private again (0.1, choose **Private**).

---

## If something goes wrong

| What you see | What to do |
|---|---|
| A page saying `This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.` | Add `SESSION_SECRET` (step 0.3) to the pod's environment variables and restart the pod |
| `ACCOUNTS entry N is not username:scrypt$…` | Entry number N of ACCOUNTS was pasted wrongly: make that line again with `npm run add-user` |
| `Wrong username or password.` | Check the username (lower case) and password; after 10 wrong tries, wait 10 minutes |
| 502 for more than 5 minutes | Open the pod's **Logs** and send the last lines to Claude |
| The upload fails for a long song | Use a shorter song or an MP3 (see "Good to know") |
| No GPU free in your data centre | Try another GPU type from the list, or another day; or create the volume in a different data centre |
