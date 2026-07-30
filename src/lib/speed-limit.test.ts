import { describe, expect, it } from "vitest";
import {
  MIN_STABLE_BT_UPLOAD_LIMIT,
  normalizeSpeedLimit,
  normalizeUploadSpeedLimit,
  speedLimitBytes,
  speedLimitToAria2,
} from "@/lib/speed-limit";

describe("normalizeSpeedLimit", () => {
  it.each([
    ["", "0"],
    ["0", "0"],
    ["1", "1K"],
    ["512 kb/s", "512K"],
    ["1.5MiB", "1.5M"],
    ["2gB", "2G"],
    ["invalid", "0"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeSpeedLimit(input)).toBe(expected);
  });
});

describe("speedLimitBytes", () => {
  it("converts unit-bearing values to bytes per second", () => {
    expect(speedLimitBytes("1K")).toBe(1024);
    expect(speedLimitBytes("1.5M")).toBe(1.5 * 1024 * 1024);
    expect(speedLimitBytes("2G")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("keeps zero as the unlimited sentinel", () => {
    expect(speedLimitBytes("0")).toBe(0);
    expect(speedLimitToAria2("0")).toBe("0");
  });
});

describe("normalizeUploadSpeedLimit", () => {
  it("clamps sub-block BT limits to aria2's stable minimum", () => {
    expect(MIN_STABLE_BT_UPLOAD_LIMIT).toBe(16 * 1024);
    expect(normalizeUploadSpeedLimit("1K")).toBe("16K");
    expect(normalizeUploadSpeedLimit("15.9K")).toBe("16K");
    expect(normalizeUploadSpeedLimit("16K")).toBe("16K");
    expect(normalizeUploadSpeedLimit("1M")).toBe("1M");
    expect(normalizeUploadSpeedLimit("0")).toBe("0");
  });
});
