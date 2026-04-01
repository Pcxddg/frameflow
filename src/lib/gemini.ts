import { GoogleGenAI } from '@google/genai';
import { isSupabaseConfigured, supabase } from './supabase/client';
import { canUseDirectGemini } from './aiRuntime';

export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const GEMINI_FLASH_LITE_MODEL = 'gemini-2.0-flash-lite';
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gemini-3-flash-preview': GEMINI_FLASH_MODEL,
  'gemini-3-pro-preview': GEMINI_PRO_MODEL,
  'gemini-3.1-flash-lite-preview': GEMINI_FLASH_MODEL,
  'gemini-3.1-pro-preview': GEMINI_PRO_MODEL,
  'gemini-2.5-flash-lite': GEMINI_FLASH_LITE_MODEL,
};

const MODEL_FALLBACKS: Record<string, string[]> = {
  [GEMINI_PRO_MODEL]: [GEMINI_FLASH_MODEL, 'gemini-2.0-flash', GEMINI_FLASH_LITE_MODEL],
  [GEMINI_FLASH_MODEL]: ['gemini-2.0-flash', GEMINI_FLASH_LITE_MODEL],
};
const DIRECT_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY?.trim();
const CAN_USE_DIRECT_GEMINI = canUseDirectGemini({
  apiKey: DIRECT_GEMINI_API_KEY,
  isDevelopment: !!import.meta.env.DEV,
});

export interface GeminiGenerateContentRequest {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
  systemInstruction?: unknown;
  tools?: unknown;
}

export interface GeminiGenerateContentResponse {
  text?: string;
  functionCalls?: Array<{ name: string; args?: unknown }>;
  candidates?: Array<{
    content?: {
      parts?: Array<Record<string, unknown>>;
      role?: string;
    };
    finishReason?: string;
  }>;
  model?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDirectGeminiClient() {
  if (!DIRECT_GEMINI_API_KEY) return null;
  return new GoogleGenAI({ apiKey: DIRECT_GEMINI_API_KEY });
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

function readErrorCode(error: unknown) {
  const message = readErrorMessage(error);
  const match = message.match(/"code"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function readErrorStatus(error: unknown) {
  const message = readErrorMessage(error);
  const match = message.match(/"status"\s*:\s*"([^"]+)"/);
  return match ? match[1] : undefined;
}

export function isTransientAiError(error: unknown) {
  const code = readErrorCode(error);
  const status = readErrorStatus(error);
  const message = readErrorMessage(error);

  return (
    code === 429 ||
    code === 502 ||
    code === 500 ||
    code === 503 ||
    code === 504 ||
    status === 'RESOURCE_EXHAUSTED' ||
    status === 'UNAVAILABLE' ||
    status === 'INTERNAL' ||
    status === 'DEADLINE_EXCEEDED' ||
    /high demand|try again later|temporar|unavailable|overloaded|timeout/i.test(message)
  );
}

export function getAiErrorMessage(
  error: unknown,
  fallback = 'La IA no pudo responder en este momento.'
) {
  if (!isSupabaseConfigured() && !CAN_USE_DIRECT_GEMINI) {
    return 'La IA no esta configurada en este entorno. Revisa la conexion con Supabase.';
  }

  if (isTransientAiError(error)) {
    return 'La IA esta con mucha demanda ahora mismo. Intenta otra vez en unos segundos.';
  }

  const code = readErrorCode(error);
  if (code === 401 || code === 403) {
    return 'La IA no pudo autenticarse en el backend. Revisa los secretos del proyecto Supabase.';
  }

  return fallback;
}

function normalizeRequestedModel(model: string) {
  return LEGACY_MODEL_ALIASES[model] || model;
}

function buildModelAttemptList(model: string) {
  const normalizedModel = normalizeRequestedModel(model);
  return [...new Set([normalizedModel, ...(MODEL_FALLBACKS[normalizedModel] || [])])];
}

async function invokeAiAssist(request: GeminiGenerateContentRequest): Promise<GeminiGenerateContentResponse> {
  const { data, error } = await supabase.functions.invoke<GeminiGenerateContentResponse>('ai-assist', {
    body: {
      action: 'generate-content',
      request,
    },
  });

  if (error) {
    throw error;
  }

  return data || {};
}

async function invokeDirectGemini(request: GeminiGenerateContentRequest): Promise<GeminiGenerateContentResponse> {
  const client = getDirectGeminiClient();
  if (!client) {
    throw new Error('VITE_GEMINI_API_KEY no esta configurada para el fallback directo.');
  }

  const requestConfig = isRecord(request.config) ? request.config : {};
  const normalizedConfig: Record<string, unknown> = {
    ...requestConfig,
  };

  if (request.tools !== undefined) {
    normalizedConfig.tools = request.tools;
  } else if (requestConfig.tools !== undefined) {
    normalizedConfig.tools = requestConfig.tools;
  }

  delete normalizedConfig.systemInstruction;

  const response = await client.models.generateContent({
    model: request.model,
    contents: request.contents as any,
    ...(request.systemInstruction !== undefined || requestConfig.systemInstruction !== undefined
      ? { systemInstruction: (request.systemInstruction ?? requestConfig.systemInstruction) as any }
      : {}),
    ...(Object.keys(normalizedConfig).length ? { config: normalizedConfig as any } : {}),
  });

  return {
    text: (response as any).text,
    functionCalls: ((response as any).functionCalls || []).map((call: any) => ({
      name: call.name || '',
      args: call.args,
    })),
    candidates: ((response as any).candidates || []).map((candidate: any) => ({
      content: candidate.content,
      finishReason: candidate.finishReason,
    })),
    model: request.model,
  };
}

export async function generateContentWithRetry(
  request: GeminiGenerateContentRequest,
  options?: { retries?: number }
) {
  if (!isSupabaseConfigured() && !CAN_USE_DIRECT_GEMINI) {
    throw new Error('La IA no esta configurada en este entorno. Revisa la conexion con Supabase.');
  }

  const retries = options?.retries ?? 3;
  let lastError: unknown;
  const modelsToTry = buildModelAttemptList(request.model);

  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex += 1) {
    const model = modelsToTry[modelIndex];

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const requestWithModel = {
          ...request,
          model,
        };

        if (CAN_USE_DIRECT_GEMINI) {
          return await invokeDirectGemini(requestWithModel);
        }

        return await invokeAiAssist(requestWithModel);
      } catch (error) {
        lastError = error;

        if (isTransientAiError(error) && attempt < retries) {
          await sleep(1500 * (attempt + 1) * (attempt + 1));
          continue;
        }

        const hasAnotherModel = modelIndex < modelsToTry.length - 1;
        if (isTransientAiError(error) && hasAnotherModel) {
          console.warn(`Gemini model ${model} unavailable, falling back to ${modelsToTry[modelIndex + 1]}.`);
          break;
        }

        throw error instanceof Error ? error : new Error(readErrorMessage(error));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(readErrorMessage(lastError));
}
