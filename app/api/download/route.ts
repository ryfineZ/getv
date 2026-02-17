import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse, DownloadRequest } from '@/lib/types';
import { FILE_SIZE_LIMITS } from '@/lib/constants';

export const maxDuration = 600; // 10 minutes

// FFmpeg API URL
const FFMPEG_API_URL = process.env.FFMPEG_API_URL || 'https://ffmpeg.226022.xyz';

/**
 * 检测 URL 是否需要通过 FFmpeg API 处理
 */
function needsFfmpegApi(url: string): boolean {
  // 原始 YouTube 页面 URL 需要 yt-dlp
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    return true;
  }
  // m3u8 需要 FFmpeg 处理
  if (url.includes('.m3u8')) {
    return true;
  }
  return false;
}

/**
 * 通过 FFmpeg API 下载视频
 */
async function downloadViaFfmpegApi(
  videoUrl: string,
  options?: {
    formatId?: string;
    audioUrl?: string;
    action?: string;
    trim?: { start: number; end: number };
    audioFormat?: string;
    audioBitrate?: number;
  }
): Promise<Response> {
  const response = await fetch(`${FFMPEG_API_URL}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl,
      formatId: options?.formatId,
      audioUrl: options?.audioUrl,
      action: options?.action || 'download',
      trim: options?.trim,
      audioFormat: options?.audioFormat,
      audioBitrate: options?.audioBitrate,
    }),
  });

  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json();
    const { videoUrl, formatId, audioUrl, filename, trim, action, audioFormat, audioBitrate } = body;

    console.log('[Download] Request for:', videoUrl?.substring(0, 100));
    console.log('[Download] Format ID:', formatId || 'auto');
    console.log('[Download] Action:', action || 'download');

    if (!videoUrl) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '缺少视频链接',
      }, { status: 400 });
    }

    // 清理文件名 - 移除特殊字符
    let downloadFilename = filename || `video_${Date.now()}.mp4`;
    downloadFilename = downloadFilename.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_.\-]/g, '_');
    downloadFilename = downloadFilename.replace(/[._]+$/, '');

    // 检测是否需要通过 FFmpeg API 处理
    const needsFfmpeg = needsFfmpegApi(videoUrl) || (audioUrl && needsFfmpegApi(audioUrl));

    if (needsFfmpeg || action === 'merge' || action === 'trim' || action === 'extract-audio') {
      console.log('[Download] Using FFmpeg API for processing');

      const ffmpegResponse = await downloadViaFfmpegApi(videoUrl, {
        formatId,
        audioUrl,
        action,
        trim,
        audioFormat,
        audioBitrate,
      });

      if (!ffmpegResponse.ok) {
        const errorText = await ffmpegResponse.text();
        console.error('[Download] FFmpeg API error:', errorText);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: `处理失败: ${errorText}`,
        }, { status: 500 });
      }

      // 流式返回文件内容
      const contentLength = ffmpegResponse.headers.get('Content-Length');
      const contentDisposition = ffmpegResponse.headers.get('Content-Disposition');

      // 确定内容类型
      let contentType = 'video/mp4';
      let finalFilename = downloadFilename;

      if (action === 'extract-audio') {
        const format = audioFormat || 'mp3';
        contentType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
        finalFilename = downloadFilename.replace(/\.[^/.]+$/, `.${format}`);
      }

      console.log('[Download] Streaming response, contentLength:', contentLength);

      // 直接流式返回，不等待完整下载
      return new NextResponse(ffmpegResponse.body, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': contentDisposition || `attachment; filename*=UTF-8''${encodeURIComponent(finalFilename)}`,
          'Content-Length': contentLength || '',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 普通下载（直接代理）
    // 检测是否需要特殊 Referer
    const needsPornhubReferer = videoUrl.includes('pornhub') ||
                                videoUrl.includes('phncdn');
    const needsXhsReferer = videoUrl.includes('xhscdn') ||
                            videoUrl.includes('xiaohongshu');

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (needsPornhubReferer) {
      fetchHeaders['Referer'] = 'https://www.pornhub.com/';
    } else if (needsXhsReferer) {
      fetchHeaders['Referer'] = 'https://www.xiaohongshu.com/';
    }

    // 获取视频流
    const response = await fetch(videoUrl, { headers: fetchHeaders });

    console.log('[Download] Response status:', response.status);

    if (!response.ok) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: `无法获取视频文件 (${response.status})`,
      }, { status: 400 });
    }

    const contentLength = response.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength) : 0;

    if (size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '文件过大，最大支持 2GB',
      }, { status: 400 });
    }

    console.log('[Download] Sending file:', downloadFilename);

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        'Content-Length': size.toString(),
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '下载失败',
    }, { status: 500 });
  }
}
