import type { PlatformConfig, Platform } from './types';

// 平台配置
export const PLATFORMS: Record<Platform, PlatformConfig> = {
  youtube: {
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com'],
    color: '#FF0000',
    icon: 'youtube',
    enabled: true,
  },
  tiktok: {
    name: 'TikTok',
    domains: ['tiktok.com', 'vm.tiktok.com', 'www.tiktok.com', 'vt.tiktok.com'],
    color: '#000000',
    icon: 'tiktok',
    enabled: true,
  },
  twitter: {
    name: 'Twitter/X',
    domains: ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com'],
    color: '#1DA1F2',
    icon: 'twitter',
    enabled: true,
  },
  instagram: {
    name: 'Instagram',
    domains: ['instagram.com', 'www.instagram.com', 'instagr.am'],
    color: '#E4405F',
    icon: 'instagram',
    enabled: true,
  },
  douyin: {
    name: '抖音',
    domains: ['douyin.com', 'www.douyin.com', 'v.douyin.com', 'iesdouyin.com'],
    color: '#000000',
    icon: 'douyin',
    enabled: true,
  },
  xiaohongshu: {
    name: '小红书',
    domains: ['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com'],
    color: '#FE2C55',
    icon: 'xiaohongshu',
    enabled: true,
  },
  wechat: {
    name: '视频号',
    domains: ['channels.weixin.qq.com', 'finder.video.qq.com'],
    color: '#07C160',
    icon: 'wechat',
    enabled: true,
  },
  bilibili: {
    name: 'Bilibili',
    domains: ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv', 'bilibili.tv'],
    color: '#FB7299',
    icon: 'bilibili',
    enabled: true,
  },
  pornhub: {
    name: 'PornHub',
    domains: [
      'pornhub.com', 'www.pornhub.com', 'pornhub.org',
      '91porn.com', 'www.91porn.com',
      '91porna.com', 'www.91porna.com',
      'xvideos.com', 'www.xvideos.com',
      'xhamster.com', 'xhamster.one',
      'xnxx.com', 'www.xnxx.com',
      'redtube.com', 'www.redtube.com',
      'youporn.com', 'www.youporn.com',
      'spankbang.com', 'spankbang.party',
    ],
    color: '#FF9900',
    icon: 'pornhub',
    enabled: true,
  },
  other: {
    name: '其他',
    domains: [],  // 其他平台不限定域名
    color: '#6366F1',
    icon: 'other',
    enabled: true,
  },
  unknown: {
    name: '未知平台',
    domains: [],
    color: '#6B7280',
    icon: 'unknown',
    enabled: false,
  },
};

// 文件大小限制
export const FILE_SIZE_LIMITS = {
  DIRECT_DOWNLOAD: 100 * 1024 * 1024,  // 100MB 以下直接下载
  R2_STORAGE: 500 * 1024 * 1024,       // 500MB 以上使用 R2
  MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 最大 2GB
};

// 缓存时间
export const CACHE_TTL = {
  VIDEO_INFO: 60 * 60,      // 视频信息缓存 1 小时
  R2_FILE: 24 * 60 * 60,    // R2 文件保留 24 小时
};

// API 端点
export const API_ENDPOINTS = {
  PARSE: '/api/parse',
  DOWNLOAD: '/api/download',
  STATUS: '/api/status',
};
