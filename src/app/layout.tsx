import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "デモクラシーフィットネス診断 | きづきくみたて工房",
  description: "組織の対話力を診断するサーベイシステム。10のデモクラシーフィットネス筋肉について、個人レベル・組織レベルでスコアを計測します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen bg-slate-50">
        {children}
      </body>
    </html>
  );
}
