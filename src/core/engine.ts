import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';

export async function initializeEngine(canvas: HTMLCanvasElement, options: { preferWebGL?: boolean } = {}): Promise<AbstractEngine> {
  const requestedRenderer = new URLSearchParams(location.search).get('renderer');
  const forceWebGPU = requestedRenderer === 'webgpu';
  const forceWebGL = requestedRenderer === 'webgl' || !!options.preferWebGL;

  if (!forceWebGL) {
    let gpu: WebGPUEngine | undefined;
    let unavailableReason = '';

    if (!window.isSecureContext) {
      unavailableReason = 'WebGPU requires a secure context (HTTPS or localhost).';
    } else if (!('gpu' in navigator)) {
      unavailableReason = 'This browser does not expose navigator.gpu. Check WebGPU support and the page Permissions Policy.';
    } else {
      try {
        if (await WebGPUEngine.IsSupportedAsync) {
          gpu = new WebGPUEngine(canvas, { antialias: true, stencil: true });
          await gpu.initAsync();
          return gpu;
        }
        unavailableReason = 'The browser did not provide a compatible WebGPU adapter.';
      } catch (error) {
        gpu?.dispose();
        unavailableReason = error instanceof Error ? error.message : String(error);
      }
    }

    if (forceWebGPU) {
      throw new Error(`WebGPU was explicitly requested but could not be initialized. ${unavailableReason} Use HTTPS or localhost, allow WebGPU in the browser/page policy, or remove ?renderer=webgpu to use automatic fallback.`);
    }
    if (unavailableReason) console.info(`WebGPU unavailable; using WebGL instead. ${unavailableReason}`);
  }

  return new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
}
