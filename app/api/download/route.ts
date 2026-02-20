import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse, DownloadRequest } from '@/lib/types';
import { shouldUseFfmpeg, getRefererForUrl, getAudioContentType } from '@/lib/download-strategy';
import { FILE_SIZE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';

const FFMPEG_API_URL = process.env.FFMPEG_API_URL || 'https://ffmpeg.226022.xyz';

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_.\-]/g, '_')
    .replace(/[._]+$/, '');
}

const POLL_INTERVAL_MS = 3000;  // 每 3 秒轮询一次
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 最多等 30 分钟

/**
 * 走 FFmpeg VPS：提交异步任务 → 轮询完成 → 流式转发文件
 */
async function handleWithFfmpeg(body: DownloadRequest, filename: string): Promise<NextResponse> {
  const { videoUrl, audioUrl, formatId, action, trim, audioFormat, audioBitrate } = body;

  const referer = getRefererForUrl(videoUrl) ?? (audioUrl ? getRefererForUrl(audioUrl) : undefined);

  // 1. 提交任务，立即拿到 taskId
  const submitRes = await fetch(`${FFMPEG_API_URL}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl,
      audioUrl,
      formatId,
      action: action || 'download',
      trim,
      audioFormat,
      audioBitrate,
      referer,
    }),
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    console.error('[Download] 提交任务失败:', errorText);
    return NextResponse.json<ApiResponse>({ success: false, error: `处理失败: ${errorText}` }, { status: 500 });
  }

  const { taskId } = await submitRes.json() as { taskId: string };
  console.log('[Download] 任务已提交, taskId:', taskId);

  // 2. 轮询任务状态
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${FFMPEG_API_URL}/task/${taskId}`);
    if (!statusRes.ok) {
      return NextResponse.json<ApiResponse>({ success: false, error: '查询任务状态失败' }, { status: 500 });
    }

    const { status, error } = await statusRes.json() as { status: string; error?: string };
    console.log(`[Download] taskId: ${taskId}, status: ${status}`);

    if (status === 'error') {
      return NextResponse.json<ApiResponse>({ success: false, error: error || '处理失败' }, { status: 500 });
    }

    if (status === 'done') {
      // 3. 任务完成，流式转发文件
      const fileRes = await fetch(`${FFMPEG_API_URL}/task/${taskId}/file`);
      if (!fileRes.ok) {
        return NextResponse.json<ApiResponse>({ success: false, error: '获取文件失败' }, { status: 500 });
      }

      const contentLength = fileRes.headers.get('Content-Length');
      const contentDisposition = fileRes.headers.get('Content-Disposition');

      let contentType = 'video/mp4';
      let finalFilename = filename;
      if (action === 'extract-audio') {
        const fmt = audioFormat || 'mp3';
        contentType = getAudioContentType(fmt);
        finalFilename = filename.replace(/\.[^/.]+$/, `.${fmt}`);
      }

      return new NextResponse(fileRes.body, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': contentDisposition || `attachment; filename*=UTF-8''${encodeURIComponent(finalFilename)}`,
          ...(contentLength ? { 'Content-Length': contentLength } : {}),
          'Cache-Control': 'no-cache',
        },
      });
    }
    // status === 'pending' | 'processing'，继续轮询
  }

  return NextResponse.json<ApiResponse>({ success: false, error: '任务超时，请重试' }, { status: 504 });
}

/**
 * 直接代理：Worker 直接转发视频直链，无需 VPS
 */
async function handleDirect(body: DownloadRequest, filename: string): Promise<NextResponse> {
  const { videoUrl } = body;

  const referer = getRefererForUrl(videoUrl);
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (referer) headers['Referer'] = referer;

  const res = await fetch(videoUrl, { headers });

  if (!res.ok) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `无法获取视频文件 (${res.status})` },
      { status: 400 }
    );
  }

  const contentLength = res.headers.get('content-length');
  const size = contentLength ? parseInt(contentLength) : 0;

  if (size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
    return NextResponse.json<ApiResponse>({ success: false, error: '文件过大，最大支持 2GB' }, { status: 400 });
  }

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      'Access-Control-Expose-Headers': 'Content-Disposition',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json();
    const { videoUrl, filename } = body;

    if (!videoUrl) {
      return NextResponse.json<ApiResponse>({ success: false, error: '缺少视频链接' }, { status: 400 });
    }

    const downloadFilename = sanitizeFilename(filename || `video_${Date.now()}.mp4`);

    console.log('[Download] videoUrl:', videoUrl.substring(0, 100));
    console.log('[Download] action:', body.action || 'download');
    console.log('[Download] formatId:', body.formatId);
    console.log('[Download] audioUrl:', body.audioUrl?.substring(0, 80));
    console.log('[Download] shouldUseFfmpeg:', shouldUseFfmpeg({ videoUrl, audioUrl: body.audioUrl, action: body.action, formatId: body.formatId }));

    if (shouldUseFfmpeg({ videoUrl, audioUrl: body.audioUrl, action: body.action, formatId: body.formatId })) {
      return handleWithFfmpeg(body, downloadFilename);
    }

    return handleDirect(body, downloadFilename);
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : '下载失败' },
      { status: 500 }
    );
  }
}
