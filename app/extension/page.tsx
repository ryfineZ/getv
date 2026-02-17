'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function ExtensionPage() {
  const [activeTab, setActiveTab] = useState<'chrome' | 'firefox'>('chrome');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
      document.documentElement.classList.toggle('light', saved === 'light');
    }
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

  const i18n = {
    zh: {
      back: '返回首页',
      title: 'GetV 视频嗅探器',
      subtitle: '自动捕获网页视频 · 一键下载\n内容创作者的终极工具',
      downloadBtn: '下载插件 (ZIP)',
      installBtn: '安装教程',
      features: {
        auto: { title: '自动嗅探', desc: '浏览网页时自动捕获网络流量中的视频地址 (m3u8, mp4)。' },
        oneClick: { title: '一键下载', desc: '将捕获的视频直接发送到 GetV 进行高速解析和下载。' },
        secure: { title: '本地安全', desc: '完全运行在浏览器本地，不会上传任何数据到远程服务器。' }
      },
      install: {
        title: '安装指南',
        subtitle: '简单几步，手动安装插件。',
        tabs: { chrome: 'Chrome / Edge / Brave', firefox: 'Firefox' },
        step1: { title: '下载并解压', desc: '下载插件压缩包并解压到一个文件夹中。', term: '终端 (可选)' },
        step2: {
          chromeTitle: '加载已解压的扩展程序',
          chromeSteps: [
            '打开 chrome://extensions (或 edge://extensions)',
            '开启右上角 "开发者模式"',
            '点击左上角 "加载已解压的扩展程序"',
            '选择刚才解压的 getv-extension 文件夹'
          ],
          firefoxTitle: '加载临时附加组件',
          firefoxSteps: [
            '打开 about:debugging#/runtime/this-firefox',
            '点击 "加载临时附加组件"',
            '选择文件夹中的 manifest.json 文件'
          ]
        },
        step3: { title: '安装完成！', desc: 'GetV 图标将出现在浏览器工具栏。建议将其固定以便随时使用。', complete: '安装成功' }
      }
    },
    en: {
      back: 'Back to Home',
      title: 'GetV Extension',
      subtitle: 'Auto-detect & download videos from any website.\nThe ultimate tool for content creators.',
      downloadBtn: 'Download Extension (ZIP)',
      installBtn: 'How to Install',
      features: {
        auto: { title: 'Auto Detection', desc: 'Automatically captures video URLs (m3u8, mp4) from network traffic as you browse.' },
        oneClick: { title: 'One-Click Download', desc: 'Send captured videos directly to GetV for high-speed parsing and downloading.' },
        secure: { title: 'Local & Secure', desc: 'Runs entirely in your browser. No data is uploaded to any remote server.' }
      },
      install: {
        title: 'Installation Guide',
        subtitle: 'Follow these simple steps to install the extension manually.',
        tabs: { chrome: 'Chrome / Edge / Brave', firefox: 'Firefox' },
        step1: { title: 'Download & Unzip', desc: 'Download the extension ZIP file and extract it to a folder.', term: 'Terminal (Optional)' },
        step2: {
          chromeTitle: 'Load Unpacked Extension',
          chromeSteps: [
            'Open chrome://extensions (or edge://extensions)',
            'Enable "Developer mode" (top right toggle)',
            'Click "Load unpacked" (top left)',
            'Select the getv-extension folder you just extracted'
          ],
          firefoxTitle: 'Load Temporary Add-on',
          firefoxSteps: [
            'Open about:debugging#/runtime/this-firefox',
            'Click "Load Temporary Add-on..."',
            'Select the manifest.json file inside the folder'
          ]
        },
        step3: { title: 'Ready to use!', desc: 'The GetV icon will appear in your browser toolbar. Pin it for easy access.', complete: 'Installation Complete' }
      }
    }
  };

  const t = i18n[lang];

  return (
    <main className="min-h-screen flex flex-col relative pb-20">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-[var(--primary)]/5 to-transparent opacity-30" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[var(--secondary)]/10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors group"
          >
            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">{t.back}</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="btn btn-ghost btn-sm border border-[var(--border)] rounded-full w-9 h-9 p-0 hover:border-[var(--primary)] transition-all flex items-center justify-center"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <span className="text-lg leading-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="btn btn-ghost btn-sm border border-[var(--border)] rounded-full px-4 hover:border-[var(--primary)] text-xs md:text-sm font-medium transition-all"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <div className="badge">v1.0.0</div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 relative z-10 text-center">
        <div className="max-w-4xl mx-auto animate-fadeIn">
          <h1 className="heading-xl mb-6 tracking-tight">
            <span className="text-gradient-cyan">GetV</span> {lang === 'zh' ? '插件' : 'Extension'}
          </h1>
          <p className="text-xl md:text-2xl text-[var(--muted-foreground)] max-w-2xl mx-auto font-light leading-relaxed mb-10 whitespace-pre-line">
            {t.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/api/extension/download"
              className="btn btn-primary btn-lg shadow-lg shadow-[var(--primary)]/20 hover:shadow-[var(--primary)]/40 transition-all transform hover:-translate-y-1"
            >
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t.downloadBtn}
            </a>
            <a
              href="#installation"
              className="btn btn-secondary btn-lg"
            >
              {t.installBtn}
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-12 relative z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          <div className="glass p-8 hover:border-[var(--primary)]/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-6 text-[var(--primary)] group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">{t.features.auto.title}</h3>
            <p className="text-[var(--muted-foreground)] leading-relaxed">
              {t.features.auto.desc}
            </p>
          </div>

          <div className="glass p-8 hover:border-[var(--secondary)]/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-[var(--secondary)]/10 flex items-center justify-center mb-6 text-[var(--secondary)] group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">{t.features.oneClick.title}</h3>
            <p className="text-[var(--muted-foreground)] leading-relaxed">
              {t.features.oneClick.desc}
            </p>
          </div>

          <div className="glass p-8 hover:border-[var(--accent)]/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mb-6 text-[var(--accent)] group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">{t.features.secure.title}</h3>
            <p className="text-[var(--muted-foreground)] leading-relaxed">
              {t.features.secure.desc}
            </p>
          </div>
        </div>
      </section>

      {/* Installation Guide */}
      <section id="installation" className="px-6 py-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t.install.title}</h2>
            <p className="text-[var(--muted-foreground)]">{t.install.subtitle}</p>
          </div>

          <div className="glass overflow-hidden transition-colors duration-300">
            {/* Tab Switcher */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('chrome')}
                className={`flex-1 py-4 text-center font-medium transition-colors ${activeTab === 'chrome' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              >
                {t.install.tabs.chrome}
              </button>
              <button
                onClick={() => setActiveTab('firefox')}
                className={`flex-1 py-4 text-center font-medium transition-colors ${activeTab === 'firefox' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              >
                {t.install.tabs.firefox}
              </button>
            </div>

            <div className="p-8 md:p-10 bg-[var(--background)]/40 relative transition-colors duration-300">
              {/* Vertical Timeline */}
              <div className="space-y-12 relative">
                {/* Line */}
                <div className="absolute left-[19px] top-2 bottom-0 w-0.5 bg-[var(--border)] z-0" />

                {/* Step 1 */}
                <div className="relative z-10 pl-16">
                  <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-[var(--background)] border-2 border-[var(--primary)] text-[var(--primary)] flex items-center justify-center font-bold shadow-lg shadow-[var(--primary)]/20 transition-colors duration-300">
                    1
                  </div>
                  <h3 className="text-xl font-bold mb-3">{t.install.step1.title}</h3>
                  <p className="text-[var(--muted-foreground)] mb-4">
                    {t.install.step1.desc}
                  </p>
                  <div className="bg-black/40 rounded-lg p-4 font-mono text-sm border border-[var(--border)] overflow-x-auto">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[var(--muted-foreground)]">{t.install.step1.term}</span>
                      <button className="text-xs text-[var(--primary)] hover:underline" onClick={() => navigator.clipboard.writeText('unzip getv-extension.zip -d getv-extension')}>Copy</button>
                    </div>
                    <code className="text-green-400">unzip getv-extension.zip -d getv-extension</code>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative z-10 pl-16">
                  <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-[var(--background)] border-2 border-[var(--secondary)] text-[var(--secondary)] flex items-center justify-center font-bold shadow-lg shadow-[var(--secondary)]/20 transition-colors duration-300">
                    2
                  </div>
                  {activeTab === 'chrome' ? (
                    <>
                      <h3 className="text-xl font-bold mb-3">{t.install.step2.chromeTitle}</h3>
                      <ol className="space-y-3 text-[var(--muted-foreground)] list-decimal list-outside ml-4">
                        {t.install.step2.chromeSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold mb-3">{t.install.step2.firefoxTitle}</h3>
                      <ol className="space-y-3 text-[var(--muted-foreground)] list-decimal list-outside ml-4">
                        {t.install.step2.firefoxSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>

                {/* Step 3 */}
                <div className="relative z-10 pl-16">
                  <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-[var(--background)] border-2 border-[var(--success)] text-[var(--success)] flex items-center justify-center font-bold shadow-lg shadow-[var(--success)]/20 transition-colors duration-300">
                    3
                  </div>
                  <h3 className="text-xl font-bold mb-3">{t.install.step3.title}</h3>
                  <p className="text-[var(--muted-foreground)]">
                    {t.install.step3.desc}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-lg text-[var(--success)] text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span>{t.install.step3.complete}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
