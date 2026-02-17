import type { Platform } from '../types';
import { PLATFORMS } from '../constants';

/**
 * 检测 URL 所属平台
 */
export function detectPlatform(url: string): Platform {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    for (const [platform, config] of Object.entries(PLATFORMS)) {
      if (config.domains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
        return platform as Platform;
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 验证 URL 是否有效
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * 验证是否为支持的视频 URL
 * 允许所有有效 URL，未知平台会尝试用 yt-dlp 解析
 */
export function isSupportedVideoUrl(url: string): boolean {
  return isValidUrl(url);
}

/**
 * 规范化 URL（处理短链接等）
 */
export function normalizeUrl(url: string): string {
  // 移除前后空白
  url = url.trim();

  // 如果没有协议，添加 https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  return url;
}

/**
 * 从 URL 中提取视频 ID
 */
export function extractVideoId(url: string, platform: Platform): string | null {
  try {
    const urlObj = new URL(url);

    switch (platform) {
      case 'youtube': {
        // YouTube: ?v=VIDEO_ID 或 /shorts/VIDEO_ID
        const vParam = urlObj.searchParams.get('v');
        if (vParam) return vParam;

        const shortsMatch = urlObj.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shortsMatch) return shortsMatch[1];

        const embedMatch = urlObj.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
        if (embedMatch) return embedMatch[1];

        return null;
      }

      case 'tiktok': {
        // TikTok: /@username/video/VIDEO_ID
        const match = urlObj.pathname.match(/\/video\/(\d+)/);
        return match ? match[1] : null;
      }

      case 'twitter': {
        // Twitter: /username/status/TWEET_ID
        const match = urlObj.pathname.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
      }

      case 'instagram': {
        // Instagram: /p/POST_ID 或 /reel/REEL_ID
        const pathMatch = urlObj.pathname.match(/\/(p|reel|reels)\/([a-zA-Z0-9_-]+)/);
        return pathMatch ? pathMatch[2] : null;
      }

      case 'douyin': {
        // 抖音: /video/VIDEO_ID 或 /note/NOTE_ID
        const match = urlObj.pathname.match(/\/(video|note)\/(\d+)/);
        return match ? match[2] : null;
      }

      case 'xiaohongshu': {
        // 小红书: /explore/NOTE_ID
        const match = urlObj.pathname.match(/\/explore\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
      }

      case 'bilibili': {
        // Bilibili: /video/BVxxxxxxx 或 /video/avxxxxxxx
        const bvMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
        if (bvMatch) return bvMatch[1];
        const avMatch = urlObj.pathname.match(/\/video\/av(\d+)/);
        if (avMatch) return `av${avMatch[1]}`;
        return null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * 格式化时长
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
