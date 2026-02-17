import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

// B 站画质 ID → 标签映射
const QUALITY_MAP: Record<number, string> = {
    127: '8K',
    126: '杜比视界',
    125: 'HDR',
    120: '4K',
    116: '1080P60',
    112: '1080P+',
    80: '1080P',
    74: '720P60',
    64: '720P',
    32: '480P',
    16: '360P',
    6: '240P',
};

interface BiliVideoInfo {
    bvid: string;
    aid: number;
    cid: number;
    title: string;
    desc: string;
    pic: string;
    duration: number;
    owner: {
        name: string;
        face: string;
        mid: number;
    };
    pages?: Array<{
        cid: number;
        part: string;
        page: number;
        duration: number;
    }>;
}

interface DashStream {
    id: number;
    baseUrl: string;
    backupUrl?: string[];
    bandwidth: number;
    codecs: string;
    mimeType: string;
    width?: number;
    height?: number;
    frameRate?: string;
    codecid?: number;
}

interface DurlItem {
    url: string;
    size: number;
    order: number;
    backup_url?: string[];
}

/**
 * Bilibili 视频解析器
 * 支持 BV/AV 号解析，DASH 多清晰度流
 */
export class BilibiliParser extends BaseParser {
    readonly platform = 'bilibili' as const;
    readonly name = 'Bilibili';

    // 可选的 SESSDATA Cookie（解锁高清画质）
    private sessdata: string | undefined;

    /**
     * 设置 B 站 SESSDATA Cookie
     */
    setSessdata(sessdata?: string) {
        this.sessdata = sessdata;
    }

    /**
     * 构建请求头（含可选 Cookie）
     */
    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Referer': 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        if (this.sessdata) {
            headers['Cookie'] = `SESSDATA=${this.sessdata}`;
        }
        return headers;
    }

    async parse(url: string, options?: { sessdata?: string }): Promise<ParseResult> {
        // 如果传入了 sessdata，临时设置
        if (options?.sessdata) {
            this.sessdata = options.sessdata;
        }
        try {
            // 1. 解析短链接 (b23.tv)
            const realUrl = await this.resolveShortUrl(url);
            console.log('[Bilibili] Real URL:', realUrl);

            // 2. 提取 BV/AV 号
            const videoId = this.extractBvid(realUrl);
            if (!videoId) {
                return this.createError('无法从 URL 中提取 B 站视频 ID');
            }
            console.log('[Bilibili] Video ID:', videoId);

            // 3. 获取视频信息（含 CID）
            const videoInfo = await this.getVideoInfo(videoId);
            if (!videoInfo) {
                return this.createError('获取 B 站视频信息失败，可能视频不存在或已下架');
            }
            console.log('[Bilibili] Title:', videoInfo.title, 'CID:', videoInfo.cid);

            // 4. 获取视频流
            const formats = await this.getPlayUrl(videoInfo.bvid, videoInfo.cid, videoInfo.duration);
            if (formats.length === 0) {
                return this.createError('获取 B 站视频流失败');
            }

            return this.createSuccess({
                id: videoInfo.bvid,
                platform: 'bilibili',
                title: videoInfo.title,
                description: videoInfo.desc || '',
                thumbnail: videoInfo.pic?.replace(/^http:\/\//, 'https://'),
                duration: videoInfo.duration,
                durationText: this.formatDuration(videoInfo.duration),
                author: videoInfo.owner.name,
                authorAvatar: videoInfo.owner.face?.replace(/^http:\/\//, 'https://'),
                formats,
                originalUrl: realUrl,
                parsedAt: Date.now(),
            });
        } catch (error) {
            console.error('[Bilibili] Parse error:', error);
            return this.createError(
                error instanceof Error ? error.message : '解析失败'
            );
        }
    }

    /**
     * 解析 b23.tv 短链接
     */
    private async resolveShortUrl(url: string): Promise<string> {
        try {
            if (url.includes('b23.tv')) {
                const response = await this.fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                });
                return response.url;
            }
            return url;
        } catch {
            return url;
        }
    }

    /**
     * 从 URL 中提取 BV 号
     */
    private extractBvid(url: string): string | null {
        // BV 号
        const bvMatch = url.match(/BV([a-zA-Z0-9]+)/);
        if (bvMatch) return `BV${bvMatch[1]}`;

        // AV 号 → 需要转换，先作为 aid 使用
        const avMatch = url.match(/av(\d+)/i);
        if (avMatch) return `av${avMatch[1]}`;

        return null;
    }

    /**
     * 获取视频基本信息和 CID
     */
    private async getVideoInfo(videoId: string): Promise<BiliVideoInfo | null> {
        try {
            const isAv = videoId.startsWith('av');
            const param = isAv ? `aid=${videoId.slice(2)}` : `bvid=${videoId}`;

            const response = await this.fetch(
                `https://api.bilibili.com/x/web-interface/view?${param}`,
                { headers: this.buildHeaders() }
            );

            const data = await response.json() as {
                code: number;
                message: string;
                data: BiliVideoInfo;
            };

            if (data.code !== 0) {
                console.error('[Bilibili] API error:', data.code, data.message);
                return null;
            }

            const info = data.data;
            return {
                bvid: info.bvid,
                aid: info.aid,
                cid: info.pages?.[0]?.cid || info.cid,
                title: info.title,
                desc: info.desc,
                pic: info.pic.startsWith('//') ? `https:${info.pic}` : info.pic,
                duration: info.duration,
                owner: info.owner,
                pages: info.pages,
            };
        } catch (error) {
            console.error('[Bilibili] getVideoInfo error:', error);
            return null;
        }
    }

    /**
     * 获取视频播放流
     * fnval=4048 请求 DASH 格式（含 4K、HDR 等）
     */
    private async getPlayUrl(bvid: string, cid: number, duration: number): Promise<VideoFormat[]> {
        try {
            const params = new URLSearchParams({
                bvid,
                cid: cid.toString(),
                qn: '127',      // 请求最高画质
                fnver: '0',
                fnval: '4048',   // DASH + HDR + 4K + AV1 + 8K
                fourk: '1',
            });

            console.log('[Bilibili] Requesting playurl with sessdata:', this.sessdata ? 'yes' : 'no');
            const response = await this.fetch(
                `https://api.bilibili.com/x/player/playurl?${params.toString()}`,
                { headers: this.buildHeaders() }
            );

            const data = await response.json() as {
                code: number;
                data: {
                    quality: number;
                    accept_quality: number[];
                    accept_description: string[];
                    dash?: {
                        video: DashStream[];
                        audio: DashStream[];
                    };
                    durl?: DurlItem[];
                };
            };

            if (data.code !== 0) {
                console.error('[Bilibili] playurl error:', data.code);
                return [];
            }

            const formats: VideoFormat[] = [];

            // 优先 DASH 格式
            if (data.data.dash) {
                const { video: videoStreams, audio: audioStreams } = data.data.dash;

                // 视频流（仅视频，无音频）
                if (videoStreams) {
                    // 按画质去重（每个画质取 bandwidth 最高的）
                    const bestByQuality = new Map<number, DashStream>();
                    for (const stream of videoStreams) {
                        const existing = bestByQuality.get(stream.id);
                        if (!existing || stream.bandwidth > existing.bandwidth) {
                            bestByQuality.set(stream.id, stream);
                        }
                    }

                    for (const [qualityId, stream] of bestByQuality) {
                        const qualityLabel = QUALITY_MAP[qualityId] || `${qualityId}`;
                        const codec = this.parseCodec(stream.codecs);
                        const fps = stream.frameRate ? Math.round(parseFloat(stream.frameRate)) : undefined;

                        formats.push(this.createFormat({
                            id: `bili-video-${qualityId}-${codec}`,
                            quality: qualityLabel,
                            format: 'mp4',
                            url: stream.baseUrl,
                            hasAudio: false,
                            hasVideo: true,
                            bitrate: stream.bandwidth,
                            codec,
                            fps,
                            size: Math.round(stream.bandwidth * duration / 8),
                        }));
                    }
                }

                // 音频流（仅音频，无视频）
                if (audioStreams) {
                    for (const stream of audioStreams) {
                        const bitrateKbps = Math.round(stream.bandwidth / 1000);
                        const codec = this.parseCodec(stream.codecs);

                        formats.push(this.createFormat({
                            id: `bili-audio-${stream.id}-${bitrateKbps}`,
                            quality: `${bitrateKbps}kbps`,
                            format: 'm4a',
                            url: stream.baseUrl,
                            hasAudio: true,
                            hasVideo: false,
                            bitrate: stream.bandwidth,
                            codec,
                            size: Math.round(stream.bandwidth * duration / 8),
                        }));
                    }
                }
            }

            // 兜底：durl 模式（合并流，通常是老视频）
            if (formats.length === 0 && data.data.durl) {
                for (const item of data.data.durl) {
                    const qualityLabel = QUALITY_MAP[data.data.quality] || `${data.data.quality}`;
                    formats.push(this.createFormat({
                        id: `bili-durl-${item.order}`,
                        quality: qualityLabel,
                        format: 'flv',
                        url: item.url,
                        size: item.size,
                        hasAudio: true,
                        hasVideo: true,
                    }));
                }
            }

            return formats;
        } catch (error) {
            console.error('[Bilibili] getPlayUrl error:', error);
            return [];
        }
    }

    /**
     * 解析 codec 名称
     */
    private parseCodec(codecs: string): string {
        if (codecs.startsWith('avc') || codecs.startsWith('h264')) return 'h264';
        if (codecs.startsWith('hev') || codecs.startsWith('h265') || codecs.startsWith('hevc')) return 'hevc';
        if (codecs.startsWith('av01') || codecs.startsWith('av1')) return 'av1';
        if (codecs.startsWith('mp4a') || codecs.startsWith('aac')) return 'aac';
        if (codecs.startsWith('flac')) return 'flac';
        return codecs.split('.')[0] || 'unknown';
    }
}
