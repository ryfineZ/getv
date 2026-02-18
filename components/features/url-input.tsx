'use client';

import { useState, useCallback } from 'react';
import { detectPlatform } from '@/lib/utils/url-detector';
import { PLATFORMS } from '@/lib/constants';
import type { Platform } from '@/lib/types';

interface UrlInputProps {
  onParse: (url: string) => void;
  loading?: boolean;
}

export function UrlInput({ onParse, loading }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null);

  const handleInputChange = useCallback((value: string) => {
    setUrl(value);
    if (value.trim()) {
      const platform = detectPlatform(value);
      setDetectedPlatform(platform !== 'unknown' ? platform : null);
    } else {
      setDetectedPlatform(null);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      handleInputChange(text);
    } catch {
      console.error('无法读取剪贴板');
    }
  }, [handleInputChange]);

  const handleSubmit = useCallback(() => {
    if (url.trim() && !loading) {
      onParse(url.trim());
    }
  }, [url, loading, onParse]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit();
    }
  }, [handleSubmit, loading]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="粘贴视频链接，支持 YouTube、Bilibili、抖音、小红书、TikTok..."
            className="w-full px-5 py-4 pr-12 text-lg input-field"
            disabled={loading}
          />

          {/* 平台指示器 */}
          {detectedPlatform && (
            <div
              className="absolute left-4 -top-3 px-2 py-0.5 text-xs font-medium rounded-full"
              style={{
                backgroundColor: PLATFORMS[detectedPlatform].color,
                color: detectedPlatform === 'tiktok' ? '#fff' : '#fff',
              }}
            >
              {PLATFORMS[detectedPlatform].name}
            </div>
          )}

          {/* 粘贴按钮 */}
          <button
            onClick={handlePaste}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors"
            title="粘贴"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>

        {/* 解析按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!url.trim() || loading}
          className="px-8 py-4 text-lg font-medium text-white rounded-xl gradient-btn disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="loader" />
              <span>解析中</span>
            </div>
          ) : (
            '解析'
          )}
        </button>
      </div>
    </div>
  );
}
