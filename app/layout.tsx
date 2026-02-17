import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "GetV - 免费视频下载器 | 支持抖音、小红书、YouTube、TikTok",
  description: "免费在线视频下载器，支持抖音、小红书、视频号、YouTube、TikTok、Twitter、Instagram 等多个平台，无水印下载，最高支持4K画质。",
  keywords: ["视频下载", "抖音下载", "小红书下载", "YouTube下载", "TikTok下载", "无水印", "在线工具"],
  authors: [{ name: "GetV" }],
  openGraph: {
    title: "GetV - 免费视频下载器",
    description: "支持多个平台的免费视频下载工具",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`dark ${outfit.variable} ${inter.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen relative overflow-x-hidden selection:bg-primary selection:text-black">
        <div className="fixed inset-0 bg-noise opacity-[0.03] pointer-events-none z-50"></div>
        <div className="fixed inset-0 bg-gradient-radial from-secondary/10 via-background to-background pointer-events-none -z-10"></div>
        {children}
      </body>
    </html>
  );
}
