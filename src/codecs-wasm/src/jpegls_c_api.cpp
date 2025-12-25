#include <charls/charls.h>
#include <cstdlib>
#include <cstring>
#include <cstdio>

#ifdef __cplusplus
extern "C" {
#endif

struct EncodedData {
    uint8_t* data;
    size_t size;
    int32_t error;
    char error_msg[256];
};

// Clean up helper
void free_encoded_data(EncodedData* res) {
    if (res) {
        if (res->data) {
            free(res->data);
            res->data = nullptr;
        }
        free(res);
    }
}

// Main encoding function using CharLS C API
// Wrapped in try-catch to convert exceptions to error codes
EncodedData* encode_jpegls(void* source, size_t source_size, int width, int height, int bits_per_sample, int components) {
    printf("JPEGLS: w=%d h=%d bits=%d comps=%d size=%zu\n", width, height, bits_per_sample, components, source_size);
    fflush(stdout);

    // Validate input parameters early
    if (!source || source_size == 0 || width <= 0 || height <= 0 || bits_per_sample <= 0 || components <= 0) {
        printf("JPEGLS: Invalid parameters\n");
        fflush(stdout);
        return nullptr;
    }

    // Expected size check
    size_t expected_size = (size_t)width * height * components * ((bits_per_sample + 7) / 8);
    if (source_size < expected_size) {
        printf("JPEGLS: Buffer too small: got %zu, expected %zu\n", source_size, expected_size);
        fflush(stdout);
        return nullptr;
    }

    // Allocate result struct
    EncodedData* result = (EncodedData*)malloc(sizeof(EncodedData));
    if (!result) {
        printf("JPEGLS: Failed to allocate result struct\n");
        fflush(stdout);
        return nullptr;
    }
    memset(result, 0, sizeof(EncodedData));

#if defined(__EXCEPTIONS) || defined(__cpp_exceptions)
    try {
#endif
        // Create encoder
        charls_jpegls_encoder* encoder = charls_jpegls_encoder_create();
        if (!encoder) {
            printf("JPEGLS: Failed to create encoder\n");
            fflush(stdout);
            result->error = 1;
            strncpy(result->error_msg, "Failed to create encoder", 255);
            return result;
        }

        // Set frame info
        charls_frame_info frame_info = {};
        frame_info.width = (uint32_t)width;
        frame_info.height = (uint32_t)height;
        frame_info.bits_per_sample = bits_per_sample;
        frame_info.component_count = components;

        charls_jpegls_errc err = charls_jpegls_encoder_set_frame_info(encoder, &frame_info);
        if (err != charls_jpegls_errc::success) {
            printf("JPEGLS: Set frame info failed: %d\n", (int)err);
            fflush(stdout);
            result->error = (int)err;
            strncpy(result->error_msg, "Failed to set frame info", 255);
            charls_jpegls_encoder_destroy(encoder);
            return result;
        }

        // Get estimated size
        size_t est_size = 0;
        err = charls_jpegls_encoder_get_estimated_destination_size(encoder, &est_size);
        if (err != charls_jpegls_errc::success) {
            printf("JPEGLS: Get estimated size failed: %d\n", (int)err);
            fflush(stdout);
            result->error = (int)err;
            strncpy(result->error_msg, "Failed to estimate size", 255);
            charls_jpegls_encoder_destroy(encoder);
            return result;
        }

        printf("JPEGLS: Estimated output size: %zu\n", est_size);
        fflush(stdout);

        // Allocate destination buffer
        result->data = (uint8_t*)malloc(est_size);
        if (!result->data) {
            printf("JPEGLS: Failed to allocate dest buffer (%zu bytes)\n", est_size);
            fflush(stdout);
            result->error = 2;
            strncpy(result->error_msg, "Failed to alloc dest buffer", 255);
            charls_jpegls_encoder_destroy(encoder);
            return result;
        }

        // Set destination buffer
        err = charls_jpegls_encoder_set_destination_buffer(encoder, result->data, est_size);
        if (err != charls_jpegls_errc::success) {
            printf("JPEGLS: Set dest buffer failed: %d\n", (int)err);
            fflush(stdout);
            result->error = (int)err;
            strncpy(result->error_msg, "Failed to set dest buffer", 255);
            charls_jpegls_encoder_destroy(encoder);
            return result;
        }

        // Calculate stride (bytes per row)
        uint32_t stride = (uint32_t)(width * components * ((bits_per_sample + 7) / 8));
        printf("JPEGLS: Stride: %u, calling encode...\n", stride);
        fflush(stdout);

        // Encode
        err = charls_jpegls_encoder_encode_from_buffer(encoder, source, source_size, stride);
        if (err != charls_jpegls_errc::success) {
            printf("JPEGLS: Encode failed: %d\n", (int)err);
            fflush(stdout);
            result->error = (int)err;
            strncpy(result->error_msg, "Encoding failed", 255);
            charls_jpegls_encoder_destroy(encoder);
            return result;
        }

        // Get bytes written
        size_t written = 0;
        charls_jpegls_encoder_get_bytes_written(encoder, &written);
        result->size = written;

        printf("JPEGLS: Encode success, wrote %zu bytes\n", written);
        fflush(stdout);

        charls_jpegls_encoder_destroy(encoder);
        return result;
#if defined(__EXCEPTIONS) || defined(__cpp_exceptions)
    } catch (const std::exception& e) {
        printf("JPEGLS: C++ exception: %s\n", e.what());
        fflush(stdout);
        result->error = 100;
        strncpy(result->error_msg, e.what(), 255);
        return result;
    } catch (...) {
        printf("JPEGLS: Unknown C++ exception\n");
        fflush(stdout);
        result->error = 101;
        strncpy(result->error_msg, "Unknown exception", 255);
        return result;
    }
#endif
}

// Dummy main for WASI
int main() {
    return 0;
}

#ifdef __cplusplus
} // extern "C"
#endif
