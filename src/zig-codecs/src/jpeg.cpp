
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

WASM_EXPORT int encode_jpeg(const uint8_t* pixel_data, size_t len, uint32_t width, uint32_t height, int bits, int components, int quality) {
    tjhandle handle = tj3Init(TJINIT_COMPRESS);
    if (!handle) return -1;

    tj3Set(handle, TJPARAM_QUALITY, quality);
    tj3Set(handle, TJPARAM_SUBSAMP, TJSAMP_444); // Default to no subsampling for max quality/compat

    int pixelFormat = TJPF_RGB;
    if (components == 1) pixelFormat = TJPF_GRAY;
    else if (components == 3) pixelFormat = TJPF_RGB;
    else if (components == 4) pixelFormat = TJPF_RGBA; // TurboJPEG assumes RGBA for 4 comp
    else {
        tj3Destroy(handle);
        return -5; // Unsupported component count
    }

    uint8_t** jpegBufPtr = (uint8_t**)malloc(sizeof(uint8_t*));
    size_t* jpegSizePtr = (size_t*)malloc(sizeof(size_t));
    *jpegBufPtr = NULL;
    *jpegSizePtr = 0;

    int res = 0;
    if (bits <= 8) {
        res = tj3Compress8(handle, pixel_data, width, 0, height, pixelFormat, jpegBufPtr, jpegSizePtr);
    } else if (bits <= 12) {
        res = tj3Compress12(handle, (const short*)pixel_data, width, 0, height, pixelFormat, jpegBufPtr, jpegSizePtr);
    } else {
        res = tj3Compress16(handle, (const unsigned short*)pixel_data, width, 0, height, pixelFormat, jpegBufPtr, jpegSizePtr);
    }

    if (res != 0) {
        if (*jpegBufPtr) tj3Free(*jpegBufPtr);
        free(jpegBufPtr);
        free(jpegSizePtr);
        tj3Destroy(handle);
        return -2;
    }

    // Copy to result buffer using generic malloc to be safe and consistent
    size_t size = *jpegSizePtr;
    uint8_t* result = (uint8_t*)malloc(size);
    memcpy(result, *jpegBufPtr, size);

    tj3Free(*jpegBufPtr);
    free(jpegBufPtr);
    free(jpegSizePtr);
    tj3Destroy(handle);

    set_result(result, size);
    return 0;
}

}
