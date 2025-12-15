use wasm_bindgen::prelude::*;
use std::io::Cursor;
// flate2/crc32fast imports removed
use image::io::Reader as ImageReader;
use image::ImageFormat;
// charls 0.4 might expose items at top level or submodule
// We will try importing expected structs or functions
// use charls::CharLS;

// RLE and PNG implementations

use flate2::write::ZlibEncoder;
use flate2::Compression;
use crc32fast::Hasher;
use std::io::Write;
use byteorder::{BigEndian, WriteBytesExt};

#[wasm_bindgen]
pub fn rle_decode(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() * 2); 
    let mut i = 0;
    while i < input.len() {
        let n = input[i] as i8;
        i += 1;
        if n >= 0 {
            let count = (n as usize) + 1;
            if i + count > input.len() {
                let remaining = input.len() - i;
                out.extend_from_slice(&input[i..i + remaining]);
                break;
            }
            out.extend_from_slice(&input[i..i + count]);
            i += count;
        } else if n != -128 { 
            let count = 1 - (n as isize);
            if i >= input.len() { break; }
            let val = input[i];
            i += 1;
            for _ in 0..count { out.push(val); }
        }
    }
    out
}

// --- PNG ---
#[wasm_bindgen]
pub fn png_encode(pixel_data: &[u8], width: u32, height: u32, bits: u8, samples: u8) -> Result<Vec<u8>, JsValue> {
    let mut png_data = Vec::new();
    png_data.write_all(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).unwrap();

    let mut ihdr_data = Vec::new();
    ihdr_data.write_u32::<BigEndian>(width).unwrap();
    ihdr_data.write_u32::<BigEndian>(height).unwrap();
    ihdr_data.write_u8(bits).unwrap();
    let color_type = match samples { 1 => 0, 3 => 2, _ => return Err(JsValue::from_str("Unsupported sample count")), };
    ihdr_data.write_u8(color_type).unwrap();
    ihdr_data.write_u8(0).unwrap(); ihdr_data.write_u8(0).unwrap(); ihdr_data.write_u8(0).unwrap();
    
    write_chunk(&mut png_data, b"IHDR", &ihdr_data);

    let bytes_per_pixel = (bits as usize / 8) * samples as usize;
    let row_size = width as usize * bytes_per_pixel;
    let mut raw_buffer = Vec::with_capacity(height as usize * (row_size + 1));
    for y in 0..height as usize {
        raw_buffer.push(0);
        let start = y * row_size;
        let end = start + row_size;
        if end > pixel_data.len() { return Err(JsValue::from_str("Pixel data too short")); }
        raw_buffer.extend_from_slice(&pixel_data[start..end]);
    }

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&raw_buffer).unwrap();
    let compressed_data = encoder.finish().unwrap();
    write_chunk(&mut png_data, b"IDAT", &compressed_data);
    write_chunk(&mut png_data, b"IEND", &[]);
    Ok(png_data)
}

fn write_chunk(output: &mut Vec<u8>, chunk_type: &[u8; 4], data: &[u8]) {
    output.write_u32::<BigEndian>(data.len() as u32).unwrap();
    output.write_all(chunk_type).unwrap();
    output.write_all(data).unwrap();
    let mut hasher = Hasher::new();
    hasher.update(chunk_type);
    hasher.update(data);
    let crc = hasher.finalize();
    output.write_u32::<BigEndian>(crc).unwrap();
}

#[wasm_bindgen]
pub fn jpeg_decode(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let cursor = Cursor::new(input);
    let decoder = image::codecs::jpeg::JpegDecoder::new(cursor)
        .map_err(|e| JsValue::from_str(&format!("JPEG creation failed: {}", e)))?;
    
    let image = image::DynamicImage::from_decoder(decoder)
        .map_err(|e| JsValue::from_str(&format!("JPEG decode failed: {}", e)))?;
    
    Ok(image.into_bytes())
}

// --- JPEG Lossless (Process 14) ---
#[wasm_bindgen]
pub fn jpeg_lossless_decode(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let cursor = Cursor::new(input);
    let mut decoder = jpeg_decoder::Decoder::new(cursor);
    let pixels = decoder.decode().map_err(|e| JsValue::from_str(&format!("JPEG Lossless decode failed: {}", e)))?;
    Ok(pixels)
}

#[wasm_bindgen]
pub fn rle_encode(
    input: &[u8],
    width: u32,
    height: u32,
    samples_per_pixel: u8,
    bits_allocated: u8,
) -> Result<Vec<u8>, JsValue> {
    // RLE encoding for DICOM (PackBits variant)
    // Header: 64 bytes (16 u32 segment offsets, little-endian)
    // Then encoded segments for each sample plane
    
    let bytes_per_pixel = if bits_allocated <= 8 { 1 } else { 2 };
    let stride = (width * bytes_per_pixel as u32) as usize;
    let num_segments = samples_per_pixel as usize;
    
    let mut result = Vec::new();
    let mut segment_offsets = vec![0u32; 15];
    
    // Reserve space for header (64 bytes)
    result.resize(64, 0);
    
    // Encode each segment (sample plane)
    for seg in 0..num_segments {
        segment_offsets[seg] = result.len() as u32;
        
        // Encode rows for this segment
        for row in 0..height as usize {
            let row_start = row * stride + seg * bytes_per_pixel;
            
            // Simple PackBits RLE encoding
            let mut i = 0;
            while i < stride {
                if i + 2 < stride 
                    && input.get(row_start + i) == input.get(row_start + i + 1)
                    && input.get(row_start + i) == input.get(row_start + i + 2) {
                    // Run of identical bytes
                    let byte_val = input[row_start + i];
                    let mut run_len = 1;
                    while i + run_len < stride 
                        && run_len < 128
                        && input.get(row_start + i + run_len) == Some(&byte_val) {
                        run_len += 1;
                    }
                    result.push((run_len as u8).wrapping_neg().wrapping_add(1)); // -(run_len - 1)
                    result.push(byte_val);
                    i += run_len;
                } else {
                    // Literal run
                    let mut lit_len = 1;
                    while i + lit_len < stride 
                        && lit_len < 128
                        && (i + lit_len + 2 >= stride
                            || input.get(row_start + i + lit_len) != input.get(row_start + i + lit_len + 1)
                            || input.get(row_start + i + lit_len) != input.get(row_start + i + lit_len + 2)) {
                        lit_len += 1;
                    }
                    result.push((lit_len - 1) as u8);
                    for j in 0..lit_len {
                        if let Some(&b) = input.get(row_start + i + j) {
                            result.push(b);
                        }
                    }
                    i += lit_len;
                }
            }
        }
    }
    
    // Write segment offsets to header (little-endian)
    for (i, &offset) in segment_offsets.iter().enumerate().take(15) {
        let offset_pos = i * 4;
        result[offset_pos..offset_pos + 4].copy_from_slice(&offset.to_le_bytes());
    }
    
    Ok(result)
}

// --- JPEG Encoding ---

#[wasm_bindgen]
pub fn jpeg_encode(
    input: &[u8],
    width: u16,
    height: u16,
    quality: u8,
    color_type: u8, // 0 = grayscale, 1 = RGB
) -> Result<Vec<u8>, JsValue> {
    use jpeg_encoder::{Encoder, ColorType};
    
    let ct = if color_type == 0 {
        ColorType::Luma
    } else {
        ColorType::Rgb
    };
    
    let mut encoded = Vec::new();
    let encoder = Encoder::new(&mut encoded, quality);
    
    encoder
        .encode(input, width, height, ct)
        .map_err(|e| JsValue::from_str(&format!("JPEG encode failed: {}", e)))?;
    
    Ok(encoded)
}

// --- JPEG 2000 (Pure Rust via hayro) ---
#[wasm_bindgen]
pub fn jpeg2000_decode(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let img = hayro_jpeg2000::decode(input, &hayro_jpeg2000::DecodeSettings::default())
        .map_err(|e| JsValue::from_str(&format!("J2K decode failed: {:?}", e)))?;
    Ok(img.data)
}

// --- JPEG-LS ---

// #[wasm_bindgen]
// pub fn jpegls_decode(input: &[u8]) -> Result<Vec<u8>, JsValue> {
//     let mut decoder = CharLS::default();
//     let decoded = decoder.decode(input).map_err(|e| JsValue::from_str(&format!("JPEG-LS decode failed: {}", e)))?;
//     Ok(decoded)
// }

// #[wasm_bindgen]
// pub fn jpegls_encode(
//     input: &[u8],
//     width: u32,
//     height: u32,
//     bits_allocated: u8,
//     samples_per_pixel: u8,
//     near_lossless: u8,
// ) -> Result<Vec<u8>, JsValue> {
//     // Placeholder until CharLS API is fixed
//     Err(JsValue::from_str("JPEG-LS encoding not enabled"))
// }
