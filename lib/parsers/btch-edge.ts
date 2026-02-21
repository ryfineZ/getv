import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

/**
 * btch-downloader Edge 版本
 * 直接调用 btch 后端 API，兼容 Cloudflare Workers
 */
const BTCH_API = 'https://backend1.tioo.eu.org';

export class BtchEdgeParser extends BaseParser {
  readonly platform = 'youtube' as const;
  readonly name = 'btch-edge';

  async parse(url: string): Promise<ParseResult> {
    try {
      console.log('[BtchEdge] Parsing:', url);

      const platform = this.detectPlatform(url);
      let endpoint = '';

      switch (platform) {
        case 'xiaohongshu':
          endpoint = 'rednote';
          break;
        case 'douyin':
          endpoint = 'douyin';
          break;
        case 'tiktok':
          endpoint = 'ttdl';
          break;
        case 'instagram':
          endpoint = 'igdl';
          break;
        case 'twitter':
          endpoint = 'twitter';
          break;
        case 'youtube':
          endpoint = 'youtube';
          break;
        default:
          endpoint = 'aio';
      }

      const apiUrl = `${BTCH_API}/${endpoint}?url=${encodeURIComponent(url)}`;
      console.log('[BtchEdge] API URL:', apiUrl);

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
      });

      if (!response.ok) {
        return this.createError(`API 请求失败: HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      console.log('[BtchEdge] Response:', JSON.stringify(data).substring(0, 200));

      // 处理小红书格式
      if (data.noteId || data.result?.noteId) {
        return this.parseXiaohongshu(data, url);
      }

      // 处理抖音格式
      if (data.result?.video || data.result?.downloads) {
        return this.parseDouyin(data, url);
      }

      // 处理 TikTok 格式
      if (data.video && Array.isArray(data.video)) {
        return this.parseTiktok(data, url);
      }

      // 处理 YouTube 格式
      if (data.mp4 || data.mp3) {
        return this.parseYouTube(data, url);
      }

      // 处理 Instagram 格式
      if (Array.isArray(data) && data[0]?.url) {
        return this.parseInstagram(data, url);
      }

      // 处理 Twitter 格式
      if (data.url) {
        return this.parseTwitter(data, url);
      }

      return this.createError('无法解析 API 响应');
    } catch (error) {
      console.error('[BtchEdge] Error:', error);
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  private parseXiaohongshu(data: any, url: string): ParseResult {
    const xhsData = data.result || data;
    const formats: VideoFormat[] = [];

    // 提取下载链接
    if (xhsData.downloads && Array.isArray(xhsData.downloads)) {
      for (const dl of xhsData.downloads) {
        if (dl.url) {
          formats.push(this.createFormat({
            id: dl.quality || 'default',
            quality: dl.quality || '原画',
            format: 'mp4',
            url: dl.url,
            hasAudio: true,
            hasVideo: true,
          }));
        }
      }
    }

    // 图片笔记
    if (formats.length === 0 && xhsData.images && Array.isArray(xhsData.images) && xhsData.images.length > 0) {
      return this.createSuccess({
        id: xhsData.noteId || Date.now().toString(),
        platform: 'xiaohongshu',
        title: xhsData.title || xhsData.nickname || '小红书笔记',
        description: xhsData.desc || '',
        thumbnail: xhsData.images[0] || '',
        duration: 0,
        durationText: '',
        author: xhsData.nickname || '',
        authorAvatar: '',
        formats: [],
        images: xhsData.images as string[],
        originalUrl: url,
        parsedAt: Date.now(),
      });
    }

    if (formats.length === 0) {
      return this.createError('未找到视频下载链接');
    }

    // 解析时长
    let duration = 0;
    if (xhsData.duration) {
      const parts = xhsData.duration.split(':').map(Number);
      if (parts.length === 2) {
        duration = parts[0] * 60 + parts[1];
      }
    }

    return this.createSuccess({
      id: xhsData.noteId || Date.now().toString(),
      platform: 'xiaohongshu',
      title: xhsData.title || xhsData.nickname || '小红书笔记',
      description: xhsData.desc || '',
      thumbnail: xhsData.images?.[0] || '',
      duration,
      durationText: this.formatDuration(duration),
      author: xhsData.nickname || '',
      authorAvatar: '',
      formats,
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private parseDouyin(data: any, url: string): ParseResult {
    const douyinData = data.result || data;
    const formats: VideoFormat[] = [];

    // 抖音视频只有一个画质，去重处理
    const seenUrls = new Set<string>();

    if (douyinData.downloads && Array.isArray(douyinData.downloads)) {
      for (const dl of douyinData.downloads) {
        if (dl.url && !seenUrls.has(dl.url)) {
          seenUrls.add(dl.url);
          formats.push(this.createFormat({
            id: dl.quality || 'default',
            quality: '原画',
            format: 'mp4',
            url: dl.url,
            hasAudio: true,
            hasVideo: true,
          }));
          // 抖音只有一个画质，取第一个即可
          break;
        }
      }
    }

    if (formats.length === 0 && douyinData.video) {
      formats.push(this.createFormat({
        id: 'default',
        quality: '原画',
        format: 'mp4',
        url: douyinData.video,
        hasAudio: true,
        hasVideo: true,
      }));
    }

    // 处理 btch API 返回的 links 格式
    if (formats.length === 0 && douyinData.links && Array.isArray(douyinData.links)) {
      const firstLink = douyinData.links[0];
      if (firstLink?.url) {
        formats.push(this.createFormat({
          id: 'default',
          quality: '原画',
          format: 'mp4',
          url: firstLink.url,
          hasAudio: true,
          hasVideo: true,
        }));
      }
    }

    if (formats.length === 0) {
      return this.createError('未找到视频下载链接');
    }

    return this.createSuccess({
      id: douyinData.noteId || douyinData.videoId || Date.now().toString(),
      platform: 'douyin',
      title: douyinData.title || douyinData.desc?.substring(0, 100) || '抖音视频',
      description: douyinData.desc || '',
      thumbnail: douyinData.cover || douyinData.images?.[0] || '',
      duration: 0,
      durationText: '',
      author: douyinData.nickname || douyinData.author || '',
      authorAvatar: '',
      formats,
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private parseTiktok(data: any, url: string): ParseResult {
    const formats: VideoFormat[] = [];

    if (data.video && Array.isArray(data.video)) {
      for (let i = 0; i < data.video.length; i++) {
        const v = data.video[i];
        formats.push(this.createFormat({
          id: `video-${i}`,
          quality: v.quality || `画质 ${i + 1}`,
          format: 'mp4',
          url: v.url || v,
          hasAudio: true,
          hasVideo: true,
        }));
      }
    }

    if (formats.length === 0) {
      return this.createError('未找到视频下载链接');
    }

    return this.createSuccess({
      id: Date.now().toString(),
      platform: 'tiktok',
      title: data.title || 'TikTok Video',
      description: '',
      thumbnail: data.thumbnail || '',
      duration: 0,
      durationText: '',
      author: '',
      authorAvatar: '',
      formats,
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private parseYouTube(data: any, url: string): ParseResult {
    const formats: VideoFormat[] = [];

    if (data.mp4) {
      formats.push(this.createFormat({
        id: 'mp4',
        quality: 'MP4',
        format: 'mp4',
        url: data.mp4,
        hasAudio: true,
        hasVideo: true,
      }));
    }

    if (data.mp3) {
      formats.push(this.createFormat({
        id: 'mp3',
        quality: 'MP3',
        format: 'mp3',
        url: data.mp3,
        hasAudio: true,
        hasVideo: false,
      }));
    }

    if (formats.length === 0) {
      return this.createError('未找到视频下载链接');
    }

    return this.createSuccess({
      id: Date.now().toString(),
      platform: 'youtube',
      title: data.title || 'YouTube Video',
      description: '',
      thumbnail: data.thumbnail || '',
      duration: 0,
      durationText: '',
      author: data.author || '',
      authorAvatar: '',
      formats,
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private parseInstagram(data: any[], url: string): ParseResult {
    const formats: VideoFormat[] = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item.url) {
        formats.push(this.createFormat({
          id: `ig-${i}`,
          quality: `视频 ${i + 1}`,
          format: 'mp4',
          url: item.url,
          hasAudio: true,
          hasVideo: true,
        }));
      }
    }

    if (formats.length === 0) {
      return this.createError('未找到视频下载链接');
    }

    return this.createSuccess({
      id: Date.now().toString(),
      platform: 'instagram',
      title: 'Instagram Media',
      description: '',
      thumbnail: data[0]?.thumbnail || '',
      duration: 0,
      durationText: '',
      author: '',
      authorAvatar: '',
      formats,
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private parseTwitter(data: any, url: string): ParseResult {
    return this.createSuccess({
      id: Date.now().toString(),
      platform: 'twitter',
      title: data.title || 'Twitter Video',
      description: '',
      thumbnail: '',
      duration: 0,
      durationText: '',
      author: '',
      authorAvatar: '',
      formats: [this.createFormat({
        id: 'default',
        quality: '原画',
        format: 'mp4',
        url: data.url,
        hasAudio: true,
        hasVideo: true,
      })],
      originalUrl: url,
      parsedAt: Date.now(),
    });
  }

  private detectPlatform(url: string): string {
    if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) return 'xiaohongshu';
    if (url.includes('douyin.com')) return 'douyin';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'unknown';
  }
}
