import { serve } from 'jsr:@std/http@1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';

interface YouTubeChannelStats {
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  publishedAt: string;
}

interface YouTubeRecentVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
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
  if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);
  return response.json() as Promise<T>;
}

async function resolveChannelId(channelUrl: string, apiKey: string) {
  const parsed = parseChannelUrl(channelUrl);
  if (!parsed) return null;
  if (parsed.type === 'id') return parsed.value;

  const lookupParam = parsed.type === 'handle'
    ? `forHandle=${encodeURIComponent(parsed.value)}`
    : `forUsername=${encodeURIComponent(parsed.value)}`;
  const data = await fetchJson<{ items?: Array<{ id: string }> }>(
    `https://www.googleapis.com/youtube/v3/channels?part=id&${lookupParam}&key=${apiKey}`
  );

  return data.items?.[0]?.id || null;
}

async function fetchChannelStats(channelUrl: string, apiKey: string): Promise<YouTubeChannelStats | null> {
  const channelId = await resolveChannelId(channelUrl, apiKey);
  if (!channelId) return null;

  const data = await fetchJson<any>(
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

  const searchData = await fetchJson<any>(
    `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${apiKey}`
  );

  const videoIds = (searchData.items || []).map((item: any) => item.id?.videoId).filter(Boolean).join(',');
  if (!videoIds) return [];

  const videoData = await fetchJson<any>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
  );

  return (videoData.items || []).map((video: any) => ({
    id: video.id,
    title: video.snippet.title,
    publishedAt: video.snippet.publishedAt,
    thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url || '',
    viewCount: parseInt(video.statistics.viewCount || '0', 10),
    likeCount: parseInt(video.statistics.likeCount || '0', 10),
    commentCount: parseInt(video.statistics.commentCount || '0', 10),
  }));
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireUser(request);

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'YOUTUBE_API_KEY no configurada en Supabase.' }, 503);
    }

    const { channelUrl } = await request.json();
    if (!channelUrl || typeof channelUrl !== 'string') {
      return jsonResponse({ error: 'channelUrl es obligatorio.' }, 400);
    }

    const [stats, videos] = await Promise.all([
      fetchChannelStats(channelUrl, apiKey),
      fetchRecentVideos(channelUrl, apiKey),
    ]);

    return jsonResponse({ stats, videos });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Missing bearer token|Auth session missing/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});

