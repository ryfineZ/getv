import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

/**
 * Instagram 视频解析器
 */
export class InstagramParser extends BaseParser {
  readonly platform = 'instagram' as const;
  readonly name = 'Instagram';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 从 URL 提取 post ID
      const postId = this.extractPostId(url);

      // 使用 cobalt API 解析
      const response = await this.fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          url,
          aFormat: 'mp3',
        }),
      });

      const data = await response.json();

      if (data.status === 'error') {
        return this.createError('无法解析此 Instagram 内容');
      }

      // 获取封面图
      const thumbnail = await this.getThumbnail(url, postId);

      // 处理多图/多视频情况
      const formats: VideoFormat[] = [];

      if (data.url) {
        // 单个视频
        formats.push(this.createFormat({
          id: `ig-${Date.now()}`,
          quality: '原画',
          format: 'mp4',
          url: data.url,
          hasAudio: true,
          hasVideo: true,
        }));
      } else if (data.picker && Array.isArray(data.picker)) {
        // 多图/多视频（Carousel）
        data.picker.forEach((item: any, index: number) => {
          if (item.type === 'video') {
            formats.push(this.createFormat({
              id: `ig-${index}`,
              quality: `视频 ${index + 1}`,
              format: 'mp4',
              url: item.url,
              hasAudio: true,
              hasVideo: true,
            }));
          }
        });
      }

      if (formats.length === 0) {
        return this.createError('未找到视频内容，可能是纯图片帖子');
      }

      return this.createSuccess({
        id: postId || `ig-${Date.now()}`,
        platform: 'instagram',
        title: data.filename?.replace(/\.[^/.]+$/, '') || 'Instagram 视频',
        thumbnail,
        duration: 0,
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      });
    } catch (error) {
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  /**
   * 从 URL 提取 post ID
   */
  private extractPostId(url: string): string {
    // /p/POST_ID 或 /reel/POST_ID 或 /reels/POST_ID
    const match = url.match(/\/(p|reel|reels)\/([^/?]+)/);
    return match ? match[2] : '';
  }

  /**
   * 获取 Instagram 封面图
   */
  private async getThumbnail(url: string, postId: string): Promise<string> {
    try {
      // 方案1: 尝试从 Instagram oEmbed 获取
      const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=`;

      // 方案2: 使用 Instagram 的媒体页面获取
      const mediaUrl = `https://www.instagram.com/p/${postId}/media/?size=l`;

      const response = await this.fetch(mediaUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });

      // 如果重定向到图片 URL，返回最终 URL
      if (response.url && response.url.includes('cdninstagram')) {
        return response.url;
      }

      // 方案3: 构造默认封面图 URL
      // Instagram 的封面图通常可以通过媒体端点获取
      return `https://www.instagram.com/p/${postId}/media/?size=l`;
    } catch {
      return '';
    }
  }
}
