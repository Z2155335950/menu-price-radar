import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // PDF 解析依赖 Node 端的 PDF.js 构建，不参与浏览器打包。
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
