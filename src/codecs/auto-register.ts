// This file configures the dynamic loading for all standard codecs.
// It maps Transfer Syntax UIDs to the corresponding codec implementation.

import { registry } from '../core/registry';

// RLE Lossless
registry.registerDynamic('1.2.840.10008.1.2.5', () => import('./rle'));

// JPEG Baseline (Process 1) & Extended (Process 2 & 4)
// These are often handled by the browser or a standard JPEG library.
// JPEG Baseline (Process 1) & Extended (Process 2 & 4)
// Use native Wasm implementation for universal support (Node.js + Browser)
registry.registerDynamic('1.2.840.10008.1.2.4.50', () => import('./jpegNative'));
registry.registerDynamic('1.2.840.10008.1.2.4.51', () => import('./browser')); // Keep extended on browser for now (or fallback)

// JPEG Lossless, Non-Hierarchical (Process 14)
registry.registerDynamic('1.2.840.10008.1.2.4.57', () => import('./jpegLossless'));

// JPEG Lossless, Non-Hierarchical, First-Order Prediction (Process 14 [SV1])
// This can be handled by a native JS implementation or a WASM library.
registry.registerDynamic('1.2.840.10008.1.2.4.70', () => import('./jpegLosslessNative'));

// JPEG-LS Lossless and Near-Lossless
registry.registerDynamic('1.2.840.10008.1.2.4.80', () => import('./jpegls'));
registry.registerDynamic('1.2.840.10008.1.2.4.81', () => import('./jpegls'));

// JPEG 2000 Lossless and Lossy
registry.registerDynamic('1.2.840.10008.1.2.4.90', () => import('./jpeg2000'));
registry.registerDynamic('1.2.840.10008.1.2.4.91', () => import('./jpeg2000'));

// MPEG2 and MPEG-4 AVC/H.264 Video
registry.registerDynamic('1.2.840.10008.1.2.4.100', () => import('./video'));
registry.registerDynamic('1.2.840.10008.1.2.4.101', () => import('./video'));
registry.registerDynamic('1.2.840.10008.1.2.4.102', () => import('./video'));
registry.registerDynamic('1.2.840.10008.1.2.4.103', () => import('./video'));

// High-priority WebGPU and WebGL fallbacks can also be registered,
// though they often claim to support many syntaxes and are chosen by priority.
// For simplicity, we can rely on them being registered statically if needed,
// as they are more like "renderers" than specific format codecs.
// Example:
// registry.register(new WebGpuDecoder());
// registry.register(new WebGlDecoder());
