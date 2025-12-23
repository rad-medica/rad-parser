#include <stdio.h>
#include "common.h"
#include "turbojpeg.h"

// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

WASM_EXPORT int decode_jpeg(const uint8_t* src, size_t src_len) {
    return -1;
}

WASM_EXPORT int encode_jpeg(const uint8_t* pixel_data, size_t len, uint32_t width, uint32_t height, int bits, int components, int quality) {
    if (bits > 8) return -55; // Safety check
    // printf("DEBUG: encode_jpeg start w=%d h=%d\n", width, height);
    // Commented out to avoid crash if printf not supported? NO, I WANT TO TEST IT.
    // Hack: use a dedicated imported function if printf fails?
    // Let's TRY printf.
    // actually, zig's libc should handle printf if using wasm32-wasi?
    // But if loader doesn't provide it...
    // Let's comment it out for now and return -1 immediately to test if it even ENTERS.
    // return -999; // Removed as per instruction

    tjhandle handle = tj3Init(TJINIT_COMPRESS);
    if (!handle) return -1;

    tj3Set(handle, TJPARAM_QUALITY, quality);
    int pixelFormat = TJPF_RGB;
    if (components == 1) {
        pixelFormat = TJPF_GRAY;
        tj3Set(handle, TJPARAM_SUBSAMP, TJSAMP_GRAY);
    }
    else if (components == 3) {
        pixelFormat = TJPF_RGB;
        tj3Set(handle, TJPARAM_SUBSAMP, TJSAMP_444);
    }
    else if (components == 4) {
        pixelFormat = TJPF_RGBA;
        tj3Set(handle, TJPARAM_SUBSAMP, TJSAMP_444);
    }
    else {
        tj3Destroy(handle);
        return -5;
    }

    // EARLY EXIT TESTING
    // tj3Destroy(handle);
    // return -998;



    if (!pixel_data) return -50;
    if (width == 0 || height == 0) return -51;

    // Dynamic allocation by TurboJPEG
    uint8_t* out_buffer = NULL;
    size_t out_len = 0;

    // For tj3Compress8 with pre-allocated buffer, *jpegSize should contain the buffer size
    int res = tj3Compress8(handle, pixel_data, width, 0, height, pixelFormat, &out_buffer, &out_len);
    tj3Destroy(handle);

    if (res != 0) {
        if (out_buffer) tj3Free(out_buffer); // Use tj3Free if allocated
        return res;
    }

    // Must copy to malloc'd buffer because set_result usage?
    // Actually set_result just sets pointer.
    // IF tj3Alloc uses SAME allocator as malloc (libc), we can just use it?
    // But zig wrapped malloc.
    // Let's assume we need to free it with tj3Free later?
    // set_result passes ownership to JS... JS code will free it?
    // NO. JS code doesn't free result buffer?
    // actually zig-codecs.ts copies it out immediately:
    // const result = new Uint8Array(exports.memory.buffer, exports.get_result_ptr(), exports.get_result_len()).slice();
    // So we just need it to survive until then.
    // We should register it for cleanup?
    // Or just leak it for now (it's one shot).

    set_result(out_buffer, out_len);
    return 0;
}

}
