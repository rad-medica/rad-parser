// Global Type Definitions for WebGPU and WebCodecs (Shim)
// This avoids needing to install @webgpu/types or similar for this zero-dependency build.

interface Window {
    ImageDecoder: any;
}

interface Navigator {
    gpu: any;
}

// WebGPU Minimal Types needed for the skeleton
interface GPUBufferUsage {
    STORAGE: number;
    COPY_DST: number;
    COPY_SRC: number;
    MAP_READ: number;
}
declare const GPUBufferUsage: GPUBufferUsage;

interface GPUMapMode {
    READ: number;
    WRITE: number;
}
declare const GPUMapMode: GPUMapMode;

interface GPUDevice {
    createBuffer(desc: any): any;
    createShaderModule(desc: any): any;
    createComputePipeline(desc: any): any;
    createBindGroup(desc: any): any;
    createCommandEncoder(): any;
    queue: { submit(cmds: any[]): void };
}

// Global variable definitions for the standalone build
declare var __RAD_STANDALONE__: boolean;
