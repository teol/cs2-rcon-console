import { describe, it, expect } from "vitest";
import { formatTimestamp, MAX_CONSOLE_LINES } from "./useRcon.ts";
import type { ConsoleLine } from "./useRcon.ts";

describe("formatTimestamp", () => {
  it("formats a timestamp as HH:MM:SS", () => {
    // 2024-03-01 14:05:09 UTC
    const ts = new Date(2024, 2, 1, 14, 5, 9).getTime();
    expect(formatTimestamp(ts)).toBe("14:05:09");
  });

  it("pads single-digit hours, minutes, and seconds with leading zeros", () => {
    const ts = new Date(2024, 0, 1, 3, 7, 2).getTime();
    expect(formatTimestamp(ts)).toBe("03:07:02");
  });

  it("handles midnight correctly", () => {
    const ts = new Date(2024, 0, 1, 0, 0, 0).getTime();
    expect(formatTimestamp(ts)).toBe("00:00:00");
  });

  it("handles end of day correctly", () => {
    const ts = new Date(2024, 0, 1, 23, 59, 59).getTime();
    expect(formatTimestamp(ts)).toBe("23:59:59");
  });
});

describe("MAX_CONSOLE_LINES", () => {
  it("is set to 1000", () => {
    expect(MAX_CONSOLE_LINES).toBe(1000);
  });
});

describe("trimLines (via MAX_CONSOLE_LINES)", () => {
  it("limits console lines to MAX_CONSOLE_LINES", () => {
    // This tests the concept; the actual trimLines function is internal to the hook.
    // We verify the constant is exported correctly and the limit is reasonable.
    const lines: ConsoleLine[] = [];
    for (let i = 0; i < MAX_CONSOLE_LINES + 100; i++) {
      lines.push({ id: i, text: `line ${i}`, type: "system", timestamp: Date.now() });
    }

    // Simulate trimming as done in the hook
    const trimmed = lines.slice(lines.length - MAX_CONSOLE_LINES);
    expect(trimmed).toHaveLength(MAX_CONSOLE_LINES);
    // Oldest lines should be removed
    expect(trimmed[0].id).toBe(100);
    expect(trimmed[trimmed.length - 1].id).toBe(MAX_CONSOLE_LINES + 99);
  });
});
