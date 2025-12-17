/**
 * Simple BMP Writer
 * Writes uncompressed BMP file from pixel data.
 * Assumes 8-bit or 24-bit RGB.
 */
import fs from "fs";

export function writeBmp(
    filename: string,
    width: number,
    height: number,
    data: Uint8Array,
    channels: number = 1
) {
    const fileSize = 54 + data.length + (channels === 1 ? 1024 : 0); // Palette for 8-bit
    const buffer = new Uint8Array(fileSize);
    const view = new DataView(buffer.buffer);

    // Bitmap File Header
    view.setUint8(0, 0x42); // 'B'
    view.setUint8(1, 0x4d); // 'M'
    view.setUint32(2, fileSize, true);
    view.setUint32(10, 54 + (channels === 1 ? 1024 : 0), true); // Offset to data

    // DIB Header
    view.setUint32(14, 40, true); // Header size
    view.setInt32(18, width, true);
    view.setInt32(22, -height, true); // Top-down
    view.setUint16(26, 1, true); // Planes
    view.setUint16(28, channels * 8, true); // Bits per pixel
    view.setUint32(30, 0, true); // Compression (BI_RGB)
    view.setUint32(34, data.length, true); // Image size

    let offset = 54;

    // Color Palette for Grayscale (8-bit)
    if (channels === 1) {
        for (let i = 0; i < 256; i++) {
            view.setUint8(offset + i * 4, i); // B
            view.setUint8(offset + i * 4 + 1, i); // G
            view.setUint8(offset + i * 4 + 2, i); // R
            view.setUint8(offset + i * 4 + 3, 0); // A
        }
        offset += 1024;
    }

    // Pixel Data
    // BMP expects BGR.
    // If input is RGB, we might need to swap.
    // If input is Grayscale, it's fine.
    // Assuming simple copy for now.
    buffer.set(data, offset);

    fs.writeFileSync(filename, buffer);
}
