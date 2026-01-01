use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn decode_ljpeg(_input: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("ljpeg codec not compiled (requires C toolchain)"))
}
