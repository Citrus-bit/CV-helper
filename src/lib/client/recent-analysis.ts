import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewProgress,
  InterviewPlan,
  InterviewSetupStage,
  JobDraft,
  JobMatchBundle,
} from "./contracts";
import type { ResumeChatContext } from "@/lib/resume-chat";

export const RECENT_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000;
export const RECENT_ANALYSIS_MAX_RECORDS = 10;
export const RECENT_ANALYSIS_MAX_BYTES = 50 * 1024 * 1024;

const DATABASE_NAME = "resume-analysis-assistant";
const DATABASE_VERSION = 2;
const STORE_NAME = "recent-analyses";
const META_STORE_NAME = "recent-analysis-meta";
const GENERATION_KEY = "generation";
const INVALIDATION_CHANNEL_NAME = "resume-analysis-history-v1";
const INVALIDATION_STORAGE_KEY = "resume-analysis-history-event-v1";

export type RecentWorkspaceModule = "resume" | "job" | "interview";
export type RecentTemplateId = "professional" | "minimal" | "compact";

export type RecentAnalysisPayload = {
  analysis: AnalysisBundle;
  jobDraft?: JobDraft;
  jobMatch: JobMatchBundle | null;
  interviewPlan: InterviewPlan | null;
  evaluations: EvaluationResponse[];
  interviewSetupStage?: InterviewSetupStage;
  interviewProgress?: InterviewProgress | null;
  module: RecentWorkspaceModule;
  selectedSuggestionId: string | null;
  selectedTemplate: RecentTemplateId;
  activeResumeVariantId?: string | null;
  resumePanel?: "suggestions" | "chat" | "templates";
  resumeChat?: ResumeChatContext | null;
};

export type RecentAnalysisRecord = {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  originalFileName: string;
  pageCount: number;
  parseMethod: "native" | "ocr" | "mixed";
  resumeRevision: number;
  score: number;
  summary: string;
  summarySource: "ai" | "rules";
  pendingSuggestionCount: number;
  payload: RecentAnalysisPayload;
  pdfBlob?: Blob;
  pdfBytes: number;
  pdfSha256?: string;
  byteSize: number;
};

export type RecentAnalysisSummary = Pick<
  RecentAnalysisRecord,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "expiresAt"
  | "originalFileName"
  | "pageCount"
  | "parseMethod"
  | "resumeRevision"
  | "score"
  | "summary"
  | "summarySource"
  | "pendingSuggestionCount"
> & {
  hasPdf: boolean;
};

export type SaveRecentAnalysisInput = {
  payload: RecentAnalysisPayload;
  expiresAt: string | null;
  pdfBlob?: Blob | null;
  pdfSha256?: string | null;
};

type RecentAnalysisPolicy = {
  maxRecords: number;
  maxBytes: number;
};

export type RecentAnalysisInvalidation = {
  eventId: string;
  kind: "clear" | "delete" | "generation";
  generation: number;
  recordId?: string;
};

export class RecentAnalysisStorageUnavailableError extends Error {
  constructor(message = "浏览器的本机记录存储不可用。") {
    super(message);
    this.name = "RecentAnalysisStorageUnavailableError";
  }
}

export class RecentAnalysisGenerationError extends Error {
  constructor(readonly reason: "stale" | "uninitialized" = "stale") {
    super(
      reason === "uninitialized"
        ? "请先读取本机记录，再保存当前会话。"
        : "本机记录已在另一个标签页中更新，请重试。",
    );
    this.name = "RecentAnalysisGenerationError";
  }
}

const DEFAULT_POLICY: RecentAnalysisPolicy = {
  maxRecords: RECENT_ANALYSIS_MAX_RECORDS,
  maxBytes: RECENT_ANALYSIS_MAX_BYTES,
};

let operationQueue: Promise<unknown> = Promise.resolve();
let observedGeneration: number | null = null;
let invalidationSequence = 0;
let invalidationChannel: BroadcastChannel | null = null;
let invalidationTransportReady = false;
const invalidationListeners = new Set<
  (event: RecentAnalysisInvalidation) => void
>();
const deliveredInvalidationIds = new Set<string>();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function newInvalidationId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isInvalidation(value: unknown): value is RecentAnalysisInvalidation {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RecentAnalysisInvalidation>;
  return Boolean(
    event.eventId &&
    (event.kind === "clear" ||
      event.kind === "delete" ||
      event.kind === "generation") &&
    Number.isInteger(event.generation) &&
    Number(event.generation) >= 0 &&
    (event.kind !== "delete" || event.recordId),
  );
}

function deliverInvalidation(event: RecentAnalysisInvalidation) {
  if (deliveredInvalidationIds.has(event.eventId)) return;
  deliveredInvalidationIds.add(event.eventId);
  invalidationSequence += 1;
  if (deliveredInvalidationIds.size > 100) {
    const oldest = deliveredInvalidationIds.values().next().value;
    if (oldest) deliveredInvalidationIds.delete(oldest);
  }
  observedGeneration = Math.max(observedGeneration ?? 0, event.generation);
  for (const listener of invalidationListeners) listener(event);
}

function ensureInvalidationTransport() {
  if (invalidationTransportReady || typeof window === "undefined") return;
  invalidationTransportReady = true;
  if (typeof globalThis.BroadcastChannel === "function") {
    invalidationChannel = new BroadcastChannel(INVALIDATION_CHANNEL_NAME);
    invalidationChannel.addEventListener("message", (message) => {
      if (isInvalidation(message.data)) deliverInvalidation(message.data);
    });
    return;
  }
  window.addEventListener("storage", (storageEvent) => {
    if (storageEvent.key !== INVALIDATION_STORAGE_KEY || !storageEvent.newValue)
      return;
    try {
      const event: unknown = JSON.parse(storageEvent.newValue);
      if (isInvalidation(event)) deliverInvalidation(event);
    } catch {
      // Ignore malformed events from other same-origin scripts.
    }
  });
}

function publishInvalidation(event: RecentAnalysisInvalidation) {
  ensureInvalidationTransport();
  if (invalidationChannel) {
    invalidationChannel.postMessage(event);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INVALIDATION_STORAGE_KEY,
      JSON.stringify(event),
    );
    window.localStorage.removeItem(INVALIDATION_STORAGE_KEY);
  } catch {
    // The generation check remains authoritative when localStorage is blocked.
  }
}

export function subscribeRecentAnalysisInvalidations(
  listener: (event: RecentAnalysisInvalidation) => void,
): () => void {
  ensureInvalidationTransport();
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    throw new RecentAnalysisStorageUnavailableError();
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  } catch (error) {
    throw new RecentAnalysisStorageUnavailableError(
      error instanceof Error ? error.message : undefined,
    );
  }
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
    if (!request.result.objectStoreNames.contains(META_STORE_NAME)) {
      request.result.createObjectStore(META_STORE_NAME, { keyPath: "key" });
    }
  };
  return requestResult(request);
}

function readAllRecords(
  store: IDBObjectStore,
): Promise<RecentAnalysisRecord[]> {
  return requestResult(store.getAll() as IDBRequest<RecentAnalysisRecord[]>);
}

function replaceAllRecords(
  store: IDBObjectStore,
  records: RecentAnalysisRecord[],
): void {
  store.clear();
  records.forEach((record) => store.put(record));
}

async function readGeneration(store: IDBObjectStore): Promise<number> {
  const result = (await requestResult(store.get(GENERATION_KEY))) as
    { key: string; value: number } | undefined;
  return Number.isInteger(result?.value) && Number(result?.value) >= 0
    ? Number(result?.value)
    : 0;
}

function writeGeneration(store: IDBObjectStore, generation: number) {
  store.put({ key: GENERATION_KEY, value: generation });
}

function writeTransaction(database: IDBDatabase) {
  const transaction = database.transaction(
    [STORE_NAME, META_STORE_NAME],
    "readwrite",
  );
  const done = transactionDone(transaction);
  void done.catch(() => undefined);
  return {
    transaction,
    done,
    records: transaction.objectStore(STORE_NAME),
    metadata: transaction.objectStore(META_STORE_NAME),
  };
}

async function verifyGeneration(
  actualGeneration: number,
  expectedGeneration: number | null,
) {
  if (expectedGeneration === null) {
    if (actualGeneration === 0) {
      observedGeneration = 0;
      return;
    }
    throw new RecentAnalysisGenerationError("uninitialized");
  }
  if (actualGeneration === expectedGeneration) {
    observedGeneration = actualGeneration;
    return;
  }
  const event: RecentAnalysisInvalidation = {
    eventId: newInvalidationId(),
    kind: "generation",
    generation: actualGeneration,
  };
  deliverInvalidation(event);
  throw new RecentAnalysisGenerationError();
}

function withoutBinaryAnalysis(analysis: AnalysisBundle): AnalysisBundle {
  return {
    ...analysis,
    pagePreviews: [],
    originalPdfBase64: undefined,
  };
}

function metadataBytes(
  record: Omit<RecentAnalysisRecord, "byteSize"> | RecentAnalysisRecord,
) {
  const serializable = { ...record, pdfBlob: undefined, byteSize: undefined };
  return new TextEncoder().encode(JSON.stringify(serializable)).byteLength;
}

function withMeasuredSize(
  record: Omit<RecentAnalysisRecord, "byteSize">,
): RecentAnalysisRecord {
  return {
    ...record,
    byteSize: metadataBytes(record) + record.pdfBytes,
  };
}

function recordTimestamp(record: RecentAnalysisRecord) {
  const timestamp = Date.parse(record.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isExpired(record: RecentAnalysisRecord, now: number) {
  const expiry = Date.parse(record.expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function applyRecentAnalysisPolicy(
  records: RecentAnalysisRecord[],
  now = Date.now(),
  policy: RecentAnalysisPolicy = DEFAULT_POLICY,
): RecentAnalysisRecord[] {
  const retained = records
    .filter((record) => !isExpired(record, now))
    .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
    .slice(0, policy.maxRecords)
    .map((record) => ({ ...record }));

  let totalBytes = retained.reduce((sum, record) => sum + record.byteSize, 0);
  if (totalBytes > policy.maxBytes) {
    for (
      let index = retained.length - 1;
      index >= 0 && totalBytes > policy.maxBytes;
      index -= 1
    ) {
      const record = retained[index];
      if (!record.pdfBlob || record.pdfBytes === 0) continue;
      totalBytes -= record.byteSize;
      const withoutPdf = withMeasuredSize({
        ...record,
        pdfBlob: undefined,
        pdfBytes: 0,
      });
      retained[index] = withoutPdf;
      totalBytes += withoutPdf.byteSize;
    }
  }

  while (retained.length > 0 && totalBytes > policy.maxBytes) {
    const removed = retained.pop()!;
    totalBytes -= removed.byteSize;
  }
  return retained;
}

function summaries(records: RecentAnalysisRecord[]): RecentAnalysisSummary[] {
  return records.map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    originalFileName: record.originalFileName,
    pageCount: record.pageCount,
    parseMethod: record.parseMethod,
    resumeRevision: record.resumeRevision,
    score: record.score,
    summary: record.summary,
    summarySource: record.summarySource,
    pendingSuggestionCount: record.pendingSuggestionCount,
    hasPdf: Boolean(record.pdfBlob),
  }));
}

function policyChanged(
  before: RecentAnalysisRecord[],
  after: RecentAnalysisRecord[],
) {
  if (before.length !== after.length) return true;
  const beforeById = new Map(before.map((record) => [record.id, record]));
  return after.some((record) => {
    const previous = beforeById.get(record.id);
    return (
      !previous ||
      previous.byteSize !== record.byteSize ||
      previous.pdfBytes !== record.pdfBytes ||
      Boolean(previous.pdfBlob) !== Boolean(record.pdfBlob)
    );
  });
}

function boundedExpiry(declaredExpiry: string | null, now: number) {
  const maximum = now + RECENT_ANALYSIS_TTL_MS;
  const declared = declaredExpiry ? Date.parse(declaredExpiry) : Number.NaN;
  return new Date(
    Number.isFinite(declared) ? Math.min(declared, maximum) : maximum,
  ).toISOString();
}

export function inferSummarySource(sourceVersion?: string): "ai" | "rules" {
  const source = sourceVersion?.toLowerCase() ?? "";
  return source.includes("provider") ||
    source.includes("ai") ||
    /resume\.score@(?:[2-9]|\d{2,})\./.test(source)
    ? "ai"
    : "rules";
}

function buildRecord(
  input: SaveRecentAnalysisInput,
  existing: RecentAnalysisRecord | undefined,
  now: number,
  measuredPdfSha256?: string,
): RecentAnalysisRecord {
  const analysis = withoutBinaryAnalysis(input.payload.analysis);
  const pdfBlob = input.pdfBlob ?? existing?.pdfBlob;
  return withMeasuredSize({
    id: analysis.resume.id,
    schemaVersion: 1,
    createdAt:
      existing?.createdAt ??
      analysis.resume.createdAt ??
      new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: boundedExpiry(
      input.expiresAt ?? existing?.expiresAt ?? null,
      now,
    ),
    originalFileName: analysis.resume.originalFileName,
    pageCount: analysis.resume.pageCount,
    parseMethod: analysis.resume.parseMethod,
    resumeRevision: analysis.resume.revision,
    score: analysis.scorecard.total,
    summary: analysis.scorecard.summary,
    summarySource: inferSummarySource(analysis.scorecard.sourceVersion),
    pendingSuggestionCount: analysis.suggestions.filter(
      (suggestion) => suggestion.status === "pending",
    ).length,
    payload: { ...input.payload, analysis },
    pdfBlob,
    pdfBytes: pdfBlob?.size ?? 0,
    pdfSha256: measuredPdfSha256 ?? input.pdfSha256 ?? existing?.pdfSha256,
  });
}

async function withDatabase<T>(
  operation: (database: IDBDatabase) => Promise<T>,
) {
  const database = await openDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

export function saveRecentAnalysis(
  input: SaveRecentAnalysisInput,
  now = Date.now(),
): Promise<RecentAnalysisSummary[]> {
  const expectedGeneration = observedGeneration;
  const expectedInvalidationSequence = invalidationSequence;
  return enqueue(async () => {
    const measuredPdfSha256 = input.pdfBlob
      ? await sha256Blob(input.pdfBlob)
      : undefined;
    return withDatabase(async (database) => {
      const stores = writeTransaction(database);
      const [records, generation] = await Promise.all([
        readAllRecords(stores.records),
        readGeneration(stores.metadata),
      ]);
      if (invalidationSequence !== expectedInvalidationSequence)
        throw new RecentAnalysisGenerationError();
      await verifyGeneration(
        generation,
        expectedGeneration ?? observedGeneration,
      );
      const existing = records.find(
        (record) => record.id === input.payload.analysis.resume.id,
      );
      const next = buildRecord(input, existing, now, measuredPdfSha256);
      const retained = applyRecentAnalysisPolicy(
        [...records.filter((record) => record.id !== next.id), next],
        now,
      );
      replaceAllRecords(stores.records, retained);
      await stores.done;
      return summaries(retained);
    });
  });
}

export function listRecentAnalyses(
  now = Date.now(),
): Promise<RecentAnalysisSummary[]> {
  return enqueue(() =>
    withDatabase(async (database) => {
      const stores = writeTransaction(database);
      const [records, generation] = await Promise.all([
        readAllRecords(stores.records),
        readGeneration(stores.metadata),
      ]);
      observedGeneration = generation;
      const retained = applyRecentAnalysisPolicy(records, now);
      if (policyChanged(records, retained))
        replaceAllRecords(stores.records, retained);
      await stores.done;
      return summaries(retained);
    }),
  );
}

export function getRecentAnalysis(
  id: string,
  now = Date.now(),
): Promise<RecentAnalysisRecord | null> {
  return enqueue(() =>
    withDatabase(async (database) => {
      const stores = writeTransaction(database);
      const [records, generation] = await Promise.all([
        readAllRecords(stores.records),
        readGeneration(stores.metadata),
      ]);
      observedGeneration = generation;
      const retained = applyRecentAnalysisPolicy(records, now);
      if (policyChanged(records, retained))
        replaceAllRecords(stores.records, retained);
      await stores.done;
      return retained.find((record) => record.id === id) ?? null;
    }),
  );
}

export function deleteRecentAnalysis(
  id: string,
  now = Date.now(),
): Promise<RecentAnalysisSummary[]> {
  return enqueue(() =>
    withDatabase(async (database) => {
      const stores = writeTransaction(database);
      const [currentRecords, generation] = await Promise.all([
        readAllRecords(stores.records),
        readGeneration(stores.metadata),
      ]);
      const records = applyRecentAnalysisPolicy(currentRecords, now).filter(
        (record) => record.id !== id,
      );
      const nextGeneration = generation + 1;
      replaceAllRecords(stores.records, records);
      writeGeneration(stores.metadata, nextGeneration);
      await stores.done;
      observedGeneration = nextGeneration;
      publishInvalidation({
        eventId: newInvalidationId(),
        kind: "delete",
        generation: nextGeneration,
        recordId: id,
      });
      return summaries(records);
    }),
  );
}

export function clearRecentAnalyses(): Promise<void> {
  return enqueue(() =>
    withDatabase(async (database) => {
      const stores = writeTransaction(database);
      const generation = await readGeneration(stores.metadata);
      const nextGeneration = generation + 1;
      replaceAllRecords(stores.records, []);
      writeGeneration(stores.metadata, nextGeneration);
      await stores.done;
      observedGeneration = nextGeneration;
      publishInvalidation({
        eventId: newInvalidationId(),
        kind: "clear",
        generation: nextGeneration,
      });
    }),
  );
}

export async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new RecentAnalysisStorageUnavailableError(
      "当前浏览器无法校验原 PDF 的完整性。",
    );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function resetObservedGenerationForTests(): void {
  observedGeneration = null;
  invalidationSequence = 0;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            reader.result instanceof ArrayBuffer
              ? resolve(reader.result)
              : reject(new Error("PDF Blob could not be read as bytes."));
          reader.onerror = () =>
            reject(reader.error ?? new Error("PDF Blob could not be read."));
          reader.readAsArrayBuffer(blob);
        });
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export function base64ToPdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "application/pdf" });
}
