
#include "common.h"
#include "turbojpeg.h"


// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

WASM_EXPORT int decode_jpeg(const uint8_t* src, size_t src_len) {
    tjhandle handle = tj3Init(TJINIT_DECOMPRESS);
    if (!handle) return -1;

    if (tj3DecompressHeader(handle, src, src_len) != 0) {
        tj3Destroy(handle);
        return -2;
    }

    int width = tj3Get(handle, TJPARAM_JPEGWIDTH);
    int height = tj3Get(handle, TJPARAM_JPEGHEIGHT);
    int precision = tj3Get(handle, TJPARAM_PRECISION);
    int pixelFormat = TJPF_RGB;

    size_t pixelSize = 3; // RGB
    if (precision > 8) {
        pixelSize = 6; // RGB * 2 bytes (short)
    }

    size_t dest_len = width * height * pixelSize;
    uint8_t* dest = (uint8_t*)malloc(dest_len);
    if (!dest) {
        tj3Destroy(handle);
        return -3;
    }

    int res = 0;
    if (precision <= 8) {
        res = tj3Decompress8(handle, src, src_len, dest, 0, pixelFormat);
    } else if (precision <= 12) {
        res = tj3Decompress12(handle, src, src_len, (short*)dest, 0, pixelFormat);
    } else {
        res = tj3Decompress16(handle, src, src_len, (unsigned short*)dest, 0, pixelFormat);
    }

    if (res != 0) {
        free(dest);
        tj3Destroy(handle);
        return -4;
    }

    tj3Destroy(handle);
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
