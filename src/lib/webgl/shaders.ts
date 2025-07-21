/**
 * GLSL Shaders för marina data-rendering
 * Optimerade för MapLibre CustomLayerInterface
 */

/**
 * Vertex shader - Standard fullscreen quad
 */
export const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    // Konvertera från [-1,1] till [0,1] för UV-koordinater
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/**
 * Fragment shader för marina parametrar med temporal interpolation
 */
export const MARINE_FRAGMENT_SHADER = `
  precision highp float;

  // Input texturer
  uniform sampler2D u_dataFrame0;     // Aktuell frame
  uniform sampler2D u_dataFrame1;     // Nästa frame
  uniform sampler2D u_colormap;       // 1D färgskala (RGBA)
  
  // Temporal interpolation
  uniform float u_timeFraction;       // 0.0 - 1.0 mellan frames
  
  // Data-normalisering
  uniform vec2 u_dataRange;           // [min_value, max_value]
  uniform float u_opacity;            // Layer opacity
  
  // Vattenmask (optional)
  uniform float u_hasWaterMask;       // 1.0 om vattenmask ska användas
  
  varying vec2 v_uv;

  /**
   * Normalisera datavärde till [0,1] för colormap lookup
   * OBS: Med UNSIGNED_BYTE texturer är värdet redan normaliserat [0,1]
   */
  float normalizeValue(float value) {
    // Värdet från UNSIGNED_BYTE texture är redan normaliserat
    return clamp(value, 0.0, 1.0);
  }

  /**
   * Sample från colormap med linjär interpolation
   */
  vec4 sampleColormap(float normalizedValue) {
    // Clampa till säker range för texture sampling
    float u = clamp(normalizedValue, 0.001, 0.999);
    return texture2D(u_colormap, vec2(u, 0.5));
  }

  /**
   * Kontrollera om punkt är i vatten (baserat på NaN-värden)
   */
  bool isInWater(float value0, float value1) {
    // NaN-värden indikerar landområden i vår data
    return (value0 == value0) && (value1 == value1); // !isNaN check
  }

  void main() {
    // Sample data från båda frames
    float value0 = texture2D(u_dataFrame0, v_uv).r;
    float value1 = texture2D(u_dataFrame1, v_uv).r;
    
    // Kontrollera om vi är i vatten
    if (!isInWater(value0, value1)) {
      // Transparent för landområden
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    // Temporal interpolation mellan frames
    float interpolatedValue = mix(value0, value1, u_timeFraction);
    
    // Normalisera för colormap lookup
    float normalizedValue = normalizeValue(interpolatedValue);
    
    // Sample färg från colormap
    vec4 color = sampleColormap(normalizedValue);
    
    // Applicera opacity
    color.a *= u_opacity;
    
    gl_FragColor = color;
  }
`;

/**
 * Debug shader - visar UV-koordinater som färger
 */
export const DEBUG_FRAGMENT_SHADER = `
  precision mediump float;
  
  uniform float u_opacity;
  varying vec2 v_uv;

  void main() {
    // UV-koordinater som RGB-färger för debugging
    vec3 debugColor = vec3(v_uv.x, v_uv.y, 0.5);
    gl_FragColor = vec4(debugColor, u_opacity);
  }
`;

/**
 * Shader med effekter (glow, konturer)
 */
export const ENHANCED_FRAGMENT_SHADER = `
  precision highp float;

  // Input texturer
  uniform sampler2D u_dataFrame0;
  uniform sampler2D u_dataFrame1; 
  uniform sampler2D u_colormap;
  
  // Temporal interpolation
  uniform float u_timeFraction;
  
  // Data-normalisering
  uniform vec2 u_dataRange;
  uniform float u_opacity;
  
  // Effekt-parametrar
  uniform float u_glowThreshold;      // Tröskelvärde för glow-effekt (0.0-1.0)
  uniform float u_glowIntensity;      // Styrka på glow (1.0-3.0)
  uniform float u_contourLevel;       // Konturlinje-värde (normaliserat 0.0-1.0)
  uniform float u_contourWidth;       // Bredd på konturlinje i pixlar
  
  varying vec2 v_uv;
  
  float normalizeValue(float value) {
    // Värdet från UNSIGNED_BYTE texture är redan normaliserat [0,1]
    return clamp(value, 0.0, 1.0);
  }
  
  vec4 sampleColormap(float normalizedValue) {
    float u = clamp(normalizedValue, 0.001, 0.999);
    return texture2D(u_colormap, vec2(u, 0.5));
  }
  
  bool isInWater(float value0, float value1) {
    return (value0 == value0) && (value1 == value1);
  }
  
  /**
   * Beräkna glow-effekt för höga värden
   */
  float calculateGlow(float normalizedValue) {
    if (normalizedValue < u_glowThreshold) {
      return 1.0;
    }
    
    float glowFactor = (normalizedValue - u_glowThreshold) / (1.0 - u_glowThreshold);
    return 1.0 + glowFactor * (u_glowIntensity - 1.0);
  }
  
  /**
   * Kontrollera om vi är nära en konturlinje
   */
  bool nearContour(float normalizedValue, float threshold, float width) {
    return abs(normalizedValue - threshold) < width;
  }

  void main() {
    float value0 = texture2D(u_dataFrame0, v_uv).r;
    float value1 = texture2D(u_dataFrame1, v_uv).r;
    
    if (!isInWater(value0, value1)) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    float interpolatedValue = mix(value0, value1, u_timeFraction);
    float normalizedValue = normalizeValue(interpolatedValue);
    
    vec4 color = sampleColormap(normalizedValue);
    
    // Glow-effekt för höga värden
    float glowMultiplier = calculateGlow(normalizedValue);
    color.rgb *= glowMultiplier;
    
    // Konturlinje
    if (u_contourLevel > 0.0 && nearContour(normalizedValue, u_contourLevel, u_contourWidth)) {
      // Vit konturlinje
      color.rgb = mix(color.rgb, vec3(1.0), 0.8);
    }
    
    color.a *= u_opacity;
    gl_FragColor = color;
  }
`;

/**
 * Shader configuration för olika parametrar
 */
export interface ShaderConfig {
  fragmentShader: string;
  uniforms: {
    dataRange: [number, number];
    glowThreshold?: number;
    glowIntensity?: number;
    contourLevel?: number;
    contourWidth?: number;
  };
}

export const SHADER_CONFIGS: Record<string, ShaderConfig> = {
  current: {
    fragmentShader: MARINE_FRAGMENT_SHADER,
    uniforms: {
      dataRange: [0.0, 1.3], // m/s
    }
  },
  
  current_enhanced: {
    fragmentShader: ENHANCED_FRAGMENT_SHADER,
    uniforms: {
      dataRange: [0.0, 1.3],
      glowThreshold: 0.7,     // Glow för strömmar >0.9 m/s
      glowIntensity: 2.0,
      contourLevel: 0.6,      // Konturlinje vid 0.8 m/s
      contourWidth: 0.02,
    }
  },
  
  temperature: {
    fragmentShader: MARINE_FRAGMENT_SHADER,
    uniforms: {
      dataRange: [-2.0, 25.0], // °C
    }
  },
  
  salinity: {
    fragmentShader: MARINE_FRAGMENT_SHADER,
    uniforms: {
      dataRange: [0.0, 35.0], // g/kg
    }
  },
  
  debug: {
    fragmentShader: DEBUG_FRAGMENT_SHADER,
    uniforms: {
      dataRange: [0.0, 1.0],
    }
  }
}; 