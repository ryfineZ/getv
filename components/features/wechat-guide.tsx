'use client';

import { useState } from 'react';

interface WechatGuideProps {
  onClose: () => void;
  onSubmit: (url: string) => void;
}

export function WechatGuide({ onClose, onSubmit }: WechatGuideProps) {
  const [url, setUrl] = useState('');
  const [activeMethod, setActiveMethod] = useState<'stream' | 'pc' | 'android'>('stream');

  const handleSubmit = () => {
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  const methods = {
    stream: {
      title: 'iOS 抓包（推荐）',
      steps: [
        '在 App Store 下载「Stream 抓包」应用',
        '打开 Stream，点击「开始抓包」',
        '切换到微信，播放要下载的视频号视频',
        '回到 Stream，点击「停止抓包」',
        '在请求列表中搜索 .mp4，找到视频链接',
        '复制视频链接（通常包含 finder.video.qq.com）',
        '粘贴到上方输入框，点击「解析下载」',
      ],
      tip: 'Stream 是付费应用（¥18），但功能强大，一次购买永久使用',
    },
    pc: {
      title: 'PC 端抓包',
      steps: [
        '下载 Fiddler 或 Charles 抓包工具',
        '配置 HTTPS 解密证书',
        '开启抓包',
        '在微信 PC 端播放视频号视频',
        '在抓包工具中搜索 .mp4 请求',
        '复制视频链接',
        '粘贴到上方输入框，点击「解析下载」',
      ],
      tip: '推荐使用现成的视频号下载工具，如 wx_channels_download',
    },
    android: {
      title: 'Android 抓包',
      steps: [
        '下载 HttpCanary 或 Packet Capture 应用',
        '安装 CA 证书',
        '开始抓包',
        '在微信中播放视频号视频',
        '停止抓包，搜索 .mp4 请求',
        '复制视频链接',
        '粘贴到上方输入框，点击「解析下载」',
      ],
      tip: 'Android 7.0+ 需要额外配置才能抓取 HTTPS',
    },
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1a2e] border-b border-gray-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">微信视频号下载指南</h2>
            <p className="text-gray-400 text-sm mt-1">视频号是封闭生态，需要手动获取链接</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 输入框 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              粘贴视频链接
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="粘贴 finder.video.qq.com 开头的链接..."
                className="flex-1 px-4 py-3 bg-[#0a0a0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleSubmit}
                disabled={!url.trim()}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-medium text-white disabled:opacity-50"
              >
                解析下载
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              链接示例：https://finder.video.qq.com/.../xxx.mp4?...
            </p>
          </div>

          {/* 方法选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">
              选择获取方式
            </label>
            <div className="flex gap-2">
              {Object.entries(methods).map(([key, method]) => (
                <button
                  key={key}
                  onClick={() => setActiveMethod(key as keyof typeof methods)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeMethod === key
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {method.title}
                </button>
              ))}
            </div>
          </div>

          {/* 步骤说明 */}
          <div className="bg-[#0a0a0f] rounded-xl p-5">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-sm">
                📱
              </span>
              {methods[activeMethod].title}
            </h3>
            <ol className="space-y-3">
              {methods[activeMethod].steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center text-xs text-gray-400 shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-gray-300">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg text-yellow-400 text-xs">
              💡 {methods[activeMethod].tip}
            </div>
          </div>

          {/* 推荐工具 */}
          <div className="bg-[#0a0a0f] rounded-xl p-5">
            <h3 className="font-medium mb-4">🛠 推荐工具</h3>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="https://apps.apple.com/app/stream/id1312141691"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="font-medium text-sm">Stream 抓包</div>
                <div className="text-xs text-gray-400 mt-1">iOS 最佳选择</div>
              </a>
              <a
                href="https://github.com/ltaoo/wx_channels_download"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="font-medium text-sm">wx_channels_download</div>
                <div className="text-xs text-gray-400 mt-1">PC 端自动下载</div>
              </a>
              <a
                href="https://github.com/qiye45/wechatVideoDownload"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="font-medium text-sm">wechatVideoDownload</div>
                <div className="text-xs text-gray-400 mt-1">PC 端抓包工具</div>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.guoshi.httpcanary"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="font-medium text-sm">HttpCanary</div>
                <div className="text-xs text-gray-400 mt-1">Android 抓包</div>
              </a>
            </div>
          </div>

          {/* 注意事项 */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>⚠️ 视频号链接通常有 24 小时有效期，请尽快下载</p>
            <p>⚠️ 请遵守版权法律，仅供个人学习和研究使用</p>
          </div>
        </div>
      </div>
    </div>
  );
}
