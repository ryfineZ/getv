// GetV 微信视频号助手 - 设置页面脚本

document.addEventListener('DOMContentLoaded', () => {
  // 加载当前设置
  loadSettings();

  // 绑定事件
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('test-btn').addEventListener('click', testConnection);
});

// 加载设置
function loadSettings() {
  chrome.storage.sync.get(['getvServer'], (result) => {
    if (result.getvServer) {
      document.getElementById('server-url').value = result.getvServer;
    }
  });
}

// 保存设置
function saveSettings() {
  const serverUrl = document.getElementById('server-url').value.trim();

  if (!serverUrl) {
    showStatus('请输入服务器地址', 'error');
    return;
  }

  // 验证 URL 格式
  try {
    new URL(serverUrl);
  } catch {
    showStatus('请输入有效的 URL（包含 http:// 或 https://）', 'error');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'SET_SERVER',
    server: serverUrl
  }, (response) => {
    if (response.success) {
      showStatus('设置已保存', 'success');
    } else {
      showStatus('保存失败', 'error');
    }
  });
}

// 测试连接
async function testConnection() {
  const serverUrl = document.getElementById('server-url').value.trim();

  if (!serverUrl) {
    showStatus('请先输入服务器地址', 'error');
    return;
  }

  showStatus('正在测试连接...', 'success');

  try {
    const response = await fetch(`${serverUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=test' })
    });

    if (response.ok) {
      showStatus('连接成功！', 'success');
    } else {
      showStatus(`服务器响应 ${response.status}`, 'error');
    }
  } catch (error) {
    showStatus('连接失败，请检查地址是否正确', 'error');
  }
}

// 显示状态
function showStatus(message, type) {
  const status = document.getElementById('status');
  const statusText = document.getElementById('status-text');

  status.classList.remove('hidden', 'error');
  if (type === 'error') {
    status.classList.add('error');
  }

  statusText.textContent = message;
  status.classList.remove('hidden');

  // 3秒后自动隐藏（成功状态）
  if (type === 'success') {
    setTimeout(() => {
      status.classList.add('hidden');
    }, 3000);
  }
}
