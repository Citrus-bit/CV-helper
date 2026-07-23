// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopBoundary } from "./desktop-boundary";

function mockDesktopMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: (_event: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    })),
  });
  return {
    setDesktop(value: boolean) {
      matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesktopBoundary", () => {
  it("shows only the desktop notice and never mounts product children below 1024px", () => {
    mockDesktopMedia(false);
    const Product = vi.fn(() => createElement("div", null, "产品工作台"));

    render(createElement(DesktopBoundary, null, createElement(Product)));

    expect(
      screen.getByRole("heading", { name: "简历分析助手" }),
    ).toBeInTheDocument();
    expect(screen.getByText("请使用电脑浏览器访问")).toBeInTheDocument();
    expect(screen.queryByText("产品工作台")).not.toBeInTheDocument();
    expect(Product).not.toHaveBeenCalled();
  });

  it("mounts the product at 1024px and reacts when the viewport crosses the boundary", () => {
    const media = mockDesktopMedia(true);
    render(
      createElement(
        DesktopBoundary,
        null,
        createElement("div", null, "产品工作台"),
      ),
    );
    expect(screen.getByText("产品工作台")).toBeInTheDocument();

    act(() => media.setDesktop(false));

    expect(screen.queryByText("产品工作台")).not.toBeInTheDocument();
    expect(screen.getByText("请使用电脑浏览器访问")).toBeInTheDocument();
  });
});
