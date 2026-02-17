import { NextResponse } from 'next/server';

export async function GET() {
  // 简单测试：直接返回静态响应
  return NextResponse.json({
    status: 'ok',
    message: 'API route is working',
    timestamp: new Date().toISOString(),
  });
}

export async function POST() {
  try {
    // 测试 fetch FFmpeg API
    const resp = await fetch('https://ffmpeg.226022.xyz/health', {
      method: 'GET',
    });
    const text = await resp.text();
    return NextResponse.json({
      status: resp.status,
      ok: resp.ok,
      body: text,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
