use wasm_bindgen::prelude::*;
use std::io::Cursor;

#[wasm_bindgen]
pub fn decode_jpeg(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let cursor = Cursor::new(input);
    let mut decoder = jpeg_decoder::Decoder::new(cursor);
    match decoder.decode() {
        Ok(pixels) => Ok(pixels),
        Err(e) => Err(JsValue::from_str(&format!("JPEG decode error: {:?}", e))),
    }
}

#[wasm_bindgen]
pub fn encode_jpeg(
    input: &[u8], width: u32, height: u32, components: i32, quality: i32
) -> Result<Vec<u8>, JsValue> {
    let color_type = match components {
        1 => jpeg_encoder::ColorType::Luma,
        3 => jpeg_encoder::ColorType::Rgb,
        4 => jpeg_encoder::ColorType::Rgba,
        _ => return Err(JsValue::from_str("Unsupported component count")),
    };

    let mut buf = Vec::new();
    {
        let mut encoder = jpeg_encoder::Encoder::new(&mut buf, quality as u8);
        encoder.set_density(jpeg_encoder::Density::None);
        match encoder.encode(input, width as u16, height as u16, color_type) {
            Ok(_) => (),
            Err(e) => return Err(JsValue::from_str(&format!("JPEG encode error: {:?}", e))),
        }
    }
    Ok(buf)
}
