/**
 * FFmpeg API 客户端
 * 用于视频处理：合并、剪辑、转换、提取音频
 */

const FFMPEG_API_BASE = process.env.NEXT_PUBLIC_FFMPEG_API || 'https://ffmpeg.226022.xyz';

export interface FFmpegHealthStatus {
  status: 'ok' | 'error';
  ffmpeg: boolean;
  timestamp: string;
}

export interface MergeRequest {
  videoUrl: string;
  audioUrl: string;
  outputFormat?: 'mp4' | 'mkv' | 'webm';
}

export interface TrimRequest {
  videoUrl: string;
  startTime: number;  // 秒
  endTime: number;    // 秒
  outputFormat?: 'mp4' | 'webm' | 'mkv';
}

export interface ConvertRequest {
  videoUrl: string;
  outputFormat: 'mp4' | 'webm' | 'mp3' | 'm4a' | 'aac' | 'wav';
  quality?: 'high' | 'medium' | 'low';
}

export interface ExtractAudioRequest {
  videoUrl: string;
  format?: 'mp3' | 'm4a' | 'aac' | 'wav';
  bitrate?: number;  // kbps
}

export interface ProbeRequest {
  videoUrl: string;
}

export interface ProbeResult {
  format: {
    duration: number;
    size: number;
    bitrate: number;
    format_name: string;
  };
  streams: Array<{
    index: number;
    codec_type: 'video' | 'audio' | 'subtitle';
    codec_name: string;
    width?: number;
    height?: number;
    fps?: string;
    bitrate?: number;
    sample_rate?: number;
    channels?: number;
  }>;
}

/**
 * 检查 FFmpeg 服务状态
 */
export async function checkFFmpegHealth(): Promise<FFmpegHealthStatus> {
  const response = await fetch(`${FFMPEG_API_BASE}/health`);
  if (!response.ok) {
    throw new Error('FFmpeg service unavailable');
  }
  return response.json();
}

/**
 * 合并音视频
 * 用于将分离的视频轨道和音频轨道合并
 */
export async function mergeAudioVideo(
  params: MergeRequest,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const response = await fetch(`${FFMPEG_API_BASE}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: params.videoUrl,
      audioUrl: params.audioUrl,
      outputFormat: params.outputFormat || 'mp4',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Merge failed' }));
    throw new Error(error.error || '音视频合并失败');
  }

  return downloadWithProgress(response, onProgress);
}

/**
 * 视频剪辑
 * 截取视频的指定片段
 */
export async function trimVideo(
  params: TrimRequest,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const response = await fetch(`${FFMPEG_API_BASE}/trim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: params.videoUrl,
      startTime: params.startTime,
      endTime: params.endTime,
      outputFormat: params.outputFormat || 'mp4',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Trim failed' }));
    throw new Error(error.error || '视频剪辑失败');
  }

  return downloadWithProgress(response, onProgress);
}

/**
 * 格式转换
 * 将视频转换为指定格式
 */
export async function convertVideo(
  params: ConvertRequest,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const response = await fetch(`${FFMPEG_API_BASE}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: params.videoUrl,
      outputFormat: params.outputFormat,
      quality: params.quality || 'high',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Convert failed' }));
    throw new Error(error.error || '格式转换失败');
  }

  return downloadWithProgress(response, onProgress);
}

/**
 * 提取音频
 * 从视频中提取音轨
 */
export async function extractAudio(
  params: ExtractAudioRequest,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const response = await fetch(`${FFMPEG_API_BASE}/extract-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: params.videoUrl,
      format: params.format || 'mp3',
      bitrate: params.bitrate || 320,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Extract audio failed' }));
    throw new Error(error.error || '音频提取失败');
  }

  return downloadWithProgress(response, onProgress);
}

/**
 * 获取视频信息
 * 分析视频的编码、分辨率、时长等信息
 */
export async function probeVideo(params: ProbeRequest): Promise<ProbeResult> {
  const response = await fetch(`${FFMPEG_API_BASE}/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: params.videoUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Probe failed' }));
    throw new Error(error.error || '视频信息获取失败');
  }

  return response.json();
}

/**
 * 带进度的下载
 */
async function downloadWithProgress(
  response: Response,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const contentLength = response.headers.get('Content-Length');
  const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

  const chunks: Uint8Array[] = [];
  let downloadedSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    downloadedSize += value.length;

    if (onProgress && totalSize > 0) {
      const progress = Math.round((downloadedSize / totalSize) * 100);
      onProgress(progress);
    }
  }

  // 合并 chunks 并转换为 Blob
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combinedArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combinedArray.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([combinedArray]);
}

/**
 * 触发文件下载
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
