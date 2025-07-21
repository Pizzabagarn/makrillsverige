'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';

interface CurrentMagnitudeShaderLayerProps {
  visible?: boolean;
  opacity?: number;
}

// Förenklad fragment shader för debugging
const CURRENT_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_dataTexture;
uniform vec2 u_resolution;
uniform float u_opacity;

// Förenklad färgskala för test
vec3 simpleColormap(float value) {
    value = clamp(value, 0.0, 1.0);
    
    if (value < 0.2) {
        return mix(vec3(0.0, 0.0, 0.4), vec3(0.0, 0.2, 0.8), value * 5.0);
    } else if (value < 0.4) {
        return mix(vec3(0.0, 0.2, 0.8), vec3(0.0, 0.8, 0.8), (value - 0.2) * 5.0);
    } else if (value < 0.6) {
        return mix(vec3(0.0, 0.8, 0.8), vec3(0.0, 1.0, 0.4), (value - 0.4) * 5.0);
    } else if (value < 0.8) {
        return mix(vec3(0.0, 1.0, 0.4), vec3(1.0, 1.0, 0.0), (value - 0.6) * 5.0);
    } else {
        return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (value - 0.8) * 5.0);
    }
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Sample data från vår data-textur
    vec4 currentData = texture2D(u_dataTexture, uv);
    float u_component = currentData.r;
    float v_component = currentData.g;
    
    // Beräkna strömstyrka: magnitude = sqrt(u² + v²)  
    float magnitude = sqrt(u_component * u_component + v_component * v_component);
    
    // Normalisera till [0,1] för visualisering (anta max 1.5 m/s)
    magnitude = magnitude / 1.5;
    
    // Konvertera till färg
    vec3 color = simpleColormap(magnitude);
    
    // För debugging: visa en gradient om ingen data finns
    if (magnitude < 0.001) {
        color = vec3(uv.x, uv.y, 0.5); // Gradient för att se att shader fungerar
    }
    
    gl_FragColor = vec4(color, u_opacity);
}
`;

// Vertex shader (standard)
const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const CurrentMagnitudeShaderLayer = React.memo<CurrentMagnitudeShaderLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  const { data: areaData, isLoading: areaDataLoading } = useAreaParameters();
  
  // Performance throttling - samma som bildlager
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  // WebGL referenser
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const dataTextureRef = useRef<WebGLTexture | null>(null);
  const [canvasSource, setCanvasSource] = useState<any>(null);
  
  // Färgskala från din befintliga implementation
  const colorRamp = useMemo(() => [
    [0.000, "#000066"], [0.068, "#0033CC"], [0.137, "#0066CC"], [0.205, "#00CCFF"],
    [0.274, "#00FFCC"], [0.342, "#00FF66"], [0.411, "#33FF33"], [0.479, "#66FF00"],
    [0.547, "#99FF00"], [0.616, "#CCFF00"], [0.684, "#FFFF00"], [0.753, "#FFCC00"],
    [0.821, "#FF9900"], [0.889, "#FF6600"], [0.958, "#FF3300"], [1.026, "#CC0000"],
    [1.095, "#990000"], [1.163, "#660000"], [1.232, "#330000"], [1.300, "#220000"]
  ] as [number, string][], []);
  
  // Konvertera hex färger till RGB
  const colorArrays = useMemo(() => {
    const values: number[] = [];
    const colors: number[] = [];
    
    for (const [value, hex] of colorRamp) {
      values.push(value as number);
      
      // Konvertera hex till RGB [0,1]
      const hexStr = hex as string;
      const r = parseInt(hexStr.slice(1, 3), 16) / 255;
      const g = parseInt(hexStr.slice(3, 5), 16) / 255;  
      const b = parseInt(hexStr.slice(5, 7), 16) / 255;
      colors.push(r, g, b);
    }
    
    return { values, colors };
  }, [colorRamp]);
  
  // Aktuell tidsstämpel
  const currentTimestamp = useMemo(() => {
    if (!baseTime) return null;
    return new Date(baseTime + effectiveSelectedHour * 3600_000).toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);
  
  // Skapa WebGL-kontext och shader-program
  const initWebGL = useCallback(() => {
    if (!canvasRef.current) return false;
    
    console.log('🚀 Initierar WebGL context...');
    
    const gl = canvasRef.current.getContext('webgl', {
      premultipliedAlpha: false,
      alpha: true
    });
    
    if (!gl) {
      console.error('❌ WebGL inte stödd på denna enhet');
      return false;
    }
    
    console.log('✅ WebGL context skapad');
    glRef.current = gl;
    
    // Kompilera shaders
    console.log('🔧 Compiling vertex shader...');
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    
    console.log('🔧 Compiling fragment shader...');
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, CURRENT_FRAGMENT_SHADER);
    
    if (!vertexShader || !fragmentShader) {
      console.error('❌ Shader compilation failed');
      return false;
    }
    
    // Skapa program
    console.log('🔗 Linking shader program...');
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      console.error('❌ Shader program linking failed');
      return false;
    }
    
    console.log('✅ Shader program created successfully');
    programRef.current = program;
    
    // Setup geometri (fullscreen quad)
    const positions = [-1, -1, 1, -1, -1, 1, 1, 1];
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    return true;
  }, []);
  
  // Utility funktioner för WebGL
  const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  };
  
  const createProgram = (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
    const program = gl.createProgram();
    if (!program) return null;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    
    return program;
  };
  
  // Konvertera area-parameters data till WebGL-textur
  const createDataTexture = useCallback((timestamp: string) => {
    if (!areaData || !glRef.current || !timestamp) {
      console.warn('⚠️ Missing data for texture creation:', { areaData: !!areaData, gl: !!glRef.current, timestamp });
      return;
    }
    
    const gl = glRef.current;
    
    console.log('🗜️ Creating data texture for timestamp:', timestamp);
    console.log('📊 Area data points:', areaData.points.length);
    
    // Hitta data för aktuell tidsstämpel
    const timestampPrefix = timestamp.substring(0, 13);
    
    // För denna prototyp, använd en förenklad grid-approach
    // I framtiden kan vi implementera mer avancerad interpolation
    const gridSize = 256; // Start med mindre grid för prototyp
    const textureData = new Float32Array(gridSize * gridSize * 4); // RGBA
    
    // Bbox för svenska vatten
    const [lon_min, lon_max, lat_min, lat_max] = [10.3, 16.6, 54.9, 59.6];
    
    let dataIndex = 0;
    
    // Skapa grid och interpolera från area-parameters
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const lon = lon_min + (x / gridSize) * (lon_max - lon_min);
        const lat = lat_min + (y / gridSize) * (lat_max - lat_min);
        
        // Hitta närmaste datapunkt (enkel nearest neighbor för prototyp)
        let nearestPoint = null;
        let minDistance = Infinity;
        
        for (const point of areaData.points) {
          const distance = Math.sqrt(
            Math.pow(lat - point.lat, 2) + Math.pow(lon - point.lon, 2)
          );
          
          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = point;
          }
        }
        
        let u = 0, v = 0;
        
        if (nearestPoint && minDistance < 0.1) { // Max 0.1 grad avstånd
          const dataEntry = nearestPoint.data.find(d => d.time.startsWith(timestampPrefix));
          if (dataEntry?.current) {
            u = dataEntry.current.u || 0;
            v = dataEntry.current.v || 0;
          }
        }
        
        // Lagra u i röd kanal, v i grön kanal
        textureData[dataIndex++] = u;     // R
        textureData[dataIndex++] = v;     // G  
        textureData[dataIndex++] = 0;     // B (oanvänd)
        textureData[dataIndex++] = 1;     // A
      }
    }
    
    // Räkna hur många datapunkter vi hittade
    let validDataPoints = 0;
    for (let i = 0; i < textureData.length; i += 4) {
      if (textureData[i] !== 0 || textureData[i + 1] !== 0) {
        validDataPoints++;
      }
    }
    
    console.log('📈 Valid data points found:', validDataPoints, 'av', gridSize * gridSize);
    
    // Om vi inte har data, skapa en test-textur istället
    if (validDataPoints === 0) {
      console.warn('⚠️ Ingen data hittad, skapar test-textur...');
      for (let i = 0; i < textureData.length; i += 4) {
        const x = (i / 4) % gridSize;
        const y = Math.floor((i / 4) / gridSize);
        textureData[i] = x / gridSize;     // R = normalized X
        textureData[i + 1] = y / gridSize; // G = normalized Y  
        textureData[i + 2] = 0.0;         // B
        textureData[i + 3] = 1.0;         // A
      }
    }
    
    // Kontrollera WebGL extensions för Float textures
    const floatTextureExt = gl.getExtension('OES_texture_float');
    if (!floatTextureExt) {
      console.error('❌ Float textures inte stödda på denna enhet');
      return;
    }
    
    // Skapa eller uppdatera textur
    if (!dataTextureRef.current) {
      dataTextureRef.current = gl.createTexture();
      console.log('🆕 Skapade ny WebGL texture');
    }
    
    gl.bindTexture(gl.TEXTURE_2D, dataTextureRef.current);
    
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridSize, gridSize, 0, gl.RGBA, gl.FLOAT, textureData);
      console.log('✅ Texture data uploaded successfully');
    } catch (error) {
      console.error('❌ Failed to upload texture data:', error);
      return;
    }
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('❌ WebGL texture error:', error);
    } else {
      console.log('🎯 Data texture created successfully for', timestampPrefix);
    }
    
  }, [areaData]);
  
  // Rendera shader  
  const render = useCallback(() => {
    if (!glRef.current || !programRef.current || !dataTextureRef.current) {
      console.warn('⚠️ WebGL components not ready for rendering');
      return;
    }
    
    const gl = glRef.current;
    const program = programRef.current;
    
    console.log('🎨 Rendering shader...');
    
    gl.useProgram(program);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    // Clear canvas
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Bind data texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dataTextureRef.current);
    
    // Set uniforms
    const dataTextureLocation = gl.getUniformLocation(program, 'u_dataTexture');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution'); 
    const opacityLocation = gl.getUniformLocation(program, 'u_opacity');
    
    if (dataTextureLocation !== null) gl.uniform1i(dataTextureLocation, 0);
    if (resolutionLocation !== null) gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
    if (opacityLocation !== null) gl.uniform1f(opacityLocation, opacity);
    
    // Rendera
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('❌ WebGL render error:', error);
    } else {
      console.log('✅ Shader rendered successfully');
    }
    
  }, [opacity]);
  
  // Initiera WebGL vid mount
  useEffect(() => {
    if (!visible) return;
    
    console.log('🚀 Initializing shader layer...');
    
    // Skapa canvas element
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    canvasRef.current = canvas;
    
    console.log('📐 Canvas created:', canvas.width, 'x', canvas.height);
    
    if (initWebGL()) {
      console.log('🗺️ Setting up MapLibre canvas source...');
      // Setup canvas source för MapLibre
      const sourceConfig = {
        type: 'canvas' as const,
        canvas: canvas,
        coordinates: [
          [10.3, 59.6], // top-left
          [16.6, 59.6], // top-right
          [16.6, 54.9], // bottom-right
          [10.3, 54.9]  // bottom-left
        ] as [[number, number], [number, number], [number, number], [number, number]],
        animate: true
      };
      
      setCanvasSource(sourceConfig);
      console.log('✅ Shader layer initialized successfully');
    } else {
      console.error('❌ Failed to initialize WebGL');
    }
  }, [visible, initWebGL]);
  
  // Uppdatera data när tid ändras
  useEffect(() => {
    if (!currentTimestamp || !areaData || areaDataLoading) return;
    
    createDataTexture(currentTimestamp);
    render();
  }, [currentTimestamp, areaData, areaDataLoading, createDataTexture, render]);
  
  // Layer configuration
  const rasterLayer = useMemo(() => {
    if (!visible || !canvasSource) return null;
    
    return {
      id: 'current-magnitude-shader',
      type: 'raster' as const,
      paint: {
        'raster-opacity': 1.0, // Opacity hanteras i shader
        'raster-fade-duration': 0
      }
    };
  }, [visible, canvasSource]);
  
  if (!visible || !canvasSource || !rasterLayer) {
    return null;
  }
  
  return (
    <>
      <canvas 
        ref={canvasRef}
        style={{ display: 'none' }} // Dölj canvas - den visas via MapLibre
      />
      <Source id="current-magnitude-shader-source" {...canvasSource}>
        <Layer {...rasterLayer} />
      </Source>
    </>
  );
});

CurrentMagnitudeShaderLayer.displayName = 'CurrentMagnitudeShaderLayer';

export default CurrentMagnitudeShaderLayer; 