import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "错因地图 MathTrace",
  description: "高中数学错题诊断 Agent P0 工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
