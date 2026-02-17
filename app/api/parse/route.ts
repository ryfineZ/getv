import { NextRequest, NextResponse } from 'next/server';
import { detectPlatform, normalizeUrl, isSupportedVideoUrl } from '@/lib/utils/url-detector';
import { getParser, getBtchParser, getYtdlpParser, hasBtchFallback, hasYtdlpFallback, GenericParser } from '@/lib/parsers';
import type { ApiResponse, VideoInfo, VideoFormat } from '@/lib/types';

// 通用解析器实例
const genericParser = new GenericParser();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { url } = body;
    const sessdata: string | undefined = body.sessdata;  // 可选的 B 站 SESSDATA

    if (!url) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '请输入视频链接',
      }, { status: 400 });
    }

    // 规范化 URL
    url = normalizeUrl(url);

    // 验证 URL
    if (!isSupportedVideoUrl(url)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '不支持此链接，请检查是否为有效的视频链接',
      }, { status: 400 });
    }

    // 检测平台
    const platform = detectPlatform(url);

    // 获取解析器
    const parser = getParser(platform);

    // 如果是未知平台，依次尝试：通用解析 -> yt-dlp
    if (!parser) {
      console.log(`[Parse] 未知平台，尝试通用解析: ${url}`);

      // 先尝试通用网页解析
      const genericResult = await genericParser.parse(url);
      if (genericResult.success && genericResult.data) {
        genericResult.data.platform = 'other';
        return NextResponse.json<ApiResponse<VideoInfo>>({
          success: true,
          data: genericResult.data,
        });
      }

      // 再尝试 yt-dlp
      console.log(`[Parse] 通用解析失败，尝试 yt-dlp: ${url}`);
      const ytdlpParser = getYtdlpParser();
      const ytdlpResult = await ytdlpParser.parse(url);

      if (ytdlpResult.success && ytdlpResult.data) {
        ytdlpResult.data.platform = 'other';
        return NextResponse.json<ApiResponse<VideoInfo>>({
          success: true,
          data: ytdlpResult.data,
        });
      }

      return NextResponse.json<ApiResponse>({
        success: false,
        error: '无法解析此链接，请确认是否为视频页面',
      }, { status: 400 });
    }

    // 解析视频
    let result;
    if (platform === 'bilibili' && sessdata) {
      // Bilibili 使用 sessdata 解析高清
      result = await parser.parse(url, { sessdata });
    } else {
      result = await parser.parse(url);
    }

    // YouTube 视频直接使用 FFmpeg API 后备（因为 Cloudflare Workers 不支持 yt-dlp）
    if (!result.success && platform === 'youtube') {
      console.log(`[Parse] YouTube 解析失败，尝试 FFmpeg API`);
      try {
        const ffmpegApiUrl = process.env.FFMPEG_API_URL || 'https://ffmpeg.226022.xyz';
        const ffmpegResponse = await fetch(`${ffmpegApiUrl}/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (ffmpegResponse.ok) {
          const ffmpegData = await ffmpegResponse.json();
          if (ffmpegData.success && ffmpegData.data) {
            console.log(`[Parse] FFmpeg API 解析成功`);
            ffmpegData.data.platform = 'youtube';
            result = { success: true, data: ffmpegData.data };
          }
        }
      } catch (ffmpegError) {
        console.log('[Parse] FFmpeg API 解析失败:', ffmpegError);
      }
    }

    // 如果解析器失败，尝试使用通用网页解析作为后备
    if (!result.success) {
      console.log(`[Parse] 专用解析器失败，尝试通用网页解析: ${url}`);
      const genericResult = await genericParser.parse(url);
      if (genericResult.success && genericResult.data) {
        console.log(`[Parse] 通用网页解析成功, platform=${platform}, hasBtchFallback=${hasBtchFallback(platform)}`);

        // 始终设置正确的平台
        genericResult.data.platform = platform;

        // 如果是已知平台但专用解析器失败了，尝试用 btch-downloader 获取更多信息
        if (platform !== 'unknown' && hasBtchFallback(platform)) {
          console.log(`[Parse] 尝试 btch-downloader 获取元数据`);
          try {
            const btchParser = getBtchParser();
            const btchResult = await btchParser.parse(url);
            console.log(`[Parse] btch result:`, btchResult.success, JSON.stringify(btchResult.data || {}));
            if (btchResult.success && btchResult.data) {
              // 合并 btch 的元数据和 generic 的视频链接
              if (btchResult.data.thumbnail) {
                genericResult.data.thumbnail = btchResult.data.thumbnail;
              }
              if (btchResult.data.title && btchResult.data.title !== '未知标题') {
                genericResult.data.title = btchResult.data.title;
              }
              if (btchResult.data.author) {
                genericResult.data.author = btchResult.data.author;
              }
              if (btchResult.data.duration) {
                genericResult.data.duration = btchResult.data.duration;
                genericResult.data.durationText = btchResult.data.durationText;
              }
              console.log(`[Parse] 合并后: platform=${genericResult.data.platform}, thumbnail=${genericResult.data.thumbnail}`);
            }
          } catch (e) {
            console.log('[Parse] btch-downloader 元数据获取失败:', e);
          }
        }

        result = genericResult;
      }
    }

    // 如果通用解析也失败，尝试 btch-downloader 后备
    if (!result.success && hasBtchFallback(platform)) {
      console.log(`[Parse] 尝试 btch-downloader 后备: ${url}`);
      try {
        const btchParser = getBtchParser();
        const btchResult = await btchParser.parse(url);
        if (btchResult.success && btchResult.data) {
          console.log(`[Parse] btch-downloader 后备解析成功`);
          // 确保平台正确
          btchResult.data.platform = platform;
          result = btchResult;
        }
      } catch (btchError) {
        console.log('[Parse] btch-downloader 后备解析失败:', btchError);
      }
    }

    // 如果 btch 也失败，尝试使用 yt-dlp 后备
    if (!result.success && hasYtdlpFallback(platform)) {
      console.log(`[Parse] 尝试 yt-dlp 后备: ${url}`);
      try {
        const ytdlpParser = getYtdlpParser();
        const ytdlpResult = await ytdlpParser.parse(url);
        if (ytdlpResult.success && ytdlpResult.data) {
          console.log(`[Parse] yt-dlp 后备解析成功`);
          // 确保平台正确，只有未知平台才设为 other
          if (platform !== 'unknown') {
            ytdlpResult.data.platform = platform;
          } else {
            ytdlpResult.data.platform = 'other';
          }
          result = ytdlpResult;
        }
      } catch (ytdlpError) {
        console.log('[Parse] yt-dlp 后备解析失败:', ytdlpError);
      }
    }

    // 如果 yt-dlp 也失败，尝试调用远程 FFmpeg API
    if (!result.success) {
      console.log(`[Parse] 尝试 FFmpeg API 后备: ${url}`);
      try {
        const ffmpegApiUrl = process.env.FFMPEG_API_URL || 'https://ffmpeg.226022.xyz';
        const ffmpegResponse = await fetch(`${ffmpegApiUrl}/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (ffmpegResponse.ok) {
          const ffmpegData = await ffmpegResponse.json();
          if (ffmpegData.success && ffmpegData.data) {
            console.log(`[Parse] FFmpeg API 后备解析成功`);
            // 确保平台正确
            if (platform !== 'unknown') {
              ffmpegData.data.platform = platform;
            } else {
              ffmpegData.data.platform = ffmpegData.data.platform || 'other';
            }
            result = { success: true, data: ffmpegData.data };
          }
        }
      } catch (ffmpegError) {
        console.log('[Parse] FFmpeg API 后备解析失败:', ffmpegError);
      }
    }

    if (!result.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: result.error || '解析失败',
      }, { status: 400 });
    }

    // YouTube 视频：如果缺少字幕，独立获取
    if (result.success && result.data && result.data.platform === 'youtube' && !result.data.subtitles?.length) {
      try {
        const videoId = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1]
          || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1];
        if (videoId) {
          console.log(`[Parse] 补充获取 YouTube 字幕: ${videoId}`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const captionRes = await fetch(
            `https://www.youtube.com/youtubei/v1/player?key=${process.env.YOUTUBE_INNERTUBE_KEY || ''}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId,
                context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
              }),
              signal: controller.signal,
            }
          );
          clearTimeout(timeout);
          const capData = await captionRes.json();
          const renderer = capData.captions?.playerCaptionsTracklistRenderer;
          const tracks = renderer?.captionTracks || [];
          const tlangs = renderer?.translationLanguages || [];

          interface CaptionTrack {
            baseUrl?: string;
            languageCode?: string;
            name?: { simpleText?: string; runs?: { text: string }[] };
            kind?: string;
          }
          interface TranslationLang {
            languageCode?: string;
            languageName?: { simpleText?: string; runs?: { text: string }[] };
          }

          if (tracks.length > 0) {
            const subtitles: { lang: string; label: string; url: string; format: string; isAutoGenerated: boolean }[] = [];
            for (const t of tracks as CaptionTrack[]) {
              if (!t.baseUrl) continue;
              const srtUrl = t.baseUrl.includes('fmt=')
                ? t.baseUrl.replace(/fmt=[^&]+/, 'fmt=srv1')
                : `${t.baseUrl}&fmt=srv1`;
              subtitles.push({
                lang: t.languageCode || 'unknown',
                label: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode || '未知',
                url: srtUrl,
                format: 'srt',
                isAutoGenerated: t.kind === 'asr',
              });
            }
            // 自动翻译字幕
            if (tlangs.length > 0 && tracks.length > 0) {
              const baseTrack = (tracks as CaptionTrack[]).find(t => t.kind !== 'asr') || tracks[0];
              if (baseTrack?.baseUrl) {
                const existingLangs = new Set(subtitles.map(s => s.lang));
                for (const tl of tlangs as TranslationLang[]) {
                  const lang = tl.languageCode;
                  if (!lang || existingLangs.has(lang)) continue;
                  const tlUrl = baseTrack.baseUrl!.includes('fmt=')
                    ? baseTrack.baseUrl!.replace(/fmt=[^&]+/, 'fmt=srv1') + `&tlang=${lang}`
                    : `${baseTrack.baseUrl}&fmt=srv1&tlang=${lang}`;
                  subtitles.push({
                    lang,
                    label: tl.languageName?.simpleText || tl.languageName?.runs?.[0]?.text || lang,
                    url: tlUrl,
                    format: 'srt',
                    isAutoGenerated: true,
                  });
                }
              }
            }
            result.data.subtitles = subtitles;
            console.log(`[Parse] 字幕补充成功: ${subtitles.length} 条`);
          }
        }
      } catch (e) {
        console.log('[Parse] 字幕补充失败（不影响视频解析）:', e instanceof Error ? e.message : e);
      }
    }

    // ===== 通用文件大小补充：对没有 size 的格式发 HEAD 请求获取 Content-Length =====
    if (result.data.formats) {
      const formatsNeedingSize = result.data.formats.filter((f: VideoFormat) => !f.size && f.url);
      if (formatsNeedingSize.length > 0) {
        const formatFileSize = (bytes: number): string => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };

        const sizePromises = formatsNeedingSize.map(async (format: VideoFormat) => {
          try {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

            // 1. 尝试 HEAD 请求
            const controller1 = new AbortController();
            const t1 = setTimeout(() => controller1.abort(), 3000);
            const resp1 = await fetch(format.url, {
              method: 'HEAD',
              signal: controller1.signal,
              headers: { 'User-Agent': ua },
            });
            clearTimeout(t1);
            const cl = resp1.headers.get('content-length');
            const ct = resp1.headers.get('content-type') || '';
            // 仅当 content-type 是媒体类型时才信任 content-length
            const isMedia = ct.includes('video') || ct.includes('audio') || ct.includes('octet-stream');
            if (cl && parseInt(cl) > 0 && isMedia) {
              format.size = parseInt(cl);
              format.sizeText = formatFileSize(format.size);
              return;
            }

            // 2. HEAD 无 Content-Length → 尝试 Range 请求获取 Content-Range
            const controller2 = new AbortController();
            const t2 = setTimeout(() => controller2.abort(), 3000);
            const resp2 = await fetch(format.url, {
              method: 'GET',
              signal: controller2.signal,
              headers: { 'User-Agent': ua, 'Range': 'bytes=0-0' },
            });
            clearTimeout(t2);

            if (resp2.status === 206) {
              // Content-Range: bytes 0-0/12345678
              const cr = resp2.headers.get('content-range');
              if (cr) {
                const match = cr.match(/\/(\d+)/);
                if (match && parseInt(match[1]) > 0) {
                  format.size = parseInt(match[1]);
                  format.sizeText = formatFileSize(format.size);
                }
              }
            }
          } catch {
            // 请求失败不影响解析结果
          }
        });

        await Promise.allSettled(sizePromises);
      }
    }

    return NextResponse.json<ApiResponse<VideoInfo>>({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
    }, { status: 500 });
  }
}
