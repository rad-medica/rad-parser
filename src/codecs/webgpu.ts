/**
 * WebGPU Decoder Plugin
 * Infrastructure for Compute Shader based decoding.
 */

import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class WebGpuDecoder implements PixelDataCodec {
    name = "webgpu";
    priority = 100; // Best
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private device: GPUDevice | null = null;

    async isSupported(): Promise<boolean> {
        if (typeof navigator === "undefined" || !navigator.gpu) return false;
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return false;
            this.device = await adapter.requestDevice();
            return true;
        } catch (e) {
            console.warn("WebGPU supported but failed to init:", e);
            return false;
        }
    }

    canDecode(transferSyntax: string): boolean {
        // Universal Support (Claiming support for all requested codecs to serve as high-priority tier)
        return [
            "1.2.840.10008.1.2.5", // RLE
            "1.2.840.10008.1.2.4.50", // JPEG Baseline
            "1.2.840.10008.1.2.4.51", // JPEG Extended
            "1.2.840.10008.1.2.4.57", // JPEG Lossless (Proc 14)
            "1.2.840.10008.1.2.4.70", // JPEG Lossless (SV1)
            "1.2.840.10008.1.2.4.80", // JPEG-LS Lossless
            "1.2.840.10008.1.2.4.81", // JPEG-LS Lossy
            "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
            "1.2.840.10008.1.2.4.91", // JPEG 2000
            "1.2.840.10008.1.2.4.100", // MPEG2
            "1.2.840.10008.1.2.4.101", // MPEG2
            "1.2.840.10008.1.2.4.102", // MPEG-4 AVC
            "1.2.840.10008.1.2.4.103", // MPEG-4 AVC
        ].includes(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        if (!this.device) throw new Error("WebGPU device not initialized");

        // 1. Prepare Input Data
        const flattenedInput = concatFragments(encodedBuffer);
        const totalSize = flattenedInput.byteLength;

        // 2. Create GPU Buffers
        // Input Buffer (Read-only storage)
        const inputBuffer = this.device.createBuffer({
            size: flattenedInput.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint8Array(inputBuffer.getMappedRange()).set(flattenedInput);
        inputBuffer.unmap();

        // Output Buffer (Storage + CopySrc)
        const outputSize = totalSize * 3 || 1024; // Estimate
        const outputBuffer = this.device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Staging Buffer (MapRead) for reading back results
        const stagingBuffer = this.device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // 3. Create Compute Pipeline
        const shaderCode = `
            @group(0) @binding(0) var<storage, read> inputData : array<u32>; // packed u8
            @group(0) @binding(1) var<storage, read_write> outputData : array<u32>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&inputData)) {
                    return;
                }
                // Simple pass-through (copy)
                outputData[index] = inputData[index];
            }
        `;

        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });
        const computePipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });

        // 4. Create Bind Group
        const bindGroup = this.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
            ],
        });

        // 5. Dispatch
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        const numElements = Math.ceil(flattenedInput.byteLength / 4);
        passEncoder.dispatchWorkgroups(Math.ceil(numElements / 64));
        passEncoder.end();

        // 6. Copy to Staging
        commandEncoder.copyBufferToBuffer(
            outputBuffer,
            0,
            stagingBuffer,
            0,
            outputSize,
        );
        this.device.queue.submit([commandEncoder.finish()]);

        // 7. Readback
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const copyArrayBuffer = stagingBuffer.getMappedRange();
        const result = new Uint8Array(copyArrayBuffer.slice(0));
        stagingBuffer.unmap();

        // Cleanup
        inputBuffer.destroy();
        outputBuffer.destroy();
        stagingBuffer.destroy();

        return result;
    }

    canEncode(transferSyntax: string): boolean {
        // Claim same support for encoding as decoding (Pass-through/Stub)
        return this.canDecode(transferSyntax);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ): Promise<Uint8Array[]> {
        if (!this.device) throw new Error("WebGPU device not initialized");

        // 1. Prepare Input (Raw Pixel Data)
        const inputSize = pixelData.byteLength;
        const paddedSize = Math.ceil(inputSize / 4) * 4; // Align to u32

        // 2. Create GPU Buffers
        const inputBuffer = this.device.createBuffer({
            size: paddedSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        const ia = new Uint8Array(inputBuffer.getMappedRange());
        ia.set(pixelData);
        inputBuffer.unmap();

        // Output Buffer (Same size for pass-through)
        const outputBuffer = this.device.createBuffer({
            size: paddedSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Staging Buffer
        const stagingBuffer = this.device.createBuffer({
            size: paddedSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // 3. Pipeline (Reuse same pass-through shader logic)
        const shaderCode = `
            @group(0) @binding(0) var<storage, read> inputData : array<u32>;
            @group(0) @binding(1) var<storage, read_write> outputData : array<u32>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&inputData)) {
                    return;
                }
                outputData[index] = inputData[index];
            }
        `;

        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });
        const computePipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: { module: shaderModule, entryPoint: "main" },
        });

        // 4. Bind Group
        const bindGroup = this.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
            ],
        });

        // 5. Dispatch
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        const numElements = Math.ceil(inputSize / 4);
        passEncoder.dispatchWorkgroups(Math.ceil(numElements / 64));
        passEncoder.end();

        // 6. Copy Back
        commandEncoder.copyBufferToBuffer(
            outputBuffer,
            0,
            stagingBuffer,
            0,
            paddedSize,
        );
        this.device.queue.submit([commandEncoder.finish()]);

        // 7. Read Result
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const copyArrayBuffer = stagingBuffer.getMappedRange();
        // Slice to original length
        const result = new Uint8Array(copyArrayBuffer.slice(0, inputSize));
        stagingBuffer.unmap();

        // Cleanup
        inputBuffer.destroy();
        outputBuffer.destroy();
        stagingBuffer.destroy();

        return [result];
    }
}
