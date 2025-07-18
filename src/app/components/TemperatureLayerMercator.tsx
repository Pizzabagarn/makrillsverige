'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import CanvasSource from './CanvasSource';

interface TemperatureLayerMercatorProps {
  visible?: boolean;
  opacity?: number;
}

const TemperatureLayerMercator = React.memo<TemperatureLayerMercatorProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  return (
    <CanvasSource
      id="temperature-mercator"
      layerId="temperature-mercator-layer"
      visible={visible}
      opacity={opacity}
      metadataUrl="/data/temperature-images-mercator/metadata.json"
      imageUrlPattern="/data/temperature-images-mercator/{filename}"
      canvasSize={{ width: 1200, height: 800 }}
    />
  );
});

TemperatureLayerMercator.displayName = 'TemperatureLayerMercator';

export default TemperatureLayerMercator; 