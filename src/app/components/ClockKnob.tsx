'use client';

import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
} from 'react-circular-input';
import { useTimeSlider, getDateText } from '../context/TimeSliderContext';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';
import Image from 'next/image';

// KORREKT ASTRONOMISK BERÄKNING - Baserad på officiella soluppgång/solnedgång-ekvationer
function calculateSunTimes(date: Date) {
  // Malmö koordinater
  const latitude = 55.6061; // Malmö latitud (nord positiv)
  const longitude = 13.0007; // Malmö longitud (öst positiv, väst negativ)
  const elevation = 0; // Höjd över havet i meter
  
  // Konvertera datum till Julian Date
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Julian Date beräkning
  const a = Math.floor((14 - month) / 12);
  const y = year - a;
  const m = month + 12 * a - 3;
  const JD = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + 1721119;
  
  // Antal dagar sedan J2000.0 epok (1 januari 2000, 12:00 UTC)
  const n = Math.ceil(JD - 2451545.0 + 0.0008);
  
  // Mean solar time
  const J_star = n - longitude / 360;
  
  // Solar mean anomaly
  const M_deg = (357.5291 + 0.98560028 * J_star) % 360;
  const M_rad = M_deg * Math.PI / 180;
  
  // Equation of the center
  const C_deg = 1.9148 * Math.sin(M_rad) + 0.0200 * Math.sin(2 * M_rad) + 0.0003 * Math.sin(3 * M_rad);
  
  // Ecliptic longitude
  const lambda_deg = (M_deg + C_deg + 180 + 102.9372) % 360;
  const lambda_rad = lambda_deg * Math.PI / 180;
  
  // Solar transit (lokal sann solmiddag)
  const J_transit = 2451545.0 + J_star + 0.0053 * Math.sin(M_rad) - 0.0069 * Math.sin(2 * lambda_rad);
  
  // Declination of the Sun
  const sin_delta = Math.sin(lambda_rad) * Math.sin(23.4397 * Math.PI / 180);
  const cos_delta = Math.cos(Math.asin(sin_delta));
  
  // Hour angle beräkning med atmosfärisk refraktion och solens diameter
  // -0.833° för standard refraktion + solens diameter
  // Ytterligare höjdkorrektion för elevation
  const elevation_correction = elevation > 0 ? -2.076 * Math.sqrt(elevation) / 60 : 0;
  const altitude_angle = -0.833 + elevation_correction;
  
  const lat_rad = latitude * Math.PI / 180;
  const cos_hour_angle = (Math.sin(altitude_angle * Math.PI / 180) - Math.sin(lat_rad) * sin_delta) / 
                         (Math.cos(lat_rad) * cos_delta);
  
  // Kontrollera för midnattssol/polarnatt
  if (Math.abs(cos_hour_angle) > 1) {
    if (cos_hour_angle > 1) {
      return { sunrise: 12, sunset: 12 }; // Polarnatt
    } else {
      return { sunrise: 0, sunset: 24 }; // Midnattssol  
    }
  }
  
  const hour_angle_rad = Math.acos(cos_hour_angle);
  const hour_angle_deg = hour_angle_rad * 180 / Math.PI;
  
  // Beräkna soluppgång och solnedgång som Julian Dates
  const J_rise = J_transit - hour_angle_deg / 360;
  const J_set = J_transit + hour_angle_deg / 360;
  
  // Konvertera från Julian Date till Unix timestamp och sedan till svensk tid
  const unix_rise = (J_rise - 2440587.5) * 86400;
  const unix_set = (J_set - 2440587.5) * 86400;
  
  // Skapa Date-objekt för soluppgång och solnedgång
  const sunrise_date = new Date(unix_rise * 1000);
  const sunset_date = new Date(unix_set * 1000);
  
  // Konvertera till svensk tid (UTC+1 eller UTC+2)
  const isDST = isDaylightSavingTime(date);
  const timezone_offset = isDST ? 2 : 1;
  
  // Få svensk lokaltid
  const sunrise_swedish = new Date(sunrise_date.getTime() + timezone_offset * 3600 * 1000);
  const sunset_swedish = new Date(sunset_date.getTime() + timezone_offset * 3600 * 1000);
  
  // Konvertera till decimal timmar (0-24)
  const sunrise_hours = sunrise_swedish.getUTCHours() + sunrise_swedish.getUTCMinutes() / 60 + sunrise_swedish.getUTCSeconds() / 3600;
  const sunset_hours = sunset_swedish.getUTCHours() + sunset_swedish.getUTCMinutes() / 60 + sunset_swedish.getUTCSeconds() / 3600;
  
  // Beräkna daglängd
  const dayLength = sunset_hours - sunrise_hours;
  const dayLengthHours = Math.floor(dayLength);
  const dayLengthMinutes = Math.floor((dayLength - dayLengthHours) * 60);
  
  // Jämför med midsommar
  const midsummer = new Date(date.getFullYear(), 5, 21);
  const daysSinceMidsummer = Math.floor((date.getTime() - midsummer.getTime()) / (1000 * 60 * 60 * 24));
  
  // Debug-loggning endast under utveckling - tyst för prestanda
  // if (process.env.NODE_ENV === 'development') {
  //   console.log(`🌅 ASTRONOMISK BERÄKNING för Malmö ${date.toDateString()}:
  //     Soluppgång: ${Math.floor(sunrise_hours)}:${Math.floor((sunrise_hours % 1) * 60).toString().padStart(2, '0')}
  //     Solnedgång: ${Math.floor(sunset_hours)}:${Math.floor((sunset_hours % 1) * 60).toString().padStart(2, '0')}
  //     Daglängd: ${dayLengthHours}h ${dayLengthMinutes}min`);
  // }
  
  return {
    sunrise: sunrise_hours,
    sunset: sunset_hours
  };
}

// TESTFUNKTION: Visa hur soltider förändras över året - avstängd för prestanda
function testSunTimesOverYear(currentDate: Date) {
  // Avstängd för bättre prestanda - endast vid utveckling
  // console.log(`📊 ÅRLIG SOLCYKEL TEST för ${currentDate.getFullYear()}:`);
  
  // const testDates = [
  //   { name: 'Vinterdagjämning', date: new Date(currentDate.getFullYear(), 11, 21) }, // 21 dec
  //   { name: 'Januari', date: new Date(currentDate.getFullYear(), 0, 15) }, // 15 jan
  //   { name: 'Vårdagjämning', date: new Date(currentDate.getFullYear(), 2, 20) }, // 20 mars
  //   { name: 'Maj', date: new Date(currentDate.getFullYear(), 4, 15) }, // 15 maj
  //   { name: 'Midsommar', date: new Date(currentDate.getFullYear(), 5, 21) }, // 21 juni
  //   { name: 'Juli', date: new Date(currentDate.getFullYear(), 6, 15) }, // 15 juli
  //   { name: 'Augusti', date: new Date(currentDate.getFullYear(), 7, 15) }, // 15 aug
  //   { name: 'Höstdagjämning', date: new Date(currentDate.getFullYear(), 8, 22) }, // 22 sept
  //   { name: 'Oktober', date: new Date(currentDate.getFullYear(), 9, 15) }, // 15 okt
  // ];
  
  // testDates.forEach(({ name, date }) => {
  //   const times = calculateSunTimes(date);
  //   const dayLength = times.sunset - times.sunrise;
  //   console.log(`  ${name} (${date.toDateString()}): 
  //   Upp: ${Math.floor(times.sunrise)}:${Math.floor((times.sunrise % 1) * 60).toString().padStart(2, '0')} 
  //   Ner: ${Math.floor(times.sunset)}:${Math.floor((times.sunset % 1) * 60).toString().padStart(2, '0')} 
  //   Daglängd: ${Math.floor(dayLength)}h ${Math.floor((dayLength % 1) * 60)}min`);
  // });
}

// Hjälpfunktion för att avgöra sommartid i Sverige
function isDaylightSavingTime(date: Date): boolean {
  const year = date.getFullYear();
  
  // Sommartid börjar sista söndagen i mars
  const marchLastSunday = new Date(year, 2, 31);
  marchLastSunday.setDate(31 - marchLastSunday.getDay());
  
  // Sommartid slutar sista söndagen i oktober
  const octoberLastSunday = new Date(year, 9, 31);
  octoberLastSunday.setDate(31 - octoberLastSunday.getDay());
  
  return date >= marchLastSunday && date < octoberLastSunday;
}

// Beräkna solens synlighet och fade-transitions
function getSunMoonState(currentHour: number, currentDate: Date) {
  const sunTimes = calculateSunTimes(currentDate);
  const { sunrise, sunset } = sunTimes;
  
  // Kör årlig test första gången (en gång per dag) - avstängd för prestanda
  // const today = new Date().toDateString();
  // if (!(window as any).lastSunTestDate || (window as any).lastSunTestDate !== today) {
  //   testSunTimesOverYear(currentDate);
  //   (window as any).lastSunTestDate = today;
  // }
  
  // Konvertera från timmar från midnatt till verklig tid
  const timeOfDay = (currentHour % 24 + 24) % 24;
  
  // Formatera tider för debugging
  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };
  
  let sunOpacity = 0;
  let moonOpacity = 0;
  
  // Beräkna transition-fönster - mjukare övergångar över längre tid
  // Börja fada 1 timme före och sluta 1 timme efter soluppgång/solnedgång
  const transitionHours = 1.0; // Förlängt från 2 timmar till 2 timmar total (1h före + 1h efter)
  const sunriseStart = sunrise - transitionHours; // Börja 1h före soluppgång
  const sunriseEnd = sunrise + transitionHours; // Sluta 1h efter soluppgång
  
  const sunsetStart = sunset - transitionHours; // Börja 1h före solnedgång
  const sunsetEnd = sunset + transitionHours; // Sluta 1h efter solnedgång
  
  // Minimal loggning endast under utveckling
  if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) {
    // console.log(`🌞 Sol/måne: ${formatTime(timeOfDay)} | Upp: ${formatTime(sunrise)} | Ner: ${formatTime(sunset)}`);
  }
  
  // Kolla om vi är i någon transition-period
  const inSunriseTransition = timeOfDay >= sunriseStart && timeOfDay <= sunriseEnd;
  const inSunsetTransition = timeOfDay >= sunsetStart && timeOfDay <= sunsetEnd;
  
  if (inSunriseTransition) {
    // Soluppgång transition: månen fadas ut, solen fadas in
    const totalTransitionTime = transitionHours * 2; // 2 timmar total (1h före + 1h efter)
    const progress = (timeOfDay - sunriseStart) / totalTransitionTime;
    
    // Extra mjuk sinuskurva för naturlig transition
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const smoothProgress = 0.5 * (1 - Math.cos(clampedProgress * Math.PI));
    
    sunOpacity = smoothProgress;
    moonOpacity = 1 - smoothProgress;
    
  } else if (inSunsetTransition) {
    // Solnedgång transition: solen fadas ut, månen fadas in
    const totalTransitionTime = transitionHours * 2; // 2 timmar total (1h före + 1h efter)
    const progress = (timeOfDay - sunsetStart) / totalTransitionTime;
    
    // Extra mjuk sinuskurva för naturlig transition
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const smoothProgress = 0.5 * (1 - Math.cos(clampedProgress * Math.PI));
    
    sunOpacity = 1 - smoothProgress;  // Sol fadas ut
    moonOpacity = smoothProgress;     // Måne fadas in
    
  } else {
    // Utanför transition-perioder - bestäm baserat på tid
    if (timeOfDay >= sunrise && timeOfDay <= sunset) {
      // Dag: efter soluppgång, före solnedgång (men inte i transition)
      sunOpacity = 1;
      moonOpacity = 0;
    } else {
      // Natt: före soluppgång eller efter solnedgång (men inte i transition)
      sunOpacity = 0;
      moonOpacity = 1;
    }
  }
  
  return {
    sunOpacity: Math.max(0, Math.min(1, sunOpacity)),
    moonOpacity: Math.max(0, Math.min(1, moonOpacity)),
    sunrise,
    sunset,
    isDaytime: timeOfDay >= sunrise && timeOfDay <= sunset,
    timeOfDay
  };
}

const ClockKnob = React.memo(() => {
  const { selectedHour, displayHour, setSelectedHour, setDisplayHour, minHour, maxHour, baseTime, isLoadingBounds } = useTimeSlider();
  const clampedHour = Math.max(minHour, Math.min(displayHour, maxHour)); // Use displayHour for immediate feedback
  const value = (clampedHour - minHour) / (maxHour - minHour);
  const lastValue = useRef(value);
  
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');

  useEffect(() => {
    const checkLayout = () => {
      setLayoutType(getLayoutType());
    };
    
    checkLayout();
    window.addEventListener('resize', checkLayout);
    window.addEventListener('orientationchange', checkLayout);
    
    return () => {
      window.removeEventListener('resize', checkLayout);
      window.removeEventListener('orientationchange', checkLayout);
    };
  }, []);

  // Memoize date calculations
  const dateInfo = useMemo(() => {
    if (!baseTime) return { date: new Date(), weekday: '', fullDate: '', time: '', offsetString: '' };
    const date = new Date(baseTime + clampedHour * 3600 * 1000);
    
    const { weekday, fullDate } = getDateText(clampedHour, baseTime);
    
    const time = date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const days = Math.floor(Math.abs(clampedHour) / 24);
    const hours = Math.abs(clampedHour) % 24;

    const offsetString = clampedHour === 0
      ? 'Nu'
      : clampedHour > 0
        ? days > 0
          ? `+${days}d ${hours}h`
          : `+${hours}h`
        : days > 0
          ? `-${days}d ${hours}h`
          : `-${hours}h`;

    return { date, weekday, fullDate, time, offsetString };
  }, [clampedHour, baseTime]);

  // Beräkna sol/måne state
  const sunMoonState = useMemo(() => {
    if (!baseTime) return { sunOpacity: 1, moonOpacity: 0, sunrise: 6, sunset: 18, isDaytime: true, timeOfDay: 12 };
    
    // VIKTIGT: Använd displayHour för realtidsuppdatering medan man drar ClockKnob
    // baseTime är redan UTC-tid, displayHour är timmar från baseTime
    const utcDateTime = new Date(baseTime + displayHour * 3600 * 1000);
    
    // Konvertera direkt till svensk tid med Intl.DateTimeFormat
    const swedishFormatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const swedishParts = swedishFormatter.formatToParts(utcDateTime);
    const swedishDateInfo = swedishParts.reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as any);
    
    // Beräkna svensk timme direkt från formaterade delen
    const swedishHour = parseInt(swedishDateInfo.hour);
    const swedishMinute = parseInt(swedishDateInfo.minute);
    const currentHourSwedish = swedishHour + swedishMinute / 60;
    
    // Skapa svenskt datum för getSunMoonState
    const swedishDate = new Date(
      parseInt(swedishDateInfo.year),
      parseInt(swedishDateInfo.month) - 1, // Månader är 0-indexerade
      parseInt(swedishDateInfo.day),
      swedishHour,
      swedishMinute,
      parseInt(swedishDateInfo.second)
    );
    
    // Avstängd för bättre prestanda
    // console.log(`🌞 Sol/måne debug (realtid):
    //   UTC tid: ${utcDateTime.toISOString()}
    //   Svensk tid: ${swedishDate.toLocaleString('sv-SE')}
    //   Svensk timme: ${currentHourSwedish.toFixed(2)}
    //   displayHour: ${displayHour} (timmar från baseTime)
    //   baseTime: ${new Date(baseTime).toISOString()}`);
    
    return getSunMoonState(currentHourSwedish, swedishDate);
  }, [displayHour, baseTime]); // Använd displayHour istället för clampedHour

  // Beautiful asymmetric color: Yellow at "now", blue scale for past, red scale for future
  const progressColor = useMemo(() => {
    if (clampedHour === 0) {
      // Exactly at "now" - bright yellow
      return `rgb(255, 223, 0)`;
    }
    
    if (clampedHour < 0) {
      // Past time: Yellow → Blue → Deep night blue
      const distanceIntoPast = Math.abs(clampedHour);
      const maxPastDistance = Math.abs(minHour);
      const intensity = Math.min(distanceIntoPast / maxPastDistance, 1);
      
      const pastColorStops = [
        { pos: 0.0, r: 255, g: 223, b: 0 },    // Bright yellow (now)
        { pos: 0.3, r: 135, g: 206, b: 235 },  // Sky blue
        { pos: 0.6, r: 70, g: 130, b: 180 },   // Steel blue
        { pos: 1.0, r: 25, g: 25, b: 112 }     // Deep night blue (midnight)
      ];
      
      // Find color segment for past
      let startStop = pastColorStops[0];
      let endStop = pastColorStops[pastColorStops.length - 1];
      
      for (let i = 0; i < pastColorStops.length - 1; i++) {
        if (intensity >= pastColorStops[i].pos && intensity <= pastColorStops[i + 1].pos) {
          startStop = pastColorStops[i];
          endStop = pastColorStops[i + 1];
          break;
        }
      }
      
      const segmentProgress = (intensity - startStop.pos) / (endStop.pos - startStop.pos);
      const clampedSegmentProgress = Math.max(0, Math.min(1, segmentProgress || 0));
      
      const r = Math.round(startStop.r + (endStop.r - startStop.r) * clampedSegmentProgress);
      const g = Math.round(startStop.g + (endStop.g - startStop.g) * clampedSegmentProgress);
      const b = Math.round(startStop.b + (endStop.b - startStop.b) * clampedSegmentProgress);
      
      return `rgb(${r},${g},${b})`;
    } else {
      // Future time: Yellow → Orange → Deep red
      const distanceIntoFuture = clampedHour;
      const maxFutureDistance = maxHour;
      const intensity = Math.min(distanceIntoFuture / maxFutureDistance, 1);
      
             const futureColorStops = [
         { pos: 0.0, r: 255, g: 223, b: 0 },    // Bright yellow (now)
         { pos: 0.4, r: 255, g: 165, b: 0 },    // Orange 
         { pos: 0.7, r: 255, g: 69, b: 0 },     // Red-orange
         { pos: 1.0, r: 80, g: 0, b: 0 }        // Very deep dark red
       ];
      
      // Find color segment for future
      let startStop = futureColorStops[0];
      let endStop = futureColorStops[futureColorStops.length - 1];
      
      for (let i = 0; i < futureColorStops.length - 1; i++) {
        if (intensity >= futureColorStops[i].pos && intensity <= futureColorStops[i + 1].pos) {
          startStop = futureColorStops[i];
          endStop = futureColorStops[i + 1];
          break;
        }
      }
      
      const segmentProgress = (intensity - startStop.pos) / (endStop.pos - startStop.pos);
      const clampedSegmentProgress = Math.max(0, Math.min(1, segmentProgress || 0));
      
      const r = Math.round(startStop.r + (endStop.r - startStop.r) * clampedSegmentProgress);
      const g = Math.round(startStop.g + (endStop.g - startStop.g) * clampedSegmentProgress);
      const b = Math.round(startStop.b + (endStop.b - startStop.b) * clampedSegmentProgress);
      
      return `rgb(${r},${g},${b})`;
    }
  }, [clampedHour, maxHour, minHour]);

  const handleCircularInputChange = useCallback((v: number) => {
    const delta = Math.abs(v - lastValue.current);
    if (delta > 0.5) return;
    const scaled = Math.round(v * (maxHour - minHour) + minHour);
    if (scaled < minHour || scaled > maxHour) return;
    
    // Uppdatera både displayHour (för omedelbar feedback) och selectedHour
    if (scaled !== clampedHour) {
      setDisplayHour(scaled); // Omedelbar visuell feedback för sol/måne
      setSelectedHour(scaled); // Faktisk dataförändring
    }
    lastValue.current = v;
  }, [maxHour, minHour, clampedHour, setSelectedHour, setDisplayHour]);

  const isTabletLandscape = layoutType === 'tabletLandscape';
  const isMobile = layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';

  // Memoize responsive dimensions
  const responsiveDimensions = useMemo(() => {
    if (isMobile) {
      return {
        radius: layoutType === 'mobileLandscape' ? 35 : 40,
        strokeWidth: 4,
        thumbRadius: 3,
      };
    }
    return {
      radius: isTabletLandscape ? 65 : 80,
      strokeWidth: isTabletLandscape ? 6 : 8,
      thumbRadius: isTabletLandscape ? 5 : 6,
    };
  }, [isTabletLandscape, isMobile, layoutType]);

  // Use static glow effect ID to prevent hydration mismatch
  const glowId = isMobile ? 'clock-knob-glow-mobile' : 'clock-knob-glow';

  if (layoutType === 'desktop' || layoutType === 'tabletLandscape') {
    // Show loading state while bounds are being calculated
    if (isLoadingBounds) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-xs text-white/70 text-center">Laddar tillgänglig data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center space-y-4">
        <svg width="0" height="0">
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <CircularInput
              value={value}
              onChange={handleCircularInputChange}
              radius={responsiveDimensions.radius}
            >
              <CircularTrack stroke="#ffffff10" strokeWidth={responsiveDimensions.strokeWidth} />
              <CircularProgress stroke={progressColor} strokeWidth={responsiveDimensions.strokeWidth} filter={`url(#${glowId})`} />
              <CircularThumb r={responsiveDimensions.thumbRadius} fill={progressColor} />
            </CircularInput>
            
            {/* Sol/Måne animationer */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                width: responsiveDimensions.radius * 2,
                height: responsiveDimensions.radius * 2,
              }}
            >
                          {/* Sol - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.sunOpacity,
                width: responsiveDimensions.radius * 0.6, // Större för att fylla mer av mitten
                height: responsiveDimensions.radius * 0.6,
              }}
                             onMouseEnter={() => {
                 // console.log(`🎨 SOL RENDER: opacity=${sunMoonState.sunOpacity}, displayHour=${displayHour}`)
               }}
            >
              <Image
                src="/images/sun.png"
                alt="Sol"
                width={48}
                height={48}
                priority={true}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            
            {/* Måne - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.moonOpacity,
                width: responsiveDimensions.radius * 0.55, // Lite mindre än solen
                height: responsiveDimensions.radius * 0.55,
              }}
                             onMouseEnter={() => {
                 // console.log(`🎨 MÅNE RENDER: opacity=${sunMoonState.moonOpacity}, displayHour=${displayHour}`)
               }}
            >
                <Image
                  src="/images/moon.png"
                  alt="Måne"
                  width={44}
                  height={44}
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              </div>
            </div>
          </div>

          <div className="text-center text-white space-y-0.5">
            <p className="text-lg font-semibold">{dateInfo.weekday}</p>
            <p className="text-sm text-white/70">{dateInfo.fullDate}</p>
            <p className="text-base font-bold">{dateInfo.time}</p>
            <p className="text-xs text-white/50 leading-tight mt-1">
              Prognos:<br />{dateInfo.offsetString}
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-3">
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => setSelectedHour(clampedHour - 24)} 
                disabled={clampedHour === minHour} 
                className="px-3 py-1 rounded-md bg-amber-900/80 hover:bg-amber-800/80 text-sm text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-amber-700/80 border border-amber-600/30"
              >
                « -1 dag
              </button>
              <button 
                onClick={() => setSelectedHour(clampedHour + 24)} 
                disabled={clampedHour === maxHour} 
                className="px-3 py-1 rounded-md bg-amber-900/80 hover:bg-amber-800/80 text-sm text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-amber-700/80 border border-amber-600/30"
              >
                +1 dag »
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => setSelectedHour(clampedHour - 1)} 
                disabled={clampedHour === minHour} 
                className="px-3 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700/90 text-sm text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-600/90 border border-white/10"
              >
                − 1 tim
              </button>
              <button 
                onClick={() => setSelectedHour(clampedHour + 1)} 
                disabled={clampedHour === maxHour} 
                className="px-3 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700/90 text-sm text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-600/90 border border-white/10"
              >
                +1 tim
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Kompakt tablet layout
  if (layoutType === 'tablet') {
    return (
      <div className="flex items-center justify-center space-x-3">
        <div className="flex-shrink-0 relative">
          <CircularInput
            value={value}
            onChange={handleCircularInputChange}
            radius={50}
          >
            <CircularTrack stroke="#ffffff10" strokeWidth={5} />
            <CircularProgress stroke={progressColor} strokeWidth={5} />
            <CircularThumb r={4} fill={progressColor} />
          </CircularInput>
          
          {/* Sol/Måne animationer för tablet */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              width: 100,
              height: 100,
            }}
          >
            {/* Sol - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.sunOpacity,
                width: 30,
                height: 30,
              }}
            >
              <Image
                src="/images/sun.png"
                alt="Sol"
                width={30}
                height={30}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            
            {/* Måne - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.moonOpacity,
                width: 28,
                height: 28,
              }}
            >
              <Image
                src="/images/moon.png"
                alt="Måne"
                width={28}
                height={28}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
          </div>
        </div>
        <div className="text-center text-white">
          <p className="text-sm font-semibold">{dateInfo.weekday}</p>
          <p className="text-xs text-white/70">{dateInfo.fullDate}</p>
          <p className="text-sm font-bold">{dateInfo.time}</p>
          <p className="text-xs text-white/50">
            {dateInfo.offsetString}
          </p>
        </div>
      </div>
    );
  }

  // Mobil layout - nu med ClockKnob istället för bara text
  if (isMobile) {
    // Show loading state while bounds are being calculated
    if (isLoadingBounds) {
      return (
        <div className="flex flex-col items-center space-y-2">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-xs text-white/70 text-center">Laddar...</p>
        </div>
      );
    }

    // Responsiv sizing baserat på skärmstorlek - använd layoutType istället för window.innerWidth
    const isLargerMobile = layoutType === 'mobilePortrait' && window.innerWidth >= 390; // iPhone 14 Pro och större
    const isLandscape = layoutType === 'mobileLandscape';
    
    const knobSize = isLandscape 
      ? (isLargerMobile ? 80 : 70)    // Landscape: 80px på större skärmar, 70px på mindre
      : (isLargerMobile ? 100 : 85);  // Portrait: 100px på större skärmar, 85px på mindre
    
    const responsiveDimensions = {
      radius: knobSize / 2,
      strokeWidth: isLargerMobile ? 6 : 5,
      thumbRadius: isLargerMobile ? 5 : 4,
    };

    const buttonSize = isLargerMobile 
      ? { width: 'w-12', height: 'h-9', text: 'text-sm' }
      : { width: 'w-10', height: 'h-8', text: 'text-xs' };

    return (
      <div className="flex items-center justify-between w-full h-full px-4 py-2">
        <svg width="0" height="0">
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        {/* ClockKnob till vänster - responsiv storlek */}
        <div className="flex-shrink-0 relative">
          <CircularInput
            value={value}
            onChange={handleCircularInputChange}
            radius={responsiveDimensions.radius}
          >
            <CircularTrack stroke="#ffffff10" strokeWidth={responsiveDimensions.strokeWidth} />
            <CircularProgress stroke={progressColor} strokeWidth={responsiveDimensions.strokeWidth} filter={`url(#${glowId})`} />
            <CircularThumb r={responsiveDimensions.thumbRadius} fill={progressColor} />
          </CircularInput>
          
          {/* Sol/Måne animationer för mobil */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              width: responsiveDimensions.radius * 2,
              height: responsiveDimensions.radius * 2,
            }}
          >
            {/* Sol - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.sunOpacity,
                width: responsiveDimensions.radius * 0.7, // Större för bättre synlighet på mobil
                height: responsiveDimensions.radius * 0.7,
              }}
            >
              <Image
                src="/images/sun.png"
                alt="Sol"
                width={32}
                height={32}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            
            {/* Måne - centrerad i mitten */}
            <div
              className="absolute transition-opacity duration-1000 ease-in-out"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: sunMoonState.moonOpacity,
                width: responsiveDimensions.radius * 0.65, // Lite mindre än solen men större än tidigare
                height: responsiveDimensions.radius * 0.65,
              }}
            >
              <Image
                src="/images/moon.png"
                alt="Måne"
                width={30}
                height={30}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* Text i mitten - responsiv storlek */}
        <div className="flex-1 text-center text-white px-4">
          <div className={`text-white/60 mb-1 ${isLargerMobile ? 'text-sm' : 'text-xs'}`}>PROGNOSTID</div>
          <div className={`font-semibold ${isLargerMobile ? 'text-base' : 'text-sm'}`}>{dateInfo.weekday}, {dateInfo.time}</div>
          <div className={`text-white/70 ${isLargerMobile ? 'text-sm' : 'text-xs'}`}>{dateInfo.fullDate}</div>
          <div className={`text-white/50 mt-1 ${isLargerMobile ? 'text-sm' : 'text-xs'}`}>{dateInfo.offsetString}</div>
        </div>

        {/* Knappar till höger - responsiv storlek */}
        <div className={`flex-shrink-0 flex flex-col ${isLargerMobile ? 'gap-1.5' : 'gap-1'}`}>
          <div className={`flex ${isLargerMobile ? 'gap-1.5' : 'gap-1'}`}>
            <button 
              onClick={() => setSelectedHour(clampedHour - 1)} 
              disabled={clampedHour === minHour} 
              className={`${buttonSize.width} ${buttonSize.height} rounded-md bg-slate-800/90 hover:bg-slate-700/90 ${buttonSize.text} text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-600/90 border border-white/10`}
            >
              -1h
            </button>
            <button 
              onClick={() => setSelectedHour(clampedHour + 1)} 
              disabled={clampedHour === maxHour} 
              className={`${buttonSize.width} ${buttonSize.height} rounded-md bg-slate-800/90 hover:bg-slate-700/90 ${buttonSize.text} text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-600/90 border border-white/10`}
            >
              +1h
            </button>
          </div>
          <div className={`flex ${isLargerMobile ? 'gap-1.5' : 'gap-1'}`}>
            <button 
              onClick={() => setSelectedHour(clampedHour - 24)} 
              disabled={clampedHour === minHour} 
              className={`${buttonSize.width} ${buttonSize.height} rounded-md bg-amber-900/80 hover:bg-amber-800/80 ${buttonSize.text} text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-amber-700/80 border border-amber-600/30`}
            >
              -1d
            </button>
            <button 
              onClick={() => setSelectedHour(clampedHour + 24)} 
              disabled={clampedHour === maxHour} 
              className={`${buttonSize.width} ${buttonSize.height} rounded-md bg-amber-900/80 hover:bg-amber-800/80 ${buttonSize.text} text-white font-medium shadow-sm backdrop-blur-md transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed active:bg-amber-700/80 border border-amber-600/30`}
            >
              +1d
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback - should not reach here
  return null;
});

ClockKnob.displayName = 'ClockKnob';

export default ClockKnob;
