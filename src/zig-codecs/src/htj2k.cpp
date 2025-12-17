
#include <cstdlib>
#include <cstring>
#include <vector>

#include "ojph_arch.h"
#include "ojph_mem.h"
#include "ojph_file.h"
#include "ojph_codestream.h"
#include "ojph_params.h"
#include "ojph_message.h"

// Define WASM_EXPORT
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WASM_EXPORT __attribute__((visibility("default"))) __attribute__((used))
#endif

// Global result buffer management (similar to other codecs)
static uint8_t* g_result_data = nullptr;
static size_t g_result_len = 0;

extern "C" {

WASM_EXPORT void* get_result_ptr() { return g_result_data; }
WASM_EXPORT size_t get_result_size() { return g_result_len; }
WASM_EXPORT void free_result() {
    if (g_result_data) free(g_result_data);
    g_result_data = nullptr;
    g_result_len = 0;
}

// Set result helper
static void set_result(uint8_t* data, size_t len) {
    free_result();
    g_result_data = data;
    g_result_len = len;
}

WASM_EXPORT int decode_htj2k(const uint8_t* src, size_t src_len) {
    if (!src || src_len == 0) return -1;

    try {
        ojph::mem_infile mem_file;
        mem_file.open(src, src_len);

        ojph::codestream codestream;
        codestream.read_headers(&mem_file);

        ojph::param_siz siz = codestream.access_siz();
        ojph::ui32 num_comps = siz.get_num_components();
        
        // Calculate output dimensions and buffer size
        // We assume all components have same size for simplicity, or we flatten them?
        // Standard DICOM is usually 1 or 3 comps, same dims.
        ojph::ui32 width = siz.get_recon_width(0);
        ojph::ui32 height = siz.get_recon_height(0);
        ojph::ui32 depth = siz.get_bit_depth(0); // Bit depth
        
        // Basic validation for supported formats (8 or 16 bit)
        size_t bytes_per_sample = (depth > 8) ? 2 : 1;
        size_t total_size = width * height * num_comps * bytes_per_sample;

        uint8_t* dest = (uint8_t*)malloc(total_size);
        if (!dest) return -2;

        codestream.create();
        codestream.set_planar(false); // Interleaved output (RGBRGB...)

        // Pull lines and write to buffer
        ojph::ui32 dest_offset = 0;
        
        for (ojph::ui32 y = 0; y < height; ++y) {
            for (ojph::ui32 c = 0; c < num_comps; ++c) {
                ojph::ui32 comp_num;
                ojph::line_buf* line = codestream.pull(comp_num);
                
                // line->i32 contains 32-bit integers. We need to pack them.
                // We are iterating c inside y, but codestream.pull might assert if we don't follow order?
                // set_planar(false) means we pull line for comp 0, then comp 1, then comp 2 for row y.
                
                // Copy line data to dest
                // Note: OpenJPH returns 32-bit signed ints.
                const ojph::si32* src_line = line->i32;
                
                // We need to write into dest at correct offset
                // But wait, if we are interleaved, we write pixel by pixel?
                // No, pull gives a whole line for one component.
                // So if interleaved (R G B R G B), we have 3 lines buffer?
                // Actually, if set_planar(false), we get lines for each component in sequence.
                // But we need to interleave them into the destination buffer?
                // DICOM usually expects standard Photometric Interpretation.
                // Re-reading ojph_expand.cpp:
                // if (codestream.is_planar()) { ... loops c then y ... }
                // else { ... loops y then c ... }
                // base->write(line, comp_num) -> writes to file.
                
                // For memory buffer, strictly interleaved RGB is:
                // R0 G0 B0 R1 G1 B1 ...
                // But we get a full line of R, then full line of G...
                // So we need to interleave manually.
                
                if (bytes_per_sample == 1) {
                    uint8_t* d8 = dest + (y * width * num_comps) + c;
                    for (ojph::ui32 x = 0; x < width; ++x) {
                        int val = src_line[x];
                        // Clamp? OpenJPH should output within range?
                        // val += (is_signed ? 1<<(depth-1) : 0); // OpenJPH handles this?
                        // Usually raw output is desired.
                        if (val < 0) val = 0;
                        if (val > 255) val = 255;
                        *d8 = (uint8_t)val;
                        d8 += num_comps;
                    }
                } else {
                    uint16_t* d16 = (uint16_t*)dest + (y * width * num_comps) + c;
                    int max_val = (1 << depth) - 1;
                    for (ojph::ui32 x = 0; x < width; ++x) {
                        int val = src_line[x];
                        if (val < 0) val = 0;
                        if (val > max_val) val = max_val;
                        *d16 = (uint16_t)val;
                        d16 += num_comps;
                    }
                }
            }
        }

        codestream.close();
        mem_file.close();

        set_result(dest, total_size);
        return 0;

    } catch (...) {
        return -3; // Exception
    }
}

}
