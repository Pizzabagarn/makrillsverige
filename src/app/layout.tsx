// src/app/layout.tsx
'use client';

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";
import { LayerProvider } from "./context/LayerContext";
import { AreaParametersProvider } from "./context/AreaParametersContext";
import { ImageLayerProvider, type ImageLayerType } from "./context/ImageLayerContext";
import { ManualPointsProvider } from "./context/ManualPointsContext";
import { AuthProvider } from "./context/AuthContext";
import { SubscriptionProvider } from "./context/SubscriptionContext";
import { SimulationProvider, useSimulationLayer } from "./context/SimulationContext";
import { NavigationProvider, useNavigation } from "./context/NavigationContext";
import { useState, useEffect } from "react";
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



// Service Worker registrering
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registrerat:', registration);
      
      // Uppdatera service worker vid behov
      registration.addEventListener('updatefound', () => {
        console.log('🔄 Service Worker uppdatering hittad');
      });
      
    } catch (error) {
      console.error('❌ Service Worker registrering misslyckades:', error);
    }
  }
};

// Metadata moved to separate file since this is now a client component

function RootLayoutContent({ children, shouldShowSidebar }: { children: React.ReactNode, shouldShowSidebar: boolean }) {
  const { simulationLayer, setSimulationLayer } = useSimulationLayer();
  const { isNavigating } = useNavigation();
  
  // Återuppta preloading när navigation är klar (automatiskt via pathname change)
  useEffect(() => {
    if (!isNavigating) {
      // Navigation just finished, resume preloading
      try {
        const LayerPreloadingManager = require('@/lib/layerPreloadingManager').default;
        const preloadingManager = LayerPreloadingManager.getInstance();
        preloadingManager.resumePreloading();
        console.log('🔄 Preloading återupptaget efter navigation');
      } catch (error) {
        console.warn('Kunde inte återuppta preloading:', error);
      }
    }
  }, [isNavigating]); // Lyssna på isNavigating state

  return (
    <>
      {/* ULTRA-snabb Navigation Loading - minimal visual feedback */}
      {isNavigating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center transition-all duration-150">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
            <p className="text-white font-light text-sm">Navigerar...</p>
          </div>
        </div>
      )}
      
      {shouldShowSidebar ? (
        <SidebarWithToggle
          simulationLayer={simulationLayer}
          onSimulationLayerChange={setSimulationLayer}
        >
          {children}
        </SidebarWithToggle>
      ) : (
        children
      )}
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Registrera Service Worker vid start
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Kontrollera om vi ska visa sidebaren (inte på startsidan, fiskinformationssidan eller admin-sidor)
  const shouldShowSidebar = pathname !== '/' && 
                           pathname !== '/fiskinformation' && 
                           !pathname.startsWith('/admin');

  return (
    <html lang="sv">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <SubscriptionProvider>
            <AreaParametersProvider>
              <TimeSliderProvider>
                <LayerProvider>
                  <ImageLayerProvider>
                                    <ManualPointsProvider>
                  <SimulationProvider>
                    <NavigationProvider>
                      <RootLayoutContent shouldShowSidebar={shouldShowSidebar}>
                        {children}
                      </RootLayoutContent>
                    </NavigationProvider>
                  </SimulationProvider>
                </ManualPointsProvider>
                  </ImageLayerProvider>
                </LayerProvider>
              </TimeSliderProvider>
            </AreaParametersProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
