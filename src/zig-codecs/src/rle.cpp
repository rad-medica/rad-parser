
#include "common.h"
#include <string.h>


// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

WASM_EXPORT int decode_rle(const uint8_t* data, size_t len, uint32_t width, uint32_t height, uint32_t components) {
    if (len < 64) return -1;
    
    uint32_t* header = (uint32_t*)data;
    uint32_t num_segments = header[0];
    if (num_segments != components) return -2;
    
    // 15 segment offsets
    uint32_t* offsets = &header[1];
    
    size_t dest_len = width * height * components;
    uint8_t* dest = (uint8_t*)malloc(dest_len);
    if (!dest) return -3;
    
    for (uint32_t s = 0; s < num_segments; ++s) {
        size_t start = offsets[s];
        size_t end = (s + 1 < num_segments) ? offsets[s+1] : len;
        if (end > len) end = len;
        if (start >= end) continue; // Empty or invalid?
        
        size_t src_idx = start;
        size_t dest_idx = s; // Interleaved output
        
        while (src_idx < end && dest_idx < dest_len) {
            int8_t n = (int8_t)data[src_idx++];
            
            if (n >= 0) {
                // Literal
                int count = n + 1;
                for (int k = 0; k < count; ++k) {
                    if (src_idx >= end) break;
                    if (dest_idx < dest_len) {
                        dest[dest_idx] = data[src_idx++];
                        dest_idx += components;
                    }
                }
            } else if (n > -128) {
                // Repeat
                int count = -n + 1;
                uint8_t val = data[src_idx++];
                for (int k = 0; k < count; ++k) {
                     if (dest_idx < dest_len) {
                         dest[dest_idx] = val;
                         dest_idx += components;
                     }
                }
            }
        }
    }
    
    set_result(dest, dest_len);
    return 0;
}

WASM_EXPORT int encode_rle(const uint8_t* src, size_t len, uint32_t width, uint32_t height, uint32_t components) {
    if (!src || len == 0 || components == 0) return -1;
    
    // 1. Deinterleave separate channels if components > 1
    // RLE is natively planar.
    size_t num_pixels = width * height;
    if (len < num_pixels * components) return -2;

    // Allocate temporary buffers for channels
    uint8_t** channels = (uint8_t**)malloc(components * sizeof(uint8_t*));
    if (!channels) return -3;
    
    for (uint32_t c = 0; c < components; ++c) {
        channels[c] = (uint8_t*)malloc(num_pixels);
        if (!channels[c]) {
             // Cleanup if fail
             for (uint32_t k=0; k<c; ++k) free(channels[k]);
             free(channels);
             return -3;
        }
    }

    // Split planarly
    // Assuming input is interleaved (R G B R G B...) 
    // If input is already planar, we might need a flag, but standard is interleaved pixel data.
    const uint8_t* sptr = src;
    for (size_t i = 0; i < num_pixels; ++i) {
        for (uint32_t c = 0; c < components; ++c) {
            channels[c][i] = *sptr++;
        }
    }

    // 2. Compress each channel
    // Max expansion is small for RLE, but let's be safe. Worst case: 128 -> 129 bytes (literal run).
    size_t max_dest_len = len * 2 + 512; 
    uint8_t* output = (uint8_t*)malloc(max_dest_len);
    if (!output) {
         for (uint32_t c = 0; c < components; ++c) free(channels[c]);
         free(channels);
         return -4;
    }
    
    // Header: 16 uint32s (64 bytes)
    uint32_t* header = (uint32_t*)output;
    memset(header, 0, 64);
    header[0] = components;
    
    size_t current_offset = 64;
    
    for (uint32_t c = 0; c < components; ++c) {
        header[c+1] = (uint32_t)current_offset;
        
        // PackBits compression for channel c
        const uint8_t* in = channels[c];
        size_t in_len = num_pixels;
        size_t in_idx = 0;
        
        while (in_idx < in_len) {
            // Find run
            size_t run_start = in_idx;
            in_idx++;
            while (in_idx < in_len && in_idx - run_start < 128 && in[in_idx] == in[in_idx-1]) {
                in_idx++;
            }
            
            int run_len = (int)(in_idx - run_start);
            
            if (run_len >= 2) {
                // Encode Run
                output[current_offset++] = (uint8_t)(-(run_len - 1)); // -1 to -127
                output[current_offset++] = in[run_start];
            } else {
                // Literal run (backtrack single byte if it wasn't a run > 1)
                in_idx = run_start; 
                
                size_t lit_start = in_idx;
                // Find length of literal run
                // Stop if we hit end, max length (128), or a run of 3 identical bytes (worth breaking for RLE)
                while (in_idx < in_len && (in_idx - lit_start) < 128) {
                    if (in_idx + 2 < in_len && in[in_idx] == in[in_idx+1] && in[in_idx] == in[in_idx+2]) {
                        break; 
                    }
                    in_idx++;
                }
                
                int lit_len = (int)(in_idx - lit_start);
                output[current_offset++] = (uint8_t)(lit_len - 1); // 0 to 127
                for (int k=0; k<lit_len; ++k) {
                    output[current_offset++] = in[lit_start + k];
                }
            }
            
            if (current_offset >= max_dest_len - 128) {
                 // Overflow danger (unlikely with generous buffer, but good practice)
                 // Realloc logic omitted for brevity in minimal C++
                 break; 
            }
        }
        
        // Done with channel
        free(channels[c]);
    }
    free(channels);

    // Set result
    set_result(output, current_offset);
    return 0;
}

}
