export interface DirectGeminiRuntimeInput {
  apiKey?: string | null;
  isDevelopment: boolean;
}

export function canUseDirectGemini({ apiKey, isDevelopment }: DirectGeminiRuntimeInput) {
  return Boolean(apiKey?.trim()) && isDevelopment;
}
