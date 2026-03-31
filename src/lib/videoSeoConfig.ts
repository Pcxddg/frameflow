import type { BoardSeoConfig } from '../types';

export const DEFAULT_BOARD_SEO_TEMPLATE = `[DESCRIPCION SEO DEL VIDEO]

{{descriptionBody}}

🔗 ENLACE AL PRODUCTO:
{{productUrl}}

📲 SIGUEME EN MIS REDES:
Instagram: {{instagramUrl}}
TikTok: {{tiktokUrl}}

✉️ COLABORACIONES:
{{collabEmail}}

{{hashtags}}`;

const DEFAULT_SEO_CONFIG: BoardSeoConfig = {
  descriptionTemplate: DEFAULT_BOARD_SEO_TEMPLATE,
  productUrl: '',
  instagramUrl: 'https://www.instagram.com/pcxdd/',
  tiktokUrl: 'https://www.tiktok.com/@pcxdd',
  collabEmail: 'keanukeanom@gmail.com',
};

const FIELD_LABELS = {
  productUrl: 'link del producto',
  instagramUrl: 'Instagram',
  tiktokUrl: 'TikTok',
  collabEmail: 'correo de colaboraciones',
} as const;

function normalizeValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function resolveBoardSeoConfig(config?: Partial<BoardSeoConfig> | null): BoardSeoConfig {
  return {
    descriptionTemplate: normalizeValue(config?.descriptionTemplate, DEFAULT_SEO_CONFIG.descriptionTemplate),
    productUrl: normalizeValue(config?.productUrl, DEFAULT_SEO_CONFIG.productUrl),
    instagramUrl: normalizeValue(config?.instagramUrl, DEFAULT_SEO_CONFIG.instagramUrl),
    tiktokUrl: normalizeValue(config?.tiktokUrl, DEFAULT_SEO_CONFIG.tiktokUrl),
    collabEmail: normalizeValue(config?.collabEmail, DEFAULT_SEO_CONFIG.collabEmail),
  };
}

export function getMissingBoardSeoConfigFields(config?: Partial<BoardSeoConfig> | null) {
  const resolved = resolveBoardSeoConfig(config);
  const missing: Array<keyof typeof FIELD_LABELS> = [];

  if (!resolved.productUrl.trim()) missing.push('productUrl');
  if (!resolved.instagramUrl.trim()) missing.push('instagramUrl');
  if (!resolved.tiktokUrl.trim()) missing.push('tiktokUrl');
  if (!resolved.collabEmail.trim()) missing.push('collabEmail');

  return missing;
}

export function getBoardSeoMissingLabels(config?: Partial<BoardSeoConfig> | null) {
  return getMissingBoardSeoConfigFields(config).map((field) => FIELD_LABELS[field]);
}

export interface RenderSeoDescriptionInput {
  template: string;
  descriptionBody: string;
  hashtags: string[];
  productUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  collabEmail: string;
}

export function renderSeoDescriptionTemplate(input: RenderSeoDescriptionInput) {
  const tokens: Record<string, string> = {
    descriptionBody: input.descriptionBody.trim() || '[descripcion pendiente]',
    productUrl: input.productUrl.trim() || '[pon aqui el enlace]',
    instagramUrl: input.instagramUrl.trim() || '[instagram pendiente]',
    tiktokUrl: input.tiktokUrl.trim() || '[tiktok pendiente]',
    collabEmail: input.collabEmail.trim() || '[correo pendiente]',
    hashtags: input.hashtags.length ? input.hashtags.join(' ') : '#tag1 #tag2 #tag3',
  };

  return input.template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => tokens[token] ?? '');
}
