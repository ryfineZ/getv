import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

/**
 * Twitter/X 视频解析器
 * 使用 fxtwitter API 获取完整信息
 */
export class TwitterParser extends BaseParser {
  readonly platform = 'twitter' as const;
  readonly name = 'Twitter/X';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 提取推文 ID
      const tweetId = this.extractTweetId(url);
      if (!tweetId) {
        return this.createError('无法从 URL 中提取推文 ID');
      }
      console.log('[Twitter] Tweet ID:', tweetId);

      // 使用 fxtwitter API 获取推文信息
      const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
      const response = await this.fetch(apiUrl);

      const data = await response.json();

      if (data.code !== 200 || !data.tweet) {
        return this.createError('无法获取推文信息，可能是私密推文或已删除');
      }

      const tweet = data.tweet;

      // 提取视频信息
      const title = tweet.text || 'Twitter 视频';
      const author = tweet.author?.name || '';
      const authorAvatar = tweet.author?.avatar_url || '';
      const thumbnail = tweet.media?.videos?.[0]?.thumbnail_url ||
                        tweet.media?.all?.[0]?.thumbnail_url || '';

      // 提取时长
      const duration = tweet.media?.videos?.[0]?.duration || 0;

      // 提取格式
      const formats: VideoFormat[] = [];

      // 从 fxtwitter 获取多个视频格式
      const videos = tweet.media?.videos || [];
      for (const video of videos) {
        if (video.formats && Array.isArray(video.formats)) {
          for (let i = 0; i < video.formats.length; i++) {
            const format = video.formats[i];
            // 只处理 mp4 格式
            if (format.container !== 'mp4' && !format.url.includes('.mp4')) continue;

            // 从 URL 中提取分辨率
            const resMatch = format.url.match(/\/(\d+)x(\d+)\//);
            const width = resMatch ? parseInt(resMatch[1]) : (video.width || 0);
            const height = resMatch ? parseInt(resMatch[2]) : (video.height || 0);

            const quality = height >= 1080 ? '超清 1080p' :
                           height >= 720 ? '高清 720p' :
                           height >= 480 ? '标清 480p' :
                           height >= 360 ? '流畅 360p' : `画质 ${height}p`;

            // 避免重复
            if (formats.some(f => f.url === format.url)) continue;

            formats.push(this.createFormat({
              id: `twitter-${tweetId}-${formats.length}`,
              quality: `${quality}`,
              format: 'mp4',
              url: format.url,
              size: format.bitrate ? Math.round(duration * format.bitrate / 8) : undefined,
              hasAudio: true,
              hasVideo: true,
              bitrate: format.bitrate,
            }));
          }
        }

        // 也处理 variants 格式
        if (video.variants && Array.isArray(video.variants)) {
          for (const variant of video.variants) {
            if (variant.content_type === 'video/mp4' && variant.url) {
              if (formats.some(f => f.url === variant.url)) continue;

              // 从 URL 中提取分辨率
              const resMatch = variant.url.match(/\/(\d+)x(\d+)\//);
              const height = resMatch ? parseInt(resMatch[2]) : 0;

              const quality = height >= 1080 ? '超清 1080p' :
                             height >= 720 ? '高清 720p' :
                             height >= 480 ? '标清 480p' :
                             height >= 360 ? '流畅 360p' : `画质 ${height || '?'}p`;

              formats.push(this.createFormat({
                id: `twitter-${tweetId}-${formats.length}`,
                quality,
                format: 'mp4',
                url: variant.url,
                hasAudio: true,
                hasVideo: true,
                bitrate: variant.bitrate,
              }));
            }
          }
        }
      }

      // 如果 fxtwitter 没有返回格式，尝试备用方案
      if (formats.length === 0 && tweet.media?.videos?.[0]?.url) {
        formats.push(this.createFormat({
          id: `twitter-${tweetId}`,
          quality: '原画',
          format: 'mp4',
          url: tweet.media.videos[0].url,
          hasAudio: true,
          hasVideo: true,
        }));
      }

      if (formats.length === 0) {
        return this.createError('该推文不包含视频，可能只是文字或图片');
      }

      // 按比特率排序 (高质量的在前)
      formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      return this.createSuccess({
        id: tweetId,
        platform: 'twitter',
        title,
        description: title,
        thumbnail,
        duration,
        durationText: this.formatDuration(duration),
        author,
        authorAvatar,
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      });
    } catch (error) {
      console.error('[Twitter] Parse error:', error);
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  /**
   * 提取推文 ID
   */
  private extractTweetId(url: string): string | null {
    // 匹配 /status/TWEET_ID
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }
}
