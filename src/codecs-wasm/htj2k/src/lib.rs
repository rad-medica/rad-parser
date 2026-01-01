use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn decode_htj2k(_input: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("htj2k codec not compiled (requires C toolchain)"))
}
