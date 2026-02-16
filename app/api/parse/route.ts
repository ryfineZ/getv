import { NextRequest, NextResponse } from 'next/server';
import { detectPlatform, normalizeUrl, isSupportedVideoUrl } from '@/lib/utils/url-detector';
import { getParser, getBtchParser, getYtdlpParser, hasBtchFallback, hasYtdlpFallback, GenericParser } from '@/lib/parsers';
import type { ApiResponse, VideoInfo } from '@/lib/types';

// 通用解析器实例
const genericParser = new GenericParser();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { url } = body;

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
    let result = await parser.parse(url);

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
