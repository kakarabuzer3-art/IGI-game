import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHADOW PROTOCOL — Tactical Infiltration Game",
  description:
    "SHADOW PROTOCOL is an original first-person tactical stealth game that runs in your browser. Infiltrate the remote Greyline Station across four missions: reconnaissance, stealth, environmental interaction, and extraction. No downloads, no installs — keyboard, mouse and touch supported.",
  keywords: [
    "tactical stealth game",
    "browser game",
    "first person infiltration",
    "stealth gameplay",
    "canvas game",
    "webgl game",
  ],
  openGraph: {
    title: "SHADOW PROTOCOL — Tactical Infiltration",
    description:
      "An original browser-based tactical stealth experience. Four missions. One rule: never be seen.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
