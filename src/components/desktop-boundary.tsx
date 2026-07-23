"use client";

import { FileSearch, Monitor } from "lucide-react";
import { useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

function desktopSnapshot() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function")
    return window.matchMedia(DESKTOP_QUERY).matches;
  return window.innerWidth >= 1024;
}

function subscribeToDesktopBoundary(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined;
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function DesktopBoundary({ children }: { children: React.ReactNode }) {
  const desktop = useSyncExternalStore(
    subscribeToDesktopBoundary,
    desktopSnapshot,
    () => false,
  );

  if (!desktop) {
    return (
      <main className="min-h-dvh bg-canvas px-6 py-8">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[8px] bg-ink text-white shadow-panel">
            <FileSearch aria-hidden="true" size={22} />
          </span>
          <h1 className="text-lg font-semibold">简历分析助手</h1>
        </div>
        <div className="mx-auto grid min-h-[calc(100dvh-144px)] max-w-md place-items-center text-center">
          <div>
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-white text-brand shadow-panel">
              <Monitor aria-hidden="true" size={30} />
            </span>
            <p className="mt-6 text-xl font-semibold">请使用电脑浏览器访问</p>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
