
#include "common.h"
#include "charls/charls.h"


// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {
WASM_EXPORT int decode_jpegls(const uint8_t* src, size_t src_len) {
    charls_jpegls_decoder* decoder = charls_jpegls_decoder_create();
    if (!decoder) return -1;

    charls_jpegls_errc error = charls_jpegls_decoder_set_source_buffer(decoder, src, src_len);
    if (error != charls_jpegls_errc::success) {
        charls_jpegls_decoder_destroy(decoder);
        return (int)error;
    }

    error = charls_jpegls_decoder_read_header(decoder);
    if (error != charls_jpegls_errc::success) {
        charls_jpegls_decoder_destroy(decoder);
        return (int)error;
    }

    charls_frame_info frame_info;
    error = charls_jpegls_decoder_get_frame_info(decoder, &frame_info);
    if (error != charls_jpegls_errc::success) {
         charls_jpegls_decoder_destroy(decoder);
         return (int)error;
    }

    size_t dest_len = 0;
    error = charls_jpegls_decoder_get_destination_size(decoder, 0, &dest_len);
    if (error != charls_jpegls_errc::success) {
         charls_jpegls_decoder_destroy(decoder);
         return (int)error;
    }

    uint8_t* dest = (uint8_t*)malloc(dest_len);
    if (!dest) {
        charls_jpegls_decoder_destroy(decoder);
        return -100;
    }

    error = charls_jpegls_decoder_decode_to_buffer(decoder, dest, dest_len, 0);
    if (error != charls_jpegls_errc::success) {
        free(dest);
        charls_jpegls_decoder_destroy(decoder);
        return (int)error;
    }

    charls_jpegls_decoder_destroy(decoder);
    set_result(dest, dest_len);
    return 0;
}

WASM_EXPORT int encode_jpegls(const uint8_t* pixel_data, size_t len, uint32_t width, uint32_t height, uint8_t bits_per_sample, uint8_t components) {
    charls_jpegls_encoder* encoder = charls_jpegls_encoder_create();
    if (!encoder) return -1;
    // return -889; // Created ok

    charls_frame_info frame_info = {};
    frame_info.width = width;
    frame_info.height = height;
    frame_info.bits_per_sample = bits_per_sample;
    frame_info.component_count = components;

    charls_jpegls_errc error = charls_jpegls_encoder_set_frame_info(encoder, &frame_info);
    if (error != charls_jpegls_errc::success) { charls_jpegls_encoder_destroy(encoder); return (int)error; }
    // return -890; // Frame info set ok

    if (components > 1) {
         error = charls_jpegls_encoder_set_interleave_mode(encoder, charls_interleave_mode::line);
         if (error != charls_jpegls_errc::success) { charls_jpegls_encoder_destroy(encoder); return (int)error; }
    }
    // return -891; // Interleave ok

    size_t encoded_len = 0;
    error = charls_jpegls_encoder_get_estimated_destination_size(encoder, &encoded_len);
    if (error != charls_jpegls_errc::success) { charls_jpegls_encoder_destroy(encoder); return (int)error; }
    // return -892; // Estimate ok

    encoded_len += 4096; // Safety padding


    uint8_t* encoded_buf = (uint8_t*)malloc(encoded_len);
    if (!encoded_buf) { charls_jpegls_encoder_destroy(encoder); return -101; }

    error = charls_jpegls_encoder_set_destination_buffer(encoder, encoded_buf, encoded_len);
    if (error != charls_jpegls_errc::success) { free(encoded_buf); charls_jpegls_encoder_destroy(encoder); return (int)error; }
    // return -893; // Dest buffer set ok
    // return -893;



    // The CRASH happens here likely?
    // Try DUMMY DATA 8-BIT
    // frame_info.bits_per_sample = 8; // Need to UPDATE frame_info too?
    // Actually set_frame_info was called earlier.
    // So we should re-create encoder or just test 8-bit flow logic.
    // Let's hack it: if this crashes, library is fundamentally broken or environment.
    size_t dummy_len = width * height * components; // 8-bit
    uint8_t* dummy_data = (uint8_t*)malloc(dummy_len);
    memset(dummy_data, 0, dummy_len);

    // We can't change frame_info easily without reset.
    // But wait, "Unreachable" means it crashes inside.
    // Let's Just Return -100 to prove we reached here (we verify this before).
    // The previous run crashed AT encode_from_buffer.
    // So if 16-bit dummy crashed, it's 16-bit specific or general.

    // I will try to create a NEW encoder for 8-bit test inside here?
    // No, too complex.
    // I will just change the existing flow to use 8-bit if I can.
    // But I entered with 16-bit args.

    // Let's assume 16-bit is broken.
    // I will revert to using `pixel_data` but I'll cast it?
    // No.

    // I will disable JPEG-LS for now?
    // Users asked to FIX it.

    // If CharLS is broken on WASM...
    // I can try to use `charls_jpegls_encoder_encode_from_buffer` with `stride=0`?
    // I did that.

    // Let's try to pass `stride` explicitly.
    // Stride = width * components * ((bits+7)/8).
    uint32_t stride = width * components * ((bits_per_sample + 7)/8);
    error = charls_jpegls_encoder_encode_from_buffer(encoder, pixel_data, len, stride);

    free(dummy_data); // unused now


    if (error != charls_jpegls_errc::success) {
        // If it throws/aborts, we won't get here.
        free(encoded_buf); charls_jpegls_encoder_destroy(encoder); return (int)error;
    }


    // Success...
    size_t bytes_written = 0;
    charls_jpegls_encoder_get_bytes_written(encoder, &bytes_written);

    charls_jpegls_encoder_destroy(encoder);
    set_result(encoded_buf, bytes_written);
    return 0;
}
}
