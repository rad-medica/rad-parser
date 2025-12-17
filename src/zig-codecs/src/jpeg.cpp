
#include "common.h"
#include "turbojpeg.h"


// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

WASM_EXPORT int decode_jpeg(const uint8_t* src, size_t src_len) {
    tjhandle handle = tjInitDecompress();
    if (!handle) return -1;

    int width, height, subsamp, colorspace;
    if (tjDecompressHeader3(handle, src, src_len, &width, &height, &subsamp, &colorspace) != 0) {
        tjDestroy(handle);
        return -2;
    }

    size_t dest_len = width * height * 3;
    uint8_t* dest = (uint8_t*)malloc(dest_len);
    if (!dest) {
        tjDestroy(handle);
        return -3;
    }

    if (tjDecompress2(handle, src, src_len, dest, width, 0, height, TJPF_RGB, TJFLAG_FASTDCT) != 0) {
        free(dest);
        tjDestroy(handle);
        return -4;
    }

    tjDestroy(handle);
    set_result(dest, dest_len);
    return 0;
}

WASM_EXPORT int encode_jpeg(const uint8_t* pixel_data, size_t len, uint32_t width, uint32_t height, int quality) {
    tjhandle handle = tjInitCompress();
    if (!handle) return -1;

    uint8_t* jpeg_buf = NULL;
    unsigned long jpeg_size = 0;

    if (tjCompress2(handle, pixel_data, width, 0, height, TJPF_RGB, &jpeg_buf, &jpeg_size, TJSAMP_444, quality, TJFLAG_FASTDCT) != 0) {
        tjDestroy(handle);
        return -2;
    }

    tjDestroy(handle);
    
    // Copy to own buffer to ensure compatibility with free_ptr/allocator if needed,
    // although TJ uses its own allocator. We want unified memory management.
    uint8_t* result = (uint8_t*)malloc(jpeg_size);
    memcpy(result, jpeg_buf, jpeg_size);
    tjFree(jpeg_buf);

    set_result(result, jpeg_size);
    return 0;
}

}
