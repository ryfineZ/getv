// GetV 视频嗅探器 - 后台脚本

// 存储捕获的视频链接
let capturedVideos = [];

// GetV 服务器地址 - 默认本地开发地址
let getvServer = 'http://localhost:3000';

// 当前标签页的视频
let currentTabVideos = {};

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['getvServer', 'capturedVideos'], (result) => {
    if (result.getvServer) {
      getvServer = result.getvServer;
    }
    if (result.capturedVideos) {
      capturedVideos = result.capturedVideos;
    }
  });
});

// 视频格式匹配规则 - 只匹配明确的视频格式
const videoPatterns = [
  // 明确的视频文件扩展名
  /\.m3u8(\?|$)/i,
  /\.mp4(\?|$)/i,
  /\.flv(\?|$)/i,
  /\.webm(\?|$)/i,
  /\.mov(\?|$)/i,
  /\.mkv(\?|$)/i,
  /\.avi(\?|$)/i,
  // 视频分片
  /\/segment\/\d+\.ts(\?|$)/i,
  /\/\d+\.ts(\?|$)/i,
  // 常见 CDN 视频路径
  /\/video\//i,
  /\/videos\//i,
  /\/media\/.*\.(mp4|m3u8|flv)/i,
];

// 排除规则 - 明确不是视频的请求
const excludePatterns = [
  // 图片和静态资源
  /\.(jpg|jpeg|png|gif|webp|svg|ico|bmp)(\?|$)/i,
  /\.(css|js|woff|woff2|ttf|eot|otf)(\?|$)/i,
  // 追踪和分析
  /google|facebook|twitter|analytics|tracking|pixel|beacon/i,
  // 广告
  /\/ads?[\/._]|\/advert|\/banner|\/promo/i,
  // API 请求（通常不是视频）
  /\/api\/(?!video|media|stream)/i,
  // 缩略图
  /thumb|preview|poster|avatar|icon/i,
  // 音频文件
  /\.(mp3|wav|aac|ogg|flac)(\?|$)/i,
];

// 高优先级域名 - 这些域名的视频更可能是用户想要的
const priorityDomains = [
  'v.douyin.com',
  'douyin.com',
  'tiktok.com',
  'tiktokcdn.com',
  'xiaohongshu.com',
  'xhscdn.com',
  'finder.video.qq.com',
  'channels.weixin.qq.com',
  'youtube.com',
  'youtu.be',
  'googlevideo.com',
  'twitter.com',
  'x.com',
  'twimg.com',
  'instagram.com',
  'fbcdn.net',
  'pornhub.com',
  'phncdn.com',
  'bilibili.com',
  'bilivideo.com',
  'b23.tv',
];

// 监听所有网络请求 - 使用 onHeadersReceived 获取响应头
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const url = details.url;

    // 检测视频链接
    if (isVideoUrl(url, details)) {
      const videoInfo = extractVideoInfo(url, details);
      if (videoInfo) {
        addCapturedVideo(videoInfo);
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 判断是否为视频链接
function isVideoUrl(url, details) {
  // 排除明确的非视频请求
  if (excludePatterns.some(pattern => pattern.test(url))) {
    return false;
  }

  // 检查 Content-Type 响应头
  const contentType = details.responseHeaders?.find(
    h => h.name.toLowerCase() === 'content-type'
  );
  if (contentType) {
    const type = contentType.value.toLowerCase();
    // 明确的视频类型
    if (type.includes('video/') || type.includes('application/x-mpegurl') ||
      type.includes('application/vnd.apple.mpegurl')) {
      return true;
    }
    // 明确的非视频类型
    if (type.includes('text/') || type.includes('application/json') ||
      type.includes('image/') || type.includes('application/javascript')) {
      return false;
    }
  }

  // 匹配视频格式
  return videoPatterns.some(pattern => pattern.test(url));
}

// 提取视频信息
function extractVideoInfo(url, details) {
  try {
    const urlObj = new URL(url);

    // 生成唯一 ID
    let videoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // 提取域名作为来源
    const source = urlObj.hostname;

    // 判断视频类型
    let videoType = 'unknown';
    if (url.includes('.m3u8')) {
      videoType = 'm3u8';
    } else if (url.includes('.mp4')) {
      videoType = 'mp4';
    } else if (url.includes('.flv')) {
      videoType = 'flv';
    } else if (url.includes('.ts')) {
      videoType = 'ts';
    } else if (url.includes('.webm')) {
      videoType = 'webm';
    }

    // 获取文件大小
    let size = 0;
    let sizeText = '';
    const contentLength = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-length'
    );
    if (contentLength) {
      size = parseInt(contentLength.value, 10);
      sizeText = formatFileSize(size);
    }

    // 计算优先级分数
    let priority = 0;
    if (size > 10 * 1024 * 1024) priority += 50; // 大于 10MB
    else if (size > 1 * 1024 * 1024) priority += 30; // 大于 1MB
    else if (size > 100 * 1024) priority += 10; // 大于 100KB

    if (priorityDomains.some(d => source.includes(d))) {
      priority += 40;
    }

    if (videoType === 'mp4' || videoType === 'm3u8') {
      priority += 20;
    }

    // 生成友好的标题
    let title = generateTitle(url, source, videoType);

    return {
      id: videoId,
      url: url,
      type: videoType,
      source: source,
      title: title,
      size: size,
      sizeText: sizeText,
      priority: priority,
      capturedAt: Date.now(),
      tabId: details.tabId,
    };
  } catch (e) {
    console.error('提取视频信息失败:', e);
    return null;
  }
}

// 生成友好的标题
function generateTitle(url, source, type) {
  // 从 URL 中提取文件名
  const urlPath = url.split('?')[0];
  const fileName = urlPath.split('/').pop() || '';

  // 常见域名映射
  const domainNames = {
    'douyin': '抖音',
    'tiktok': 'TikTok',
    'xiaohongshu': '小红书',
    'xhscdn': '小红书',
    'weixin': '微信视频号',
    'qq.com': '腾讯视频',
    'youtube': 'YouTube',
    'googlevideo': 'YouTube',
    'twitter': 'Twitter/X',
    'x.com': 'Twitter/X',
    'instagram': 'Instagram',
    'pornhub': 'PornHub',
    'phncdn': 'PornHub',
    'bilibili': 'Bilibili',
    'bilivideo': 'Bilibili',
  };

  let sourceName = source;
  for (const [key, name] of Object.entries(domainNames)) {
    if (source.includes(key)) {
      sourceName = name;
      break;
    }
  }

  const typeLabel = type.toUpperCase();

  // 如果文件名看起来有意义，使用它
  if (fileName && fileName.length > 3 && !fileName.match(/^\d+$/)) {
    return `${sourceName} - ${fileName.slice(0, 30)}`;
  }

  return `${sourceName} ${typeLabel}视频`;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// 添加捕获的视频
function addCapturedVideo(videoInfo) {
  // 检查是否已存在相同 URL
  const exists = capturedVideos.some(v => v.url === videoInfo.url);
  if (!exists) {
    capturedVideos.unshift(videoInfo);

    // 按优先级排序
    capturedVideos.sort((a, b) => b.priority - a.priority);

    // 只保留最近 100 条
    if (capturedVideos.length > 100) {
      capturedVideos = capturedVideos.slice(0, 100);
    }
    saveCapturedVideos();

    // 更新扩展图标徽章
    chrome.action.setBadgeText({ text: capturedVideos.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });

    // 更新当前标签页的视频列表
    if (videoInfo.tabId) {
      if (!currentTabVideos[videoInfo.tabId]) {
        currentTabVideos[videoInfo.tabId] = [];
      }
      currentTabVideos[videoInfo.tabId].unshift(videoInfo);
      // 同样排序
      currentTabVideos[videoInfo.tabId].sort((a, b) => b.priority - a.priority);
    }
  }
}

// 保存捕获的视频列表
function saveCapturedVideos() {
  chrome.storage.local.set({ capturedVideos });
}

// 监听标签页关闭，清理数据
chrome.tabs.onRemoved.addListener((tabId) => {
  delete currentTabVideos[tabId];
});

// 监听来自 content script 和 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_VIDEOS':
      sendResponse({
        videos: capturedVideos,
        server: getvServer,
        currentTabVideos: sender.tab ? currentTabVideos[sender.tab.id] || [] : []
      });
      break;

    case 'GET_TAB_VIDEOS':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          sendResponse({
            videos: currentTabVideos[tabs[0].id] || capturedVideos.filter(v => v.tabId === tabs[0].id),
            server: getvServer
          });
        } else {
          sendResponse({ videos: capturedVideos, server: getvServer });
        }
      });
      return true;

    case 'CLEAR_VIDEOS':
      capturedVideos = [];
      currentTabVideos = {};
      saveCapturedVideos();
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
      break;

    case 'REMOVE_VIDEO':
      capturedVideos = capturedVideos.filter(v => v.id !== message.videoId);
      saveCapturedVideos();
      if (capturedVideos.length === 0) {
        chrome.action.setBadgeText({ text: '' });
      } else {
        chrome.action.setBadgeText({ text: capturedVideos.length.toString() });
      }
      sendResponse({ success: true });
      break;

    case 'SEND_TO_CUTCUT':
      sendToGetV(message.videoUrl)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'DOWNLOAD_VIDEO':
      downloadVideo(message.videoUrl, message.filename)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'SET_SERVER':
      getvServer = message.server;
      chrome.storage.sync.set({ getvServer: message.server });
      sendResponse({ success: true });
      break;

    case 'MANUAL_ADD':
      if (message.url) {
        const videoInfo = {
          id: Date.now().toString(),
          url: message.url,
          type: detectVideoType(message.url),
          source: new URL(message.url).hostname,
          title: message.title || '手动添加',
          size: 0,
          sizeText: '',
          priority: 100, // 手动添加优先级高
          capturedAt: Date.now(),
        };
        addCapturedVideo(videoInfo);
        sendResponse({ success: true, video: videoInfo });
      } else {
        sendResponse({ success: false, error: 'URL 不能为空' });
      }
      break;
  }
});

// 检测视频类型
function detectVideoType(url) {
  if (url.includes('.m3u8')) return 'm3u8';
  if (url.includes('.mp4')) return 'mp4';
  if (url.includes('.flv')) return 'flv';
  return 'unknown';
}

// 获取 B 站 SESSDATA Cookie（自动从浏览器中读取）
async function getBilibiliSessdata() {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://www.bilibili.com',
      name: 'SESSDATA',
    });
    return cookie ? cookie.value : null;
  } catch (e) {
    console.log('[GetV] 获取 B 站 Cookie 失败:', e);
    return null;
  }
}

// 发送视频到 GetV
async function sendToGetV(videoUrl) {
  try {
    const body = { url: videoUrl };

    // B 站链接自动附带 SESSDATA
    if (videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv')) {
      const sessdata = await getBilibiliSessdata();
      if (sessdata) {
        body.sessdata = sessdata;
        console.log('[GetV] 已自动附带 B 站 SESSDATA');
      }
    }

    const response = await fetch(`${getvServer}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.success) {
      // 打开 GetV 结果页面
      chrome.tabs.create({
        url: `${getvServer}/?video=${encodeURIComponent(videoUrl)}`
      });
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 直接下载视频
async function downloadVideo(videoUrl, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url: videoUrl,
      filename: filename || `video_${Date.now()}.mp4`,
      saveAs: true
    });
    return { success: true, downloadId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
