import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "GroundEd — the classroom AI that works when the internet doesn't",
  description:
    "GroundEd is an offline-first teaching kit for low-connectivity classrooms: quizzes, lesson plans and flashcards from any material, private on-device grading, and live sessions that survive airplane mode. On-device Gemini Nano via Firebase AI Logic hybrid inference.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  keywords: [
    "GroundEd",
    "Firebase AI Logic",
    "hybrid inference",
    "on-device AI",
    "Gemini Nano",
    "offline quiz generator",
    "lesson plan generator",
    "flashcards",
    "teachers",
    "#BuildHybridAI",
  ],
  authors: [{ name: "GroundEd" }],
  openGraph: {
    title: "GroundEd — offline-first classroom AI",
    description:
      "Quizzes, lesson plans and flashcards from any material. Private on-device grading, live sessions with intermittent connectivity, and answer keys verified on the OTHER tier. Built on Firebase AI Logic hybrid inference.",
    siteName: "GroundEd",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "GroundEd — offline-first classroom AI" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6d52",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Fraunces for display headings, Inter for UI text — graceful system fallbacks offline */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased bg-background text-foreground"
        style={
          {
            "--font-fraunces": "Fraunces",
            "--font-inter": "Inter",
          } as React.CSSProperties
        }
      >
        {children}
        <SonnerToaster position="top-center" offset={72} richColors />
      </body>
    </html>
  );
}
