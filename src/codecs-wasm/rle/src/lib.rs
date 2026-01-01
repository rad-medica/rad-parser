use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn decode_rle(input: &[u8], width: u32, height: u32, components: u32) -> Result<Vec<u8>, JsValue> {
    if input.len() < 64 { return Err(JsValue::from_str("Input too short")); }

    // Header: num_segments (u32 LE)
    let num_segments = u32::from_le_bytes([input[0], input[1], input[2], input[3]]);

    if num_segments != components && !(num_segments == 2 && components == 1) {
        return Err(JsValue::from_str("Segment count mismatch"));
    }

    // Read 15 offsets (u32 LE)
    let mut offsets = [0usize; 15];
    for i in 0..15 {
        let idx = 4 + i * 4;
        offsets[i] = u32::from_le_bytes([input[idx], input[idx+1], input[idx+2], input[idx+3]]) as usize;
    }

    let is_16bit_single = num_segments == 2 && components == 1;
    let dest_len = (width * height * components * (if is_16bit_single { 2 } else { 1 })) as usize;

    let mut dest = vec![0u8; dest_len];

    if is_16bit_single {
        let num_pixels = (width * height) as usize;
        let mut msb_buf = vec![0u8; num_pixels];
        let mut lsb_buf = vec![0u8; num_pixels];

        for s in 0..2 {
            let start = offsets[s];
            let end = if s + 1 < 15 && offsets[s+1] > 0 { offsets[s+1] } else { input.len() };
            let end = std::cmp::min(end, input.len());
            if start >= end { continue; }

            let seg_buf = if s == 0 { &mut msb_buf } else { &mut lsb_buf };
            decode_segment(&input[start..end], seg_buf);
        }

        // Interleave: LSB, MSB (Little Endian)
        for p in 0..num_pixels {
            dest[p * 2] = lsb_buf[p];
            dest[p * 2 + 1] = msb_buf[p];
        }

    } else {
        // Standard Planar
        for s in 0..num_segments as usize {
            let start = offsets[s];
            let end = if s + 1 < 15 && offsets[s+1] > 0 { offsets[s+1] } else { input.len() };
            let end = std::cmp::min(end, input.len());
            if start >= end { continue; }

            let num_pixels = (width * height) as usize;
            let mut channel_buf = vec![0u8; num_pixels];
            decode_segment(&input[start..end], &mut channel_buf);

            let comp_count = components as usize;
            for (i, &val) in channel_buf.iter().enumerate() {
                if i * comp_count + s < dest_len {
                    dest[i * comp_count + s] = val;
                }
            }
        }
    }

    Ok(dest)
}

fn decode_segment(src: &[u8], dest: &mut [u8]) {
    let mut src_idx = 0;
    let mut dest_idx = 0;
    let src_len = src.len();
    let dest_len = dest.len();

    while src_idx < src_len && dest_idx < dest_len {
        let n = src[src_idx] as i8;
        src_idx += 1;

        if n >= 0 {
            // Literal
            let count = (n + 1) as usize;
            for _ in 0..count {
                if src_idx < src_len && dest_idx < dest_len {
                    dest[dest_idx] = src[src_idx];
                    src_idx += 1;
                    dest_idx += 1;
                }
            }
        } else if n > -128 {
            // Repeat
            let count = (-n + 1) as usize;
            if src_idx < src_len {
                let val = src[src_idx];
                src_idx += 1;
                for _ in 0..count {
                    if dest_idx < dest_len {
                        dest[dest_idx] = val;
                        dest_idx += 1;
                    }
                }
            }
        }
    }
}

#[wasm_bindgen]
pub fn encode_rle(input: &[u8], width: u32, height: u32, components: u32) -> Result<Vec<u8>, JsValue> {
    if input.is_empty() || components == 0 { return Err(JsValue::from_str("Invalid input")); }
    let num_pixels = (width * height) as usize;
    if input.len() < num_pixels * components as usize { return Err(JsValue::from_str("Input too short")); }

    let mut output = Vec::with_capacity(input.len() + 1024);
    output.extend_from_slice(&[0u8; 64]);

    let comp_bytes = (components as u32).to_le_bytes();
    output[0] = comp_bytes[0];
    output[1] = comp_bytes[1];
    output[2] = comp_bytes[2];
    output[3] = comp_bytes[3];

    for c in 0..components as usize {
        let offset = output.len() as u32;
        let idx = 4 + c * 4;
        let off_bytes = offset.to_le_bytes();
        output[idx] = off_bytes[0];
        output[idx+1] = off_bytes[1];
        output[idx+2] = off_bytes[2];
        output[idx+3] = off_bytes[3];

        let mut channel = Vec::with_capacity(num_pixels);
        for i in 0..num_pixels {
            channel.push(input[i * components as usize + c]);
        }

        encode_segment(&channel, &mut output);
    }

    Ok(output)
}

fn encode_segment(data: &[u8], output: &mut Vec<u8>) {
    let mut in_idx = 0;
    let len = data.len();

    while in_idx < len {
        let run_start = in_idx;
        in_idx += 1;
        while in_idx < len && (in_idx - run_start) < 128 && data[in_idx] == data[in_idx - 1] {
            in_idx += 1;
        }

        let run_len = in_idx - run_start;

        if run_len >= 2 {
            output.push((-(run_len as i32 - 1)) as u8);
            output.push(data[run_start]);
        } else {
            in_idx = run_start;
            let lit_start = in_idx;
            while in_idx < len && (in_idx - lit_start) < 128 {
                if in_idx + 2 < len && data[in_idx] == data[in_idx+1] && data[in_idx] == data[in_idx+2] {
                    break;
                }
                in_idx += 1;
            }
            let lit_len = in_idx - lit_start;
            output.push((lit_len as i32 - 1) as u8);
            output.extend_from_slice(&data[lit_start..in_idx]);
        }
    }
}
