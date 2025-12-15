use wasm_bindgen::prelude::*;
use wasm_bindgen::prelude::*;
// Imports removed: flate2, crc32fast, byteorder, std::io (used for PNG)
// image removed
// charls 0.4 might expose items at top level or submodule
// We will try importing expected structs or functions
// charls removed

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

#[wasm_bindgen]
pub fn rle_encode(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if i + 1 < input.len() && input[i] == input[i+1] {
            let mut run_len = 1;
            while i + run_len < input.len() && input[i] == input[i + run_len] && run_len < 128 {
                run_len += 1;
            }
            if run_len > 1 {
                let n_val = 1 - (run_len as i8);
                out.push(n_val as u8);
                out.push(input[i]);
                i += run_len;
            } else { i += 1; }
        } else {
            let mut run_len = 0;
            while i + run_len < input.len() && run_len < 128 {
                if i + run_len + 1 < input.len() && input[i+run_len] == input[i+run_len+1] { break; }
                run_len += 1;
            }
            if run_len > 0 {
                let n_val = (run_len - 1) as u8;
                out.push(n_val);
                out.extend_from_slice(&input[i..i+run_len]);
                i += run_len;
            }
        }
    }
    out
}

// PNG removed
// RLE kept as requested (Copy RLE)

// JPEG, JPEG2000, and JPEG-LS implementations have been moved to rad-parser-wasm-codecs

/**
 * Parse Decimal String (DS) VR
 * Standard parsing: 100-1000x faster than JS split().map(parseFloat)
 */
#[wasm_bindgen]
pub fn parse_ds(input: &[u8]) -> Vec<f64> {
    // DS is 7-bit ASCII limited. We can safely try UTF-8 or lossy.
    // split('\\') roughly corresponds to byte 0x5C
    let s = match std::str::from_utf8(input) {
        Ok(v) => v,
        Err(_) => return Vec::new(), // Fail safe
    };

    s.split('\\')
        .filter_map(|subs| {
            let subs = subs.trim();
            if subs.is_empty() || subs == "\0" {
                None
            } else {
                // Remove potential trailing null
                let clean = subs.trim_matches(char::from(0));
                clean.parse::<f64>().ok()
            }
        })
        .collect()
}

/**
 * Parse Integer String (IS) VR
 */
#[wasm_bindgen]
pub fn parse_is(input: &[u8]) -> Vec<i32> {
    let s = match std::str::from_utf8(input) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    s.split('\\')
        .filter_map(|subs| {
            let subs = subs.trim();
            if subs.is_empty() || subs == "\0" {
                None
            } else {
                let clean = subs.trim_matches(char::from(0));
                clean.parse::<i32>().ok()
            }
        })
        .collect()
}

/// Parse Person Name (PN) value
/// Format: "Family^Given^Middle^Prefix^Suffix" or multiple components with =
/// Returns JS object with parsed components
#[wasm_bindgen]
pub fn parse_person_name(value: &str) -> JsValue {
    let obj = js_sys::Object::new();
    
    if value.is_empty() {
        js_sys::Reflect::set(&obj, &"Alphanumeric".into(), &value.into()).ok();
        return obj.into();
    }
    
    // PN can have multiple components separated by =
    // Alphabetic=Ideographic=Phonetic
    let components: Vec<&str> = value.split('=').collect();
    
    // Parse alphabetic component (Family^Given^Middle^Prefix^Suffix)
    if let Some(alphabetic) = components.get(0) {
        let parts: Vec<&str> = alphabetic.split('^').collect();
        
        if let Some(family) = parts.get(0) {
            js_sys::Reflect::set(&obj, &"family".into(), &(*family).into()).ok();
        }
        if let Some(given) = parts.get(1) {
            js_sys::Reflect::set(&obj, &"given".into(), &(*given).into()).ok();
        }
        if let Some(middle) = parts.get(2) {
            js_sys::Reflect::set(&obj, &"middle".into(), &(*middle).into()).ok();
        }
        if let Some(prefix) = parts.get(3) {
            js_sys::Reflect::set(&obj, &"prefix".into(), &(*prefix).into()).ok();
        }
        if let Some(suffix) = parts.get(4) {
            js_sys::Reflect::set(&obj, &"suffix".into(), &(*suffix).into()).ok();
        }
        
        js_sys::Reflect::set(&obj, &"Alphanumeric".into(), &value.into()).ok();
    }
    
    // Ideographic component
    if let Some(ideographic) = components.get(1) {
        if !ideographic.is_empty() {
            js_sys::Reflect::set(&obj, &"Ideographic".into(), &(*ideographic).into()).ok();
        }
    }
    
    // Phonetic component
    if let Some(phonetic) = components.get(2) {
        if !phonetic.is_empty() {
            js_sys::Reflect::set(&obj, &"Phonetic".into(), &(*phonetic).into()).ok();
        }
    }
    
    obj.into()
}

/// Parse Date (DA) value
/// Format: YYYYMMDD
/// Returns ISO date string or original value if invalid
#[wasm_bindgen]
pub fn parse_date(value: &str) -> String {
    if value.len() != 8 {
        return value.to_string();
    }
    
    // Parse YYYYMMDD
    if let (Ok(year), Ok(month), Ok(day)) = (
        value[0..4].parse::<u32>(),
        value[4..6].parse::<u32>(),
        value[6..8].parse::<u32>(),
    ) {
        // Basic validation
        if year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31 {
            return format!("{:04}-{:02}-{:02}", year, month, day);
        }
    }
    
    value.to_string()
}

/// Parse Time (TM) value  
/// Format: HHMMSS.FFFFFF or HHMMSS
/// Returns ISO time string or original value if invalid
#[wasm_bindgen]
pub fn parse_time(value: &str) -> String {
    let time_part = if value.contains('.') {
        value.split('.').next().unwrap_or(value)
    } else {
        value
    };
    
    if time_part.len() < 6 {
        return value.to_string();
    }
    
    // Parse HHMMSS
    if let (Ok(hour), Ok(minute), Ok(second)) = (
        time_part[0..2].parse::<u32>(),
        time_part[2..4].parse::<u32>(),
        time_part[4..6].parse::<u32>(),
    ) {
        // Basic validation
        if hour < 24 && minute < 60 && second < 60 {
            let fraction = if value.contains('.') {
                value.split('.').nth(1).unwrap_or("")
            } else {
                ""
            };
            
            if !fraction.is_empty() {
                return format!("{:02}:{:02}:{:02}.{}", hour, minute, second, fraction);
            } else {
                return format!("{:02}:{:02}:{:02}", hour, minute, second);
            }
        }
    }
    
    value.to_string()
}

/**
 * Apply Modality LUT (Safe Multi-threaded Candidates?)
 * Converts raw byte data into Float32 array applying computed slope/intercept
 */
#[wasm_bindgen]
pub fn apply_modality_lut(
    pixel_data: &[u8],
    slope: f32,
    intercept: f32,
    bits_allocated: u8,
    pixel_representation: u8, // 0 = unsigned, 1 = signed
) -> Vec<f32> {
    let len = pixel_data.len();
    let mut out = Vec::with_capacity(len / (if bits_allocated > 8 { 2 } else { 1 }));

    if bits_allocated == 8 {
        for &b in pixel_data {
            out.push((b as f32) * slope + intercept);
        }
    } else if bits_allocated == 16 {
        // Handle 16-bit
        if pixel_representation == 1 {
            // Signed
            // Interpret as i16 (little endian)
            for chunk in pixel_data.chunks(2) {
                if chunk.len() == 2 {
                    let val = i16::from_le_bytes([chunk[0], chunk[1]]);
                    out.push((val as f32) * slope + intercept);
                }
            }
        } else {
            // Unsigned
            // Interpret as u16 (little endian)
            for chunk in pixel_data.chunks(2) {
                if chunk.len() == 2 {
                    let val = u16::from_le_bytes([chunk[0], chunk[1]]);
                    out.push((val as f32) * slope + intercept);
                }
            }
        }
    }
    // Else unsupported for now in this optimized path, returns empty or partial.
    // In real world, 8 and 16 are 99% of cases.
    
    out
}

/**
 * Apply VOI LUT (Window/Level)
 * Maps Float32 data -> Uint8 display data (0-255)
 */
#[wasm_bindgen]
pub fn apply_voi_lut(
    input: &[f32],
    window_center: f32,
    window_width: f32,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    
    // Safety check
    if window_width <= 0.0 {
        // Fallback or binary? Just return 0s to avoid div by zero
        return vec![0; input.len()];
    }

    let ww = window_width;
    let wc = window_center;
    let half_width = ww / 2.0;
    let lower = wc - half_width;
    let upper = wc + half_width - 1.0; 

    for &val in input {
        if val <= lower {
            out.push(0);
        } else if val > upper {
            out.push(255);
        } else {
            let res = ((val - lower) / ww) * 255.0;
            if res < 0.0 { out.push(0); }
            else if res > 255.0 { out.push(255); }
            else { out.push(res as u8); }
        }
    }
    
    out
}
