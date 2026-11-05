import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 第二阶段只验证运行骨架，不添加业务相关的构建开关。
  reactStrictMode: true,
};

export default nextConfig;
