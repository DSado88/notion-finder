import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion Finder",
  description: "Mac Finder-style browser for your Notion workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
