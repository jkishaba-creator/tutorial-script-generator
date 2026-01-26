import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Script Generator",
  description: "Convert HTML instructions into narrated video scripts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
