import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';
import { extractVideoId } from '../utils/url-detector';

/**
 * TikTok 视频解析器
 * 支持去除水印
 */
export class TikTokParser extends BaseParser {
  readonly platform = 'tiktok' as const;
  readonly name = 'TikTok';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 先获取重定向后的真实 URL
      const realUrl = await this.getRealUrl(url);

      // 提取视频 ID
      const videoId = extractVideoId(realUrl, 'tiktok');
      if (!videoId) {
        return this.createError('无法从 URL 中提取视频 ID');
      }

      // 尝试多种解析方法
      const videoInfo =
        (await this.parseWithTikwm(videoId)) ||
        (await this.parseWithTikmate(videoId)) ||
        (await this.parseWithCobalt(url));

      if (videoInfo) {
        return this.createSuccess(videoInfo);
      }

      return this.createError('无法获取视频信息，请稍后重试');
    } catch (error) {
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  /**
   * 获取真实 URL（处理短链接）
   */
  private async getRealUrl(url: string): Promise<string> {
    try {
      // 处理 TikTok 短链接
      if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
        const response = await this.fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
        });
        return response.url;
      }
      return url;
    } catch {
      return url;
    }
  }

  /**
   * 使用 tikwm.com API 解析
   */
  private async parseWithTikwm(videoId: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch(
        `https://www.tikwm.com/api/?url=https://www.tiktok.com/video/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.code !== 0 || !data.data) {
        return null;
      }

      const videoData = data.data;
      const formats: VideoFormat[] = [];

      // 无水印视频
      if (videoData.play) {
        formats.push(
          this.createFormat({
            id: `tiktok-hd-${videoId}`,
            quality: 'HD (无水印)',
            format: 'mp4',
            url: videoData.play,
            hasAudio: true,
            hasVideo: true,
            noWatermark: true,
          })
        );
      }

      // 有水印视频
      if (videoData.wmplay) {
        formats.push(
          this.createFormat({
            id: `tiktok-wm-${videoId}`,
            quality: 'HD (有水印)',
            format: 'mp4',
            url: videoData.wmplay,
            hasAudio: true,
            hasVideo: true,
            noWatermark: false,
          })
        );
      }

      // 音频
      if (videoData.music) {
        formats.push(
          this.createFormat({
            id: `tiktok-audio-${videoId}`,
            quality: '音频',
            format: 'mp3',
            url: videoData.music,
            hasAudio: true,
            hasVideo: false,
          })
        );
      }

      if (formats.length === 0) {
        return null;
      }

      return {
        id: videoId,
        platform: 'tiktok',
        title: videoData.title || 'TikTok 视频',
        description: videoData.desc || videoData.title,
        thumbnail: videoData.cover || videoData.origin_cover,
        duration: videoData.duration || 0,
        durationText: this.formatDuration(videoData.duration || 0),
        author: videoData.author?.nickname || videoData.author?.unique_id,
        authorAvatar: videoData.author?.avatar,
        formats,
        originalUrl: `https://www.tiktok.com/video/${videoId}`,
        parsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * 使用 tikmate 解析（备用）
   */
  private async parseWithTikmate(videoId: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch(
        `https://api.tikmate.app/api/lookup?url=https://www.tiktok.com/video/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!data.success || !data.video) {
        return null;
      }

      const formats: VideoFormat[] = [];

      if (data.video?.url) {
        formats.push(
          this.createFormat({
            id: `tikmate-${videoId}`,
            quality: 'HD (无水印)',
            format: 'mp4',
            url: data.video.url,
            hasAudio: true,
            hasVideo: true,
            noWatermark: true,
          })
        );
      }

      if (data.video?.url_no_wm) {
        formats.push(
          this.createFormat({
            id: `tikmate-nwm-${videoId}`,
            quality: '无水印',
            format: 'mp4',
            url: data.video.url_no_wm,
            hasAudio: true,
            hasVideo: true,
            noWatermark: true,
          })
        );
      }

      if (formats.length === 0) {
        return null;
      }

      return {
        id: videoId,
        platform: 'tiktok',
        title: data.video.title || 'TikTok 视频',
        thumbnail: data.video.cover,
        duration: data.video.duration || 0,
        durationText: this.formatDuration(data.video.duration || 0),
        author: data.video.author?.nickname,
        formats,
        originalUrl: `https://www.tiktok.com/video/${videoId}`,
        parsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * 使用 cobalt API 解析（备用）
   */
  private async parseWithCobalt(url: string): Promise<VideoInfo | null> {
    try {
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
        return null;
      }

      const formats: VideoFormat[] = [];

      if (data.status === 'stream' || data.status === 'redirect') {
        formats.push(
          this.createFormat({
            id: `cobalt-tiktok-${Date.now()}`,
            quality: '最佳',
            format: 'mp4',
            url: data.url,
            hasAudio: true,
            hasVideo: true,
            noWatermark: true,
          })
        );
      }

      if (formats.length === 0) {
        return null;
      }

      const videoId = url.split('/video/')[1]?.split('?')[0] || '';

      return {
        id: videoId,
        platform: 'tiktok',
        title: data.filename?.replace(/\.[^/.]+$/, '') || 'TikTok 视频',
        thumbnail: '',
        duration: 0,
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }
}
