import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getGoogleClientId } from "@/lib/googleSignIn";
import { buildSiteMetadata, buildWebsiteJsonLd } from "@/lib/siteMetadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = buildSiteMetadata();

export const viewport = {
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
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full min-h-0 antialiased`}
    >
      <body className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden">
        <script
          id="sg-public-config"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ googleClientId: getGoogleClientId() }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd()) }}
        />
        {children}
      </body>
    </html>
  );
}
