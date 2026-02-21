// GetV 视频嗅探器 - Popup 脚本

let allVideos = [];
let currentTabId = null;

document.addEventListener('DOMContentLoaded', () => {
  // 初始化
  initTabs();
  loadVideos();
  getCurrentTab();

  // 事件绑定
  document.getElementById('scan-btn').addEventListener('click', scanCurrentPage);
  document.getElementById('clear-btn').addEventListener('click', clearVideos);
  document.getElementById('manual-add-btn').addEventListener('click', manualAdd);
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  document.getElementById('manual-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manualAdd();
  });

  autoPasteVideoUrl();
});

// 初始化标签页
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

// 获取当前标签页
function getCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      const title = tabs[0].title || tabs[0].url || '未知页面';
      document.getElementById('current-page-title').textContent =
        title.length > 40 ? title.slice(0, 40) + '...' : title;
    }
  });
}

// 自动粘贴视频链接
function autoPasteVideoUrl() {
  navigator.clipboard.readText().then(text => {
    if (text && (
      text.includes('.m3u8') ||
      text.includes('.mp4') ||
      text.includes('.flv') ||
      text.includes('finder.video.qq.com') ||
      text.includes('douyin.com') ||
      text.includes('xiaohongshu.com') ||
      text.includes('youtube.com') ||
      text.includes('tiktok.com')
    )) {
      document.getElementById('manual-url').value = text;
    }
  }).catch(() => {});
}

// 加载视频列表
function loadVideos() {
  chrome.runtime.sendMessage({ type: 'GET_VIDEOS' }, (response) => {
    if (response) {
      allVideos = response.videos || [];
      renderVideoList(allVideos);
      renderCurrentPageVideos();
      document.getElementById('video-count').textContent = allVideos.length;
      document.getElementById('server-url').textContent =
        response.server.replace('https://', '').replace('http://', '');
    }
  });
}

// 渲染当前页面视频
function renderCurrentPageVideos() {
  const container = document.getElementById('current-video-list');
  const currentVideos = allVideos.filter(v => v.tabId === currentTabId);

  if (currentVideos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </div>
        <div class="empty-title">暂无视频</div>
        <div class="empty-desc">播放视频后会自动捕获</div>
      </div>
    `;
    return;
  }

  container.innerHTML = currentVideos.map(video => createVideoItem(video)).join('');
  bindVideoActions(container);
}

// 渲染所有视频列表
function renderVideoList(videos) {
  const container = document.getElementById('video-list');

  if (!videos || videos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </div>
        <div class="empty-title">暂无视频</div>
        <div class="empty-desc">打开包含视频的页面自动捕获</div>
      </div>
    `;
    return;
  }

  container.innerHTML = videos.map(video => createVideoItem(video)).join('');
  bindVideoActions(container);
}

// 创建视频项 HTML
function createVideoItem(video) {
  const typeClass = video.type || 'other';
  const typeLabel = video.type?.toUpperCase() || 'VID';

  // 大小显示
  const sizeDisplay = video.sizeText ? `<span class="video-size">${video.sizeText}</span>` : '';

  // 时间显示
  const timeAgo = getTimeAgo(video.capturedAt);

  // 根据类型决定主操作按钮
  const isHLS = video.type === 'm3u8';
  const primaryAction = isHLS
    ? `<button class="action-btn primary" title="发送到 GetV" data-url="${video.url}">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 2L11 13 22 2l-7 20-4-9-9-4 20-7z"/>
         </svg>
       </button>`
    : `<button class="action-btn download" title="直接下载" data-url="${video.url}">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
         </svg>
       </button>`;

  return `
    <div class="video-item" data-id="${video.id}">
      <div class="video-badge ${typeClass}">${typeLabel}</div>
      <div class="video-info">
        <div class="video-name" title="${video.title}">${video.title}</div>
        <div class="video-meta">
          ${sizeDisplay}
          <span>${timeAgo}</span>
        </div>
      </div>
      <div class="video-actions">
        ${primaryAction}
        <button class="action-btn secondary" title="复制链接" data-url="${video.url}">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
        <button class="action-btn secondary danger" title="删除" data-id="${video.id}">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// 计算时间差
function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return Math.floor(seconds / 60) + '分钟前';
  if (seconds < 86400) return Math.floor(seconds / 3600) + '小时前';
  return Math.floor(seconds / 86400) + '天前';
}

// 绑定视频操作事件
function bindVideoActions(container) {
  container.querySelectorAll('.action-btn.primary').forEach(btn => {
    btn.onclick = () => sendToGetV(btn.dataset.url);
  });

  container.querySelectorAll('.action-btn.download').forEach(btn => {
    btn.onclick = () => downloadVideo(btn.dataset.url);
  });

  container.querySelectorAll('.action-btn.secondary').forEach(btn => {
    if (btn.dataset.url) {
      btn.onclick = () => copyUrl(btn.dataset.url, btn);
    }
  });

  container.querySelectorAll('.action-btn.danger').forEach(btn => {
    btn.onclick = () => removeVideo(btn.dataset.id);
  });
}

// 发送到 GetV
function sendToGetV(url) {
  chrome.runtime.sendMessage({
    type: 'SEND_TO_GETV',
    videoUrl: url
  }, (response) => {
    if (response && response.success) {
      window.close();
    } else {
      alert(response?.error || '发送失败');
    }
  });
}

// 直接下载视频
function downloadVideo(url) {
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_VIDEO',
    videoUrl: url,
    filename: `video_${Date.now()}.mp4`
  }, (response) => {
    if (!response?.success) {
      alert(response?.error || '下载失败');
    }
  });
}

// 复制链接
function copyUrl(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg fill="none" stroke="#10b981" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      </svg>
    `;
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 1500);
  });
}

// 删除视频
function removeVideo(videoId) {
  chrome.runtime.sendMessage({
    type: 'REMOVE_VIDEO',
    videoId: videoId
  }, () => {
    loadVideos();
  });
}

// 清空列表
function clearVideos() {
  if (confirm('确定要清空所有捕获的视频吗？')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_VIDEOS' }, () => {
      loadVideos();
      document.getElementById('video-count').textContent = '0';
    });
  }
}

// 手动添加
function manualAdd() {
  const input = document.getElementById('manual-url');
  const url = input.value.trim();

  if (!url) {
    alert('请输入视频链接');
    return;
  }

  sendToGetV(url);
  input.value = '';
}

// 扫描当前页面
function scanCurrentPage() {
  const btn = document.getElementById('scan-btn');
  btn.textContent = '扫描中...';
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_PAGE' }, (response) => {
        btn.textContent = '扫描';
        btn.disabled = false;

        if (response && response.videos && response.videos.length > 0) {
          response.videos.forEach(video => {
            chrome.runtime.sendMessage({
              type: 'MANUAL_ADD',
              url: video.url,
              title: video.title
            });
          });
          setTimeout(loadVideos, 500);
        } else {
          const tipBox = document.getElementById('tip-box');
          tipBox.style.display = 'block';
          tipBox.textContent = '⚠️ 未找到视频，请尝试播放视频后再扫描';
          setTimeout(() => { tipBox.style.display = 'none'; }, 3000);
        }
      });
    }
  });
}

// 打开设置页面
function openSettings() {
  chrome.runtime.openOptionsPage();
}
