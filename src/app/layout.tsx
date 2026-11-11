import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./fonts.css";
import "./globals.css";

// Fonts are self-hosted AND base64-embedded directly in fonts.css, so the
// build never fetches from Google Fonts and never depends on binary .woff2
// files surviving the deploy pipeline. This removes any font file paths for
// the bundler to resolve. (Orbitron, Space Grotesk, JetBrains Mono — OFL.)

export const metadata: Metadata = {
  title: "AETHERWEAVE // Multiplayer Game Hub",
  description:
    "Multiplayer game rooms with voice and text chat: a gravity arena shooter, neon hover racing, and a turn-based hex strategy game.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050711] font-sans text-slate-100 antialiased selection:bg-cyan-400/30 selection:text-cyan-100">
        {children}
      </body>
    </html>
  );
}
