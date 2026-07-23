"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { FilePenLine, LayoutTemplate } from "lucide-react";
import { DocumentPreview } from "./document-preview";
import { ScorePanel } from "./score-panel";
import { SuggestionReview } from "./suggestion-review";
import { TemplateExport } from "./template-export";
import { useAppStore } from "@/lib/client/store";

export function ResumeWorkspace() {
  const analysis = useAppStore((state) => state.analysis)!;

  return (
    <div className="grid min-h-[calc(100dvh-64px)] grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:grid-cols-[minmax(480px,1.25fr)_minmax(390px,0.75fr)]">
      <h1 data-module-heading tabIndex={-1} className="sr-only">
        简历优化
      </h1>
      <DocumentPreview />
      <aside className="flex max-h-[calc(100dvh-64px)] min-h-[620px] flex-col border-l border-line bg-white">
        <ScorePanel scorecard={analysis.scorecard} />
        <Tabs.Root
          defaultValue="suggestions"
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs.List
            className="grid h-12 shrink-0 grid-cols-2 border-b border-line px-3"
            aria-label="简历审阅视图"
          >
            <Tabs.Trigger
              value="suggestions"
              className="flex items-center justify-center gap-2 border-b-2 border-transparent text-sm font-medium text-muted data-[state=active]:border-brand data-[state=active]:text-brand"
            >
              <FilePenLine aria-hidden="true" size={17} />
              修改建议
            </Tabs.Trigger>
            <Tabs.Trigger
              value="templates"
              className="flex items-center justify-center gap-2 border-b-2 border-transparent text-sm font-medium text-muted data-[state=active]:border-brand data-[state=active]:text-brand"
            >
              <LayoutTemplate aria-hidden="true" size={17} />
              排版预览
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content
            value="suggestions"
            className="flex min-h-0 flex-1 flex-col outline-none"
          >
            <SuggestionReview />
          </Tabs.Content>
          <Tabs.Content
            value="templates"
            className="flex min-h-0 flex-1 flex-col outline-none"
          >
            <TemplateExport />
          </Tabs.Content>
        </Tabs.Root>
      </aside>
    </div>
  );
}
