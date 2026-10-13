import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "AI Visibility Monitor",
  description: "Monitoring widoczności marki w asystentach AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-t0">{children}</body>
    </html>
  );
}
