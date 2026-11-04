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
