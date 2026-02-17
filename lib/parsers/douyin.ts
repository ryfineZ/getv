import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

/**
 * 抖音视频解析器
 * 使用多种方法尝试解析
 */
export class DouyinParser extends BaseParser {
  readonly platform = 'douyin' as const;
  readonly name = '抖音';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 1. 解析短链接
      const realUrl = await this.resolveShortUrl(url);
      console.log('[Douyin] Real URL:', realUrl);

      // 2. 提取视频 ID
      const videoId = this.extractVideoId(realUrl);
      if (!videoId) {
        return this.createError('无法从 URL 中提取视频 ID');
      }
      console.log('[Douyin] Video ID:', videoId);

      // 3. 尝试多种解析方法 (tikvideo 最可靠，放第一位)
      const methods = [
        () => this.parseWithTikVideo(realUrl),
        () => this.parseWithDouyinWtf(videoId),
        () => this.parseWithSnapTik(url),
        () => this.parseWithTikSave(url),
        () => this.parseWithSSSTik(url),
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result) {
            return this.createSuccess(result);
          }
        } catch (e) {
          console.log('[Douyin] Method failed:', e);
        }
      }

      return this.createError('无法获取视频信息，可能需要登录或视频已删除');
    } catch (error) {
      console.error('[Douyin] Parse error:', error);
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
      if (url.includes('v.douyin.com') || url.includes('vm.douyin.com')) {
        const response = await this.fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          },
        });
        return response.url;
      }
      return url;
    } catch {
      return url;
    }
  }

  /**
   * 提取视频 ID
   */
  private extractVideoId(url: string): string | null {
    // 匹配 /video/123456 或 /note/123456
    const match = url.match(/\/(video|note)\/(\d+)/);
    if (match) return match[2];

    // 匹配 modId=123456
    const modMatch = url.match(/modId=(\d+)/);
    if (modMatch) return modMatch[1];

    return null;
  }

  /**
   * 使用 tikvideo.app API (最可靠)
   */
  private async parseWithTikVideo(url: string): Promise<VideoInfo | null> {
    try {
      const params = new URLSearchParams({
        q: url,
        lang: 'en',
        cftoken: '',
      });

      const response = await this.fetch('https://tikvideo.app/api/ajaxSearch', {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://tikvideo.app/en/download-douyin-video',
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (data.status !== 'ok' || !data.data) {
        return null;
      }

      // 从 HTML 中解析视频信息
      const html = data.data;
      const formats: VideoFormat[] = [];

      // 提取标题
      const titleMatch = html.match(/<h3>([^<]+)<\/h3>/);
      const title = titleMatch ? titleMatch[1].trim() : '抖音视频';

      // 提取时长
      const durationMatch = html.match(/<p>(\d+:\d+)<\/p>/);
      const durationText = durationMatch ? durationMatch[1] : '0:00';
      const duration = this.parseDuration(durationText);

      // 提取缩略图
      const thumbnailMatch = html.match(/<img src="([^"]+)"/);
      const thumbnail = thumbnailMatch ? thumbnailMatch[1].replace(/&amp;/g, '&') : '';

      // 提取下载链接 - 抖音只有一个画质，取第一个有效链接即可
      // 格式: <a ... href="URL" ... class="tik-button-dl ...">...</a>
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*tik-button-dl[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch;

      while ((linkMatch = linkRegex.exec(html)) !== null) {
        const downloadUrl = linkMatch[1].replace(/&amp;/g, '&');
        // 链接文本可能包含 <i> 标签，需要去除
        const rawText = linkMatch[2].replace(/<[^>]*>/g, '').trim();

        // 跳过 MP3 和 Profile 链接
        if (rawText.toLowerCase().includes('mp3') || rawText.toLowerCase().includes('profile')) {
          continue;
        }

        // 抖音视频只有一个画质，取第一个有效链接
        formats.push(this.createFormat({
          id: 'douyin-original',
          quality: '原画',
          format: 'mp4',
          url: downloadUrl,
          hasAudio: true,
          hasVideo: true,
        }));
        break; // 只取第一个
      }

      if (formats.length === 0) {
        return null;
      }

      const videoId = this.extractVideoId(url) || Date.now().toString();

      return {
        id: videoId,
        platform: 'douyin',
        title,
        description: '',
        thumbnail,
        duration,
        durationText: this.formatDuration(duration),
        author: '',
        authorAvatar: '',
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      };
    } catch (error) {
      console.error('[Douyin] TikVideo error:', error);
      return null;
    }
  }

  /**
   * 解析时长字符串 (如 "1:30" -> 90 秒)
   */
  private parseDuration(durationStr: string): number {
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * 使用 douyin.wtf API
   */
  private async parseWithDouyinWtf(videoId: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch(
        `https://api.douyin.wtf/api?url=https://www.douyin.com/video/${videoId}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.url || data.video) {
        const videoUrl = data.url || data.video;
        return {
          id: videoId,
          platform: 'douyin',
          title: data.title || '抖音视频',
          thumbnail: data.cover || data.thumbnail || '',
          duration: 0,
          formats: [this.createFormat({
            id: `douyin-${videoId}`,
            quality: '原画',
            format: 'mp4',
            url: videoUrl,
            hasAudio: true,
            hasVideo: true,
          })],
          originalUrl: `https://www.douyin.com/video/${videoId}`,
          parsedAt: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 使用 SnapTik API
   */
  private async parseWithSnapTik(url: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch('https://snaptik.app/abc2.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
        body: `url=${encodeURIComponent(url)}`,
      });

      const html = await response.text();

      // 从 HTML 中提取视频 URL
      const urlMatch = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);
      if (urlMatch) {
        return {
          id: this.extractVideoId(url) || Date.now().toString(),
          platform: 'douyin',
          title: '抖音视频',
          thumbnail: '',
          duration: 0,
          formats: [this.createFormat({
            id: `douyin-snaptik-${Date.now()}`,
            quality: '原画',
            format: 'mp4',
            url: urlMatch[0].replace(/\\/g, ''),
            hasAudio: true,
            hasVideo: true,
          })],
          originalUrl: url,
          parsedAt: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 使用 TikSave API
   */
  private async parseWithTikSave(url: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch('https://tiksave.io/api/ajaxSearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encodeURIComponent(url)}&lang=zh`,
      });

      const html = await response.text();
      const urlMatch = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);

      if (urlMatch) {
        return {
          id: this.extractVideoId(url) || Date.now().toString(),
          platform: 'douyin',
          title: '抖音视频',
          thumbnail: '',
          duration: 0,
          formats: [this.createFormat({
            id: `douyin-tiksave-${Date.now()}`,
            quality: '原画',
            format: 'mp4',
            url: urlMatch[0].replace(/\\/g, '').replace(/&amp;/g, '&'),
            hasAudio: true,
            hasVideo: true,
          })],
          originalUrl: url,
          parsedAt: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 使用 SSS Tik API
   */
  private async parseWithSSSTik(url: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch('https://ssstik.io/abc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
        body: `url=${encodeURIComponent(url)}`,
      });

      const html = await response.text();
      const urlMatch = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);

      if (urlMatch) {
        return {
          id: this.extractVideoId(url) || Date.now().toString(),
          platform: 'douyin',
          title: '抖音视频',
          thumbnail: '',
          duration: 0,
          formats: [this.createFormat({
            id: `douyin-ssstik-${Date.now()}`,
            quality: '原画',
            format: 'mp4',
            url: urlMatch[1].replace(/&amp;/g, '&'),
            hasAudio: true,
            hasVideo: true,
          })],
          originalUrl: url,
          parsedAt: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
