/**
 * MarineShaderLayer - MapLibre CustomLayerInterface för WebGL shader-rendering
 * Renderar marina data (strömstyrka, temperatur, salthalt) i realtid på GPU
 */

import { CustomLayerInterface, Map, CustomRenderMethodInput } from 'maplibre-gl';
import {
  loadShaderData,
  createDataTexture,
  createColormapTexture,
  updateTemporalState,
  extractFrame,
  createShader,
  createProgram,
  createFullscreenQuad,
  checkWebGLError,
  type ShaderDataSet
} from './shaderUtils';
import { 
  VERTEX_SHADER,
  SHADER_CONFIGS,
  type ShaderConfig 
} from './shaders';

export interface MarineShaderLayerProps {
  parameter: string;           // 'current', 'temperature', 'salinity'
  opacity?: number;           // 0.0 - 1.0
  enhanced?: boolean;         // Använd enhanced shader med effekter
  onDataLoaded?: () => void;  // Callback när data är laddad
  onError?: (error: Error) => void; // Error callback
}

export class MarineShaderLayer implements CustomLayerInterface {
  // MapLibre CustomLayerInterface properties
  id: string;
  type: 'custom' = 'custom';
  renderingMode: '2d' = '2d';

  // Layer properties
  private parameter: string;
  private opacity: number;
  private enhanced: boolean;
  private onDataLoaded?: () => void;
  private onError?: (error: Error) => void;

  // WebGL resources
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private colormapTexture: WebGLTexture | null = null;
  private dataTexture0: WebGLTexture | null = null;
  private dataTexture1: WebGLTexture | null = null;

  // Uniform locations
  private uniforms: {
    dataFrame0: WebGLUniformLocation | null;
    dataFrame1: WebGLUniformLocation | null;
    colormap: WebGLUniformLocation | null;
    timeFraction: WebGLUniformLocation | null;
    dataRange: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
    glowThreshold?: WebGLUniformLocation | null;
    glowIntensity?: WebGLUniformLocation | null;
    contourLevel?: WebGLUniformLocation | null;
    contourWidth?: WebGLUniformLocation | null;
  } = {
    dataFrame0: null,
    dataFrame1: null,
    colormap: null,
    timeFraction: null,
    dataRange: null,
    opacity: null,
  };

  // Attribute locations
  private attributes: {
    position: number;
  } = {
    position: -1,
  };

  // Data management
  private dataset: ShaderDataSet | null = null;
  private isInitialized = false;
  private isLoading = false;
  private currentTime = new Date();

  constructor(id: string, props: MarineShaderLayerProps) {
    this.id = id;
    this.parameter = props.parameter;
    this.opacity = props.opacity ?? 1.0;
    this.enhanced = props.enhanced ?? false;
    this.onDataLoaded = props.onDataLoaded;
    this.onError = props.onError;

    console.log(`🚀 Creating MarineShaderLayer: ${this.id} (${this.parameter})`);
  }

  /**
   * MapLibre lifecycle: Called when layer is added to map
   */
  async onAdd(map: Map, gl: WebGLRenderingContext): Promise<void> {
    console.log(`🔧 Initializing shader layer: ${this.id}`);

    try {
      // Ladda shader-data
      await this.loadData();

      // Skapa WebGL-resurser
      await this.initializeWebGL(gl);

      this.isInitialized = true;
      
      if (this.onDataLoaded) {
        this.onDataLoaded();
      }

      console.log(`✅ Shader layer initialized: ${this.id}`);

    } catch (error) {
      console.error(`❌ Failed to initialize shader layer ${this.id}:`, error);
      if (this.onError) {
        this.onError(error as Error);
      }
    }
  }

  /**
   * MapLibre lifecycle: Called for each frame render
   */
  render(gl: WebGLRenderingContext, options: CustomRenderMethodInput): void {
    if (!this.isInitialized || !this.dataset || !this.program) {
      return;
    }

    // Uppdatera temporal state baserat på aktuell tid
    updateTemporalState(this.dataset, this.currentTime);

    // Uppdatera texturer om frame-index har ändrats
    this.updateDataTextures(gl);

    // Rendera
    this.renderFrame(gl, options);
  }

  /**
   * MapLibre lifecycle: Called when layer is removed
   */
  onRemove(map: Map, gl: WebGLRenderingContext): void {
    console.log(`🗑️ Cleaning up shader layer: ${this.id}`);
    this.cleanup(gl);
  }

  /**
   * Public API: Uppdatera tid för temporal interpolation
   */
  setCurrentTime(time: Date): void {
    this.currentTime = time;
  }

  /**
   * Public API: Uppdatera opacity
   */
  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }

  /**
   * Ladda shader-data från .bin-filer
   */
  private async loadData(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    console.log(`📦 Loading data for parameter: ${this.parameter}`);

    try {
      this.dataset = await loadShaderData(this.parameter);
      console.log(`✅ Data loaded for ${this.parameter}:`, {
        timesteps: this.dataset.metadata.shape[0],
        gridSize: this.dataset.metadata.grid_size,
        dataRange: this.dataset.metadata.data_range
      });
    } catch (error) {
      console.error(`❌ Failed to load data for ${this.parameter}:`, error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Initiera WebGL-resurser
   */
  private async initializeWebGL(gl: WebGLRenderingContext): Promise<void> {
    if (!this.dataset) throw new Error('No dataset loaded');

    console.log(`🔧 Initializing WebGL resources...`);

    // Skapa shader program
    const config = this.getShaderConfig();
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, config.fragmentShader);

    if (!vertexShader || !fragmentShader) {
      throw new Error('Failed to compile shaders');
    }

    this.program = createProgram(gl, vertexShader, fragmentShader);
    if (!this.program) {
      throw new Error('Failed to create shader program');
    }

    // Hämta uniform och attribute locations
    this.getUniformLocations(gl);
    this.getAttributeLocations(gl);

    // Skapa vertex buffer för fullscreen quad
    this.vertexBuffer = createFullscreenQuad(gl);
    if (!this.vertexBuffer) {
      throw new Error('Failed to create vertex buffer');
    }

    // Kontrollera WebGL context status
    console.log(`🔍 WebGL context info:`, {
      version: gl.getParameter(gl.VERSION),
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
    });

    // Skapa colormap texture
    this.colormapTexture = createColormapTexture(gl, this.dataset.colormap);
    if (!this.colormapTexture) {
      throw new Error('Failed to create colormap texture');
    }

    // Skapa initiala data-texturer
    const { grid_size } = this.dataset.metadata;
    console.log(`📐 Creating textures for grid size: ${grid_size}x${grid_size}`);
    
    const frame0 = extractFrame(this.dataset, 0);
    const frame1 = extractFrame(this.dataset, 1);
    
    console.log(`🖼️ Frame data lengths: ${frame0.length}, ${frame1.length}`);

    this.dataTexture0 = createDataTexture(gl, frame0, grid_size, grid_size);
    if (!this.dataTexture0) {
      throw new Error('Failed to create data texture 0');
    }

    this.dataTexture1 = createDataTexture(gl, frame1, grid_size, grid_size);
    if (!this.dataTexture1) {
      throw new Error('Failed to create data texture 1');
    }

    const finalError = checkWebGLError(gl, 'WebGL initialization');
    if (!finalError) {
      throw new Error('WebGL initialization failed with errors');
    }
  }

  /**
   * Hämta shader-konfiguration
   */
  private getShaderConfig(): ShaderConfig {
    const configKey = this.enhanced ? `${this.parameter}_enhanced` : this.parameter;
    const config = SHADER_CONFIGS[configKey];
    
    if (!config) {
      console.warn(`⚠️ No shader config found for ${configKey}, using basic config`);
      return SHADER_CONFIGS[this.parameter] || SHADER_CONFIGS.current;
    }

    return config;
  }

  /**
   * Hämta uniform locations från shader program
   */
  private getUniformLocations(gl: WebGLRenderingContext): void {
    if (!this.program) return;

    this.uniforms.dataFrame0 = gl.getUniformLocation(this.program, 'u_dataFrame0');
    this.uniforms.dataFrame1 = gl.getUniformLocation(this.program, 'u_dataFrame1');
    this.uniforms.colormap = gl.getUniformLocation(this.program, 'u_colormap');
    this.uniforms.timeFraction = gl.getUniformLocation(this.program, 'u_timeFraction');
    this.uniforms.dataRange = gl.getUniformLocation(this.program, 'u_dataRange');
    this.uniforms.opacity = gl.getUniformLocation(this.program, 'u_opacity');

    if (this.enhanced) {
      this.uniforms.glowThreshold = gl.getUniformLocation(this.program, 'u_glowThreshold');
      this.uniforms.glowIntensity = gl.getUniformLocation(this.program, 'u_glowIntensity');
      this.uniforms.contourLevel = gl.getUniformLocation(this.program, 'u_contourLevel');
      this.uniforms.contourWidth = gl.getUniformLocation(this.program, 'u_contourWidth');
    }
  }

  /**
   * Hämta attribute locations från shader program
   */
  private getAttributeLocations(gl: WebGLRenderingContext): void {
    if (!this.program) return;

    this.attributes.position = gl.getAttribLocation(this.program, 'a_position');
  }

  /**
   * Uppdatera data-texturer baserat på aktuell temporal state
   */
  private lastFrameIndex0 = -1;
  private lastFrameIndex1 = -1;

  private updateDataTextures(gl: WebGLRenderingContext): void {
    if (!this.dataset) return;

    const { currentFrameIndex, nextFrameIndex } = this.dataset;
    const { grid_size } = this.dataset.metadata;

    // Uppdatera texture 0 om frame-index har ändrats
    if (currentFrameIndex !== this.lastFrameIndex0) {
      const frame0 = extractFrame(this.dataset, currentFrameIndex);
      
      if (this.dataTexture0) {
        gl.deleteTexture(this.dataTexture0);
      }
      
      this.dataTexture0 = createDataTexture(gl, frame0, grid_size, grid_size);
      this.lastFrameIndex0 = currentFrameIndex;
    }

    // Uppdatera texture 1 om frame-index har ändrats
    if (nextFrameIndex !== this.lastFrameIndex1) {
      const frame1 = extractFrame(this.dataset, nextFrameIndex);
      
      if (this.dataTexture1) {
        gl.deleteTexture(this.dataTexture1);
      }
      
      this.dataTexture1 = createDataTexture(gl, frame1, grid_size, grid_size);
      this.lastFrameIndex1 = nextFrameIndex;
    }
  }

  /**
   * Rendera en frame
   */
  private renderFrame(gl: WebGLRenderingContext, options: CustomRenderMethodInput): void {
    if (!this.program || !this.dataset) return;

    const config = this.getShaderConfig();

    gl.useProgram(this.program);

    // Bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.attributes.position);
    gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 0, 0);

    // Bind texturer
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTexture0);
    gl.uniform1i(this.uniforms.dataFrame0, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTexture1);
    gl.uniform1i(this.uniforms.dataFrame1, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.colormapTexture);
    gl.uniform1i(this.uniforms.colormap, 2);

    // Sätt uniforms
    gl.uniform1f(this.uniforms.timeFraction, this.dataset.timeFraction);
    gl.uniform2fv(this.uniforms.dataRange, config.uniforms.dataRange);
    gl.uniform1f(this.uniforms.opacity, this.opacity);

    // Enhanced shader uniforms
    if (this.enhanced && config.uniforms) {
      if (this.uniforms.glowThreshold && config.uniforms.glowThreshold !== undefined) {
        gl.uniform1f(this.uniforms.glowThreshold, config.uniforms.glowThreshold);
      }
      if (this.uniforms.glowIntensity && config.uniforms.glowIntensity !== undefined) {
        gl.uniform1f(this.uniforms.glowIntensity, config.uniforms.glowIntensity);
      }
      if (this.uniforms.contourLevel && config.uniforms.contourLevel !== undefined) {
        gl.uniform1f(this.uniforms.contourLevel, config.uniforms.contourLevel);
      }
      if (this.uniforms.contourWidth && config.uniforms.contourWidth !== undefined) {
        gl.uniform1f(this.uniforms.contourWidth, config.uniforms.contourWidth);
      }
    }

    // Rendera fullscreen quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    checkWebGLError(gl, 'frame render');
  }

  /**
   * Rensa upp WebGL-resurser
   */
  private cleanup(gl: WebGLRenderingContext): void {
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }

    if (this.colormapTexture) {
      gl.deleteTexture(this.colormapTexture);
      this.colormapTexture = null;
    }

    if (this.dataTexture0) {
      gl.deleteTexture(this.dataTexture0);
      this.dataTexture0 = null;
    }

    if (this.dataTexture1) {
      gl.deleteTexture(this.dataTexture1);
      this.dataTexture1 = null;
    }

    this.isInitialized = false;
  }
} 