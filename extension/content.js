// GetV 视频嗅探助手 - 内容脚本

(function () {
  'use strict';

  // 检测是否已注入
  if (window.__getvInjected) return;
  window.__getvInjected = true;

  console.log('[GetV] 内容脚本已加载');

  // 自动注入 B 站 SESSDATA 到 GetV 页面
  // 当用户在 GetV 网页粘贴 B 站链接时，自动使用浏览器中已登录的 B 站 Cookie
  const host = window.location.hostname;
  if (host === 'localhost' || host.includes('getv') || host.includes('226022.xyz')) {
    chrome.runtime.sendMessage({ type: 'GET_BILIBILI_SESSDATA' }, (response) => {
      if (response && response.sessdata) {
        const existing = localStorage.getItem('bilibili_sessdata');
        if (existing !== response.sessdata) {
          localStorage.setItem('bilibili_sessdata', response.sessdata);
          console.log('[GetV] 已自动注入 B 站 SESSDATA（来自浏览器 Cookie）');
        }
      }
    });
  }

  // 创建悬浮按钮
  function createFloatingButton() {
    const btn = document.createElement('div');
    btn.id = 'getv-floating-btn';
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="10,8 16,12 10,16" fill="currentColor"/>
      </svg>
    `;
    btn.title = '发送到 GetV';
    btn.onclick = handleFloatingClick;
    document.body.appendChild(btn);
  }

  // 悬浮按钮点击处理
  function handleFloatingClick() {
    const videos = findVideosOnPage();
    if (videos.length > 0) {
      showVideoSelector(videos);
    } else {
      showManualInput();
    }
  }

  // 查找页面上的视频
  function findVideosOnPage() {
    const videos = [];
    const seenUrls = new Set();

    // 1. 查找 video 元素
    document.querySelectorAll('video').forEach(video => {
      if (video.src && !seenUrls.has(video.src)) {
        seenUrls.add(video.src);
        videos.push({
          url: video.src,
          title: document.title || '未知视频',
          type: detectVideoType(video.src)
        });
      }
      if (video.currentSrc && !seenUrls.has(video.currentSrc)) {
        seenUrls.add(video.currentSrc);
        videos.push({
          url: video.currentSrc,
          title: document.title || '未知视频',
          type: detectVideoType(video.currentSrc)
        });
      }
    });

    // 2. 查找 source 元素
    document.querySelectorAll('source').forEach(source => {
      if (source.src && !seenUrls.has(source.src)) {
        seenUrls.add(source.src);
        videos.push({
          url: source.src,
          title: document.title || '未知视频',
          type: detectVideoType(source.src)
        });
      }
    });

    // 3. 从 JSON-LD 结构化数据中提取
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];

        items.forEach(item => {
          // VideoObject
          if (item['@type'] === 'VideoObject') {
            const contentUrl = item.contentUrl || item.embedUrl;
            if (contentUrl && !seenUrls.has(contentUrl)) {
              seenUrls.add(contentUrl);
              videos.push({
                url: contentUrl,
                title: item.name || document.title || '视频',
                type: detectVideoType(contentUrl),
                source: 'json-ld'
              });
            }
          }
        });
      } catch (e) { }
    });

    // 4. 从页面 HTML 中提取视频链接（正则匹配）
    const html = document.documentElement.outerHTML;

    // 匹配 m3u8 链接
    const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi;
    let match;
    while ((match = m3u8Regex.exec(html)) !== null) {
      const url = match[1];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        videos.push({
          url: url,
          title: document.title || 'HLS 视频',
          type: 'm3u8',
          source: 'page-scan'
        });
      }
    }

    // 匹配 mp4 链接
    const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi;
    while ((match = mp4Regex.exec(html)) !== null) {
      const url = match[1];
      if (!seenUrls.has(url) && !url.includes('avatar') && !url.includes('thumb') && !url.includes('preview')) {
        seenUrls.add(url);
        videos.push({
          url: url,
          title: document.title || 'MP4 视频',
          type: 'mp4',
          source: 'page-scan'
        });
      }
    }

    // 5. 检查 iframe（可能嵌入视频）
    document.querySelectorAll('iframe').forEach(iframe => {
      const src = iframe.src;
      if (src && isVideoEmbedUrl(src) && !seenUrls.has(src)) {
        seenUrls.add(src);
        videos.push({
          url: src,
          title: document.title || '嵌入视频',
          type: 'embed',
          source: 'iframe'
        });
      }
    });

    return videos;
  }

  // 检测视频类型
  function detectVideoType(url) {
    if (url.includes('.m3u8')) return 'm3u8';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.flv')) return 'flv';
    if (url.includes('.webm')) return 'webm';
    return 'unknown';
  }

  // 判断是否为视频嵌入链接
  function isVideoEmbedUrl(url) {
    const patterns = [
      /youtube\.com\/embed/,
      /player\.vimeo\.com/,
      /player\.youku\.com/,
      /player\.bilibili\.com/,
      /video\.qq\.com/,
      /iframe.*video/i,
    ];
    return patterns.some(p => p.test(url));
  }

  // 显示视频选择器
  function showVideoSelector(videos) {
    const modal = document.createElement('div');
    modal.id = 'getv-modal';
    modal.innerHTML = `
      <div class="getv-modal-content">
        <div class="getv-modal-header">
          <h3>选择要下载的视频</h3>
          <button class="getv-close-btn">&times;</button>
        </div>
        <div class="getv-modal-body">
          ${videos.map((v, i) => `
            <div class="getv-video-item" data-url="${v.url}" data-title="${v.title}">
              <div class="getv-video-info">
                <span class="getv-video-title">${v.title}</span>
                <span class="getv-video-url">${v.url.slice(0, 50)}...</span>
              </div>
              <button class="getv-send-btn">发送到 GetV</button>
            </div>
          `).join('')}
        </div>
        <div class="getv-modal-footer">
          <button class="getv-manual-btn">手动输入链接</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 绑定事件
    modal.querySelector('.getv-close-btn').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    modal.querySelectorAll('.getv-video-item').forEach(item => {
      item.querySelector('.getv-send-btn').onclick = () => {
        const url = item.dataset.url;
        sendToGetV(url);
        modal.remove();
      };
    });

    modal.querySelector('.getv-manual-btn').onclick = () => {
      modal.remove();
      showManualInput();
    };
  }

  // 显示手动输入框
  function showManualInput() {
    const modal = document.createElement('div');
    modal.id = 'getv-modal';
    modal.innerHTML = `
      <div class="getv-modal-content">
        <div class="getv-modal-header">
          <h3>手动输入视频链接</h3>
          <button class="getv-close-btn">&times;</button>
        </div>
        <div class="getv-modal-body">
          <div class="getv-input-group">
            <input type="text" id="getv-url-input" placeholder="粘贴视频号视频链接..." />
            <button id="getv-submit-btn">发送</button>
          </div>
          <p class="getv-hint">
            提示：视频号链接通常以 finder.video.qq.com 或 channels.weixin.qq.com 开头
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 绑定事件
    modal.querySelector('.getv-close-btn').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    const input = modal.querySelector('#getv-url-input');
    const submitBtn = modal.querySelector('#getv-submit-btn');

    submitBtn.onclick = () => {
      const url = input.value.trim();
      if (url) {
        sendToGetV(url);
        modal.remove();
      }
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        submitBtn.click();
      }
    };

    // 自动粘贴
    navigator.clipboard.readText().then(text => {
      if (text && (text.includes('finder.video.qq.com') ||
        text.includes('channels.weixin.qq.com') ||
        text.includes('weixin.qq.com'))) {
        input.value = text;
      }
    }).catch(() => { });
  }

  // 发送到 GetV
  function sendToGetV(url) {
    // 显示加载状态
    const loading = document.createElement('div');
    loading.id = 'getv-loading';
    loading.innerHTML = `
      <div class="getv-loading-content">
        <div class="getv-spinner"></div>
        <span>正在发送到 GetV...</span>
      </div>
    `;
    document.body.appendChild(loading);

    chrome.runtime.sendMessage({
      type: 'SEND_TO_CUTCUT',
      videoUrl: url
    }, (response) => {
      loading.remove();

      if (response && response.success) {
        showNotification('成功！正在打开 GetV...', 'success');
      } else {
        showNotification(response?.error || '发送失败', 'error');
      }
    });
  }

  // 显示通知
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.id = 'getv-notification';
    notification.className = `getv-notification getv-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VIDEO_CAPTURED') {
      showNotification(`已捕获视频：${message.data.title}`, 'success');
    }

    // 扫描页面请求
    if (message.type === 'SCAN_PAGE') {
      const videos = findVideosOnPage();
      sendResponse({ videos: videos });
      return true; // 保持消息通道打开
    }

    sendResponse({});
  });

  // 拦截 XHR 请求
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;

    xhr.open = function (method, url) {
      if (isVideoRequestUrl(url)) {
        chrome.runtime.sendMessage({
          type: 'MANUAL_ADD',
          url: url,
          title: document.title
        });
      }
      return originalOpen.apply(this, arguments);
    };

    return xhr;
  };

  // 拦截 Fetch 请求
  const originalFetch = window.fetch;
  window.fetch = function (url, options) {
    if (typeof url === 'string' && isVideoRequestUrl(url)) {
      chrome.runtime.sendMessage({
        type: 'MANUAL_ADD',
        url: url,
        title: document.title
      });
    } else if (url instanceof Request && isVideoRequestUrl(url.url)) {
      chrome.runtime.sendMessage({
        type: 'MANUAL_ADD',
        url: url.url,
        title: document.title
      });
    }
    return originalFetch.apply(this, arguments);
  };

  // 判断是否为视频请求链接（扩展到所有视频格式）
  function isVideoRequestUrl(url) {
    // 排除静态资源
    const excludePatterns = [
      /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff|woff2|ttf)(\?|$)/i,
      /avatar|thumb|preview|poster|icon/i,
    ];

    if (excludePatterns.some(p => p.test(url))) {
      return false;
    }

    // 匹配视频格式
    const videoPatterns = [
      /\.m3u8(\?|$)/i,
      /\.mp4(\?|$)/i,
      /\.flv(\?|$)/i,
      /\.webm(\?|$)/i,
      /\.ts(\?|$)/i,
      /finder\.video\.qq\.com/i,
      /channels\.weixin\.qq\.com/i,
      /video.*\.qq\.com/i,
    ];

    return videoPatterns.some(p => p.test(url));
  }

  // 初始化
  createFloatingButton();
})();
