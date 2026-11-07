// Shader maths that is undefined on some graphics chips must not creep back into a template
// (M7 spec §5.5): pow() of a base that can be negative, and a sin() hash fed huge numbers.
// This PC draws them fine; other GPUs (e.g. the cloud machine's) may not.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const templatesDir = path.join(process.cwd(), "templates");
const pages = readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "shared")
  .map((d) => path.join(templatesDir, d.name, "index.html"));

/** "file:line  text" for every line matching the pattern. */
function offenders(pattern: RegExp): string[] {
  return pages.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) =>
        pattern.test(line)
          ? [`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`]
          : [],
      ),
  );
}

describe("template shaders", () => {
  it("found the templates", () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  it("every GLSL pow() has a base that can't be negative (max, clamp or abs)", () => {
    expect(offenders(/(?<![.\w])pow\(\s*(?!max\(|clamp\(|abs\()/)).toEqual([]);
  });

  it("every sin() hash wraps its input with mod(…, 256.0)", () => {
    expect(offenders(/fract\(sin\(dot\((?!mod\()/)).toEqual([]);
  });
});
