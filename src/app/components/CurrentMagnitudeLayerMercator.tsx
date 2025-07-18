'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import CanvasSource from './CanvasSource';

interface CurrentMagnitudeLayerMercatorProps {
  visible?: boolean;
  opacity?: number;
}

const CurrentMagnitudeLayerMercator = React.memo<CurrentMagnitudeLayerMercatorProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  return (
    <CanvasSource
      id="current-magnitude-mercator"
      layerId="current-magnitude-mercator-layer"
      visible={visible}
      opacity={opacity}
      metadataUrl="/data/current-images-mercator/metadata.json"
      imageUrlPattern="/data/current-images-mercator/{filename}"
      canvasSize={{ width: 1200, height: 800 }}
    />
  );
});

CurrentMagnitudeLayerMercator.displayName = 'CurrentMagnitudeLayerMercator';

export default CurrentMagnitudeLayerMercator; 