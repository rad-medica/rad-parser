//! rad-parser codec module backed by jpegexp-rs.
//!
//! Decoding uses the bindings jpegexp-rs already exports from its own `wasm` module
//! (`decode_jpeg`, `decode_jpegls`, `decode_j2k`, ...). They are linked into this cdylib
//! because it depends on the crate, so re-declaring them here would collide. This crate only
//! adds encoders that take the bit depth and quality rad-parser needs; their names are
//! prefixed with `rad_` to stay clear of the upstream exports.
//!
//! Sample layout for every encoder: interleaved samples, one byte each up to 8 bits,
//! little-endian 16-bit words for 9-16 bits.

use jpegexp_rs::jpeg1::Jpeg1Encoder;
use jpegexp_rs::jpeg2000::J2kEncoder;
use jpegexp_rs::jpegls::JpeglsEncoder;
use jpegexp_rs::{CodecError, FrameInfo};
use wasm_bindgen::prelude::*;

const LOSSLESS_QUALITY: u8 = 100;

fn js_error(error: CodecError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn frame_info(width: u32, height: u32, bits: u32, components: u32) -> Result<FrameInfo, JsValue> {
    if !(2..=16).contains(&bits) {
        return Err(JsValue::from_str(&format!("unsupported bit depth: {bits}")));
    }
    let component_count = i32::try_from(components)
        .map_err(|_| JsValue::from_str(&format!("unsupported component count: {components}")))?;
    Ok(FrameInfo {
        width,
        height,
        bits_per_sample: bits as i32,
        component_count,
    })
}

/// Reinterprets little-endian 16-bit sample bytes, checking the length matches the frame.
fn samples_u16(pixels: &[u8], frame: &FrameInfo) -> Result<Vec<u16>, JsValue> {
    let expected = frame.width as usize
        * frame.height as usize
        * frame.component_count as usize
        * 2;
    if pixels.len() < expected {
        return Err(JsValue::from_str(&format!(
            "pixel buffer too small: {} bytes, frame needs {expected}",
            pixels.len()
        )));
    }
    Ok(pixels[..expected]
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&pair| u16::from_le_bytes(pair))
        .collect())
}

/// Encodes to JPEG 1. With `lossless_predictor` 0 this is DCT coding (baseline for 8 bits,
/// extended sequential above) at `quality` 1-100; with a predictor 1-7 it is lossless
/// Process 14 (SOF3) and `quality` is ignored.
#[wasm_bindgen]
pub fn rad_encode_jpeg(
    pixels: &[u8],
    width: u32,
    height: u32,
    bits: u32,
    components: u32,
    quality: u8,
    lossless_predictor: u8,
) -> Result<Vec<u8>, JsValue> {
    let frame = frame_info(width, height, bits, components)?;
    let mut encoder = Jpeg1Encoder::new();
    if lossless_predictor == 0 {
        encoder.set_quality(quality).map_err(js_error)?;
    } else {
        encoder.set_lossless(lossless_predictor).map_err(js_error)?;
    }
    if bits <= 8 {
        encoder.encode_to_vec(pixels, &frame).map_err(js_error)
    } else {
        encoder
            .encode_u16_to_vec(&samples_u16(pixels, &frame)?, &frame)
            .map_err(js_error)
    }
}

/// Encodes to lossless JPEG-LS.
#[wasm_bindgen]
pub fn rad_encode_jpegls(
    pixels: &[u8],
    width: u32,
    height: u32,
    bits: u32,
    components: u32,
) -> Result<Vec<u8>, JsValue> {
    let frame = frame_info(width, height, bits, components)?;
    let mut encoder = JpeglsEncoder::new();
    let mut destination = vec![0u8; jpegexp_rs::jpegls::maximum_encoded_size(&frame)];
    let length = if bits <= 8 {
        encoder.encode(pixels, &frame, &mut destination)
    } else {
        encoder.encode_u16(&samples_u16(pixels, &frame)?, &frame, &mut destination)
    }
    .map_err(js_error)?;
    destination.truncate(length);
    Ok(destination)
}

/// Encodes to a JPEG 2000 codestream. `lossless` selects the reversible 5/3 wavelet and
/// ignores `quality`; otherwise the irreversible 9/7 wavelet is used with `quality` 1-99.
/// `htj2k` selects High-Throughput block coding (ISO/IEC 15444-15).
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)] // flat signature keeps the JS boundary free of structs
pub fn rad_encode_j2k(
    pixels: &[u8],
    width: u32,
    height: u32,
    bits: u32,
    components: u32,
    lossless: bool,
    quality: u8,
    htj2k: bool,
) -> Result<Vec<u8>, JsValue> {
    let frame = frame_info(width, height, bits, components)?;
    if !lossless && !(1..LOSSLESS_QUALITY).contains(&quality) {
        return Err(JsValue::from_str(&format!(
            "lossy JPEG 2000 quality must be 1-99, got {quality}"
        )));
    }
    let mut encoder = J2kEncoder::new();
    encoder.set_irreversible(!lossless);
    encoder
        .set_quality(if lossless { LOSSLESS_QUALITY } else { quality })
        .map_err(js_error)?;
    encoder.set_htj2k(htj2k);
    // J2kEncoder takes 9-16 bit samples as little-endian bytes directly.
    encoder.encode_to_vec(pixels, &frame).map_err(js_error)
}
