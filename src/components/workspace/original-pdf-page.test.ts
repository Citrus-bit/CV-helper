// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { renderPdfPage } = vi.hoisted(() => ({ renderPdfPage: vi.fn() }));

vi.mock("./pdf-page-renderer", () => ({ renderPdfPage }));

import { OriginalPdfPage } from "./original-pdf-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = {
  pdfBase64: "JVBERi0=",
  iframeSrc: "data:application/pdf;base64,JVBERi0=",
  pageIndex: 1,
  title: "原始简历 PDF",
  highlights: [
    {
      id: "source-1",
      bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.04 },
    },
  ],
};

describe("OriginalPdfPage", () => {
  it("renders the requested page and shows its exact highlight after PDF.js succeeds", async () => {
    renderPdfPage.mockResolvedValue({ pageCount: 3, width: 612, height: 792 });

    render(createElement(OriginalPdfPage, props));

    await waitFor(() => expect(renderPdfPage).toHaveBeenCalledTimes(1));
    expect(renderPdfPage.mock.calls[0][0]).toBe(props.pdfBase64);
    expect(renderPdfPage.mock.calls[0][1]).toBe(1);
    expect(screen.getByLabelText("当前建议对应的原文位置")).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "50%",
      height: "4%",
    });
    expect(
      screen.queryByTitle("原始简历 PDF（浏览器预览）"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the browser PDF preview without showing a false highlight", async () => {
    renderPdfPage.mockRejectedValue(new Error("render failed"));

    const { rerender } = render(createElement(OriginalPdfPage, props));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "原文定位暂不可用，已显示浏览器 PDF 预览。",
    );
    expect(
      screen.getByTitle("原始简历 PDF（浏览器预览）"),
    ).toHaveAttribute("src", `${props.iframeSrc}#page=2`);
    expect(
      screen.queryByLabelText("当前建议对应的原文位置"),
    ).not.toBeInTheDocument();

    renderPdfPage.mockResolvedValue({ pageCount: 3, width: 612, height: 792 });
    rerender(createElement(OriginalPdfPage, { ...props, pageIndex: 2 }));
    await waitFor(() => expect(renderPdfPage).toHaveBeenCalledTimes(2));
    expect(renderPdfPage.mock.calls[1][1]).toBe(2);
    expect(
      await screen.findByLabelText("当前建议对应的原文位置"),
    ).toBeInTheDocument();
  });
});
