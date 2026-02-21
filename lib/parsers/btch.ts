import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

// 导入 btch-downloader 的各个函数
import { ttdl, igdl, twitter, youtube, fbdown, xiaohongshu, douyin, aio } from 'btch-downloader';

/**
 * 基于 btch-downloader 的通用解析器
 * 支持: TikTok, Douyin, Instagram, YouTube, Facebook, Twitter, Pinterest, Xiaohongshu 等
 */
export class BtchParser extends BaseParser {
  readonly platform = 'youtube' as const;
  readonly name = 'btch-downloader';

  async parse(url: string): Promise<ParseResult> {
    try {
      console.log('[Btch] Parsing:', url);

      // 根据平台选择对应的解析函数
      const platform = this.detectPlatform(url);
      let result: any;

      switch (platform) {
        case 'tiktok':
          result = await ttdl(url);
          break;
        case 'douyin':
          result = await douyin(url);
          break;
        case 'instagram':
          result = await igdl(url);
          break;
        case 'youtube':
          result = await youtube(url);
          break;
        case 'twitter':
          result = await twitter(url);
          break;
        case 'xiaohongshu':
          result = await xiaohongshu(url);
          break;
        default:
          // 使用 aio 作为备选
          result = await aio(url);
      }

      if (!result || (!result.url && !result.video && !result.data && !result.result)) {
        return this.createError('无法获取视频信息');
      }

      // 提取视频 URL
      let videoUrl = '';
      let thumbnail = '';
      let title = '';
      let author = '';
      let duration = 0;
      const formats: VideoFormat[] = [];

      // 处理不同平台的返回格式
      if (result.url) {
        videoUrl = result.url;
      } else if (result.video) {
        videoUrl = result.video;
      } else if (result.data && result.data.url) {
        videoUrl = result.data.url;
      }

      // 处理小红书特殊格式
      if (result.result && result.result.downloads) {
        const xhsData = result.result;
        thumbnail = xhsData.images?.[0] || '';
        title = xhsData.title || xhsData.nickname || '小红书笔记';
        author = xhsData.nickname || '';
        // 解析时长
        if (xhsData.duration) {
          const parts = xhsData.duration.split(':').map(Number);
          if (parts.length === 2) {
            duration = parts[0] * 60 + parts[1];
          }
        }
        // 提取下载链接
        if (xhsData.downloads && Array.isArray(xhsData.downloads)) {
          for (const dl of xhsData.downloads) {
            if (dl.url) {
              formats.push(this.createFormat({
                id: dl.quality || `fmt-${Date.now()}`,
                quality: dl.quality || '原画',
                format: 'mp4',
                url: dl.url,
                hasAudio: true,
                hasVideo: true,
              }));
            }
          }
        }
        // 如果有格式，直接返回
        if (formats.length > 0) {
          return this.createSuccess({
            id: xhsData.noteId || Date.now().toString(),
            platform: 'xiaohongshu',
            title,
            description: xhsData.desc || '',
            thumbnail,
            duration,
            durationText: this.formatDuration(duration),
            author,
            authorAvatar: '',
            formats,
            originalUrl: url,
            parsedAt: Date.now(),
          });
        }
      }

      // 处理多质量视频
      if (result.medias && Array.isArray(result.medias)) {
        // 选择最高质量的视频
        const videos = result.medias.filter((m: any) =>
          m.type === 'video' && m.url
        );
        if (videos.length > 0) {
          // 优先选择有音频的视频
          const withAudio = videos.find((v: any) => v.audio);
          videoUrl = withAudio?.url || videos[0].url;
        }
      }

      // 提取元数据
      thumbnail = result.thumbnail || result.cover || result.image || '';
      title = result.title || result.caption || '未知标题';
      author = result.author?.nickname || result.author || '';
      duration = result.duration || 0;

      if (!videoUrl) {
        // 检查是否为图集（抖音/Instagram 等）
        if (result.images && Array.isArray(result.images) && result.images.length > 0) {
          return this.createSuccess({
            id: result.id || Date.now().toString(),
            platform,
            title,
            description: result.description || '',
            thumbnail: result.images[0] || thumbnail,
            duration: 0,
            durationText: '',
            author,
            authorAvatar: result.author?.avatar || '',
            formats: [],
            images: result.images as string[],
            originalUrl: url,
            parsedAt: Date.now(),
          });
        }
        return this.createError('无法获取视频下载链接');
      }

      // 创建格式信息
      // formats 已在上面定义

      // 如果有多个质量选项
      if (result.medias && Array.isArray(result.medias)) {
        for (const media of result.medias) {
          if (media.type === 'video' && media.url) {
            formats.push(this.createFormat({
              id: media.quality || `fmt-${Date.now()}`,
              quality: media.quality || '原画',
              format: media.extension || 'mp4',
              size: media.size,
              url: media.url,
              hasAudio: media.audio !== false,
              hasVideo: true,
            }));
          }
        }
      }

      // 如果没有多质量，使用默认视频
      if (formats.length === 0) {
        formats.push(this.createFormat({
          id: 'default',
          quality: '原画',
          format: 'mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
        }));
      }

      return this.createSuccess({
        id: result.id || Date.now().toString(),
        platform,
        title,
        description: result.description || '',
        thumbnail,
        duration,
        durationText: this.formatDuration(duration),
        author,
        authorAvatar: result.author?.avatar || '',
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      });
    } catch (error) {
      console.error('[Btch] Error:', error);

      const errorMessage = error instanceof Error ? error.message : '解析失败';

      if (errorMessage.includes('Invalid URL') || errorMessage.includes('not supported')) {
        return this.createError('不支持此链接格式');
      }
      if (errorMessage.includes('private') || errorMessage.includes('not found')) {
        return this.createError('视频不可用或为私密视频');
      }

      return this.createError('解析失败，请检查链接是否正确');
    }
  }

  /**
   * 检测平台
   */
  private detectPlatform(url: string): 'youtube' | 'tiktok' | 'twitter' | 'instagram' | 'douyin' | 'xiaohongshu' | 'unknown' {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('douyin.com')) return 'douyin';
    if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) return 'xiaohongshu';
    return 'unknown';
  }
}
