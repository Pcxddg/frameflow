export function stripMarkdownCodeFence(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}
