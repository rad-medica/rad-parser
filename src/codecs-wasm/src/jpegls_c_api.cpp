#include <charls/charls.h>
#include <string.h>
#include <stdlib.h>

#define WASM_EXPORT __attribute__((visibility("default"))) __attribute__((used))

// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

// Allocator for host to use
WASM_EXPORT void* alloc(size_t size) { return malloc(size); }
WASM_EXPORT void free_ptr(void* ptr) { free(ptr); }

WASM_EXPORT int encode_jpegls(const uint8_t* source, size_t source_size,
                              uint8_t** dest, size_t* dest_size,
                              size_t width, size_t height,
                              size_t bits_per_sample, size_t components) {
    if (!source || source_size == 0) return 1;

    charls_jpegls_encoder* encoder = charls_jpegls_encoder_create();
    if (!encoder) return 4;

    charls_frame_info frame_info;
    frame_info.width = (uint32_t)width;
    frame_info.height = (uint32_t)height;
    frame_info.bits_per_sample = (uint32_t)bits_per_sample;
    frame_info.component_count = (uint32_t)components;

    charls_jpegls_errc err = charls_jpegls_encoder_set_frame_info(encoder, &frame_info);
    if ((int)err != 0) {
        charls_jpegls_encoder_destroy(encoder);
        return 4;
    }

    if (components > 1) {
        charls_jpegls_encoder_set_interleave_mode(encoder, (charls_interleave_mode)1); // Line interleave
    } else {
        charls_jpegls_encoder_set_interleave_mode(encoder, (charls_interleave_mode)0); // None
    }

    size_t est_size;
    charls_jpegls_encoder_get_estimated_destination_size(encoder, &est_size);

    uint8_t* buffer = (uint8_t*)malloc(est_size);
    if (!buffer) {
        charls_jpegls_encoder_destroy(encoder);
        return 5;
    }

    err = charls_jpegls_encoder_set_destination_buffer(encoder, buffer, est_size);
    if ((int)err != 0) {
        free(buffer);
        charls_jpegls_encoder_destroy(encoder);
        return 4;
    }

    uint32_t stride = (uint32_t)(width * components * ((bits_per_sample + 7) / 8));
    err = charls_jpegls_encoder_encode_from_buffer(encoder, source, source_size, stride);
    if ((int)err != 0) {
        free(buffer);
        charls_jpegls_encoder_destroy(encoder);
        return 6;
    }

    size_t written;
    charls_jpegls_encoder_get_bytes_written(encoder, &written);

    *dest = buffer;
    *dest_size = written;

    charls_jpegls_encoder_destroy(encoder);
    return 0;
}

WASM_EXPORT int free_encoded_data(uint8_t* ptr) {
    free(ptr);
    return 0;
}

}
