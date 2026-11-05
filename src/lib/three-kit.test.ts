// templates/shared/three-kit.js is three.js plus the add-ons templates use, bundled by
// `npm run build:three` into one plain script (window.THREE_KIT; module.exports under Node).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const kitPath = path.join(process.cwd(), "templates", "shared", "three-kit.js");

type Kit = {
  THREE: {
    REVISION: string;
    UnsignedByteType: number;
    WebGLRenderTarget: new (
      w: number,
      h: number,
      o: { type: number },
    ) => { texture: { type: number } };
  };
  EffectComposer: unknown;
  RenderPass: unknown;
  UnrealBloomPass: unknown;
  OutputPass: unknown;
  RoomEnvironment: unknown;
};

describe("three-kit bundle", () => {
  const kit = require(kitPath) as Kit;

  it("exposes three.js and the add-ons templates use", () => {
    for (const name of [
      "THREE",
      "EffectComposer",
      "RenderPass",
      "UnrealBloomPass",
      "OutputPass",
      "RoomEnvironment",
    ]) {
      expect(kit[name as keyof Kit], name).toBeTruthy();
    }
  });

  it("is three.js 0.187.0 (revision 187)", () => {
    expect(kit.THREE.REVISION).toBe("187");
  });

  it("keeps the three.js MIT licence notice at the top", () => {
    const head = readFileSync(kitPath, "utf8").slice(0, 400);
    expect(head).toContain("MIT");
    expect(head).toContain("three.js");
  });

  it("draws deterministically: no browser random generator or frame loop", () => {
    const source = readFileSync(kitPath, "utf8");
    expect(source).not.toMatch(/Math\.random|requestAnimationFrame|cancelAnimationFrame/);
    expect(source).toContain("__threeKitRandom");
  });

  it("leaves the renderer's frame loop unplugged, so dispose() and stop() can't crash", () => {
    // WebGLRenderer.dispose() calls its animation loop's stop(), which would call the renamed
    // (missing) frame-loop function on the window if the loop were plugged into it.
    const source = readFileSync(kitPath, "utf8");
    expect(source).not.toContain("setContext(self)");
    expect(source).toMatch(/var frameLoopDisabled = function/);
    expect(source).toMatch(/var frameLoopCancelDisabled = function/);
  });

  it("can make 8-bit render targets", () => {
    const { THREE } = kit;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType });
    expect(target.texture.type).toBe(THREE.UnsignedByteType);
  });
});
