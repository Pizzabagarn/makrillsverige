//src/app/page.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { animate, createScope } from 'animejs';
import LayerPreloadingManager from '@/lib/layerPreloadingManager';
import PopupPreloadManager from '@/lib/popupPreloadManager';
import { useCacheOptimization } from '@/lib/throttleHooks';
import { useNavigation } from './context/NavigationContext';
import UserMenu from './components/UserMenu';
import { Loader2 } from 'lucide-react';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [preloadingProgress, setPreloadingProgress] = useState(0);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const router = useRouter();
  const { isLowEndDevice } = useCacheOptimization();
  const { setNavigating } = useNavigation();

  // Refs för anime.js animationer
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<any>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Starta preloading i bakgrunden utan att blockera UI
    const startPreloading = async () => {
      try {
        const preloadingManager = LayerPreloadingManager.getInstance();
        
        // Snabb progress animation för bättre UX
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += Math.random() * 25 + 10; // Snabbare progress
          if (progress > 95) {
            clearInterval(progressInterval);
            progress = 100;
            setPreloadingProgress(100);
            // Kortare loading-tid för snabbare känsla
            setTimeout(() => {
              setIsLoading(false);
            }, 500);
          } else {
            setPreloadingProgress(progress);
          }
        }, 150); // Snabbare uppdateringar
        
        // Starta preloading asynkront utan await (blockerar inte UI)
        if (isLowEndDevice) {
          console.log('📱 Mobil-optimerad preloading');
          setTimeout(() => {
            preloadingManager.startPreloading().catch(console.warn);
          }, 500);
        } else {
          // Starta direkt för desktop
          preloadingManager.startPreloading().catch(console.warn);
          
          // Popup preloading för starka enheter
          const popupPreloadManager = PopupPreloadManager.getInstance();
          popupPreloadManager.startPreloading().catch(console.warn);
        }
        
      } catch (error) {
        console.warn('⚠️ Preloading startar i bakgrunden:', error);
        setIsLoading(false);
      }
    };
    
    startPreloading();
  }, [isLowEndDevice]);

  // Visa laddningsindikator när användaren navigerar
  useEffect(() => {
    if (isPreloading) {
      // Visa något som indikerar att navigation pågår
      const timer = setTimeout(() => {
        setIsPreloading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPreloading]);

  // Anime.js setup med nya API:n
  useEffect(() => {
    if (isLoading || !rootRef.current) return;

    // Skapa en anime scope för alla animationer
    const scope = createScope();
    scopeRef.current = scope;

    // Sekventiell animation av element med anime.js
    setTimeout(() => {
      if (titleRef.current) {
        animate(titleRef.current, {
          opacity: [0, 1],
          translateY: [30, 0],
          duration: 1000,
          delay: 200,
          ease: 'outExpo'
        });
      }
    }, 0);

    setTimeout(() => {
      if (subtitleRef.current) {
        animate(subtitleRef.current, {
          opacity: [0, 1],
          translateY: [30, 0],
          duration: 800,
          delay: 400,
          ease: 'outExpo'
        });
      }
    }, 200);

    setTimeout(() => {
      if (featuresRef.current?.children) {
        animate(featuresRef.current.children, {
          opacity: [0, 1],
          translateY: [20, 0],
          duration: 600,
          delay: (_: any, i: number) => i * 100,
          ease: 'outBack'
        });
      }
    }, 400);

    setTimeout(() => {
      if (buttonsRef.current?.children) {
        animate(buttonsRef.current.children, {
          opacity: [0, 1],
          scale: [0.95, 1],
          duration: 700,
          delay: (_: any, i: number) => i * 150,
          ease: 'outElastic'
        });
      }
    }, 600);

    // Hover-animationer som metoder
    scopeRef.current.methods = {
      titleHover: () => {
        if (titleRef.current) {
          animate(titleRef.current, {
            color: '#22d3ee',
            scale: 1.02,
            duration: 300
          });
        }
      },
      titleLeave: () => {
        if (titleRef.current) {
          animate(titleRef.current, {
            color: '#ffffff',
            scale: 1,
            duration: 300
          });
        }
      },
      subtitleHover: () => {
        if (subtitleRef.current) {
          animate(subtitleRef.current, {
            color: '#a5f3fc',
            duration: 300
          });
        }
      },
      subtitleLeave: () => {
        if (subtitleRef.current) {
          animate(subtitleRef.current, {
            color: 'rgba(255, 255, 255, 0.8)',
            duration: 300
          });
        }
      },
      featureHover: (target: Element) => {
        animate(target, {
          scale: 1.05,
          translateY: -5,
          duration: 200,
          ease: 'outQuart'
        });
      },
      featureLeave: (target: Element) => {
        animate(target, {
          scale: 1,
          translateY: 0,
          duration: 200
        });
      },
      buttonHover: (target: Element) => {
        animate(target, {
          scale: 1.05,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          duration: 100,
          ease: 'outQuart'
        });
      },
      buttonLeave: (target: Element) => {
        animate(target, {
          scale: 1,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          duration: 100
        });
      }
    };

    return () => {
      // Cleanup
      scope.revert();
    };
  }, [isLoading]);

  // Event handlers för interaktioner
  const handleTitleHover = () => scopeRef.current?.methods.titleHover();
  const handleTitleLeave = () => scopeRef.current?.methods.titleLeave();
  
  const handleSubtitleHover = () => scopeRef.current?.methods.subtitleHover();
  const handleSubtitleLeave = () => scopeRef.current?.methods.subtitleLeave();
  
  const handleFeatureHover = (e: React.MouseEvent) => {
    scopeRef.current?.methods.featureHover(e.currentTarget);
  };
  const handleFeatureLeave = (e: React.MouseEvent) => {
    scopeRef.current?.methods.featureLeave(e.currentTarget);
  };

  const handleButtonHover = (e: React.MouseEvent) => {
    scopeRef.current?.methods.buttonHover(e.currentTarget);
  };
  const handleButtonLeave = (e: React.MouseEvent) => {
    scopeRef.current?.methods.buttonLeave(e.currentTarget);
  };

  // CLEAN navigation handlers - bara starta navigation och låt Next.js sköta resten
  const handleNavigateToMap = () => {
    // Pausa preloading för att inte konkurrera med navigation
    const preloadingManager = LayerPreloadingManager.getInstance();
    preloadingManager.pausePreloading();
    
    // Navigera omedelbart - låt inte preloading blockera  
    setIsPreloading(true);
    setNavigating(true);
    router.push('/map');
  };

  const handleNavigateToSignup = () => {
    // Pausa preloading för att inte konkurrera med navigation
    const preloadingManager = LayerPreloadingManager.getInstance();
    preloadingManager.pausePreloading();
    
    setIsRegistering(true);
    setNavigating(true);
    router.push('/signup');
  };

  return (
    <div ref={rootRef} className="relative min-h-screen w-full overflow-hidden">
      {/* Video Bakgrund med subtil blur för elegans */}
      <video
        className="absolute inset-0 w-full h-full object-cover z-0"
        style={{
          filter: 'brightness(0.4) contrast(1.05) saturate(0.8) blur(1px)',
        }}
        autoPlay
        muted
        loop
        playsInline
        onLoadedData={(e) => {
          const video = e.target as HTMLVideoElement;
          video.playbackRate = 0.5;
          console.log('📹 Video laddad med hastighet:', video.playbackRate);
        }}
        onCanPlay={(e) => {
          const video = e.target as HTMLVideoElement;
          video.playbackRate = 0.5; // Säkerställ hastigheten även när videon är redo att spelas
        }}
      >
        <source src="/videos/seal-chasing-fish.mp4" type="video/mp4" />
        Din webbläsare stöder inte video.
      </video>
      
      {/* Modern minimal overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/70 z-10" />
      
      {/* UserMenu i högra hörnet */}
      <div className="absolute top-8 right-8 z-40">
        <UserMenu />
      </div>

      {/* Innehåll med avancerade anime.js animationer */}
      <div className="relative z-30 min-h-screen flex flex-col items-center justify-center px-6 md:px-12 lg:px-16">
        
        {/* Modern minimal header med anime.js animationer */}
        <div className="text-center mb-16 max-w-4xl">
          <h1 
            ref={titleRef}
            onMouseEnter={handleTitleHover}
            onMouseLeave={handleTitleLeave}
            className="text-5xl md:text-7xl lg:text-8xl font-light text-white mb-8 tracking-[-0.02em] cursor-default"
            style={{ opacity: 0 }}
          >
            Fiskdata
            <span className="text-white/50 font-extralight">.se</span>
          </h1>
          <p 
            ref={subtitleRef}
            onMouseEnter={(e) => scopeRef.current?.methods.featureHover(e.currentTarget)}
            onMouseLeave={(e) => scopeRef.current?.methods.featureLeave(e.currentTarget)}
            className="text-xl md:text-2xl lg:text-3xl text-white/80 font-extralight tracking-wide leading-relaxed mb-12 cursor-default"
            style={{ opacity: 0 }}
          >
            Avancerad marinanalys för professionellt fiske
          </p>

          {/* Subtila features med interactive hover */}
          <div 
            ref={featuresRef}
            className="flex flex-wrap justify-center gap-8 text-white/60 text-sm font-light"
          >
            <span 
              onMouseEnter={handleFeatureHover}
              onMouseLeave={handleFeatureLeave}
              className="flex items-center gap-2 cursor-default"
              style={{ opacity: 0 }}
            >
              <div className="w-1 h-1 bg-teal-400 rounded-full animate-pulse"></div>
              AI-prediktioner
            </span>
            <span 
              onMouseEnter={handleFeatureHover}
              onMouseLeave={handleFeatureLeave}
              className="flex items-center gap-2 cursor-default"
              style={{ opacity: 0 }}
            >
              <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></div>
              Prognoser
            </span>
            <span 
              onMouseEnter={handleFeatureHover}
              onMouseLeave={handleFeatureLeave}
              className="flex items-center gap-2 cursor-default"
              style={{ opacity: 0 }}
            >
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
              Historisk analys
            </span>
          </div>
        </div>

        {/* Subtil laddningsindikator */}
        {isLoading && (
          <div className="mb-12">
            <div className="flex items-center justify-center gap-2">
              <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse"></div>
              <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse delay-200"></div>
              <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse delay-500"></div>
            </div>
          </div>
        )}

        {/* Modern Action Buttons med anime.js */}
        <div ref={buttonsRef} className="flex flex-col sm:flex-row items-center gap-4 max-w-2xl mx-auto">
          
          {/* Öppna Karta */}
          <button
            onClick={handleNavigateToMap}
            onMouseEnter={handleButtonHover}
            onMouseLeave={handleButtonLeave}
            disabled={isPreloading}
            className="group relative w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-medium rounded-2xl border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ opacity: 0 }}
          >
            <span className="relative flex items-center justify-center gap-3">
              {isPreloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Öppnar analys...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
                  </svg>
                  <span>Starta analys</span>
                </>
              )}
            </span>
          </button>

          {/* Fiskinformation knapp */}
          <button
            onClick={() => {
              setNavigating(true);
              router.push('/fiskinformation');
            }}
            onMouseEnter={handleButtonHover}
            onMouseLeave={handleButtonLeave}
            className="group relative w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-medium rounded-2xl border border-white/20"
            style={{ opacity: 0 }}
          >
            <span className="relative flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Fiskguide</span>
            </span>
          </button>

          {/* Väderprognos knapp */}
          <button
            onClick={() => {
              setNavigating(true);
              router.push('/weather');
            }}
            onMouseEnter={handleButtonHover}
            onMouseLeave={handleButtonLeave}
            className="group relative w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-medium rounded-2xl border border-white/20"
            style={{ opacity: 0 }}
          >
            <span className="relative flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15a4.5 4.5 0 004.5 4.5H16.5A3.75 3.75 0 0020.25 12a3.75 3.75 0 00-3.75-3.75 1.5 1.5 0 00-1.5 1.5v1.5a3 3 0 00-3 3 3 3 0 01-3-3V9a4.5 4.5 0 00-4.5-4.5 4.5 4.5 0 00-4.5 4.5v.75c0 .414.336.75.75.75h.75z" />
              </svg>
              <span>Väderprognos</span>
            </span>
          </button>

          {/* Registrera knapp */}
          <button
            onClick={handleNavigateToSignup}
            onMouseEnter={handleButtonHover}
            onMouseLeave={handleButtonLeave}
            disabled={isRegistering}
            className="group relative w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-medium rounded-2xl border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ opacity: 0 }}
          >
            <span className="relative flex items-center justify-center gap-3">
              {isRegistering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Omdirigerar...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span>Registrera</span>
                </>
              )}
            </span>
          </button>
        </div>

        {/* Minimal footer - visas med delay */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center">
          <p className="text-white/40 text-xs font-light">
            © 2025 Fiskdata.se
          </p>
          <p className="text-white/30 text-xs font-light mt-1">
            Powered by Norentix
          </p>
        </div>
      </div>
    </div>
  );
}
