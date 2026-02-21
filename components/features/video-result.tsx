'use client';

import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import type { VideoInfo, VideoFormat, Subtitle, DownloadRequest } from '@/lib/types';
import { formatDuration } from '@/lib/utils/url-detector';
import { PLATFORMS } from '@/lib/constants';
import { VideoTrimmer } from './video-trimmer';

const UTF8_FILENAME_REGEX = /filename\*=UTF-8''([^;]+)/;
const LEGACY_FILENAME_REGEX = /filename="?([^";]+)"?/;

const TEXTS = {
  zh: {
    noPrev: '无预览',
    downloadCover: '下载封面',
    videoDownload: '视频下载',
    tabMerged: '原画',
    tabVideo: '仅视频',
    tabAudio: '仅音频',
    quality: '画质',
    encoding: '编码格式',
    audioFormat: '音频格式',
    fileSize: '文件大小',
    downloading: '下载中',
    download: '下载',
    downloadAudio: '下载 MP3 (320kbps)',
    trimVideo: '视频剪辑',
    cancel: '取消',
    clickExpand: '点击展开',
    auto: '自动 (最佳)',
    subtitles: '字幕下载',
    downloadSubtitle: '下载',
    trimHint: '已设置剪辑',
    noFormats: '无可用格式',
    serverProcessing: '服务器处理中，请稍候...',
    imageGallery: '图片下载',
    downloadAll: '下载全部图片',
    downloadImage: '下载',
    imageCount: '张图片',
  },
  en: {
    noPrev: 'No preview',
    downloadCover: 'Download Cover',
    videoDownload: 'Video Download',
    tabMerged: 'Original',
    tabVideo: 'Video Only',
    tabAudio: 'Audio Only',
    quality: 'Quality',
    encoding: 'Encoding',
    audioFormat: 'Audio Format',
    fileSize: 'File size',
    downloading: 'Downloading',
    download: 'Download',
    downloadAudio: 'Download MP3 (320kbps)',
    trimVideo: 'Trim Video',
    cancel: 'Cancel',
    clickExpand: 'Click to expand',
    auto: 'Auto (best)',
    subtitles: 'Subtitles',
    downloadSubtitle: 'Download',
    trimHint: 'Trim set',
    noFormats: 'No formats available',
    serverProcessing: 'Server processing, please wait...',
    imageGallery: 'Image Download',
    downloadAll: 'Download All Images',
    downloadImage: 'Download',
    imageCount: 'images',
  },
} as const;

interface VideoResultProps {
  videoInfo: VideoInfo;
  onReset?: () => void;
  compact?: boolean;
  onExpand?: () => void;
  lang?: 'zh' | 'en';
}

type FormatTab = 'merged' | 'video' | 'audio';

// 从 quality 字符串中提取分辨率数字
function qualityToNumber(q: string): number {
  if (!q) return 0;
  const upper = q.toUpperCase();
  if (upper.includes('4K') || upper.includes('2160')) return 2160;
  if (upper.includes('8K') || upper.includes('4320')) return 4320;
  if (upper.includes('2K') || upper.includes('1440')) return 1440;
  const match = q.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// 规范化编码名称
function normalizeCodec(codec?: string): string {
  if (!codec) return 'auto';
  const c = codec.toLowerCase();
  if (c.includes('h264') || c.includes('avc')) return 'H264';
  if (c.includes('h265') || c.includes('hevc')) return 'H265';
  if (c.includes('vp9')) return 'VP9';
  if (c.includes('av1') || c.includes('av01')) return 'AV1';
  return codec.toUpperCase();
}

function VideoResultInner({ videoInfo, onReset, compact, onExpand, lang = 'zh' }: VideoResultProps) {
  // ============ 分类格式 ============
  const { allVideoFormats, videoOnlyFormats, audioOnlyFormats, bestAudio } = useMemo(() => {
    const allVideo = videoInfo.formats
      .filter(f => f.hasVideo)
      .sort((a, b) => {
        const qDiff = qualityToNumber(b.quality) - qualityToNumber(a.quality);
        if (qDiff !== 0) return qDiff;
        // 同分辨率：优先有音频的
        if (a.hasAudio !== b.hasAudio) return a.hasAudio ? -1 : 1;
        return (b.size || 0) - (a.size || 0);
      });

    const videoOnly = videoInfo.formats
      .filter(f => f.hasVideo && !f.hasAudio)
      .sort((a, b) => qualityToNumber(b.quality) - qualityToNumber(a.quality));

    const audioOnly = videoInfo.formats
      .filter(f => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const best = audioOnly.length > 0 ? audioOnly[0] : null;

    return {
      allVideoFormats: allVideo,
      videoOnlyFormats: videoOnly,
      audioOnlyFormats: audioOnly,
      bestAudio: best,
    };
  }, [videoInfo.formats]);

  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [activeTab, setActiveTab] = useState<FormatTab>('merged');
  const [selectedCodec, setSelectedCodec] = useState<string>('auto');
  const [selectedSubtitleIdx, setSelectedSubtitleIdx] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(videoInfo.duration);

  // 对防盗链 CDN 的图片使用代理
  const proxyImageUrl = (url: string | undefined) => {
    if (!url) return undefined;
    if (url.includes('hdslb.com') || url.includes('bilibili.com') || url.includes('xhscdn.com') || url.includes('xiaohongshu.com')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 当前 Tab 的原始格式列表
  const rawFormats = useMemo(() => {
    switch (activeTab) {
      case 'merged': return allVideoFormats;
      case 'video': return videoOnlyFormats;
      case 'audio': return audioOnlyFormats;
      default: return [];
    }
  }, [activeTab, allVideoFormats, videoOnlyFormats, audioOnlyFormats]);

  // 提取可用的编码列表
  const availableCodecs = useMemo(() => {
    if (activeTab === 'audio') return [];
    const codecs = new Set<string>();
    for (const f of rawFormats) {
      const codec = normalizeCodec(f.codec);
      if (codec !== 'auto') codecs.add(codec);
    }
    return Array.from(codecs);
  }, [rawFormats, activeTab]);

  // 根据选中的编码过滤格式，然后按画质去重
  const filteredFormats = useMemo(() => {
    if (activeTab === 'audio') return rawFormats;

    let formats = rawFormats;

    // 按编码过滤
    if (selectedCodec !== 'auto') {
      formats = formats.filter(f => normalizeCodec(f.codec) === selectedCodec);
    }

    // 按分辨率+fps去重，保留第一个（已按优先级排序）
    const unique: VideoFormat[] = [];
    const seen = new Set<string>();
    for (const f of formats) {
      const resolution = qualityToNumber(f.quality);
      const fpsKey = f.fps && f.fps > 30 ? `${f.fps}` : '30';
      const key = `${resolution}-${fpsKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f);
      }
    }
    return unique;
  }, [rawFormats, selectedCodec, activeTab]);

  // 初始化
  useEffect(() => {
    if (allVideoFormats.length > 0) {
      setActiveTab('merged');
      setSelectedCodec('auto');
    } else if (audioOnlyFormats.length > 0) {
      setActiveTab('audio');
    }
  }, [allVideoFormats, audioOnlyFormats]);

  // 当 filteredFormats 变化时，自动选择最高画质
  useEffect(() => {
    if (filteredFormats.length > 0) {
      setSelectedFormat(filteredFormats[0]);
    } else {
      setSelectedFormat(null);
    }
  }, [filteredFormats]);

  // 编码变更时重置选中格式
  const handleCodecChange = useCallback((codec: string) => {
    setSelectedCodec(codec);
  }, []);

  const isYouTube = videoInfo.platform === 'youtube';
  const platform = PLATFORMS[videoInfo.platform];

  // 取消下载
  const handleCancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDownloading(false);
    setDownloadProgress(0);
  }, []);

  const t = TEXTS[lang];

  const getProgressText = () => {
    if (!downloading) return '';
    if (downloadProgress < 0) return t.serverProcessing;
    return `${downloadProgress}%`;
  };
  const handleStreamDownload = async (response: Response, signal: AbortSignal) => {
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `video.mp4`;
    if (contentDisposition) {
      const utf8Match = contentDisposition.match(UTF8_FILENAME_REGEX);
      if (utf8Match) filename = decodeURIComponent(utf8Match[1]);
      else {
        const match = contentDisposition.match(LEGACY_FILENAME_REGEX);
        if (match) filename = decodeURIComponent(match[1]);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const contentLength = response.headers.get('Content-Length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    // 尝试使用 File System Access API 直接分发到磁盘（无内存占用，支持 Chrome/Edge 桌面端）
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
        });
        const writable = await fileHandle.createWritable();

        let totalDownloaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal.aborted) {
            await writable.abort();
            throw new Error('已取消');
          }

          await writable.write(value);
          totalDownloaded += value.length;
          if (totalSize > 0) {
            setDownloadProgress(Math.round((totalDownloaded / totalSize) * 100));
          }
        }
        await writable.close();
        setDownloadProgress(100);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === '已取消') {
          throw new Error('已取消');
        }
        console.warn('showSaveFilePicker 失败，回退到 Blob 内存下载:', err);
      }
    }

    // 备选方案：通过内存收集完整 Blob 再下载（兼容所有浏览器，但大文件可能崩溃）
    const chunks: Uint8Array[] = [];
    let totalDownloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new Error('已取消');

      chunks.push(value);
      totalDownloaded += value.length;

      if (totalSize > 0) {
        setDownloadProgress(Math.round((totalDownloaded / totalSize) * 100));
      }
    }

    const blob = new Blob(chunks as BlobPart[]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadProgress(100);
  };

  // ============ 下载处理 ============
  // 公共执行逻辑：发请求 → 流式下载
  const executeDownload = async (body: DownloadRequest) => {
    setDownloading(true);
    setDownloadProgress(-1);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || '下载失败');
      }

      const contentType = response.headers.get('Content-Type') || '';

      // VPS 异步任务完成后返回直链，浏览器直连下载
      if (contentType.includes('application/json')) {
        const json = await response.json() as { success: boolean; data?: { url: string; filename: string }; error?: string };
        if (!json.success || !json.data?.url) throw new Error(json.error || '下载失败');
        const a = document.createElement('a');
        a.href = json.data.url;
        a.download = json.data.filename || 'video.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDownloadProgress(100);
        return;
      }

      // 直接代理流（非 VPS 路径）
      setDownloadProgress(0);
      await handleStreamDownload(response, abortController.signal);
    } catch (error) {
      if (error instanceof Error && error.message !== '已取消') {
        alert(error.message);
      }
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleDownload = async (format?: VideoFormat) => {
    const targetFormat = format || selectedFormat;
    if (!targetFormat || downloading) return;

    const needsTrim = showTrimmer && (trimStart > 0 || trimEnd < videoInfo.duration);
    const needsMerge = activeTab === 'merged' && targetFormat.hasVideo && !targetFormat.hasAudio && bestAudio;
    const filename = `${videoInfo.title.slice(0, 50)}.mp4`;

    const body: DownloadRequest = { videoUrl: targetFormat.url, filename };

    if (needsMerge) {
      // 分离流：YouTube 传 originalUrl+formatId 让 VPS 用 yt-dlp 处理（action=download，VPS 自动合并）
      // 其他平台传视频直链+音频直链，VPS 用 ffmpeg 合并（action=merge）
      if (isYouTube && videoInfo.originalUrl) {
        body.videoUrl = videoInfo.originalUrl;
        body.formatId = targetFormat.id;
        body.action = 'download';
      } else {
        body.audioUrl = bestAudio!.url;
        body.action = 'merge';
      }
    }

    // 仅视频 tab：YouTube 格式也走 VPS yt-dlp，速度更快
    if (activeTab === 'video' && isYouTube && videoInfo.originalUrl) {
      body.videoUrl = videoInfo.originalUrl;
      body.formatId = targetFormat.id;
      body.action = 'download';
      body.videoOnly = true;
    }

    if (needsTrim) {
      body.action = 'trim';
      body.trim = { start: trimStart, end: trimEnd };
    }

    await executeDownload(body);
  };

  const handleDownloadAudio = async () => {
    if (downloading) return;
    const audioSourceUrl = selectedFormat?.url || bestAudio?.url;
    if (!audioSourceUrl) return alert('没有可用的音频源');

    const body: DownloadRequest = {
      videoUrl: audioSourceUrl,
      action: 'extract-audio',
      audioFormat: 'mp3',
      audioBitrate: 320,
      filename: `${videoInfo.title.slice(0, 50)}.mp3`,
    };

    // YouTube：传 originalUrl 让 VPS 用 yt-dlp 下载音频
    if (isYouTube && videoInfo.originalUrl) {
      body.videoUrl = videoInfo.originalUrl;
      body.formatId = selectedFormat?.id || bestAudio?.id;
    }

    await executeDownload(body);
  };

  // 下载封面
  const handleDownloadCover = useCallback(() => {
    if (!videoInfo.thumbnail) return;
    const a = document.createElement('a');
    a.href = videoInfo.thumbnail;
    a.download = `${videoInfo.title.slice(0, 50)}_cover.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [videoInfo]);

  // 下载字幕
  const handleDownloadSubtitle = useCallback(async (subtitleUrl: string, subtitleLang: string) => {
    try {
      const a = document.createElement('a');
      a.href = subtitleUrl;
      a.download = `${videoInfo.title.slice(0, 50)}_${subtitleLang}.srt`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert(lang === 'zh' ? '字幕下载失败' : 'Subtitle download failed');
    }
  }, [videoInfo, lang]);

  // 下载单张图片
  const handleDownloadImage = useCallback((imageUrl: string, index: number) => {
    const a = document.createElement('a');
    a.href = proxyImageUrl(imageUrl) || imageUrl;
    a.download = `${videoInfo.title.slice(0, 50)}_${index + 1}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [videoInfo]);

  // 下载全部图片
  const handleDownloadAllImages = useCallback(() => {
    if (!videoInfo.images) return;
    videoInfo.images.forEach((url, i) => {
      setTimeout(() => handleDownloadImage(url, i), i * 300);
    });
  }, [videoInfo.images, handleDownloadImage]);

  // 是否为图片模式
  const isImageMode = (videoInfo.images?.length ?? 0) > 0 && videoInfo.formats.length === 0;

  // 剪辑后文件大小估算
  const estimatedTrimSize = useMemo(() => {
    if (!showTrimmer || !selectedFormat?.size || !videoInfo.duration) return null;
    const trimDuration = trimEnd - trimStart;
    if (trimDuration >= videoInfo.duration) return null;
    const ratio = trimDuration / videoInfo.duration;
    const estimatedBytes = Math.round(selectedFormat.size * ratio);
    if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(1)} KB`;
    }
    return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [showTrimmer, selectedFormat, videoInfo.duration, trimStart, trimEnd]);

  // 字幕数据
  const subtitles: Subtitle[] | undefined = videoInfo.subtitles;

  // ========== 紧凑模式 ==========
  if (compact) {
    return (
      <div
        className="w-full glass p-4 cursor-pointer hover:border-[var(--primary)]/50 transition-all animate-fadeIn"
        onClick={onExpand}
      >
        <div className="flex gap-4 items-center">
          <div className="w-24 h-16 bg-black/50 rounded-lg overflow-hidden shrink-0 relative border border-[var(--border)]">
            {videoInfo.thumbnail ? (
              <img src={proxyImageUrl(videoInfo.thumbnail)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-xs">{t.noPrev}</div>
            )}
            {videoInfo.duration > 0 && (
              <div className="absolute bottom-0.5 right-0.5 px-1 bg-black/80 rounded text-[10px] text-white">
                {formatDuration(videoInfo.duration)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">{videoInfo.title}</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{platform.name} · {t.clickExpand}</p>
          </div>
          <svg className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  }

  // 画质标签
  const qualityLabel = (format: VideoFormat) => {
    const parts: string[] = [];
    parts.push(format.quality || '默认');
    if (format.fps && format.fps > 30) parts.push(`${format.fps}fps`);
    if (format.sizeText) parts.push(`(${format.sizeText})`);
    return parts.join(' ');
  };

  // ========== 展开模式 - 双栏布局 ==========
  return (
    <div className="w-full max-w-5xl mx-auto animate-fadeIn">
      <div className="glass overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row">
          {/* ===== 左栏：预览 ===== */}
          <div className="lg:w-[45%] p-6 lg:p-8 bg-[rgba(0,0,0,0.2)]">
            {/* 视频缩略图 */}
            <div className="relative aspect-video bg-black/50 rounded-xl overflow-hidden">
              {videoInfo.thumbnail ? (
                <img src={proxyImageUrl(videoInfo.thumbnail)} alt={videoInfo.title} className="w-full h-full object-contain" />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">{t.noPrev}</div>
              )}
              <div
                className="absolute top-3 left-3 px-2 py-0.5 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: platform.color }}
              >
                {platform.name}
              </div>
              {videoInfo.duration > 0 && (
                <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/80 rounded-lg text-xs text-white">
                  {formatDuration(videoInfo.duration)}
                </div>
              )}
            </div>

            {/* 封面下载 */}
            {videoInfo.thumbnail && (
              <button onClick={handleDownloadCover} className="mt-3 w-full btn btn-secondary btn-sm text-xs gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t.downloadCover}
              </button>
            )}

            {/* 视频标题 & 作者 */}
            <div className="mt-4">
              <h2 className="font-semibold text-base leading-snug line-clamp-2">{videoInfo.title}</h2>
              {videoInfo.author && (
                <p className="text-sm text-[var(--muted-foreground)] mt-1">{videoInfo.author}</p>
              )}
            </div>

            {/* 字幕区域 */}
            {subtitles && subtitles.length > 0 && (
              <div className="mt-4">
                <div className="section-label mb-2">{t.subtitles} ({subtitles.length})</div>
                <div className="flex gap-2 items-center">
                  <select
                    className="select-field flex-1"
                    value={selectedSubtitleIdx ?? ''}
                    onChange={(e) => setSelectedSubtitleIdx(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">{lang === 'zh' ? '选择字幕语言...' : 'Select subtitle...'}</option>
                    {subtitles.map((sub, idx) => (
                      <option key={`${sub.lang}-${idx}`} value={idx}>
                        {sub.label || sub.lang}{sub.isAutoGenerated ? (lang === 'zh' ? ' (自动)' : ' (Auto)') : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (selectedSubtitleIdx !== null && subtitles[selectedSubtitleIdx]) {
                        const sub = subtitles[selectedSubtitleIdx];
                        handleDownloadSubtitle(sub.url, sub.lang);
                      }
                    }}
                    disabled={selectedSubtitleIdx === null}
                    className="btn-secondary text-xs px-3 py-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ⬇ {t.downloadSubtitle}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ===== 右栏：操作面板 ===== */}
          <div className="lg:w-[55%] border-t lg:border-t-0 lg:border-l border-[var(--glass-border)] p-6 lg:p-8">

            {isImageMode ? (
              /* ===== 图片模式 ===== */
              <div>
                <div className="section-label mb-3">{t.imageGallery} ({videoInfo.images!.length} {t.imageCount})</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-[400px] overflow-y-auto">
                  {videoInfo.images!.map((img, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-[var(--border)] aspect-square bg-black/30">
                      <img
                        src={proxyImageUrl(img)}
                        alt={`${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <button
                        onClick={() => handleDownloadImage(img, idx)}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleDownloadAllImages}
                  className="w-full btn btn-primary btn-lg animate-pulse-glow"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>{t.downloadAll} ({videoInfo.images!.length})</span>
                  </div>
                </button>
              </div>
            ) : (
            /* ===== 视频模式 ===== */
            <>
            {/* 下载进度条 */}
            {downloading && (
              <div className="mb-4">
                <div className="progress-bar">
                  <div className={`progress-bar-fill${downloadProgress < 0 ? ' indeterminate' : ''}`} style={downloadProgress >= 0 ? { width: `${downloadProgress}%` } : undefined} />
                </div>
                <p className="text-xs text-center text-[var(--muted-foreground)] mt-1.5">{getProgressText()}</p>
              </div>
            )}

            {/* Tab 切换 */}
            <div className="section-label mb-3">{t.videoDownload}</div>
            <div className="tab-group mb-4">
              {allVideoFormats.length > 0 && (
                <button
                  className={`tab-item ${activeTab === 'merged' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('merged'); setSelectedCodec('auto'); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t.tabMerged}
                </button>
              )}
              {videoOnlyFormats.length > 0 && (
                <button
                  className={`tab-item ${activeTab === 'video' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('video'); setSelectedCodec('auto'); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                  {t.tabVideo}
                </button>
              )}
              {audioOnlyFormats.length > 0 && (
                <button
                  className={`tab-item ${activeTab === 'audio' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('audio'); setSelectedCodec('auto'); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  {t.tabAudio}
                </button>
              )}
            </div>

            {/* 视频格式：编码（左）+ 画质（右）联动选择 */}
            {activeTab !== 'audio' && (
              <div className="space-y-3 mb-4">
                <div className="flex gap-3">
                  {/* 编码选择（左）*/}
                  <div className="w-36">
                    <label className="text-xs text-[var(--muted-foreground)] mb-1.5 block">{t.encoding}</label>
                    <select
                      className="select-field w-full"
                      value={selectedCodec}
                      onChange={(e) => handleCodecChange(e.target.value)}
                      disabled={downloading}
                    >
                      <option value="auto">{t.auto}</option>
                      {availableCodecs.map((codec) => (
                        <option key={codec} value={codec}>{codec}</option>
                      ))}
                    </select>
                  </div>

                  {/* 画质选择（右）*/}
                  <div className="flex-1">
                    <label className="text-xs text-[var(--muted-foreground)] mb-1.5 block">{t.quality}</label>
                    {filteredFormats.length > 0 ? (
                      <select
                        className="select-field w-full"
                        value={selectedFormat?.id || ''}
                        onChange={(e) => {
                          const fmt = filteredFormats.find(f => f.id === e.target.value);
                          if (fmt) setSelectedFormat(fmt);
                        }}
                        disabled={downloading}
                      >
                        {filteredFormats.map((format) => (
                          <option key={format.id} value={format.id}>
                            {qualityLabel(format)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="select-field w-full text-center text-[var(--muted-foreground)]">{t.noFormats}</div>
                    )}
                  </div>
                </div>

                {/* 文件大小 */}
                {(selectedFormat?.sizeText || estimatedTrimSize) && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t.fileSize}: {selectedFormat?.sizeText || '-'}
                    {estimatedTrimSize && (
                      <span className="text-[var(--primary)]"> → ~{estimatedTrimSize}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 音频 Tab 的格式选择 */}
            {activeTab === 'audio' && audioOnlyFormats.length > 0 && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-[var(--muted-foreground)] mb-1.5 block">{t.audioFormat}</label>
                  <select
                    className="select-field w-full"
                    value={selectedFormat?.id || ''}
                    onChange={(e) => {
                      const fmt = audioOnlyFormats.find(f => f.id === e.target.value);
                      if (fmt) setSelectedFormat(fmt);
                    }}
                    disabled={downloading}
                  >
                    {audioOnlyFormats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.quality || 'Auto'} {format.sizeText ? `(${format.sizeText})` : ''} {format.bitrate ? `${Math.round(format.bitrate / 1000)}kbps` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* 剪辑工具（仅视频 Tab 显示）*/}
            {activeTab !== 'audio' && videoInfo.duration > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowTrimmer(!showTrimmer)}
                  className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                  </svg>
                  <span>{t.trimVideo}</span>
                  {showTrimmer && (trimStart > 0 || trimEnd < videoInfo.duration) && (
                    <span className="text-xs text-[var(--primary)]">
                      ({formatDuration(trimStart)} → {formatDuration(trimEnd)})
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showTrimmer ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showTrimmer && (
                  <div className="mt-3">
                    <VideoTrimmer
                      duration={videoInfo.duration}
                      onTrimChange={(start, end) => {
                        setTrimStart(start);
                        setTrimEnd(end);
                      }}
                      disabled={downloading}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 下载按钮 */}
            <div className="space-y-2.5">
              {activeTab !== 'audio' ? (
                <button
                  onClick={() => handleDownload()}
                  disabled={!selectedFormat || downloading}
                  className="w-full btn btn-primary btn-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none animate-pulse-glow"
                >
                  {downloading ? (
                    <div className="flex items-center gap-2">
                      <div className="loader" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      <span>{t.downloading} {downloadProgress >= 0 ? `${downloadProgress}%` : ''}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>
                        {t.download} {selectedFormat?.quality || ''}
                        {showTrimmer && (trimStart > 0 || trimEnd < videoInfo.duration) ? ` (${t.trimHint})` : ''}
                      </span>
                    </div>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDownloadAudio}
                  disabled={downloading}
                  className="w-full btn btn-primary btn-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <div className="flex items-center gap-2">
                      <div className="loader" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      <span>{t.downloading}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                      </svg>
                      <span>{t.downloadAudio}</span>
                    </div>
                  )}
                </button>
              )}

              {/* 取消 */}
              {downloading && (
                <div className="flex justify-end items-center pt-2">
                  <button onClick={handleCancelDownload} className="btn btn-ghost btn-sm text-xs text-[var(--error)] hover:text-white hover:bg-[var(--error)]">
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const VideoResult = memo(VideoResultInner);
