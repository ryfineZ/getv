import type { Platform } from '../types';
import { BaseParser } from './base';
import { YouTubeParser } from './youtube';
import { TikTokParser } from './tiktok';
import { TwitterParser } from './twitter';
import { InstagramParser } from './instagram';
import { DouyinParser } from './douyin';
import { XiaohongshuParser } from './xiaohongshu';
import { WeChatParser } from './wechat';
import { YtDlpParser } from './ytdlp';
import { BtchParser } from './btch';
import { BtchEdgeParser } from './btch-edge';
import { PornHubParser } from './pornhub';
import { GenericParser } from './generic';

// 导出所有解析器
export { BaseParser } from './base';
export { YouTubeParser } from './youtube';
export { TikTokParser } from './tiktok';
export { TwitterParser } from './twitter';
export { InstagramParser } from './instagram';
export { DouyinParser } from './douyin';
export { XiaohongshuParser } from './xiaohongshu';
export { WeChatParser } from './wechat';
export { YtDlpParser } from './ytdlp';
export { BtchParser } from './btch';
export { BtchEdgeParser } from './btch-edge';
export { PornHubParser } from './pornhub';
export { GenericParser } from './generic';

// 解析器映射
const parserMap: Partial<Record<Platform, BaseParser>> = {
  youtube: new YouTubeParser(),
  tiktok: new TikTokParser(),
  twitter: new TwitterParser(),
  instagram: new InstagramParser(),
  douyin: new DouyinParser(),
  xiaohongshu: new XiaohongshuParser(),
  wechat: new WeChatParser(),
  pornhub: new PornHubParser(),
};

// btch-downloader 通用解析器实例（Node.js 环境）
const btchParser = new BtchParser();

// btch-downloader Edge 解析器（Cloudflare Workers 环境）
const btchEdgeParser = new BtchEdgeParser();

// yt-dlp 通用解析器实例（作为最终后备）
const ytdlpParser = new YtDlpParser();

// 需要 btch-downloader 后备的平台
const btchFallbackPlatforms: Platform[] = ['douyin', 'xiaohongshu', 'tiktok', 'instagram'];

// 需要 yt-dlp 后备的平台
const ytdlpFallbackPlatforms: Platform[] = ['youtube', 'douyin', 'xiaohongshu', 'tiktok', 'instagram'];

/**
 * 获取平台对应的解析器
 */
export function getParser(platform: Platform): BaseParser | null {
  return parserMap[platform] || null;
}

/**
 * 检测是否在 Edge 环境（Cloudflare Workers）
 */
function isEdgeEnvironment(): boolean {
  // Cloudflare Workers 有特定的全局对象
  return typeof globalThis !== 'undefined' &&
    // @ts-expect-error Cloudflare specific
    (typeof globalThis.WebSocketPair !== 'undefined' ||
     // @ts-expect-error Cloudflare specific
     typeof globalThis.EmailMessage !== 'undefined' ||
     process.env.NEXT_RUNTIME === 'edge');
}

/**
 * 获取 btch-downloader 后备解析器
 * 在 Cloudflare Workers 环境下使用 Edge 版本
 */
export function getBtchParser(): BtchParser | BtchEdgeParser {
  if (isEdgeEnvironment()) {
    console.log('[Parser] Using BtchEdgeParser for Edge environment');
    return btchEdgeParser;
  }
  return btchParser;
}

/**
 * 获取 yt-dlp 后备解析器
 */
export function getYtdlpParser(): YtDlpParser {
  return ytdlpParser;
}

/**
 * 检查平台是否支持 btch-downloader 后备
 */
export function hasBtchFallback(platform: Platform): boolean {
  return btchFallbackPlatforms.includes(platform);
}

/**
 * 检查平台是否支持 yt-dlp 后备
 */
export function hasYtdlpFallback(platform: Platform): boolean {
  return ytdlpFallbackPlatforms.includes(platform);
}

/**
 * 检查平台是否支持
 */
export function isPlatformSupported(platform: Platform): boolean {
  return platform in parserMap;
}
