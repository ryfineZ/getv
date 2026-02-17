import { BaseParser } from './base';
import type { VideoInfo, ParseResult } from '../types';

/**
 * 微信视频号解析器
 * 最难解析的平台：封闭生态，无公开 API
 */
export class WeChatParser extends BaseParser {
  readonly platform = 'wechat' as const;
  readonly name = '视频号';

  async parse(url: string): Promise<ParseResult> {
    // 视频号视频需要用户通过抓包获取链接
    // 这里提供一个引导式的处理方式

    if (url.includes('channels.weixin.qq.com') || url.includes('finder.video.qq.com')) {
      // 尝试解析用户提供的视频链接
      return this.parseDirectUrl(url);
    }

    return this.createError(
      '视频号视频需要手动获取链接。请使用抓包工具（如 Stream 抓包）获取视频的真实地址，然后粘贴到这里。'
    );
  }

  /**
   * 解析直接视频链接
   */
  private async parseDirectUrl(url: string): Promise<ParseResult> {
    try {
      // 检查是否是有效的视频链接
      const response = await this.fetch(url, { method: 'HEAD' });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('video')) {
        return this.createError('这不是一个有效的视频链接');
      }

      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength) : undefined;

      return this.createSuccess({
        id: `wechat-${Date.now()}`,
        platform: 'wechat',
        title: '微信视频号视频',
        thumbnail: '',
        duration: 0,
        formats: [{
          id: `wechat-${Date.now()}`,
          quality: 'original',
          format: 'mp4',
          url: url,
          size,
          sizeText: size ? this.formatFileSize(size) : undefined,
          hasAudio: true,
          hasVideo: true,
        }],
        originalUrl: url,
        parsedAt: Date.now(),
        expiresIn: 86400, // 视频号链接通常 24 小时过期
      });
    } catch (error) {
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }
}
