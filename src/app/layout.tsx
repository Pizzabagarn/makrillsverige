// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Makrill-Sverige",
  description: "Fiskedata och havsprognoser längs västkusten",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
  maximumScale: 1.0,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>

        <TimeSliderProvider>
          <SidebarWithToggle>
            {children}
          </SidebarWithToggle>
        </TimeSliderProvider>
      </body>
    </html>
  );
}
