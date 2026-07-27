// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EstimatedProgressText,
  estimatedProgressAt,
} from "./estimated-progress";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("estimated progress", () => {
  it("increases monotonically and caps at 99 percent", () => {
    expect(estimatedProgressAt(0, 10_000)).toBe(1);
    expect(estimatedProgressAt(5_000, 10_000)).toBeGreaterThan(1);
    expect(estimatedProgressAt(10_000, 10_000)).toBe(99);
    expect(estimatedProgressAt(60_000, 10_000)).toBe(99);
  });

  it("updates while mounted and clears its timer when removed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const view = render(
      createElement(EstimatedProgressText, {
        expectedDurationMs: 10_000,
        label: "测试预估进度",
      }),
    );
    const progress = screen.getByRole("progressbar", {
      name: "测试预估进度",
    });

    expect(progress).toHaveAttribute("aria-valuenow", "1");
    act(() => vi.advanceTimersByTime(5_000));
    expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(progress).toHaveAttribute("aria-valuenow", "99");

    view.unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("starts a new mounted operation from one percent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));
    const renderProgress = () =>
      render(
        createElement(EstimatedProgressText, {
          expectedDurationMs: 10_000,
          label: "重置预估进度",
        }),
      );

    const first = renderProgress();
    act(() => vi.advanceTimersByTime(8_000));
    expect(
      Number(
        screen
          .getByRole("progressbar", { name: "重置预估进度" })
          .getAttribute("aria-valuenow"),
      ),
    ).toBeGreaterThan(1);
    first.unmount();

    const second = renderProgress();
    expect(
      screen.getByRole("progressbar", { name: "重置预估进度" }),
    ).toHaveAttribute("aria-valuenow", "1");
    second.unmount();
  });
});
