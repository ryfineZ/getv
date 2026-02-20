/**
 * 下载策略
 * 集中管理"走 FFmpeg VPS"还是"Worker 直接代理"的所有判断逻辑
 */

export type DownloadAction = 'download' | 'merge' | 'trim' | 'extract-audio';

export interface DownloadStrategyInput {
  videoUrl: string;
  audioUrl?: string;
  action?: DownloadAction;
  formatId?: string;
}

/**
 * 判断是否需要经过 FFmpeg VPS 处理
 *
 * 需要 VPS 的情况：
 * - merge：音视频分离流需要合并
 * - trim：视频剪辑需要 ffmpeg
 * - extract-audio：提取音频需要 ffmpeg 转码
 * - m3u8：HLS 流需要 ffmpeg 合流
 * - formatId 存在：YouTube 分离流需要 yt-dlp 下载合并
 */
export function shouldUseFfmpeg(input: DownloadStrategyInput): boolean {
  const { action, videoUrl, audioUrl, formatId } = input;

  if (action === 'merge') return true;
  if (action === 'trim') return true;
  if (action === 'extract-audio') return true;

  // YouTube 分离流：有 formatId 说明需要 yt-dlp 处理
  if (formatId) return true;

  if (videoUrl.includes('.m3u8')) return true;
  if (audioUrl?.includes('.m3u8')) return true;

  return false;
}

/**
 * 根据视频 URL 推断需要附加的 Referer
 * 部分 CDN 有防盗链校验
 */
export function getRefererForUrl(url: string): string | undefined {
  if (url.includes('bilivideo') || url.includes('bilivideo.com')) {
    return 'https://www.bilibili.com/';
  }
  if (url.includes('phncdn') || url.includes('pornhub')) {
    return 'https://www.pornhub.com/';
  }
  if (url.includes('xhscdn') || url.includes('xiaohongshu')) {
    return 'https://www.xiaohongshu.com/';
  }
  return undefined;
}

/**
 * 根据音频格式返回对应的 Content-Type
 */
export function getAudioContentType(format: string): string {
  switch (format) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'aac': return 'audio/aac';
    case 'm4a': return 'audio/mp4';
    default: return `audio/${format}`;
  }
}
