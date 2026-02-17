import type { VideoInfo, VideoFormat, ParseResult, Platform } from '../types';

/**
 * 视频解析器基类
 * 所有平台解析器都需要继承此类
 */
export abstract class BaseParser {
  abstract readonly platform: Platform;
  abstract readonly name: string;

  /**
   * 解析视频信息
   */
  abstract parse(url: string): Promise<ParseResult>;

  /**
   * 创建标准视频格式对象
   */
  protected createFormat(options: Partial<VideoFormat>): VideoFormat {
    return {
      id: options.id || `${this.platform}-${Date.now()}`,
      quality: options.quality || 'unknown',
      format: options.format || 'mp4',
      size: options.size,
      sizeText: options.size ? this.formatFileSize(options.size) : undefined,
      url: options.url || '',
      hasAudio: options.hasAudio ?? true,
      hasVideo: options.hasVideo ?? true,
      bitrate: options.bitrate,
      noWatermark: options.noWatermark,
    };
  }

  /**
   * 创建成功的解析结果
   */
  protected createSuccess(data: VideoInfo): ParseResult {
    return {
      success: true,
      data: {
        ...data,
        parsedAt: Date.now(),
      },
    };
  }

  /**
   * 创建失败的解析结果
   */
  protected createError(error: string): ParseResult {
    return {
      success: false,
      error,
    };
  }

  /**
   * 格式化文件大小
   */
  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
  }

  /**
   * 格式化时长
   */
  protected formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * 发送 HTTP 请求（带错误处理）
   */
  protected async fetch(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const defaultHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    // 合并 headers
    const mergedHeaders = {
      ...defaultHeaders,
      ...(options?.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers: mergedHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * 获取重定向后的 URL
   */
  protected async getRedirectUrl(url: string): Promise<string> {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });
    return response.url;
  }
}
