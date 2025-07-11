// src/app/layout.tsx
'use client';

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";
import { LayerProvider } from "./context/LayerContext";
import { AreaParametersProvider } from "./context/AreaParametersContext";
import { ImageLayerProvider } from "./context/ImageLayerContext";
import { useEffect } from "react";
import { registerServiceWorker } from "../lib/serviceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata moved to separate file since this is now a client component

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Register service worker for aggressive caching
  useEffect(() => {
    if (typeof window !== 'undefined') {
      registerServiceWorker()
        .then((registration) => {
          if (registration) {
            console.log('🚀 Service Worker: Aggressive caching enabled for marine images');
          }
        })
        .catch((error) => {
          console.warn('⚠️ Service Worker: Failed to register, falling back to normal caching');
        });
    }
  }, []);

  return (
    <html lang="sv">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AreaParametersProvider>
          <ImageLayerProvider>
            <TimeSliderProvider>
              <LayerProvider>
                <SidebarWithToggle>
                  {children}
                </SidebarWithToggle>
              </LayerProvider>
            </TimeSliderProvider>
          </ImageLayerProvider>
        </AreaParametersProvider>
      </body>
    </html>
  );
}
