"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FilePenLine,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { renderResume } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import {
  ResumeASTSchema,
  type ResumeAST,
  type ResumeEntry,
  type ResumeSection,
  type ResumeSectionType,
} from "@/lib/domain";
import {
  normalizeBulletText,
  repairResumeAstLineBreaks,
} from "@/lib/resume-line-normalization";

const sectionTypeLabels: Record<ResumeSectionType, string> = {
  summary: "个人简介",
  experience: "工作经历",
  education: "教育背景",
  projects: "项目经历",
  skills: "专业技能",
  certifications: "证书",
  awards: "奖项",
  publications: "出版物",
  languages: "语言能力",
  custom: "自定义",
};

const fieldClass =
  "mt-1.5 min-h-11 w-full rounded-[8px] border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/20";
const iconButtonClass =
  "grid size-11 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-[#eef1f5] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-35";

function uniqueId(prefix: string) {
  const unique =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${unique}`;
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function paragraphText(value: string | undefined) {
  const normalized = value
    ?.split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || undefined;
}

function normalizeEditedResumeAst(ast: ResumeAST): ResumeAST {
  const normalized = structuredClone(ast);
  normalized.contact.name = normalized.contact.name.trim();
  normalized.contact.headline = optionalText(normalized.contact.headline);
  normalized.contact.email = optionalText(normalized.contact.email);
  normalized.contact.phone = optionalText(normalized.contact.phone);
  normalized.contact.location = optionalText(normalized.contact.location);
  normalized.contact.links = normalized.contact.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label && link.url);
  normalized.summary = paragraphText(normalized.summary);
  normalized.sections = normalized.sections.map((section) => ({
    ...section,
    title: section.title.trim(),
    text: paragraphText(section.text),
    entries: section.entries.map((entry) => ({
      ...entry,
      title: entry.title.trim(),
      subtitle: optionalText(entry.subtitle),
      organization: optionalText(entry.organization),
      location: optionalText(entry.location),
      startDate: optionalText(entry.startDate),
      endDate: entry.current ? undefined : optionalText(entry.endDate),
      summary: paragraphText(entry.summary),
      bullets: entry.bullets.map(normalizeBulletText).filter(Boolean),
      keywords: entry.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    })),
  }));
  return ResumeASTSchema.parse(normalized);
}

function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function newEntry(): ResumeEntry {
  return {
    id: uniqueId("entry"),
    title: "",
    current: false,
    bullets: [""],
    keywords: [],
    sourceBlockIds: [],
  };
}

function newSection(): ResumeSection {
  return {
    id: uniqueId("section"),
    type: "custom",
    title: "自定义内容",
    entries: [newEntry()],
    sourceBlockIds: [],
  };
}

function DraftPreview({ ast }: { ast: ResumeAST }) {
  return (
    <div className="h-full overflow-auto bg-[#e9edf2] p-4">
      <div className="mx-auto min-h-[540px] w-full max-w-[360px] bg-white px-7 py-7 shadow-sm">
        <div className="text-center">
          <p className="text-xl font-bold text-[#18201f]">
            {ast.contact.name || "姓名"}
          </p>
          {ast.contact.headline ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-[11px] font-medium text-[#14635b]">
              {ast.contact.headline}
            </p>
          ) : null}
          <p className="mt-2 break-words text-[8px] leading-4 text-[#5e6a68]">
            {[
              ast.contact.email,
              ast.contact.phone,
              ast.contact.location,
              ...ast.contact.links.map((link) => `${link.label}: ${link.url}`),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {ast.summary ? (
          <p className="mt-4 whitespace-pre-line rounded bg-[#f2f7f5] px-3 py-2 text-[9px] leading-[1.65] text-[#18201f]">
            {ast.summary}
          </p>
        ) : null}
        {ast.sections.map((section) => (
          <section key={section.id} className="mt-4">
            <div className="flex items-center gap-2">
              <h4 className="shrink-0 text-[10px] font-bold text-[#14635b]">
                {section.title || "未命名章节"}
              </h4>
              <span className="h-px flex-1 bg-[#ccd8d5]" />
            </div>
            {section.text ? (
              <p className="mt-2 whitespace-pre-line text-[8px] leading-[1.65]">
                {section.text}
              </p>
            ) : null}
            {section.entries.map((entry) => (
              <div key={entry.id} className="mt-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-semibold">
                      {entry.title || "未命名条目"}
                    </p>
                    <p className="text-[8px] text-[#5e6a68]">
                      {[entry.organization, entry.subtitle]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[7px] text-[#5e6a68]">
                    {[entry.startDate, entry.current ? "至今" : entry.endDate]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                {entry.summary ? (
                  <p className="mt-1 text-[8px] leading-[1.65]">
                    {entry.summary}
                  </p>
                ) : null}
                <ul className="mt-1 space-y-1">
                  {entry.bullets.filter(Boolean).map((bullet, index) => (
                    <li
                      key={`${entry.id}-preview-${index}`}
                      className="grid grid-cols-[6px_1fr] gap-1 text-[8px] leading-[1.65]"
                    >
                      <span className="text-[#14635b]">•</span>
                      <span>{normalizeBulletText(bullet)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

type SectionEditorProps = {
  section: ResumeSection;
  sectionIndex: number;
  sectionCount: number;
  update: (section: ResumeSection) => void;
  remove: () => void;
  move: (direction: -1 | 1) => void;
};

function SectionEditor({
  section,
  sectionIndex,
  sectionCount,
  update,
  remove,
  move,
}: SectionEditorProps) {
  function updateEntry(entryIndex: number, entry: ResumeEntry) {
    update({
      ...section,
      entries: section.entries.map((item, index) =>
        index === entryIndex ? entry : item,
      ),
    });
  }

  function removeEntry(entryIndex: number) {
    update({
      ...section,
      entries: section.entries.filter((_, index) => index !== entryIndex),
    });
  }

  function moveEntry(entryIndex: number, direction: -1 | 1) {
    update({
      ...section,
      entries: moveItem(section.entries, entryIndex, direction),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink">编辑章节</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            每条要点独立编辑，输入框内的换行保存时会自动合并。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="上移章节"
            disabled={sectionIndex === 0}
            onClick={() => move(-1)}
            className={iconButtonClass}
          >
            <ArrowUp aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            aria-label="下移章节"
            disabled={sectionIndex === sectionCount - 1}
            onClick={() => move(1)}
            className={iconButtonClass}
          >
            <ArrowDown aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            aria-label="删除章节"
            onClick={remove}
            className={`${iconButtonClass} hover:bg-[#fff0ef] hover:text-danger`}
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs font-medium text-muted">
          章节名称
          <input
            value={section.title}
            onChange={(event) => update({ ...section, title: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-medium text-muted">
          章节类型
          <select
            value={section.type}
            onChange={(event) =>
              update({
                ...section,
                type: event.target.value as ResumeSectionType,
              })
            }
            className={fieldClass}
          >
            {Object.entries(sectionTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-medium text-muted">
        章节说明（可选）
        <textarea
          rows={3}
          value={section.text ?? ""}
          onChange={(event) => update({ ...section, text: event.target.value })}
          className={`${fieldClass} resize-y`}
        />
      </label>

      <div className="space-y-4">
        {section.entries.map((entry, entryIndex) => (
          <div
            key={entry.id}
            className="rounded-[10px] border border-line bg-[#fafbfc] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">条目 {entryIndex + 1}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`上移条目 ${entryIndex + 1}`}
                  disabled={entryIndex === 0}
                  onClick={() => moveEntry(entryIndex, -1)}
                  className={iconButtonClass}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`下移条目 ${entryIndex + 1}`}
                  disabled={entryIndex === section.entries.length - 1}
                  onClick={() => moveEntry(entryIndex, 1)}
                  className={iconButtonClass}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`删除条目 ${entryIndex + 1}`}
                  onClick={() => removeEntry(entryIndex)}
                  className={`${iconButtonClass} hover:bg-[#fff0ef] hover:text-danger`}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted">
                职位 / 项目 / 学历名称
                <input
                  value={entry.title}
                  onChange={(event) =>
                    updateEntry(entryIndex, {
                      ...entry,
                      title: event.target.value,
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-xs font-medium text-muted">
                公司 / 学校 / 组织
                <input
                  value={entry.organization ?? ""}
                  onChange={(event) =>
                    updateEntry(entryIndex, {
                      ...entry,
                      organization: event.target.value,
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-xs font-medium text-muted">
                补充说明
                <input
                  value={entry.subtitle ?? ""}
                  onChange={(event) =>
                    updateEntry(entryIndex, {
                      ...entry,
                      subtitle: event.target.value,
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-xs font-medium text-muted">
                地点
                <input
                  value={entry.location ?? ""}
                  onChange={(event) =>
                    updateEntry(entryIndex, {
                      ...entry,
                      location: event.target.value,
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-xs font-medium text-muted">
                开始时间
                <input
                  value={entry.startDate ?? ""}
                  onChange={(event) =>
                    updateEntry(entryIndex, {
                      ...entry,
                      startDate: event.target.value,
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <label className="text-xs font-medium text-muted">
                  结束时间
                  <input
                    value={entry.endDate ?? ""}
                    disabled={entry.current}
                    onChange={(event) =>
                      updateEntry(entryIndex, {
                        ...entry,
                        endDate: event.target.value,
                      })
                    }
                    className={`${fieldClass} disabled:bg-[#f0f1f3]`}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-xs font-medium text-muted">
                  <input
                    type="checkbox"
                    checked={entry.current}
                    onChange={(event) =>
                      updateEntry(entryIndex, {
                        ...entry,
                        current: event.target.checked,
                      })
                    }
                    className="size-4 accent-[#0969da]"
                  />
                  至今
                </label>
              </div>
            </div>

            <label className="mt-3 block text-xs font-medium text-muted">
              条目摘要（可选）
              <textarea
                rows={2}
                value={entry.summary ?? ""}
                onChange={(event) =>
                  updateEntry(entryIndex, {
                    ...entry,
                    summary: event.target.value,
                  })
                }
                className={`${fieldClass} resize-y`}
              />
            </label>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted">经历要点</p>
                <button
                  type="button"
                  onClick={() =>
                    updateEntry(entryIndex, {
                      ...entry,
                      bullets: [...entry.bullets, ""],
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-3 text-xs font-medium text-brand hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus aria-hidden="true" size={15} />
                  添加要点
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {entry.bullets.map((bullet, bulletIndex) => (
                  <div
                    key={`${entry.id}-bullet-${bulletIndex}`}
                    className="grid grid-cols-[minmax(0,1fr)_44px_44px_44px] items-start gap-1"
                  >
                    <label className="sr-only" htmlFor={`${entry.id}-${bulletIndex}`}>
                      要点 {bulletIndex + 1}
                    </label>
                    <textarea
                      id={`${entry.id}-${bulletIndex}`}
                      rows={2}
                      value={bullet}
                      onChange={(event) =>
                        updateEntry(entryIndex, {
                          ...entry,
                          bullets: entry.bullets.map((item, index) =>
                            index === bulletIndex ? event.target.value : item,
                          ),
                        })
                      }
                      className={`${fieldClass} mt-0 resize-y`}
                    />
                    <button
                      type="button"
                      aria-label={`上移要点 ${bulletIndex + 1}`}
                      disabled={bulletIndex === 0}
                      onClick={() =>
                        updateEntry(entryIndex, {
                          ...entry,
                          bullets: moveItem(entry.bullets, bulletIndex, -1),
                        })
                      }
                      className={iconButtonClass}
                    >
                      <ArrowUp aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`下移要点 ${bulletIndex + 1}`}
                      disabled={bulletIndex === entry.bullets.length - 1}
                      onClick={() =>
                        updateEntry(entryIndex, {
                          ...entry,
                          bullets: moveItem(entry.bullets, bulletIndex, 1),
                        })
                      }
                      className={iconButtonClass}
                    >
                      <ArrowDown aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除要点 ${bulletIndex + 1}`}
                      onClick={() =>
                        updateEntry(entryIndex, {
                          ...entry,
                          bullets: entry.bullets.filter(
                            (_, index) => index !== bulletIndex,
                          ),
                        })
                      }
                      className={`${iconButtonClass} hover:bg-[#fff0ef] hover:text-danger`}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => update({ ...section, entries: [...section.entries, newEntry()] })}
        className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-white px-4 text-sm font-medium text-ink hover:border-[#acd0fb] hover:bg-[#f7faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Plus aria-hidden="true" size={17} />
        添加条目
      </button>
    </div>
  );
}

export function ResumeContentEditor() {
  const analysis = useAppStore((state) => state.analysis)!;
  const selectedTemplate = useAppStore((state) => state.selectedTemplate);
  const applyManualResumeAst = useAppStore(
    (state) => state.applyManualResumeAst,
  );
  const setRender = useAppStore((state) => state.setRender);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ResumeAST>(() =>
    structuredClone(analysis.resume.ast),
  );
  const [initialSignature, setInitialSignature] = useState("");
  const [activeSectionIndex, setActiveSectionIndex] = useState(-1);
  const [repairCount, setRepairCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const draftSignature = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = open && initialSignature !== draftSignature;

  function beginEditing() {
    const repaired = repairResumeAstLineBreaks(analysis.resume);
    setDraft(repaired.ast);
    setInitialSignature(JSON.stringify(analysis.resume.ast));
    setRepairCount(repaired.mergedCount);
    setActiveSectionIndex(-1);
    setError("");
    setOpen(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("还有未保存的简历修改，确定放弃吗？")) {
      return;
    }
    setOpen(false);
  }

  function updateSection(index: number, section: ResumeSection) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((item, sectionIndex) =>
        sectionIndex === index ? section : item,
      ),
    }));
  }

  async function saveAndRender() {
    setError("");
    let normalized: ResumeAST;
    try {
      normalized = normalizeEditedResumeAst(draft);
      if (!normalized.contact.name) throw new Error("请填写姓名。");
      if (normalized.sections.some((section) => !section.title)) {
        throw new Error("每个章节都需要填写名称。");
      }
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "简历内容格式不正确。",
      );
      return;
    }

    setSaving(true);
    const revision = applyManualResumeAst(
      normalized,
      `已直接编辑简历内容${repairCount ? `，并合并 ${repairCount} 处断行` : ""}。`,
    );
    if (revision === null) {
      setSaving(false);
      setOpen(false);
      return;
    }
    setDraft(normalized);
    setInitialSignature(JSON.stringify(normalized));
    try {
      const rendered = await renderResume({
        resumeId: analysis.resume.id,
        revision,
        ast: normalized,
        template: selectedTemplate,
        sourcePageCount: analysis.resume.pageCount,
      });
      setRender(rendered);
      setOpen(false);
    } catch (renderError) {
      setError(
        renderError instanceof Error
          ? `内容已保存，但 PDF 生成失败：${renderError.message}`
          : "内容已保存，但 PDF 生成失败，请在排版预览中重试。",
      );
    } finally {
      setSaving(false);
    }
  }

  const activeSection =
    activeSectionIndex >= 0 ? draft.sections[activeSectionIndex] : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) beginEditing();
        else requestClose();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-[#edf5ff] hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          aria-label="直接编辑简历内容"
          title="直接编辑简历内容"
        >
          <FilePenLine aria-hidden="true" size={18} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            if (dirty || saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (dirty || saving) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(90dvh,900px)] w-[min(1240px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] bg-white shadow-panel focus:outline-none"
        >
          <header className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-b border-line px-5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">
                直接编辑简历
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted">
                所有修改一次保存；AI 编辑仍是可选功能。
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="关闭简历编辑器"
              onClick={requestClose}
              disabled={saving}
              className={iconButtonClass}
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          {repairCount > 0 ? (
            <div
              className="flex min-h-10 shrink-0 items-center gap-2 border-b border-[#cfe8db] bg-[#f1faf5] px-5 text-xs text-success"
              role="status"
            >
              <Check aria-hidden="true" size={15} />
              已在草稿中合并 {repairCount} 处疑似断行，保存前可继续核对。
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(430px,1fr)_minmax(280px,0.62fr)]">
            <nav
              className="min-h-0 overflow-auto border-r border-line bg-[#f8f9fb] p-3"
              aria-label="简历章节"
            >
              <button
                type="button"
                onClick={() => setActiveSectionIndex(-1)}
                aria-current={activeSectionIndex === -1 ? "page" : undefined}
                className={`min-h-11 w-full rounded-[8px] px-3 text-left text-sm font-medium transition-colors ${
                  activeSectionIndex === -1
                    ? "bg-white text-brand shadow-sm"
                    : "text-muted hover:bg-white hover:text-ink"
                }`}
              >
                基本信息
              </button>
              <div className="my-3 h-px bg-line" />
              <div className="space-y-1">
                {draft.sections.map((section, index) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSectionIndex(index)}
                    aria-current={activeSectionIndex === index ? "page" : undefined}
                    className={`min-h-11 w-full rounded-[8px] px-3 text-left text-sm font-medium transition-colors ${
                      activeSectionIndex === index
                        ? "bg-white text-brand shadow-sm"
                        : "text-muted hover:bg-white hover:text-ink"
                    }`}
                  >
                    <span className="block truncate">
                      {section.title || `未命名章节 ${index + 1}`}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const section = newSection();
                  setDraft((current) => ({
                    ...current,
                    sections: [...current.sections, section],
                  }));
                  setActiveSectionIndex(draft.sections.length);
                }}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#9ebad7] bg-white px-3 text-sm font-medium text-brand hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" size={16} />
                添加章节
              </button>
            </nav>

            <main className="min-h-0 overflow-auto px-6 py-5">
              {activeSection ? (
                <SectionEditor
                  section={activeSection}
                  sectionIndex={activeSectionIndex}
                  sectionCount={draft.sections.length}
                  update={(section) =>
                    updateSection(activeSectionIndex, section)
                  }
                  move={(direction) => {
                    setDraft((current) => ({
                      ...current,
                      sections: moveItem(
                        current.sections,
                        activeSectionIndex,
                        direction,
                      ),
                    }));
                    setActiveSectionIndex(activeSectionIndex + direction);
                  }}
                  remove={() => {
                    if (!window.confirm(`删除“${activeSection.title}”章节？`)) {
                      return;
                    }
                    setDraft((current) => ({
                      ...current,
                      sections: current.sections.filter(
                        (_, index) => index !== activeSectionIndex,
                      ),
                    }));
                    setActiveSectionIndex(-1);
                  }}
                />
              ) : (
                <div>
                  <h3 className="text-base font-semibold text-ink">基本信息</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    这些信息会自动进入所选模板的简历页眉。
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <label className="text-xs font-medium text-muted">
                      姓名
                      <input
                        value={draft.contact.name}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              name: event.target.value,
                            },
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted">
                      求职方向 / 个人标题
                      <input
                        value={draft.contact.headline ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              headline: event.target.value,
                            },
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted">
                      邮箱
                      <input
                        type="email"
                        value={draft.contact.email ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              email: event.target.value,
                            },
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted">
                      电话
                      <input
                        type="tel"
                        value={draft.contact.phone ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              phone: event.target.value,
                            },
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted">
                      地点
                      <input
                        value={draft.contact.location ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              location: event.target.value,
                            },
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                  </div>
                  <label className="mt-4 block text-xs font-medium text-muted">
                    个人简介
                    <textarea
                      rows={6}
                      value={draft.summary ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          summary: event.target.value,
                        }))
                      }
                      className={`${fieldClass} resize-y`}
                    />
                  </label>
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted">个人链接</p>
                        <p className="mt-1 text-[11px] leading-4 text-muted">
                          可填写 GitHub、作品集或个人主页。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            contact: {
                              ...current.contact,
                              links: [
                                ...current.contact.links,
                                { label: "GitHub", url: "" },
                              ],
                            },
                          }))
                        }
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-3 text-xs font-medium text-brand hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Plus aria-hidden="true" size={15} />
                        添加链接
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {draft.contact.links.map((link, index) => (
                        <div
                          key={`contact-link-${index}`}
                          className="grid grid-cols-[140px_minmax(0,1fr)_44px] items-end gap-2"
                        >
                          <label className="text-xs font-medium text-muted">
                            名称
                            <input
                              value={link.label}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  contact: {
                                    ...current.contact,
                                    links: current.contact.links.map(
                                      (item, linkIndex) =>
                                        linkIndex === index
                                          ? { ...item, label: event.target.value }
                                          : item,
                                    ),
                                  },
                                }))
                              }
                              className={fieldClass}
                            />
                          </label>
                          <label className="text-xs font-medium text-muted">
                            地址
                            <input
                              type="url"
                              value={link.url}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  contact: {
                                    ...current.contact,
                                    links: current.contact.links.map(
                                      (item, linkIndex) =>
                                        linkIndex === index
                                          ? { ...item, url: event.target.value }
                                          : item,
                                    ),
                                  },
                                }))
                              }
                              className={fieldClass}
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={`删除个人链接 ${index + 1}`}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                contact: {
                                  ...current.contact,
                                  links: current.contact.links.filter(
                                    (_, linkIndex) => linkIndex !== index,
                                  ),
                                },
                              }))
                            }
                            className={`${iconButtonClass} hover:bg-[#fff0ef] hover:text-danger`}
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </main>

            <aside className="min-h-0 overflow-hidden border-l border-line">
              <div className="flex h-11 items-center justify-between border-b border-line bg-white px-4">
                <p className="text-xs font-semibold text-ink">即时排版预览</p>
                <p className="text-[11px] text-muted">最终以真实 PDF 为准</p>
              </div>
              <div className="h-[calc(100%-44px)]">
                <DraftPreview ast={draft} />
              </div>
            </aside>
          </div>

          <footer className="flex min-h-[72px] shrink-0 items-center justify-between gap-4 border-t border-line bg-[#fafafa] px-5">
            <div className="min-w-0 flex-1">
              {error ? (
                <p className="text-xs leading-5 text-danger" role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-xs leading-5 text-muted">
                  保存后会更新本地版本，并只生成一次当前模板 PDF。
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="min-h-11 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#eef1f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveAndRender()}
                disabled={saving || !dirty}
                className="inline-flex min-h-11 min-w-[176px] items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#075bbf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  <LoaderCircle aria-hidden="true" size={17} className="animate-spin" />
                ) : (
                  <Check aria-hidden="true" size={17} />
                )}
                {saving ? "保存并生成中" : "保存并生成 PDF"}
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
