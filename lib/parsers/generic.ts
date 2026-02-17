import { BaseParser } from './base';
import type { VideoInfo, ParseResult, VideoFormat } from '../types';

/**
 * 通用网页解析器
 * 从网页中提取 m3u8/mp4 视频链接
 */
export class GenericParser extends BaseParser {
  readonly platform = 'other' as const;
  readonly name = '通用解析器';

  async parse(url: string): Promise<ParseResult> {
    try {
      console.log('[Generic] Parsing:', url);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        return this.createError(`无法访问页面 (${response.status})`);
      }

      const html = await response.text();
      console.log('[Generic] HTML length:', html.length);

      // 检测 Cloudflare 保护
      if (html.includes('Cloudflare') && (html.includes('been blocked') || html.includes('Attention Required'))) {
        return this.createError('该网站有 Cloudflare 保护，服务端无法访问。请使用浏览器插件在页面上嗅探视频链接，或尝试其他下载工具');
      }

      // 提取标题
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim().replace(/\s*[-|].*$/, '') : '未知标题';

      // 提取视频链接
      const formats: VideoFormat[] = [];
      const seenUrls = new Set<string>();

      // 处理转义的 HTML - 将 \/ 转换为 /
      const processedHtml = html.replace(/\\\//g, '/');

      // 匹配 m3u8 链接
      const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi;
      let match;
      while ((match = m3u8Regex.exec(processedHtml)) !== null) {
        let videoUrl = match[1];

        // 清理 URL 末尾可能的特殊字符
        videoUrl = videoUrl.replace(/[",']+$/, '');

        if (seenUrls.has(videoUrl)) continue;
        seenUrls.add(videoUrl);

        console.log('[Generic] Found m3u8:', videoUrl.substring(0, 80));

        formats.push(this.createFormat({
          id: `m3u8-${formats.length}`,
          quality: 'HLS',
          format: 'm3u8',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
        }));
      }

      // 匹配 mp4 链接
      const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi;
      while ((match = mp4Regex.exec(processedHtml)) !== null) {
        let videoUrl = match[1];
        videoUrl = videoUrl.replace(/[",']+$/, '');

        if (seenUrls.has(videoUrl)) continue;
        seenUrls.add(videoUrl);

        console.log('[Generic] Found mp4:', videoUrl.substring(0, 80));

        formats.push(this.createFormat({
          id: `mp4-${formats.length}`,
          quality: 'MP4',
          format: 'mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
        }));
      }

      // 提取缩略图 - 尝试多种方式
      let thumbnail = '';

      // 方式1: og:image
      const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
      if (ogImageMatch) {
        thumbnail = ogImageMatch[1];
      }

      // 方式2: twitter:image
      if (!thumbnail) {
        const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i);
        if (twitterImageMatch) {
          thumbnail = twitterImageMatch[1];
        }
      }

      // 方式3: 查找页面中第一张图片（排除 logo、icon 等）
      if (!thumbnail) {
        // 尝试找到 content 中的图片
        const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
        for (const imgMatch of imgMatches) {
          const imgUrl = imgMatch[1];
          // 跳过小图标、logo 等
          if (imgUrl.includes('logo') ||
              imgUrl.includes('icon') ||
              imgUrl.includes('avatar') ||
              imgUrl.includes('loading') ||
              imgUrl.startsWith('data:') ||
              imgUrl.endsWith('.svg')) {
            continue;
          }
          // 优先选择较大的图片
          if (imgUrl.includes('upload') || imgUrl.includes('pic') || imgUrl.includes('image')) {
            thumbnail = imgUrl;
            break;
          }
        }
      }

      // 方式4: data-src 懒加载图片
      if (!thumbnail) {
        const lazyImgMatch = html.match(/data-(?:src|original|xkrkllgl)=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i);
        if (lazyImgMatch) {
          thumbnail = lazyImgMatch[1];
        }
      }

      console.log('[Generic] Thumbnail:', thumbnail);

      if (formats.length === 0) {
        return this.createError('未在页面中找到视频链接');
      }

      console.log('[Generic] Found', formats.length, 'video(s)');

      return this.createSuccess({
        id: `generic-${Date.now()}`,
        platform: 'other',
        title,
        thumbnail,
        duration: 0,
        durationText: '',
        formats,
        originalUrl: url,
        parsedAt: Date.now(),
      });
    } catch (error) {
      console.error('[Generic] Error:', error);
      return this.createError('解析失败，请检查链接是否正确');
    }
  }
}
