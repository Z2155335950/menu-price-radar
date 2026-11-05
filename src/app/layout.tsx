import type { Metadata } from "next";
import type { ReactNode } from "react";

import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/app-meta";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
