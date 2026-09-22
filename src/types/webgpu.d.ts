// Minimal ambient declarations for the modern (2024+) browser WebGPU API.
// TypeScript's bundled DOM lib does not include WebGPU, so we declare exactly
// the surface the Aqua lab's FLIP engine uses. These match the shipped browser
// implementations (Chrome/Edge/Safari/Firefox) and avoid depending on the
// older, incomplete @webgpu/types package.

interface GPUBufferUsage {
  readonly MAP_READ: number;
  readonly MAP_WRITE: number;
  readonly COPY_DST: number;
  readonly COPY_SRC: number;
  readonly UNIFORM: number;
  readonly STORAGE: number;
  readonly INDIRECT: number;
}
declare const GPUBufferUsage: GPUBufferUsage;

interface GPUTextureUsage {
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly TEXTURE_BINDING: number;
  readonly STORAGE_BINDING: number;
  readonly RENDER_ATTACHMENT: number;
  readonly TRANSIENT_ATTACHMENT: number;
  readonly SAMPLE: number;
}
declare const GPUTextureUsage: GPUTextureUsage;

interface GPUShaderStage {
  readonly VERTEX: number;
  readonly FRAGMENT: number;
  readonly COMPUTE: number;
}
declare const GPUShaderStage: GPUShaderStage;

interface GPUMapMode {
  readonly READ: number;
  readonly WRITE: number;
}
declare const GPUMapMode: GPUMapMode;

type GPUBufferUsageFlags = number;
type GPUTextureUsageFlags = number;
type GPUShaderStageFlags = number;
type GPUMapModeFlags = number;
type GPUTextureFormat = string;
type GPUBufferCopySrc = GPUBuffer;
type GPUBufferCopyDest = GPUBuffer;
type GPUAllowSharedBufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer;

interface GPUBufferDescriptor {
  size: number;
  usage: GPUBufferUsageFlags;
  label?: string;
}
interface GPUBuffer {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  readonly label: string;
  destroy(): void;
  mapAsync(mode: GPUMapModeFlags): Promise<void>;
  getMappedRange(options?: { offset?: number; size?: number }): ArrayBuffer;
  unmap(): void;
}

interface GPUTextureDescriptor {
  size: { width: number; height: number; depthOrArrayLayers?: number } | [number, number, number?];
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  label?: string;
  mipLevelCount?: number;
  sampleCount?: number;
}
interface GPUTextureViewDescriptor {
  format?: GPUTextureFormat;
  type?: string;
  dimension?: string;
  aspect?: string;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
}
interface GPUTextureView {
  destroy(): void;
}
interface GPUTexture {
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly format: GPUTextureFormat;
  readonly usage: GPUTextureUsageFlags;
  readonly label: string;
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: GPUShaderStageFlags;
  buffer?: { type: "uniform" | "storage" | "read-only-storage"; hasDynamicOffset?: boolean; minBindingSize?: number };
  texture?: { sampleType?: string; viewDimension?: string };
  sampler?: { type: string };
  externalTexture?: object;
  storageTexture?: { format: GPUTextureFormat; access: string };
}
interface GPUBindGroupLayoutDescriptor {
  entries: GPUBindGroupLayoutEntry[];
  label?: string;
}
interface GPUBindGroupLayout {
  readonly label: string;
  destroy(): void;
}
interface GPUBindGroupEntry {
  binding: number;
  resource:
    | { buffer: GPUBuffer; offset?: number; size?: number }
    | GPUTextureView
    | GPUTexture
    | GPUExternalTexture
    | object;
}
interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
  label?: string;
}
interface GPUBindGroup {
  readonly label: string;
  destroy(): void;
}
interface GPUExternalTexture {
  destroy(): void;
}

interface GPUShaderModuleDescriptor {
  code: string;
  label?: string;
}
interface GPUShaderModule {
  readonly label: string;
  destroy(): void;
}

interface GPUComputePipelineDescriptor {
  layout: GPUPipelineLayout | GPUBindGroupLayout[] | "auto";
  compute: { module: GPUShaderModule; entryPoint?: string };
  label?: string;
}
interface GPUPipelineLayout {
  readonly label: string;
  destroy(): void;
}
interface GPUComputePipeline {
  readonly label: string;
  destroy(): void;
}
type GPUPipeline = GPUComputePipeline;

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup | null, dynamicOffsetData?: GPUAllowSharedBufferSource, dynamicOffsetCount?: number): void;
  setBuffer(index: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  finish(): void;
}
interface GPUCommandEncoder {
  beginComputePass(descriptor?: { label?: string; timestampWrites?: object[] }): GPUComputePassEncoder;
  finish(): GPUCommandBuffer;
  destroy(): void;
}
interface GPUCommandBuffer {
  readonly label: string;
}
interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: GPUAllowSharedBufferSource, size?: number, dataOffset?: number): void;
  writeTexture(destination: object, data: GPUAllowSharedBufferSource, dataLayout: object, textureSize: object): void;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, copySize: number): void;
  copyExternalImageToTexture(source: object, destination: object, copySize: object): void;
  onSubmittedWorkDone(): Promise<void>;
  fillBuffer(buffer: GPUBuffer, bufferOffset: number, size: number, value: number): void;
}
interface GPUUncapturedErrorEvent {
  readonly error: GPUError;
}
interface GPUError {
  readonly message: string;
}
interface GPUDeviceLostInfo {
  readonly status: string;
  readonly message: string;
}
interface GPUDevice {
  readonly adapter: GPUAdapter;
  readonly queue: GPUQueue;
  ondevicelost: ((this: GPUDevice, ev: Event) => any) | null;
  onuncapturederror: ((this: GPUDevice, ev: GPUUncapturedErrorEvent) => any) | null;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createPipelineLayout(descriptor?: { bindGroupLayouts: (GPUBindGroupLayout | null)[]; label?: string }): GPUPipelineLayout;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createCommandEncoder(descriptor?: { label?: string }): GPUCommandEncoder;
  getPipelineCache(): object;
  pushErrorScope(scope: string): void;
  popErrorScope(): Promise<GPUError | null>;
  destroy(): void;
}
interface GPUAdapter {
  readonly info: { vendor?: string; architecture?: string; device?: string; description?: string };
  requestDevice(options?: { requiredLimits?: object; requiredFeatures?: string[]; label?: string }): Promise<GPUDevice>;
  getLimits(): object;
}
interface GPU {
  requestAdapter(options?: object): Promise<GPUAdapter | null>;
}

