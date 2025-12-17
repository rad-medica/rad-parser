
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

WASM_EXPORT int encode_rle(const uint8_t* val, size_t len, uint32_t width, uint32_t height, uint32_t components) {
     // Placeholder: Copy input + header, or just dummy compressed
     // Proper RLE encoding logic is needed if user encodes.
     // For now, mirroring previous limited logic or improved version.
     
     // To keep simple and compilation-focused:
     size_t max_size = len * 2 + 64;
     uint8_t* dest = (uint8_t*)malloc(max_size);
     if (!dest) return -1;
     
     uint32_t* header = (uint32_t*)dest;
     header[0] = components;
     // Dummy: Everything pointing to end
     // Real implementation deferred or copied from Zig logic if critical now.
     
     free(dest);
     return -1; // Not implemented fully yet
}

}
