import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat, Subtitle } from '../types';
import { extractVideoId } from '../utils/url-detector';

// YouTube innertube API key (通过环境变量 YOUTUBE_INNERTUBE_KEY 配置)
const INNERTUBE_API_KEY = process.env.YOUTUBE_INNERTUBE_KEY || '';

/**
 * YouTube 视频解析器
 * 使用多种方法获取视频信息
 */
export class YouTubeParser extends BaseParser {
  readonly platform = 'youtube' as const;
  readonly name = 'YouTube';

  async parse(url: string): Promise<ParseResult> {
    try {
      // 提取视频 ID
      const videoId = extractVideoId(url, 'youtube');
      if (!videoId) {
        return this.createError('无法从 URL 中提取视频 ID');
      }

      // 方法 1: 使用 youtubei API（推荐）
      const videoInfo = await this.parseWithYoutubei(videoId);
      if (videoInfo) {
        return this.createSuccess(videoInfo);
      }

      // 方法 2: 使用备用服务
      const backupInfo = await this.parseWithBackup(videoId);
      if (backupInfo) {
        return this.createSuccess(backupInfo);
      }

      return this.createError('无法获取视频信息，请稍后重试');
    } catch (error) {
      return this.createError(
        error instanceof Error ? error.message : '解析失败'
      );
    }
  }

  /**
   * 使用 youtubei API 解析
   * 这是 YouTube 内部 API，无需 API Key
   */
  private async parseWithYoutubei(videoId: string): Promise<VideoInfo | null> {
    try {
      const response = await this.fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId,
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20241210.00.00',
                hl: 'zh-CN',
                gl: 'CN',
              },
            },
          }),
        }
      );

      const data = await response.json();

      // 检查是否有视频
      if (!data.videoDetails || data.playabilityStatus?.status !== 'OK') {
        return null;
      }

      const videoDetails = data.videoDetails;
      const streamingData = data.streamingData;

      // 构建格式列表
      const formats: VideoFormat[] = [];

      // 添加渐进式格式（视频+音频合并）
      if (streamingData?.formats) {
        for (const format of streamingData.formats) {
          if (format.url) {
            formats.push(
              this.createFormat({
                id: format.itag?.toString() || `yt-${Date.now()}`,
                quality: format.qualityLabel || 'unknown',
                format: 'mp4',
                size: format.contentLength ? parseInt(format.contentLength) : undefined,
                url: format.url,
                hasAudio: true,
                hasVideo: true,
                bitrate: format.bitrate,
              })
            );
          }
        }
      }

      // 添加自适应格式（视频和音频分离）
      if (streamingData?.adaptiveFormats) {
        // 视频格式（无音频）
        for (const format of streamingData.adaptiveFormats) {
          if (format.url && format.mimeType?.includes('video')) {
            const mimeType = format.mimeType?.split(';')[0] || '';
            const codec = mimeType.includes('avc') || mimeType.includes('h264') ? 'h264' :
              mimeType.includes('vp9') ? 'vp9' :
                mimeType.includes('av01') ? 'av1' : 'other';

            // 确定画质标签
            let qualityLabel = format.qualityLabel;
            if (!qualityLabel) {
              if (format.width) {
                qualityLabel = `${format.width}p`;
              } else if (format.height) {
                qualityLabel = `${format.height}p`;
              } else {
                qualityLabel = '未知画质';
              }
            }

            // 格式 ID 直接使用 itag（yt-dlp 可识别）
            formats.push(
              this.createFormat({
                id: format.itag?.toString() || `yt-${Date.now()}`,
                quality: qualityLabel,
                format: mimeType.split('/')[1] || 'mp4',
                size: format.contentLength ? parseInt(format.contentLength) : undefined,
                url: format.url,
                hasAudio: false,
                hasVideo: true,
                bitrate: format.bitrate,
                codec,
                fps: format.fps,
              })
            );
          }
        }

        // 音频格式（无视频）
        for (const format of streamingData.adaptiveFormats) {
          if (format.url && format.mimeType?.includes('audio')) {
            const mimeType = format.mimeType?.split(';')[0] || '';
            const bitrate = format.bitrate || 0;
            const bitrateKbps = Math.round(bitrate / 1000);
            const qualityLabel = bitrateKbps >= 128 ? '高音质' :
              bitrateKbps >= 64 ? '中音质' : '标准';

            formats.push(
              this.createFormat({
                id: format.itag?.toString() || `audio-${Date.now()}`,
                quality: `${qualityLabel} (${bitrateKbps}kbps)`,
                format: mimeType.split('/')[1] || 'mp4',
                size: format.contentLength ? parseInt(format.contentLength) : undefined,
                url: format.url,
                hasAudio: true,
                hasVideo: false,
                bitrate: format.bitrate,
              })
            );
          }
        }
      }

      // 按质量排序，同画质优先 VP9/AV1（更小）
      formats.sort((a, b) => {
        const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
        const aIndex = qualityOrder.indexOf(a.quality);
        const bIndex = qualityOrder.indexOf(b.quality);

        // 先按画质排序
        if (aIndex !== bIndex) return aIndex - bIndex;

        // 同画质优先 VP9/AV1（文件更小）
        const codecPriority: Record<string, number> = { 'av1': 0, 'vp9': 1, 'h264': 2, 'other': 3 };
        const aCodec = codecPriority[a.codec || 'other'] ?? 3;
        const bCodec = codecPriority[b.codec || 'other'] ?? 3;
        return aCodec - bCodec;
      });

      // 提取字幕 — WEB 客户端不返回 captions，使用独立 ANDROID 客户端请求
      const subtitles: Subtitle[] = [];
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const captionResponse = await globalThis.fetch(
          `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId,
              context: {
                client: {
                  clientName: 'ANDROID',
                  clientVersion: '19.09.37',
                  androidSdkVersion: 30,
                  hl: 'en',
                  gl: 'US',
                },
              },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        const captionData = await captionResponse.json();
        const renderer = captionData.captions?.playerCaptionsTracklistRenderer;
        const captionTracks = renderer?.captionTracks;
        const translationLanguages = renderer?.translationLanguages;
        console.log('[YouTube] captionTracks:', captionTracks?.length || 0, ', translationLanguages:', translationLanguages?.length || 0);

        if (Array.isArray(captionTracks)) {
          for (const track of captionTracks) {
            if (!track.baseUrl) continue;
            const srtUrl = track.baseUrl.includes('fmt=')
              ? track.baseUrl.replace(/fmt=[^&]+/, 'fmt=srv1')
              : `${track.baseUrl}&fmt=srv1`;
            subtitles.push({
              lang: track.languageCode || 'unknown',
              label: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode || '未知',
              url: srtUrl,
              format: 'srt',
              isAutoGenerated: track.kind === 'asr',
            });
          }

          // 利用 translationLanguages 生成自动翻译字幕
          if (Array.isArray(translationLanguages) && captionTracks.length > 0) {
            const baseTrack = captionTracks.find((t: { kind?: string }) => t.kind !== 'asr') || captionTracks[0];
            if (baseTrack?.baseUrl) {
              const existingLangs = new Set(subtitles.map(s => s.lang));
              for (const tl of translationLanguages) {
                const tlLang = tl.languageCode;
                if (!tlLang || existingLangs.has(tlLang)) continue;
                const tlUrl = baseTrack.baseUrl.includes('fmt=')
                  ? baseTrack.baseUrl.replace(/fmt=[^&]+/, 'fmt=srv1') + `&tlang=${tlLang}`
                  : `${baseTrack.baseUrl}&fmt=srv1&tlang=${tlLang}`;
                subtitles.push({
                  lang: tlLang,
                  label: tl.languageName?.simpleText || tl.languageName?.runs?.[0]?.text || tlLang,
                  url: tlUrl,
                  format: 'srt',
                  isAutoGenerated: true,
                });
              }
            }
          }
        }
      } catch (captionError) {
        console.log('[YouTube] 字幕获取失败（不影响视频解析）:', captionError instanceof Error ? captionError.message : captionError);
      }
      console.log('[YouTube] 最终字幕数量:', subtitles.length);

      return {
        id: videoId,
        platform: 'youtube',
        title: videoDetails.title || '无标题',
        description: videoDetails.shortDescription,
        thumbnail:
          videoDetails.thumbnail?.thumbnails?.pop()?.url ||
          `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        duration: parseInt(videoDetails.lengthSeconds) || 0,
        durationText: this.formatDuration(parseInt(videoDetails.lengthSeconds) || 0),
        author: videoDetails.author,
        formats,
        subtitles: subtitles.length > 0 ? subtitles : undefined,
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        parsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * 使用备用服务解析
   * 当主要方法失败时使用
   */
  private async parseWithBackup(videoId: string): Promise<VideoInfo | null> {
    try {
      // 使用 cobalt API（开源服务）
      const response = await this.fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          vCodec: 'h264',
          vQuality: '1080',
          aFormat: 'mp3',
        }),
      });

      const data = await response.json();

      if (data.status === 'error') {
        return null;
      }

      const formats: VideoFormat[] = [];

      // 如果是直接链接
      if (data.status === 'stream' || data.status === 'redirect') {
        formats.push(
          this.createFormat({
            id: `cobalt-${Date.now()}`,
            quality: 'best',
            format: 'mp4',
            url: data.url,
            hasAudio: true,
            hasVideo: true,
          })
        );
      }

      // 如果是选择器（多格式）
      if (data.status === 'picker' && Array.isArray(data.picker)) {
        for (const item of data.picker) {
          formats.push(
            this.createFormat({
              id: `cobalt-picker-${Date.now()}`,
              quality: item.quality || 'unknown',
              format: 'mp4',
              url: item.url,
              hasAudio: true,
              hasVideo: true,
            })
          );
        }
      }

      if (formats.length === 0) {
        return null;
      }

      return {
        id: videoId,
        platform: 'youtube',
        title: data.filename?.replace(/\.[^/.]+$/, '') || 'YouTube 视频',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 0,
        formats,
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        parsedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }
}
