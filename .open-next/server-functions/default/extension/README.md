# GetV 微信视频号助手

一个 Chrome 浏览器扩展，用于捕获微信视频号链接并发送到 GetV 进行下载。

## 功能特点

- 🔍 **自动捕获**：在微信视频号页面自动捕获视频链接
- 📋 **手动添加**：支持手动粘贴视频链接
- ⚡ **一键发送**：将链接发送到 GetV 进行下载
- 📱 **多平台支持**：除视频号外，还支持抖音、小红书等平台

## 安装方法

### 方法一：开发者模式安装（推荐）

1. 下载或克隆此扩展目录
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `extension` 文件夹

### 方法二：打包安装

1. 在 `chrome://extensions/` 页面点击「打包扩展程序」
2. 选择 `extension` 文件夹
3. 生成 `.crx` 文件后拖拽安装

## 使用方法

### 自动捕获

1. 安装扩展后，打开微信视频号页面
2. 播放任意视频，扩展会自动捕获链接
3. 点击扩展图标查看捕获的视频列表
4. 点击「发送到 GetV」按钮进行下载

### 手动添加

1. 复制视频链接（微信分享链接或抓包获取的链接）
2. 点击扩展图标，在输入框粘贴链接
3. 点击「添加并发送」

### 悬浮按钮

- 在微信相关页面，右下角会显示紫色悬浮按钮
- 点击按钮可快速选择当前页面的视频

## 配置说明

点击扩展图标的「设置」按钮可配置：

- **服务器地址**：GetV 服务器的 URL（默认：https://getv.top）
- 本地开发时可设置为 `http://localhost:3000`

## 支持的平台

| 平台 | 自动捕获 | 手动添加 |
|------|---------|---------|
| 微信视频号 | ✅ | ✅ |
| 抖音 | ✅ | ✅ |
| 小红书 | ✅ | ✅ |
| YouTube | - | ✅ |
| TikTok | - | ✅ |
| Twitter/X | - | ✅ |
| Instagram | - | ✅ |

## 生成图标

扩展需要 PNG 格式的图标文件。运行以下命令从 SVG 生成：

```bash
# 使用 ImageMagick
convert icons/icon.svg -resize 16x16 icons/icon16.png
convert icons/icon.svg -resize 48x48 icons/icon48.png
convert icons/icon.svg -resize 128x128 icons/icon128.png

# 或使用在线工具
# https://cloudconvert.com/svg-to-png
```

或者使用 Node.js 脚本：

```bash
npm install sharp
node generate-icons.js
```

## 隐私说明

- 扩展仅在微信相关页面运行
- 不收集任何个人信息
- 视频链接仅存储在本地浏览器中
- 不会向第三方发送数据

## 常见问题

### 为什么有些视频无法捕获？

微信视频号采用了加密技术，部分视频链接可能需要手动添加。建议：
- 使用抓包工具（如 Stream、HttpCanary）获取链接
- 或使用配套的桌面客户端

### 视频链接过期怎么办？

视频号链接通常有 24 小时有效期，请在有效期内下载。

### 如何获取视频号链接？

1. **方法一**：使用此扩展自动捕获
2. **方法二**：使用抓包工具（Stream、Charles 等）
3. **方法三**：使用微信开发者工具

## 开发说明

```bash
# 目录结构
extension/
├── manifest.json      # 扩展配置
├── background.js      # 后台服务
├── content.js         # 内容脚本
├── content.css        # 样式
├── popup.html/js      # 弹窗界面
├── options.html/js    # 设置页面
└── icons/             # 图标
```

## License

MIT
