import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';

const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
const GEMINI_FLASH_LITE_MODEL = 'gemini-2.0-flash-lite';
const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gemini-3-flash-preview': GEMINI_FLASH_MODEL,
  'gemini-3-pro-preview': GEMINI_PRO_MODEL,
  'gemini-3.1-flash-lite-preview': GEMINI_FLASH_MODEL,
  'gemini-3.1-pro-preview': GEMINI_PRO_MODEL,
  'gemini-2.5-flash-lite': GEMINI_FLASH_LITE_MODEL,
};

function normalizeModel(model: string) {
  return LEGACY_MODEL_ALIASES[model] || model;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePart(part: unknown): Record<string, unknown> | null {
  if (typeof part === 'string') {
    const text = part.trim();
    return text ? { text } : null;
  }

  if (!isRecord(part)) return null;

  if (typeof part.text === 'string' && part.text.trim()) {
    return { text: part.text.trim() };
  }

  if (isRecord(part.inlineData) || isRecord(part.functionCall) || isRecord(part.functionResponse) || isRecord(part.fileData)) {
    return part;
  }

  return null;
}

function normalizeContent(content: unknown, fallbackRole = 'user'): Record<string, unknown> | null {
  if (typeof content === 'string') {
    const text = content.trim();
    if (!text) return null;
    return { role: fallbackRole, parts: [{ text }] };
  }

  if (!isRecord(content)) return null;

  if (Array.isArray(content.parts)) {
    const parts = content.parts.map(normalizePart).filter((part): part is Record<string, unknown> => !!part);
    if (!parts.length) return null;

    return {
      role: typeof content.role === 'string' && content.role.trim() ? content.role.trim() : fallbackRole,
      parts,
    };
  }

  if (typeof content.text === 'string' && content.text.trim()) {
    return {
      role: typeof content.role === 'string' && content.role.trim() ? content.role.trim() : fallbackRole,
      parts: [{ text: content.text.trim() }],
    };
  }

  return null;
}

function normalizeContents(contents: unknown) {
  if (Array.isArray(contents)) {
    return contents
      .map((item) => normalizeContent(item, 'user'))
      .filter((item): item is Record<string, unknown> => !!item);
  }

  const single = normalizeContent(contents, 'user');
  return single ? [single] : [];
}

function normalizeSystemInstruction(systemInstruction: unknown) {
  if (!systemInstruction) return undefined;
  return normalizeContent(systemInstruction, 'system');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await requireUser(request);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY no configurada en Supabase.' }, 503);
    }

    const body = await request.json();
    if (body?.action !== 'generate-content' || !body?.request?.model) {
      return jsonResponse({ error: 'Payload invalido para ai-assist.' }, 400);
    }

    const model = normalizeModel(String(body.request.model));
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const config = isRecord(body.request.config) ? body.request.config : {};
    const contents = normalizeContents(body.request.contents);
    const systemInstruction = normalizeSystemInstruction(body.request.systemInstruction ?? config.systemInstruction);
    const tools = body.request.tools ?? config.tools;

    if (!contents.length) {
      return jsonResponse({ error: 'No se pudo normalizar el contenido enviado a Gemini.' }, 400);
    }

    const geminiBody: Record<string, unknown> = {};
    geminiBody.contents = contents;
    if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
    if (tools) geminiBody.tools = tools;
    if (config.temperature !== undefined || config.topP !== undefined || config.topK !== undefined || config.maxOutputTokens !== undefined || config.responseMimeType !== undefined) {
      geminiBody.generationConfig = {
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.topP !== undefined && { topP: config.topP }),
        ...(config.topK !== undefined && { topK: config.topK }),
        ...(config.maxOutputTokens !== undefined && { maxOutputTokens: config.maxOutputTokens }),
        ...(config.responseMimeType !== undefined && { responseMimeType: config.responseMimeType }),
      };
    }

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return jsonResponse({ error: errText }, geminiResponse.status);
    }

    const data = await geminiResponse.json();

    // Extract text and function calls from response
    let text = '';
    const functionCalls: Array<{ name: string; args?: unknown }> = [];
    const candidates = (data.candidates || []).map((candidate: any) => ({
      finishReason: candidate.finishReason,
      content: candidate.content
        ? {
            role: candidate.content.role,
            parts: (candidate.content.parts || []).map((part: any) => {
              if (part.text) {
                text += part.text;
                return { text: part.text };
              }
              if (part.inlineData) return { inlineData: part.inlineData };
              if (part.functionCall) {
                functionCalls.push({
                  name: part.functionCall.name || '',
                  args: part.functionCall.args,
                });
                return { functionCall: part.functionCall };
              }
              if (part.functionResponse) return { functionResponse: part.functionResponse };
              return part;
            }),
          }
        : undefined,
    }));

    return jsonResponse({ text, functionCalls, candidates, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Missing bearer token|Auth session missing/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
