/**
 * WebGL Shader Utilities
 * Utilities för att arbeta med WebGL shaders i MapLibre Custom Layers
 */

export interface ShaderMetadata {
  parameter: string;
  grid_size: number;
  timestamps: string[];
  bbox: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max]
  shape: [number, number, number]; // [timesteps, height, width]
  data_range: [number, number];
  exported_at: string;
  file_size_mb: number;
}

export interface ShaderDataSet {
  metadata: ShaderMetadata;
  data: Float32Array;
  colormap: Float32Array;
  currentFrameIndex: number;
  nextFrameIndex: number;
  timeFraction: number;
}

/**
 * Skapa och kompilera en WebGL shader
 */
export function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

/**
 * Skapa och länka ett WebGL shader-program
 */
export function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

/**
 * Skapa en fullscreen quad för shader-rendering
 */
export function createFullscreenQuad(gl: WebGLRenderingContext): WebGLBuffer | null {
  const buffer = gl.createBuffer();
  if (!buffer) return null;

  const positions = new Float32Array([
    -1.0, -1.0,
     1.0, -1.0,
    -1.0,  1.0,
     1.0,  1.0
  ]);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  return buffer;
}

/**
 * Ladda shader-data från .bin-filer
 */
export async function loadShaderData(
  parameter: string,
  basePath = '/data/shader-data'
): Promise<ShaderDataSet> {
  console.log(`🔄 Loading shader data for ${parameter}...`);

  try {
    // Ladda metadata
    const metadataResponse = await fetch(`${basePath}/${parameter}_metadata.json`);
    if (!metadataResponse.ok) {
      throw new Error(`Failed to load metadata: ${metadataResponse.status}`);
    }
    const metadata: ShaderMetadata = await metadataResponse.json();

    // Ladda grid-data
    const dataResponse = await fetch(`${basePath}/${parameter}_data.bin`);
    if (!dataResponse.ok) {
      throw new Error(`Failed to load data: ${dataResponse.status}`);
    }
    const dataBuffer = await dataResponse.arrayBuffer();
    const data = new Float32Array(dataBuffer);

    // Ladda colormap
    const colormapResponse = await fetch(`${basePath}/${parameter}_colormap.bin`);
    if (!colormapResponse.ok) {
      throw new Error(`Failed to load colormap: ${colormapResponse.status}`);
    }
    const colormapBuffer = await colormapResponse.arrayBuffer();
    const colormap = new Float32Array(colormapBuffer);

    console.log(`✅ Loaded shader data:`, {
      parameter: metadata.parameter,
      gridSize: metadata.grid_size,
      timesteps: metadata.shape[0],
      dataRange: metadata.data_range,
      fileSize: `${metadata.file_size_mb.toFixed(1)}MB`
    });

    return {
      metadata,
      data,
      colormap,
      currentFrameIndex: 0,
      nextFrameIndex: 1,
      timeFraction: 0.0
    };

  } catch (error) {
    console.error('❌ Failed to load shader data:', error);
    throw error;
  }
}

/**
 * Skapa WebGL textur från Float32Array data
 */
export function createDataTexture(
  gl: WebGLRenderingContext,
  data: Float32Array,
  width: number,
  height: number
): WebGLTexture | null {
  console.log(`🔧 Creating data texture ${width}x${height}, data length: ${data.length}`);
  
  const texture = gl.createTexture();
  if (!texture) {
    console.error('❌ Failed to create WebGL texture');
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  checkWebGLError(gl, 'bind texture');

  // Kontrollera WebGL extensions
  const floatExt = gl.getExtension('OES_texture_float');
  const floatLinearExt = gl.getExtension('OES_texture_float_linear');
  
  console.log(`🔍 WebGL extensions:`, {
    'OES_texture_float': !!floatExt,
    'OES_texture_float_linear': !!floatLinearExt,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
  });

  // Använd alltid UNSIGNED_BYTE för kompatibilitet först
  console.log('📊 Converting to UNSIGNED_BYTE format...');
  
  // Konvertera till 0-255 range för UNSIGNED_BYTE
  const normalizedData = new Uint8Array(data.length);
  const [minVal, maxVal] = findDataRange(data);
  const range = maxVal - minVal || 1;
  
  console.log(`📈 Data range: ${minVal.toFixed(3)} - ${maxVal.toFixed(3)}`);
  
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - minVal) / range;
    normalizedData[i] = Math.round(normalized * 255);
  }
  
  // Skapa texture med UNSIGNED_BYTE
  gl.texImage2D(
    gl.TEXTURE_2D, 
    0,                    // level
    gl.LUMINANCE,         // internal format
    width, 
    height, 
    0,                    // border
    gl.LUMINANCE,         // format
    gl.UNSIGNED_BYTE,     // type
    normalizedData
  );
  
  checkWebGLError(gl, 'texImage2D');

  // Sätt texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  checkWebGLError(gl, 'texParameteri MIN_FILTER');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  checkWebGLError(gl, 'texParameteri MAG_FILTER');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  checkWebGLError(gl, 'texParameteri WRAP_S');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  checkWebGLError(gl, 'texParameteri WRAP_T');

  console.log('✅ Data texture created successfully');
  return texture;
}

/**
 * Skapa 1D colormap textur
 */
export function createColormapTexture(
  gl: WebGLRenderingContext,
  colormap: Float32Array
): WebGLTexture | null {
  const colormapLength = colormap.length / 4; // RGBA
  console.log(`🎨 Creating colormap texture ${colormapLength}x1, data length: ${colormap.length}`);
  
  const texture = gl.createTexture();
  if (!texture) {
    console.error('❌ Failed to create colormap texture');
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  checkWebGLError(gl, 'bind colormap texture');

  // Konvertera colormap från Float32 till Uint8 för kompatibilitet
  const uint8Colormap = new Uint8Array(colormap.length);
  for (let i = 0; i < colormap.length; i++) {
    // Clampa värden till [0,1] och konvertera till 0-255
    const clamped = Math.max(0, Math.min(1, colormap[i]));
    uint8Colormap[i] = Math.round(clamped * 255);
  }

  gl.texImage2D(
    gl.TEXTURE_2D, 
    0,               // level
    gl.RGBA,         // internal format
    colormapLength,  // width
    1,               // height
    0,               // border
    gl.RGBA,         // format
    gl.UNSIGNED_BYTE, // type (ändrat från FLOAT)
    uint8Colormap
  );
  
  checkWebGLError(gl, 'colormap texImage2D');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  checkWebGLError(gl, 'colormap texParameteri MIN_FILTER');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  checkWebGLError(gl, 'colormap texParameteri MAG_FILTER');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  checkWebGLError(gl, 'colormap texParameteri WRAP_S');
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  checkWebGLError(gl, 'colormap texParameteri WRAP_T');

  console.log('✅ Colormap texture created successfully');
  return texture;
}

/**
 * Uppdatera temporal interpolation baserat på aktuell tid
 */
export function updateTemporalState(
  dataset: ShaderDataSet,
  currentTime: Date
): void {
  const { metadata } = dataset;
  const targetTimestamp = currentTime.toISOString().substring(0, 19) + '.000Z';
  
  // Hitta närmaste timestamps
  let currentIndex = 0;
  let nextIndex = 1;
  let timeFraction = 0.0;

  for (let i = 0; i < metadata.timestamps.length - 1; i++) {
    const t0 = new Date(metadata.timestamps[i]).getTime();
    const t1 = new Date(metadata.timestamps[i + 1]).getTime();
    const target = currentTime.getTime();

    if (target >= t0 && target <= t1) {
      currentIndex = i;
      nextIndex = i + 1;
      timeFraction = (target - t0) / (t1 - t0);
      break;
    }
  }

  // Clampa till tillgängliga data
  currentIndex = Math.max(0, Math.min(currentIndex, metadata.timestamps.length - 1));
  nextIndex = Math.max(1, Math.min(nextIndex, metadata.timestamps.length - 1));
  timeFraction = Math.max(0, Math.min(timeFraction, 1));

  dataset.currentFrameIndex = currentIndex;
  dataset.nextFrameIndex = nextIndex;
  dataset.timeFraction = timeFraction;
}

/**
 * Extrahera en frame från data-arrayen
 */
export function extractFrame(
  dataset: ShaderDataSet,
  frameIndex: number
): Float32Array {
  const { metadata, data } = dataset;
  const [timesteps, height, width] = metadata.shape;
  const frameSize = height * width;
  
  const startIdx = frameIndex * frameSize;
  const endIdx = startIdx + frameSize;
  
  return data.slice(startIdx, endIdx);
}

/**
 * Hitta min/max värden i data
 */
function findDataRange(data: Float32Array): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  
  for (let i = 0; i < data.length; i++) {
    if (isFinite(data[i])) {
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
    }
  }
  
  return [min === Infinity ? 0 : min, max === -Infinity ? 1 : max];
}

/**
 * WebGL error handling
 */
export function checkWebGLError(gl: WebGLRenderingContext, operation: string): boolean {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    console.error(`❌ WebGL error during ${operation}:`, error);
    return false;
  }
  return true;
} 