// 图标生成脚本
// 运行：node generate-icons.js

const fs = require('fs');
const path = require('path');

// 简单的 PNG 生成（使用 canvas 或 sharp）
// 由于这是示例，我们创建一个简单的 base64 编码的图标

const iconSizes = [16, 48, 128];

// 这是一个简化的方案 - 创建简单的 PNG 占位符
// 实际项目中建议使用 sharp 或 canvas 库生成

async function generateIcons() {
  console.log('请安装 sharp 来生成图标：');
  console.log('npm install sharp');
  console.log('');

  try {
    const sharp = require('sharp');

    const svgPath = path.join(__dirname, 'icons', 'icon.svg');
    const svgBuffer = fs.readFileSync(svgPath);

    for (const size of iconSizes) {
      const outputPath = path.join(__dirname, 'icons', `icon${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`✓ 生成 icon${size}.png`);
    }

    console.log('\n所有图标已生成！');
  } catch (error) {
    console.log('Sharp 未安装，使用占位图标...\n');

    // 创建简单的占位图标（纯色 PNG）
    // 这是 PNG 文件的最小有效格式
    const createPlaceholderPNG = (size) => {
      // 使用最小的有效 PNG 结构
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A // PNG signature
      ]);

      // 创建一个简单的 1x1 紫色像素 PNG (base64)
      // 这是一个预先生成的紫色 1x1 PNG
      const purplePixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      return purplePixel;
    };

    for (const size of iconSizes) {
      const outputPath = path.join(__dirname, 'icons', `icon${size}.png`);
      fs.writeFileSync(outputPath, createPlaceholderPNG(size));
      console.log(`✓ 生成占位图标 icon${size}.png (${size}x${size})`);
    }

    console.log('\n提示：这些是占位图标。请使用在线工具或图像处理软件生成正式图标。');
    console.log('在线工具：https://cloudconvert.com/svg-to-png');
  }
}

generateIcons();
