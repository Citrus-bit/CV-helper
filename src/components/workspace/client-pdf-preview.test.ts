// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const renderPdfFirstPage = vi.hoisted(() => vi.fn());

vi.mock("./pdf-first-page-renderer", () => ({ renderPdfFirstPage }));

import { ClientPdfPreview } from "./client-pdf-preview";

const props = {
  artifactSha256: "a".repeat(64),
  iframeSrc: "data:application/pdf;base64,JVBERi0=",
  pdfBase64: "JVBERi0=",
  title: "新版简历 PDF",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientPdfPreview", () => {
  it("marks an artifact only after PDF.js finishes the first-page canvas render", async () => {
    let finishRender: (() => void) | undefined;
    renderPdfFirstPage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRender = resolve;
        }),
    );
    const onVerified = vi.fn();

    render(createElement(ClientPdfPreview, { ...props, onVerified }));
    await waitFor(() => expect(renderPdfFirstPage).toHaveBeenCalledOnce());
    expect(onVerified).not.toHaveBeenCalled();
    expect(
      screen.getByRole("progressbar", { name: "PDF 首屏验证预估进度" }),
    ).toBeInTheDocument();

    finishRender?.();
    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith(props.artifactSha256),
    );
  });

  it("blocks verification on render failure and succeeds only after an explicit retry", async () => {
    renderPdfFirstPage
      .mockRejectedValueOnce(new Error("invalid PDF"))
      .mockResolvedValueOnce({ pageCount: 1, width: 595, height: 842 });
    const onVerified = vi.fn();

    render(createElement(ClientPdfPreview, { ...props, onVerified }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前版本不能确认或下载",
    );
    expect(onVerified).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重新验证" }));
    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith(props.artifactSha256),
    );
  });
});
