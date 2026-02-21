import { NextRequest, NextResponse } from 'next/server';

/**
 * 图片代理 API - 解决 B 站等平台的防盗链问题
 * GET /api/image-proxy?url=https://i0.hdslb.com/...
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    try {
        // 根据 URL 设置合适的 Referer
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        if (url.includes('hdslb.com') || url.includes('bilibili.com')) {
            headers['Referer'] = 'https://www.bilibili.com/';
        }

        if (url.includes('xhscdn.com') || url.includes('xiaohongshu.com')) {
            headers['Referer'] = 'https://www.xiaohongshu.com/';
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            return NextResponse.json({ error: `HTTP ${response.status}` }, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // 缓存 24 小时
            },
        });
    } catch (error) {
        console.error('[ImageProxy] Error:', error);
        return NextResponse.json({ error: '代理请求失败' }, { status: 500 });
    }
}
