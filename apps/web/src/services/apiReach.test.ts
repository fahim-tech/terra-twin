import { describe, expect, it } from "vitest";
import { API_PULSE_MS, apiReachability } from "./api";

describe("API reachability", () => {
  const now = 1_000_000;
  it("is ok when the health check answers", () => {
    expect(apiReachability({ isError: false, isSuccess: true }, null, now)).toBe("ok");
  });
  it("stays ok when one health poll fails but another API call answered recently", () => {
    expect(apiReachability({ isError: true, isSuccess: false }, now - 5_000, now)).toBe("ok");
  });
  it("reports down only when health fails and nothing answered within the pulse window", () => {
    expect(apiReachability({ isError: true, isSuccess: false }, now - API_PULSE_MS - 1, now)).toBe("down");
    expect(apiReachability({ isError: true, isSuccess: false }, null, now)).toBe("down");
  });
  it("is checking before the first answer", () => {
    expect(apiReachability({ isError: false, isSuccess: false }, null, now)).toBe("checking");
  });
});
