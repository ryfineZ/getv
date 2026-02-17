import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

// 导入 btch-downloader 的 xiaohongshu 函数
import { xiaohongshu as xhsDl } from 'btch-downloader';

/**
 * 小红书视频解析器
 * 使用 btch-downloader 作为解析源
 */
export class XiaohongshuParser extends BaseParser {
  readonly platform = 'xiaohongshu' as const;
  readonly name = '小红书';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 解析短链接
      const realUrl = await this.resolveShortUrl(url);
      console.log('[Xiaohongshu] Real URL:', realUrl);

      // 提取笔记 ID
      const noteId = this.extractNoteId(realUrl);
      if (!noteId) {
        return this.createError('无法从 URL 中提取笔记 ID');
      }
      console.log('[Xiaohongshu] Note ID:', noteId);

      // 使用真实 URL 进行解析
      const result = await xhsDl(realUrl);

      if (!result || !result.status || !result.result) {
        if (result?.message?.includes('No results')) {
          return this.createError('该笔记可能是图片笔记或已删除，请确认链接是否为视频笔记');
        }
        return this.createError(result?.message || '解析失败，请检查链接是否正确');
      }

      const data = result.result as any; // 使用 any 类型以兼容不同格式的返回数据

      // 提取视频信息
      const title = data.title || data.nickname || data.desc?.substring(0, 100) || '小红书笔记';
      const description = data.desc || '';
      const thumbnail = data.images?.[0] || data.cover || '';

      // 解析时长 (格式: "00:22")
      let duration = 0;
      if (data.duration) {
        const parts = data.duration.split(':').map(Number);
        if (parts.length === 2) {
          duration = parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
          duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      // 提取格式
      const formats: VideoFormat[] = [];

      // btch-downloader 返回的 downloads 数组
      if (data.downloads && Array.isArray(data.downloads)) {
        for (let i = 0; i < data.downloads.length; i++) {
          const download = data.downloads[i];
          if (download.url) {
            formats.push(this.createFormat({
              id: `xhs-${noteId}-${i}`,
              quality: download.quality || `画质 ${i + 1}`,
              format: 'mp4',
              url: download.url,
              hasAudio: true,
              hasVideo: true,
            }));
          }
        }
      }

      // 兼容旧格式
      if (data.video) {
        const videoUrl = typeof data.video === 'string' ? data.video : data.video.url;
        if (videoUrl && formats.length === 0) {
          formats.push(this.createFormat({
            id: `xhs-${noteId}`,
            quality: '原画',
            format: 'mp4',
            url: videoUrl,
            hasAudio: true,
            hasVideo: true,
          }));
        }
      }

      // 如果是纯图片笔记
      if (data.images && data.images.length > 0 && formats.length === 0) {
        return this.createError(`这是一个图片笔记，共 ${data.images.length} 张图片，暂不支持下载图片笔记`);
      }

      if (formats.length === 0) {
        return this.createError('未找到视频下载链接，该笔记可能是图片类型或需要登录');
      }

      return this.createSuccess({
        id: noteId,
        platform: 'xiaohongshu',
        title,
        description,
        thumbnail,
        duration,
        durationText: this.formatDuration(duration),
        author: data.nickname || '',
        authorAvatar: '',
        formats,
        originalUrl: realUrl,
        parsedAt: Date.now(),
      });
    } catch (error) {
      console.error('[Xiaohongshu] Parse error:', error);
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  /**
   * 解析短链接
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // 检测短链接
      if (url.includes('xhslink.com') || url.includes('www.xhslink.com')) {
        console.log('[Xiaohongshu] Resolving short URL:', url);
        const response = await this.fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.0',
          },
        });
        console.log('[Xiaohongshu] Resolved to:', response.url);
        return response.url;
      }
      return url;
    } catch (e) {
      console.error('[Xiaohongshu] resolveShortUrl error:', e);
      return url;
    }
  }

  /**
   * 提取笔记 ID
   */
  private extractNoteId(url: string): string | null {
    // 匹配 /explore/NOTE_ID
    const exploreMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/);
    if (exploreMatch) return exploreMatch[1];

    // 匹配 /discovery/item/NOTE_ID
    const discoveryMatch = url.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
    if (discoveryMatch) return discoveryMatch[1];

    // 匹配 URL 参数中的 noteId 或 note_id
    try {
      const urlObj = new URL(url);
      const noteIdParam = urlObj.searchParams.get('noteId') || urlObj.searchParams.get('note_id');
      if (noteIdParam) return noteIdParam;
    } catch {
      // URL 解析失败，忽略
    }

    return null;
  }
}
