// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginAnalysisRequest,
  cancelAnalysisRequest,
  hasActiveAnalysisRequest,
} from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";

vi.mock("./analysis-progress", () => ({
  AnalysisProgress: () => createElement("div", null, "analysis-progress"),
}));
vi.mock("./upload-screen", () => ({
  UploadScreen: () => createElement("div", null, "upload-screen"),
}));
vi.mock("./workspace/workspace", () => ({
  Workspace: () => createElement("div", null, "workspace"),
}));

import { App } from "./app";

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
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  });
  return (next: boolean) => {
    matches = next;
    listeners.forEach((listener) => listener());
  };
}

afterEach(() => {
  cleanup();
  cancelAnalysisRequest();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("App analysis request lifetime", () => {
  it("keeps analysis alive when the responsive boundary hides progress", async () => {
    const setDesktop = mockDesktopMedia(true);
    beginAnalysisRequest();
    useAppStore.setState({ stage: "analyzing" });
    const view = render(createElement(App));

    await waitFor(() =>
      expect(screen.getByText("analysis-progress")).toBeInTheDocument(),
    );
    expect(hasActiveAnalysisRequest()).toBe(true);

    await act(async () => {
      setDesktop(false);
      await Promise.resolve();
    });

    expect(screen.getByText("请使用电脑浏览器访问")).toBeInTheDocument();
    expect(hasActiveAnalysisRequest()).toBe(true);

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(hasActiveAnalysisRequest()).toBe(false);
  });
});
