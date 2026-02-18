'use client';

import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { VideoResult } from '@/components/features/video-result';
import { PlatformBadges } from '@/components/features/platform-badges';
import { detectPlatform } from '@/lib/utils/url-detector';
import { PLATFORMS } from '@/lib/constants';
import type { VideoInfo, Platform, ApiResponse } from '@/lib/types';

const WechatGuide = lazy(() => import('@/components/features/wechat-guide').then(mod => ({ default: mod.WechatGuide })));

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfos, setVideoInfos] = useState<VideoInfo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showWechatGuide, setShowWechatGuide] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showSettings, setShowSettings] = useState(false);
  const [sessdata, setSessdata] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
      document.documentElement.classList.toggle('light', saved === 'light');
    }
    // 加载保存的 SESSDATA
    const savedSessdata = localStorage.getItem('bilibili_sessdata');
    if (savedSessdata) setSessdata(savedSessdata);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.classList.toggle('light', next === 'light');
      return next;
    });
  }, []);

  const extractUrls = useCallback((text: string): string[] => {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = text.match(urlRegex) || [];
    return matches.map(url => {
      const cleanUrl = url.replace(/[.,;:!?)\]}>'"]+$/, '');
      try { new URL(cleanUrl); return cleanUrl; } catch { return null; }
    }).filter((url): url is string => url !== null);
  }, []);

  const detectedPlatforms = useMemo((): Platform[] => {
    const urls = extractUrls(inputValue);
    const platforms = new Set<Platform>();
    urls.forEach(url => {
      const platform = detectPlatform(url);
      if (platform !== 'unknown') platforms.add(platform);
    });
    return Array.from(platforms);
  }, [inputValue, extractUrls]);

  const urlCount = useMemo(() => extractUrls(inputValue).length, [inputValue, extractUrls]);

  const parseSingleUrl = useCallback(async (url: string): Promise<VideoInfo | null> => {
    try {
      const body: Record<string, string> = { url };
      // B 站链接附带 SESSDATA
      if (sessdata && (url.includes('bilibili.com') || url.includes('b23.tv'))) {
        body.sessdata = sessdata;
      }
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: ApiResponse<VideoInfo> = await response.json();
      if (data.success && data.data) return data.data;
      return null;
    } catch { return null; }
  }, [sessdata]);

  const addVideoInfo = useCallback((newInfo: VideoInfo) => {
    setVideoInfos(prev => {
      const exists = prev.some(v => v.id === newInfo.id);
      if (exists) return prev;
      return [newInfo, ...prev];
    });
  }, []);

  const handleParse = useCallback(async () => {
    const urls = extractUrls(inputValue);
    if (urls.length === 0) {
      setError(lang === 'zh' ? '请输入有效的视频链接' : 'Please enter a valid video URL');
      return;
    }

    for (const url of urls) {
      const platform = detectPlatform(url);
      if (platform === 'wechat' && !url.includes('finder.video.qq.com') && !url.includes('.mp4')) {
        setShowWechatGuide(true);
        return;
      }
    }

    setLoading(true);
    setError(null);

    if (urls.length === 1) {
      setBatchMode(false);
      const result = await parseSingleUrl(urls[0]);
      if (result) {
        addVideoInfo(result);
        setExpandedId(result.id);
      } else {
        setError(lang === 'zh' ? '解析失败，请检查链接是否正确' : 'Parse failed, please check the URL');
      }
    } else {
      setBatchMode(true);
      setParseProgress({ current: 0, total: urls.length });
      const concurrencyLimit = 3;
      let completed = 0;
      let successCount = 0;
      let duplicateCount = 0;

      const parseWithConcurrency = async (urlList: string[]) => {
        const results: (VideoInfo | null)[] = [];
        const executing: Promise<void>[] = [];

        for (const url of urlList) {
          const promise = parseSingleUrl(url).then(result => {
            results.push(result);
            completed++;
            setParseProgress({ current: completed, total: urlList.length });
            if (result) {
              setVideoInfos(prev => {
                const exists = prev.some(v => v.id === result.id);
                if (exists) { duplicateCount++; return prev; }
                successCount++;
                return [result, ...prev];
              });
            }
          });
          executing.push(promise);
          if (executing.length >= concurrencyLimit) {
            await Promise.race(executing);
            const settledIndex = executing.findIndex(p => Promise.race([p, Promise.resolve('pending')]).then(v => v !== 'pending'));
            if (settledIndex >= 0) executing.splice(settledIndex, 1);
          }
        }
        await Promise.all(executing);
        return { results: results.filter(Boolean) as VideoInfo[], successCount, duplicateCount };
      };

      const { successCount: success, duplicateCount: duplicates } = await parseWithConcurrency(urls);
      if (success === 0) setError(lang === 'zh' ? '所有链接解析失败' : 'All URLs failed to parse');
      else if (duplicates > 0) setError(`成功解析 ${success} 个视频，${duplicates} 个重复链接已跳过`);
      else if (success < urls.length) setError(`成功解析 ${success}/${urls.length} 个链接`);
    }
    setLoading(false);
  }, [inputValue, extractUrls, parseSingleUrl, addVideoInfo, lang]);

  const handleReset = useCallback(() => {
    setVideoInfos([]);
    setError(null);
    setInputValue('');
    setBatchMode(false);
    setExpandedId(null);
  }, []);

  const handleRemoveResult = useCallback((id: string) => {
    setVideoInfos(prev => prev.filter(v => v.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const t = {
    zh: {
      tagline: '精准下载与剪辑全网视频，无需安装任何软件',
      searchPlaceholder: '粘贴视频链接，支持 YouTube、Bilibili、抖音、小红书、TikTok...',
      search: '搜索',
      parsing: '解析中',
      batchParsing: (c: number, t: number) => `解析中 ${c}/${t}`,
      batchParse: (n: number) => `批量解析 (${n}个)`,
      urlCount: (n: number) => `${n} 个链接`,
      features: '为什么选择 GetV',
      feat1Title: '极速解析', feat1Desc: '分布式架构，全球边缘节点加速',
      feat2Title: '批量下载', feat2Desc: '支持批量粘贴链接，一次解析多个视频',
      feat3Title: '完全免费', feat3Desc: '核心功能永久免费，无需注册登录',
      feat4Title: '视频剪辑', feat4Desc: '精确到秒的在线剪辑，下载指定片段',
      faq: '常见问题',
      faq1Q: '支持哪些平台？', faq1A: '目前支持 YouTube、Bilibili（B站）、抖音、小红书、TikTok、Twitter/X、Instagram 等主流平台，同时通过 yt-dlp 支持数百个其他站点。',
      faq2Q: '如何批量下载？', faq2A: '在输入框中粘贴多个视频链接（每行一个），点击"搜索"即可。',
      faq3Q: '解析失败怎么办？', faq3A: '请确保链接正确且视频公开。私密视频无法解析。',
      faq5Q: '支持最高什么画质？', faq5A: '支持最高 4K (2160p) 及 MP3 320kbps 音频。',
      footer: 'GetV 仅供个人学习和研究使用，请勿用于商业用途',
      copyright: (y: number) => `© ${y} GetV. All rights reserved.`,
      extension: '浏览器插件', extensionHint: '部分网站无法直接解析？', extensionLink: '安装浏览器插件', extensionDesc: '，自动嗅探视频资源',
      clearAll: '清空重新解析', successCount: (n: number) => `成功解析 ${n} 个视频`, backToList: '← 返回列表',
      settings: '设置',
      settingsTitle: '平台设置',
      biliSessdata: 'B 站 SESSDATA',
      biliSessdataHint: '填写后可解锁 720P 以上高清画质。从浏览器 Cookie 中获取。',
      biliSessdataPlaceholder: '粘贴 SESSDATA 值...',
      settingsSave: '保存',
      settingsClose: '关闭',
      settingsClear: '清除',
    },
    en: {
      tagline: 'Download & trim videos from any platform, no software needed',
      searchPlaceholder: 'Paste video URL (YouTube, Bilibili, TikTok, Instagram...)',
      search: 'Search',
      parsing: 'Parsing',
      batchParsing: (c: number, t: number) => `Parsing ${c}/${t}`,
      batchParse: (n: number) => `Batch parse (${n})`,
      urlCount: (n: number) => `${n} URLs`,
      features: 'Why GetV',
      feat1Title: 'Lightning Fast', feat1Desc: 'Distributed architecture, global edge acceleration',
      feat2Title: 'Batch Download', feat2Desc: 'Paste multiple links, parse all at once',
      feat3Title: 'Totally Free', feat3Desc: 'Core features free forever, no login required',
      feat4Title: 'Video Trimming', feat4Desc: 'Precise online trimming, download exact segments',
      faq: 'FAQ',
      faq1Q: 'What platforms are supported?', faq1A: 'Supports YouTube, Bilibili, Douyin, Xiaohongshu, TikTok, Twitter/X, Instagram, and hundreds more via yt-dlp.',
      faq2Q: 'How to batch download?', faq2A: 'Paste multiple links (one per line) and click "Search".',
      faq3Q: 'What if parsing fails?', faq3A: 'Ensure the video is public.',
      faq5Q: 'Max quality?', faq5A: 'Up to 4K (2160p) and MP3 320kbps.',
      footer: 'GetV is for personal learning and research only',
      copyright: (y: number) => `© ${y} GetV. All rights reserved.`,
      extension: 'Browser Extension', extensionHint: 'Some sites can\'t be parsed directly?', extensionLink: 'Install browser extension', extensionDesc: ' to auto-detect video resources',
      clearAll: 'Clear & restart', successCount: (n: number) => `Successfully parsed ${n} videos`, backToList: '← Back to list',
      settings: 'Settings',
      settingsTitle: 'Platform Settings',
      biliSessdata: 'Bilibili SESSDATA',
      biliSessdataHint: 'Enables 720P+ quality. Get SESSDATA from browser cookies.',
      biliSessdataPlaceholder: 'Paste SESSDATA value...',
      settingsSave: 'Save',
      settingsClose: 'Close',
      settingsClear: 'Clear',
    },
  };

  const i = t[lang];

  return (
    <main className="relative min-h-screen z-10 flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 group">
            <span className="text-2xl font-bold tracking-tighter text-gradient group-hover:opacity-80 transition-opacity">
              GetV
            </span>
            <span className="badge">Beta</span>
          </a>
          <div className="flex items-center gap-4">
            <a href="/extension" className="hidden md:flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-white transition-colors">
              {i.extension}
            </a>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="btn btn-ghost btn-sm border border-[var(--border)] rounded-full px-4 hover:border-[var(--primary)]"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--glass-bg-hover)] transition-all bg-transparent"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <span className="text-lg leading-none select-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--glass-bg-hover)] transition-all bg-transparent"
              title={i.settings}
            >
              <span className="text-lg leading-none select-none">⚙️</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 md:pt-48 md:pb-24 flex-grow flex flex-col justify-center">
        <div className="max-w-5xl mx-auto px-6 text-center">
          {videoInfos.length === 0 && (
            <div className="animate-fadeIn mb-12">
              <h1 className="heading-xl mb-6 tracking-tight">
                <span className="text-gradient-cyan">Get</span> <span className="text-[var(--foreground)]">Video</span>
              </h1>
              <p className="text-xl md:text-2xl text-[var(--muted-foreground)] max-w-2xl mx-auto font-light leading-relaxed">
                {i.tagline}
              </p>
            </div>
          )}

          {/* Search Bar */}
          <div className="w-full max-w-3xl mx-auto relative z-20">
            <div className={`search-bar flex items-center gap-3 p-2 ${loading ? 'opacity-80 pointer-events-none' : ''}`}>
              {detectedPlatforms.length > 0 && (
                <div className="flex gap-2 shrink-0 pl-2">
                  {detectedPlatforms.map(platform => (
                    <span key={platform} className="text-[10px] px-2 py-1 rounded-full font-bold text-black uppercase tracking-wider" style={{ backgroundColor: PLATFORMS[platform].color }}>
                      {PLATFORMS[platform].name}
                    </span>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) { e.preventDefault(); handleParse(); } }}
                placeholder={i.searchPlaceholder}
                className="flex-1 bg-transparent border-none outline-none text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-lg py-3 px-2 font-medium"
                disabled={loading}
              />

              {urlCount > 1 && <span className="text-xs text-[var(--primary)] font-bold shrink-0">{i.urlCount(urlCount)}</span>}

              <div className="flex gap-2 shrink-0 items-center">
                <button
                  onClick={async () => { try { const text = await navigator.clipboard.readText(); setInputValue(text); } catch { console.error('Clipboard error'); } }}
                  className="btn btn-ghost btn-sm !rounded-lg p-2 flex items-center justify-center"
                  title="Paste"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </button>
                <button
                  onClick={handleParse}
                  disabled={!inputValue.trim() || loading}
                  className="btn btn-primary btn-md !rounded-xl sm:min-w-[100px]"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="loader" style={{ width: 16, height: 16, borderTopColor: 'black', borderRightColor: 'black' }} />
                      <span>{batchMode ? i.batchParsing(parseProgress.current, parseProgress.total) : i.parsing}</span>
                    </div>
                  ) : (
                    urlCount > 1 ? i.batchParse(urlCount) : i.search
                  )}
                </button>
              </div>
            </div>
          </div>

          {videoInfos.length === 0 && (
            <>
              <PlatformBadges
                activePlatform={detectedPlatforms[0] || null}
                onPlatformClick={(p) => p === 'wechat' && setShowWechatGuide(true)}
              />
              <div className="mt-6 text-sm text-[var(--muted-foreground)]/60">
                {i.extensionHint} <a href="/extension" className="text-[var(--primary)] hover:text-white transition-colors border-b border-[var(--primary)] pb-0.5">{i.extensionLink}</a>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="max-w-2xl mx-auto px-6 mb-10 w-full">
          <div className="glass p-6 text-center text-[var(--error)] border-[var(--error)]/30 bg-[var(--error)]/5 animate-fadeIn font-medium">
            {error}
          </div>
        </div>
      )}

      {/* Video Results */}
      {videoInfos.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-20 w-full animate-slideUp">
          {batchMode && videoInfos.length > 1 && (
            <div className="flex justify-between items-center mb-6 px-2">
              <span className="text-[var(--primary)] font-mono text-sm uppercase tracking-wider">{i.successCount(videoInfos.length)}</span>
              <button onClick={handleReset} className="btn btn-ghost btn-sm hover:text-[var(--error)]">
                {i.clearAll}
              </button>
            </div>
          )}

          <div className="space-y-6">
            {videoInfos.map((videoInfo) => {
              const isExpanded = expandedId === videoInfo.id;
              const isCompact = videoInfos.length > 1 && !isExpanded;
              return (
                <div key={videoInfo.id} className="relative group">
                  {videoInfos.length > 1 && (
                    <button onClick={() => handleRemoveResult(videoInfo.id)} className="absolute -top-3 -right-3 z-20 w-8 h-8 bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--error)] hover:border-[var(--error)] rounded-full flex items-center justify-center transition-all shadow-xl">×</button>
                  )}
                  {isCompact ? (
                    <VideoResult videoInfo={videoInfo} compact={true} onExpand={() => handleToggleExpand(videoInfo.id)} />
                  ) : (
                    <div className="relative">
                      {videoInfos.length > 1 && (
                        <button onClick={() => setExpandedId(null)} className="mb-4 btn btn-ghost btn-sm text-xs uppercase tracking-widest opacity-60 hover:opacity-100 pl-0">
                          {i.backToList}
                        </button>
                      )}
                      <VideoResult videoInfo={videoInfo} onReset={videoInfos.length === 1 ? handleReset : undefined} compact={false} lang={lang} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Features & FAQ */}
      {videoInfos.length === 0 && (
        <>
          <section className="max-w-7xl mx-auto px-6 py-20 border-t border-[var(--border)]">
            <h2 className="heading-lg text-center mb-16 text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--muted-foreground)]">{i.features}</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: '⚡', title: i.feat1Title, desc: i.feat1Desc },
                { icon: '📦', title: i.feat2Title, desc: i.feat2Desc },
                { icon: '🆓', title: i.feat3Title, desc: i.feat3Desc },
                { icon: '✂️', title: i.feat4Title, desc: i.feat4Desc },
              ].map((feat) => (
                <div key={feat.title} className="glass p-8 text-center hover:scale-105 transition-transform duration-300">
                  <div className="text-4xl mb-6 opacity-80">{feat.icon}</div>
                  <h3 className="font-bold text-lg mb-3 text-white">{feat.title}</h3>
                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-3xl mx-auto px-6 py-20">
            <h2 className="heading-lg text-center mb-12">{i.faq}</h2>
            <div className="space-y-4">
              {[{ q: i.faq1Q, a: i.faq1A }, { q: i.faq2Q, a: i.faq2A }, { q: i.faq3Q, a: i.faq3A }, { q: i.faq5Q, a: i.faq5A }].map((faq) => (
                <details key={faq.q} className="faq-item">
                  <summary>{faq.q} <span className="text-[var(--primary)] text-xl">+</span></summary>
                  <div className="faq-content">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--background)] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 opacity-60 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl tracking-tight text-white">GetV</span>
            <span className="w-px h-4 bg-[var(--border)]"></span>
            <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">
              {lang === 'zh' ? 'Free Video Tools' : 'Free Video Tools'}
            </span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">{i.footer}</p>
          <div className="text-xs font-mono text-[var(--muted-foreground)]">
            {i.copyright(new Date().getFullYear())}
          </div>
        </div>
      </footer>

      {showWechatGuide && (
        <Suspense fallback={null}>
          <WechatGuide onClose={() => setShowWechatGuide(false)} onSubmit={(url) => { setShowWechatGuide(false); setInputValue(url); }} />
        </Suspense>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="glass-card w-[90%] max-w-md p-6 rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[var(--foreground)]">{i.settingsTitle}</h2>
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--glass-bg-hover)] transition-colors text-[var(--muted-foreground)]">✕</button>
            </div>

            {/* Bilibili SESSDATA */}
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                  <span style={{ color: '#FB7299' }}>●</span> {i.biliSessdata}
                  {sessdata && <span className="text-xs text-green-400">✓</span>}
                </span>
                <span className="text-xs text-[var(--muted-foreground)] mt-1 block">{i.biliSessdataHint}</span>
              </label>
              <input
                type="password"
                value={sessdata}
                onChange={(e) => setSessdata(e.target.value)}
                placeholder={i.biliSessdataPlaceholder}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    localStorage.setItem('bilibili_sessdata', sessdata);
                    setShowSettings(false);
                  }}
                  className="flex-1 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {i.settingsSave}
                </button>
                <button
                  onClick={() => {
                    setSessdata('');
                    localStorage.removeItem('bilibili_sessdata');
                  }}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--muted-foreground)] text-sm hover:border-[var(--primary)] transition-colors"
                >
                  {i.settingsClear}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
