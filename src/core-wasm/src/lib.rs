use wasm_bindgen::prelude::*;
use std::str;

fn is_ws(c: u8) -> bool { c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' }
fn parse_int(s: &[u8]) -> i32 { std::str::from_utf8(s).unwrap_or("0").trim().parse().unwrap_or(0) }
fn parse_double_one(s: &[u8]) -> f64 { std::str::from_utf8(s).unwrap_or("0.0").trim().parse().unwrap_or(0.0) }

#[wasm_bindgen]
pub fn parse_is(input: &[u8]) -> Vec<i32> {
    let len = input.len();
    let mut results = Vec::new();
    let mut i = 0;
    while i < len {
         while i < len && is_ws(input[i]) { i += 1; }
         if i >= len { break; }
         let start = i;
         while i < len && input[i] != b'\\' { i += 1; }
         let end = i;
         let s = &input[start..end];
         let mut trim_end = s.len();
         while trim_end > 0 && is_ws(s[trim_end - 1]) { trim_end -= 1; }
         results.push(parse_int(&s[0..trim_end]));
         i += 1;
    }
    results
}

#[wasm_bindgen]
pub fn parse_ds(input: &[u8]) -> Vec<f64> {
    let len = input.len();
    let mut results = Vec::new();
    let mut i = 0;
    while i < len {
         while i < len && is_ws(input[i]) { i += 1; }
         if i >= len { break; }
         let start = i;
         while i < len && input[i] != b'\\' { i += 1; }
         let end = i;
         let s = &input[start..end];
         let mut trim_end = s.len();
         while trim_end > 0 && is_ws(s[trim_end - 1]) { trim_end -= 1; }
         results.push(parse_double_one(&s[0..trim_end]));
         i += 1;
    }
    results
}

#[wasm_bindgen]
pub fn parse_date(input: &[u8]) -> String {
    let len = input.len();
    if len != 8 { return String::from_utf8_lossy(&input[0..std::cmp::min(len,16)]).to_string(); }
    let y = std::str::from_utf8(&input[0..4]).unwrap_or("0").parse().unwrap_or(0);
    let m = std::str::from_utf8(&input[4..6]).unwrap_or("0").parse().unwrap_or(0);
    let d = std::str::from_utf8(&input[6..8]).unwrap_or("0").parse().unwrap_or(0);
    if y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 { format!("{:04}-{:02}-{:02}", y, m, d) } else { String::from_utf8_lossy(input).to_string() }
}

#[wasm_bindgen]
pub fn parse_time(input: &[u8]) -> String {
    let len = input.len();
    if len < 6 { return String::from_utf8_lossy(&input[0..std::cmp::min(len,32)]).to_string(); }
    let h = std::str::from_utf8(&input[0..2]).unwrap_or("0").parse().unwrap_or(99);
    let m = std::str::from_utf8(&input[2..4]).unwrap_or("0").parse().unwrap_or(99);
    let s = std::str::from_utf8(&input[4..6]).unwrap_or("0").parse().unwrap_or(99);
    if h < 24 && m < 60 && s < 60 {
         let mut res = format!("{:02}:{:02}:{:02}", h, m, s);
         if len > 6 {
             let fraction = String::from_utf8_lossy(&input[6..len]);
             res.push_str(if fraction.len() > 10 { &fraction[0..10] } else { &fraction });
         }
         res
    } else { String::from_utf8_lossy(&input[0..std::cmp::min(len,32)]).to_string() }
}

#[wasm_bindgen]
pub fn find_sequence_delimiter(input: &[u8]) -> isize {
    if input.len() < 4 { return -1; }
    for i in 0..=input.len()-4 {
        if input[i] == 0xFE && input[i+1] == 0xFF && input[i+2] == 0xDD && input[i+3] == 0xE0 { return i as isize; }
    }
    -1
}

#[wasm_bindgen]
pub fn apply_modality_lut(input: &[u8], slope: f64, intercept: f64, bits: i32, representation: i32) -> Result<Vec<f32>, JsValue> {
    let len = input.len();
    let bytes_per_pixel = if bits <= 8 { 1 } else if bits <= 16 { 2 } else if bits <= 32 { 4 } else { return Err(JsValue::from_str("Invalid bits")); };
    let num_pixels = len / bytes_per_pixel;
    let mut out = Vec::with_capacity(num_pixels);
    for i in 0..num_pixels {
        let val: f64 = if bytes_per_pixel == 1 { input[i] as f64 }
        else if bytes_per_pixel == 2 {
            let offset = i * 2;
            let val_u16 = u16::from_le_bytes([input[offset], input[offset+1]]);
            if representation == 1 { (val_u16 as i16) as f64 } else { val_u16 as f64 }
        } else {
            let offset = i * 4;
            let val_u32 = u32::from_le_bytes([input[offset], input[offset+1], input[offset+2], input[offset+3]]);
            if representation == 1 { (val_u32 as i32) as f64 } else { val_u32 as f64 }
        };
        out.push((val * slope + intercept) as f32);
    }
    Ok(out)
}

fn clamp_u8(v: f64) -> u8 { if v < 0.0 { 0 } else if v > 255.0 { 255 } else { v as u8 } }

#[wasm_bindgen]
pub fn apply_voi_lut(input: &[f32], wc: f64, ww: f64) -> Vec<u8> {
    let ww = if ww < 1.0 { 1.0 } else { ww };
    let mut out = Vec::with_capacity(input.len());
    for &val in input {
        let val = val as f64;
        let res = if val <= (wc - 0.5 - (ww - 1.0) / 2.0) { 0 }
        else if val > (wc - 0.5 + (ww - 1.0) / 2.0) { 255 }
        else { ((val - (wc - 0.5)) / (ww - 1.0) + 0.5) * 255.0 };
        out.push(clamp_u8(res));
    }
    out
}
