import type { VideoExecutionSnapshot } from './optimizedVideoFlow';

export type ProductAnalyticsEvent =
  | 'video_created'
  | 'brief_ai_suggested'
  | 'titles_generated'
  | 'script_generated'
  | 'teleprompter_started'
  | 'thumbnail_prompt_generated'
  | 'seo_applied'
  | 'production_stage_completed'
  | 'publish_ready_reached'
  | 'kanban_authoritative_refresh'
  | 'kanban_mutation_failed'
  | 'kanban_save_conflict';

type AnalyticsProvider = 'posthog' | 'debug';

const DISTINCT_ID_KEY = 'ff-product-distinct-id';
const SESSION_ID_KEY = 'ff-product-session-id';
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com').replace(/\/$/, '');
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim();

function safeStorageGet(key: string) {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures and continue in best-effort mode.
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `ff-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getDistinctId() {
  const existing = safeStorageGet(DISTINCT_ID_KEY);
  if (existing) return existing;

  const next = makeId();
  safeStorageSet(DISTINCT_ID_KEY, next);
  return next;
}

function getSessionId() {
  if (typeof window === 'undefined') return makeId();

  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;

    const next = makeId();
    window.sessionStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return makeId();
  }
}

function getProvider(): AnalyticsProvider {
  return POSTHOG_KEY ? 'posthog' : 'debug';
}

function sendToPostHog(event: ProductAnalyticsEvent, properties: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === 'undefined') return;

  const payload = {
    api_key: POSTHOG_KEY,
    event,
    distinct_id: getDistinctId(),
    properties: {
      ...properties,
      $lib: 'frameflow-web',
      $current_url: window.location.href,
      session_id: getSessionId(),
    },
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const endpoint = `${POSTHOG_HOST}/capture/`;

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Best effort only; analytics must never break the product flow.
  });
}

export function trackProductEvent(
  event: ProductAnalyticsEvent,
  properties: Record<string, unknown> = {},
) {
  const provider = getProvider();
  const payload = {
    app: 'frameflow',
    provider,
    recorded_at: new Date().toISOString(),
    ...properties,
  };

  if (provider === 'posthog') {
    sendToPostHog(event, payload);
    return;
  }

  if (import.meta.env.DEV) {
    // Keep a visible trail in development until PostHog is configured.
    console.debug('[frameflow.analytics]', event, payload);
  }
}

export function isExecutionPublishReady(execution: VideoExecutionSnapshot) {
  return execution.readiness.length > 0 && execution.readiness.every((item) => item.status === 'ready');
}

export function buildReadinessPayload(execution: VideoExecutionSnapshot) {
  const readinessKeyMap: Record<string, string> = {
    title: 'title_ready',
    thumbnail: 'thumbnail_ready',
    description: 'description_ready',
    script: 'script_ready',
    production: 'production_ready',
    checklist: 'production_ready',
    publish: 'publish_ready',
  };

  const readiness = Object.fromEntries(
    execution.readiness.map((item) => [readinessKeyMap[item.id] || `${item.id}_ready`, item.status === 'ready'])
  );

  return {
    ...readiness,
    current_stage: execution.currentStage?.id || null,
    next_stage: execution.nextStage?.id || null,
    next_action: execution.nextActionLabel,
  };
}
