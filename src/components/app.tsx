"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AnalysisProgress } from "./analysis-progress";
import { DesktopBoundary } from "./desktop-boundary";
import { UploadScreen } from "./upload-screen";
import { Workspace } from "./workspace/workspace";
import { clearLegacySession } from "@/lib/client/privacy";
import {
  handleRecentAnalysisInvalidation,
  useAppStore,
} from "@/lib/client/store";
import { subscribeRecentAnalysisInvalidations } from "@/lib/client/recent-analysis";

export function App() {
  const stage = useAppStore((state) => state.stage);
  const analysis = useAppStore((state) => state.analysis);
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    clearLegacySession(window.localStorage);
  }, []);

  useEffect(
    () => subscribeRecentAnalysisInvalidations(handleRecentAnalysisInvalidation),
    [],
  );

  useEffect(() => {
    const enforceExpiry = () => {
      void useAppStore.getState().enforceLocalExpiry();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") enforceExpiry();
    };
    enforceExpiry();
    const timer = window.setInterval(enforceExpiry, 60_000);
    window.addEventListener("focus", enforceExpiry);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", enforceExpiry);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!hydrated) {
    return <div className="min-h-dvh bg-canvas" aria-hidden="true" />;
  }

  return (
    <DesktopBoundary>
      {stage === "analyzing" ? (
        <AnalysisProgress />
      ) : stage === "workspace" && analysis ? (
        <Workspace />
      ) : (
        <UploadScreen />
      )}
    </DesktopBoundary>
  );
}
