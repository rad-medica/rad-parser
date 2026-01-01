use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn decode_jpeg2000(_input: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("j2k codec not compiled (requires C toolchain)"))
}


#[wasm_bindgen]
pub fn encode_jpeg2000(
    _input: &[u8], _width: u32, _height: u32, _bits: u32, _components: u32,
    _lossless: bool, _quality: f32
) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("JPEG 2000 codec not compiled (requires C toolchain)"))
}
