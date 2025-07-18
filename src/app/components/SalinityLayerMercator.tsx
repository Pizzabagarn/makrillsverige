'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import CanvasSource from './CanvasSource';

interface SalinityLayerMercatorProps {
  visible?: boolean;
  opacity?: number;
}

const SalinityLayerMercator = React.memo<SalinityLayerMercatorProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  return (
    <CanvasSource
      id="salinity-mercator"
      layerId="salinity-mercator-layer"
      visible={visible}
      opacity={opacity}
      metadataUrl="/data/salinity-images-mercator/metadata.json"
      imageUrlPattern="/data/salinity-images-mercator/{filename}"
      canvasSize={{ width: 1200, height: 800 }}
    />
  );
});

SalinityLayerMercator.displayName = 'SalinityLayerMercator';

export default SalinityLayerMercator; 