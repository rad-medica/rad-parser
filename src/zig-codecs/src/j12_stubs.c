// Stub implementations for 12-bit JPEG functions
// These allow an 8-bit-only build to link successfully.
// 12-bit support is disabled for now due to complex symbol renaming requirements.

#define JPEG_INTERNALS
#include "jinclude.h"
#include "jpeglib.h"

// Compression stubs (12-bit)
GLOBAL(void) j12init_c_main_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_c_prep_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_c_coef_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_color_converter(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_downsampler(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_forward_dct(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

// Decompression stubs (12-bit)
GLOBAL(void) j12init_d_main_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_d_coef_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_d_post_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_inverse_dct(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_upsampler(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_color_deconverter(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_1pass_quantizer(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_2pass_quantizer(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_merged_upsampler(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

// 12-bit lossless stubs
GLOBAL(void) j12init_c_diff_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_lossless_compressor(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_d_diff_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j12init_lossless_decompressor(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

// Copy sample rows stub
GLOBAL(void) j12copy_sample_rows(J12SAMPARRAY input_array, int source_row,
                                  J12SAMPARRAY output_array, int dest_row,
                                  int num_rows, JDIMENSION num_cols) {
    // Do nothing - should never be called in 8-bit mode
}

// 16-bit compression stubs
GLOBAL(void) j16init_c_main_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_c_prep_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_color_converter(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_downsampler(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_c_diff_controller(j_compress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_lossless_compressor(j_compress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

// 16-bit decompression stubs
GLOBAL(void) j16init_d_main_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_d_post_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_upsampler(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_color_deconverter(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_d_diff_controller(j_decompress_ptr cinfo, boolean need_full_buffer) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16init_lossless_decompressor(j_decompress_ptr cinfo) {
    ERREXIT(cinfo, JERR_BAD_PRECISION);
}

GLOBAL(void) j16copy_sample_rows(J16SAMPARRAY input_array, int source_row,
                                  J16SAMPARRAY output_array, int dest_row,
                                  int num_rows, JDIMENSION num_cols) {
    // Do nothing - should never be called in 8-bit mode
}
