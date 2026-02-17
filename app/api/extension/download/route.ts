import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const extensionDir = join(process.cwd(), 'extension');
    const zipPath = join('/tmp', `getv-extension-${Date.now()}.zip`);

    // 使用系统 zip 命令创建 ZIP 文件
    await execAsync(`cd "${extensionDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`);

    // 读取 ZIP 文件
    const zipBuffer = await readFile(zipPath);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="getv-extension.zip"',
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Extension download error:', error);
    return NextResponse.json(
      { error: '下载失败' },
      { status: 500 }
    );
  }
}
