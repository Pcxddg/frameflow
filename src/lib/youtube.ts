import { supabase } from './supabase/client';

export interface YouTubeChannelStats {
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  publishedAt: string;
}

export interface YouTubeRecentVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface YouTubeChannelData {
  stats: YouTubeChannelStats | null;
  videos: YouTubeRecentVideo[];
}

const envApiKey = process.env.YOUTUBE_API_KEY?.trim() || '';
let functionUnavailableForSession = false;

function isLocalhost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function getFunctionFallbackMessage() {
  if (isLocalhost()) {
    return 'YouTube no esta disponible en local sin YOUTUBE_API_KEY. Usa la version publicada o agrega la key en tu .env.';
  }

  return 'No se pudieron obtener los datos de YouTube en este momento.';
}

function parseChannelUrl(url: string) {
  try {
    const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    const path = parsedUrl.pathname;

    const channelMatch = path.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id' as const, value: channelMatch[1] };

    const handleMatch = path.match(/\/@([\w.-]+)/);
    if (handleMatch) return { type: 'handle' as const, value: handleMatch[1] };

    const customMatch = path.match(/\/(c|user)\/([\w.-]+)/);
    if (customMatch) return { type: 'username' as const, value: customMatch[2] };

    const simpleMatch = path.match(/^\/([\w.-]+)\/?$/);
    if (simpleMatch && simpleMatch[1] !== 'watch' && simpleMatch[1] !== 'feed') {
      return { type: 'handle' as const, value: simpleMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function resolveChannelId(channelUrl: string, apiKey: string): Promise<string | null> {
  const parsed = parseChannelUrl(channelUrl);
  if (!parsed) return null;
  if (parsed.type === 'id') return parsed.value;

  const lookupParam = parsed.type === 'handle'
    ? `forHandle=${encodeURIComponent(parsed.value)}`
    : `forUsername=${encodeURIComponent(parsed.value)}`;
  const lookupData = await fetchJson<{ items?: Array<{ id: string }> }>(
    `https://www.googleapis.com/youtube/v3/channels?part=id&${lookupParam}&key=${apiKey}`
  );

  if (!lookupData.items?.length) return null;
  return lookupData.items[0].id;
}

async function fetchChannelStats(channelUrl: string, apiKey: string): Promise<YouTubeChannelStats | null> {
  const channelId = await resolveChannelId(channelUrl, apiKey);
  if (!channelId) return null;

  const data = await fetchJson<{
    items?: Array<{
      snippet: {
        title: string;
        description: string;
        customUrl?: string;
        publishedAt?: string;
        thumbnails?: {
          medium?: { url: string };
          default?: { url: string };
        };
      };
      statistics: {
        subscriberCount?: string;
        viewCount?: string;
        videoCount?: string;
      };
    }>;
  }>(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
  );

  if (!data.items?.length) return null;

  const channel = data.items[0];
  return {
    title: channel.snippet.title,
    description: channel.snippet.description,
    customUrl: channel.snippet.customUrl || '',
    thumbnailUrl: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '',
    subscriberCount: parseInt(channel.statistics.subscriberCount || '0', 10),
    viewCount: parseInt(channel.statistics.viewCount || '0', 10),
    videoCount: parseInt(channel.statistics.videoCount || '0', 10),
    publishedAt: channel.snippet.publishedAt || '',
  };
}

async function fetchRecentVideos(channelUrl: string, apiKey: string, maxResults = 8): Promise<YouTubeRecentVideo[]> {
  const channelId = await resolveChannelId(channelUrl, apiKey);
  if (!channelId) return [];

  const searchData = await fetchJson<{
    items?: Array<{ id?: { videoId?: string } }>;
  }>(
    `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${apiKey}`
  );

  const videoIds = (searchData.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean)
    .join(',');

  if (!videoIds) return [];

  const videoData = await fetchJson<{
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        publishedAt: string;
        thumbnails?: {
          medium?: { url: string };
          default?: { url: string };
        };
      };
      statistics: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  }>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
  );

  return (videoData.items || []).map((video) => ({
    id: video.id,
    title: video.snippet.title,
    publishedAt: video.snippet.publishedAt,
    thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url || '',
    viewCount: parseInt(video.statistics.viewCount || '0', 10),
    likeCount: parseInt(video.statistics.likeCount || '0', 10),
    commentCount: parseInt(video.statistics.commentCount || '0', 10),
  }));
}

async function fetchYouTubeChannelDataFromApi(channelUrl: string, apiKey: string): Promise<YouTubeChannelData> {
  const [stats, videos] = await Promise.all([
    fetchChannelStats(channelUrl, apiKey),
    fetchRecentVideos(channelUrl, apiKey),
  ]);

  return { stats, videos };
}

export async function fetchYouTubeChannelData(
  channelUrl: string,
  apiKey?: string
): Promise<YouTubeChannelData> {
  const normalizedUrl = channelUrl.trim();
  if (!normalizedUrl) {
    return { stats: null, videos: [] };
  }

  const resolvedApiKey = apiKey?.trim() || envApiKey;

  if (resolvedApiKey) {
    return fetchYouTubeChannelDataFromApi(normalizedUrl, resolvedApiKey);
  }

  if (isLocalhost() || functionUnavailableForSession) {
    throw new Error(getFunctionFallbackMessage());
  }

  try {
    const { data, error } = await supabase.functions.invoke<YouTubeChannelData>('youtube-channel-data', {
      body: { channelUrl: normalizedUrl },
    });
    if (error) throw error;
    return data || { stats: null, videos: [] };
  } catch (error) {
    functionUnavailableForSession = true;

    throw new Error(
      error instanceof Error && !isLocalhost()
        ? error.message || getFunctionFallbackMessage()
        : getFunctionFallbackMessage()
    );
  }
}
