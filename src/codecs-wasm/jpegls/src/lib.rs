use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn decode_jpegls(_input: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("jpegls codec not compiled (requires C toolchain)"))
}


#[wasm_bindgen]
pub fn encode_jpegls(
    _input: &[u8], _width: u32, _height: u32, _bits: u32, _components: u32
) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("JPEG-LS codec not compiled (requires C++ toolchain)"))
}
