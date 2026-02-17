import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 成人网站视频解析器
 * 使用 yt-dlp 解析 PornHub, 91Porn, XVideos, XHamster 等
 */
export class PornHubParser extends BaseParser {
  readonly platform = 'pornhub' as const;
  readonly name = 'Adult Video';

  async parse(url: string): Promise<ParseResult> {
    try {
      console.log('[Adult] Parsing:', url);

      // 使用 yt-dlp 获取视频信息
      // 添加 --no-check-certificate 跳过证书检查
      const { stdout } = await execAsync(
        `python3 -m yt_dlp --dump-json --no-warnings --no-check-certificate "${url}"`,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000, // 2分钟超时，成人网站可能较慢
        }
      );

      const data = JSON.parse(stdout);

      // 提取视频 ID
      const videoId = data.id || url.match(/viewkey=([a-f0-9]+)/)?.[1] || Date.now().toString();

      // 提取格式
      const formats: VideoFormat[] = [];
      const seenQualities = new Set<string>();

      if (data.formats && Array.isArray(data.formats)) {
        for (const f of data.formats) {
          // 跳过 HLS 格式（m3u8）除非没有其他选择
          if (f.protocol === 'm3u8_native' || f.protocol === 'm3u8') continue;
          if (!f.url) continue;

          // 跳过没有视频的格式
          if (f.video_ext === 'none' && f.audio_ext === 'none') continue;

          const quality = f.format_id || `${f.height}p`;
          const key = `${quality}-${f.ext}`;

          // 去重
          if (seenQualities.has(key)) continue;
          seenQualities.add(key);

          // 计算文件大小
          let size = f.filesize || f.filesize_approx;
          if (!size && f.tbr && data.duration) {
            size = Math.round(f.tbr * 1000 * data.duration / 8);
          }

          formats.push(this.createFormat({
            id: f.format_id || `fmt-${Date.now()}`,
            quality: f.height ? `${f.height}p` : quality,
            format: f.ext || 'mp4',
            size,
            url: f.url,
            hasAudio: f.acodec !== 'none' && f.audio_ext !== 'none',
            hasVideo: f.vcodec !== 'none' && f.video_ext !== 'none',
            bitrate: f.tbr ? Math.round(f.tbr * 1000) : undefined,
          }));
        }
      }

      // 如果没有找到格式，尝试使用 URL
      if (formats.length === 0 && data.url) {
        formats.push(this.createFormat({
          id: 'default',
          quality: 'best',
          format: 'mp4',
          url: data.url,
          hasAudio: true,
          hasVideo: true,
        }));
      }

      // 按分辨率排序
      formats.sort((a, b) => {
        const getHeight = (q: string) => parseInt(q) || 0;
        return getHeight(b.quality) - getHeight(a.quality);
      });

      return this.createSuccess({
        id: videoId,
        platform: 'pornhub',
        title: data.title || data.fulltitle || 'Video',
        description: data.description || '',
        thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || '',
        duration: data.duration || 0,
        durationText: this.formatDuration(data.duration || 0),
        author: data.uploader || data.channel || '',
        authorAvatar: '',
        formats: formats.slice(0, 10),
        originalUrl: url,
        parsedAt: Date.now(),
      });
    } catch (error) {
      console.error('[Adult] Error:', error);

      const errorMessage = error instanceof Error ? error.message : '解析失败';

      // yt-dlp 明确拒绝（piracy policy）
      if (errorMessage.includes('Piracy') || errorMessage.includes('no longer supported')) {
        return this.createError('yt-dlp 已停止支持该站点。请安装浏览器插件，在视频页面上直接嗅探视频链接下载');
      }
      // yt-dlp 无提取器
      if (errorMessage.includes('Unsupported URL')) {
        return this.createError('该站点暂不支持服务端解析。请安装浏览器插件，在视频页面上直接嗅探视频链接下载');
      }
      if (errorMessage.includes('Video unavailable') || errorMessage.includes('not available')) {
        return this.createError('视频不可用或已被删除');
      }
      if (errorMessage.includes('Private video')) {
        return this.createError('这是私密视频，无法下载');
      }
      if (errorMessage.includes('age')) {
        return this.createError('需要验证年龄才能访问此视频');
      }
      if (errorMessage.includes('HTTP Error 403') || errorMessage.includes('Cloudflare')) {
        return this.createError('该站点有 Cloudflare 保护，服务端无法访问。请安装浏览器插件，在视频页面上直接嗅探视频链接下载');
      }

      return this.createError('解析失败，请安装浏览器插件在视频页面上嗅探下载');
    }
  }
}
