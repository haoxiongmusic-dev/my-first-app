// Upload routes check the login themselves, because the proxy must not see their bodies
// (Next copies a body into memory for the proxy and keeps only the first 10 MB).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEEDS_ACCOUNTS_MESSAGE } from "@/lib/auth/gate";
import { hashPassword } from "@/lib/auth/passwords";
import { requireLogin } from "@/lib/auth/require-login";
import { signSession } from "@/lib/auth/session";

const secret = "q".repeat(40);
const env = { ACCOUNTS: `ana:${hashPassword("password123456")}`, SESSION_SECRET: secret };
const put = (cookie?: string) =>
  new Request("http://pod.example/api/songs", {
    method: "PUT",
    headers: cookie ? { cookie: `other=1; mv_session=${cookie}` } : {},
  });

describe("requireLogin (for routes the proxy skips)", () => {
  it("lets everything through when logins are off (the owner's PC)", () => {
    expect(requireLogin(put(), {})).toBeNull();
  });

  it("refuses a signed-out upload with 401, and lets a signed-in one through", async () => {
    const refused = requireLogin(put(), env);
    expect(refused?.status).toBe(401);
    expect(await refused?.json()).toEqual({ error: "Please log in." });
    expect(requireLogin(put(signSession("ana", secret)), env)).toBeNull();
  });

  it("stops the cloud machine when it must have logins but has none", async () => {
    const res = requireLogin(put(), { REQUIRE_LOGIN: "1", ACCOUNTS: " , " });
    expect(res?.status).toBe(500);
    expect(await res?.text()).toBe(NEEDS_ACCOUNTS_MESSAGE);
  });
});

describe("the proxy's matcher", () => {
  const proxySrc = readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
  const source = /matcher:\s*\["(.+)"\]/.exec(proxySrc)?.[1] ?? "";
  // The matcher string as JavaScript sees it (it is written with escaped backslashes).
  const pattern = new RegExp(`^${JSON.parse(`"${source}"`)}$`);
  const gated = (p: string) => pattern.test(p);

  it("skips exactly the upload routes and static files, anchored", () => {
    for (const p of [
      "/api/songs",
      "/api/images",
      "/api/backgrounds",
      "/_next/static/a.js",
      "/favicon.ico",
    ]) {
      expect(gated(p), p).toBe(false);
    }
    for (const p of [
      "/",
      "/edit/halo-rings",
      "/api/songs/abc",
      "/api/images/abc/square.jpg",
      "/api/exports",
      "/_next/image",
      "/_next/imageFoo",
      "/favicon.icoX",
      "/faviconXico/a",
      "/preview/a/b/index.html",
    ]) {
      expect(gated(p), p).toBe(true);
    }
  });

  it("every route that takes an upload body checks the login itself", () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "route.ts") routes.push(full);
      }
    };
    walk(path.join(process.cwd(), "src", "app", "api"));
    const uploads = routes.filter((f) =>
      /export (async )?function PUT[(]/.test(readFileSync(f, "utf8")),
    );
    const names = uploads.map((f) =>
      path.relative(path.join(process.cwd(), "src", "app"), path.dirname(f)).replaceAll("\\", "/"),
    );
    expect(names.sort()).toEqual(["api/backgrounds", "api/images", "api/songs"]);
    for (const f of uploads) {
      const name = names[uploads.indexOf(f)];
      expect(gated(`/${name}`), name).toBe(false); // the proxy leaves its body alone …
      expect(readFileSync(f, "utf8"), name).toContain("requireLogin(request)"); // … and it checks
    }
  });
});
