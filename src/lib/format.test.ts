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
