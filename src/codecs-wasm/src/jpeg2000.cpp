
#include "common.h"
#include "openjpeg.h"

// Stream Adapters
typedef struct {
    uint8_t* data;
    size_t len;
    size_t offset;
} MemStream;

static OPJ_SIZE_T read_fn(void* p_buffer, OPJ_SIZE_T p_nb_bytes, void* p_user_data) {
    MemStream* stream = (MemStream*)p_user_data;
    if (stream->offset >= stream->len) return (OPJ_SIZE_T)-1;

    size_t remain = stream->len - stream->offset;
    size_t to_read = p_nb_bytes;
    if (to_read > remain) to_read = remain;

    memcpy(p_buffer, stream->data + stream->offset, to_read);
    stream->offset += to_read;
    return to_read;
}

static OPJ_OFF_T skip_fn(OPJ_OFF_T p_nb_bytes, void* p_user_data) {
    MemStream* stream = (MemStream*)p_user_data;
    if (p_nb_bytes < 0) return -1;

    stream->offset += p_nb_bytes;
    if (stream->offset > stream->len) stream->offset = stream->len;
    return p_nb_bytes;
}

static OPJ_BOOL seek_fn(OPJ_OFF_T p_nb_bytes, void* p_user_data) {
    MemStream* stream = (MemStream*)p_user_data;
    if (p_nb_bytes < 0 || (size_t)p_nb_bytes > stream->len) return OPJ_FALSE;
    stream->offset = (size_t)p_nb_bytes;
    return OPJ_TRUE;
}

typedef struct {
    uint8_t* data;
    size_t len;     // data used
    size_t capacity;
    size_t offset;
} MemWriteStream;

static OPJ_SIZE_T write_fn(void* p_buffer, OPJ_SIZE_T p_nb_bytes, void* p_user_data) {
    MemWriteStream* stream = (MemWriteStream*)p_user_data;

    size_t needed = stream->offset + p_nb_bytes;
    if (needed > stream->capacity) {
        size_t new_cap = stream->capacity * 2;
        if (new_cap < needed) new_cap = needed + 1024;

        uint8_t* new_data = (uint8_t*)realloc(stream->data, new_cap);
        if (!new_data) return (OPJ_SIZE_T)-1;
        stream->data = new_data;
        stream->capacity = new_cap;
    }

    memcpy(stream->data + stream->offset, p_buffer, p_nb_bytes);
    stream->offset += p_nb_bytes;
    if (stream->offset > stream->len) stream->len = stream->offset;
    return p_nb_bytes;
}


// Dummy main for Wasm linker
int main() { return 0; }

extern "C" {

WASM_EXPORT int decode_jpeg2000(const uint8_t* src, size_t src_len) {
    // Validate input parameters
    if (!src || src_len == 0) {
        return -1;
    }

    MemStream stream_data = { (uint8_t*)src, src_len, 0 };

    opj_stream_t* stream = opj_stream_default_create(OPJ_TRUE);
    if (!stream) return -1;

    opj_stream_set_read_function(stream, read_fn);
    opj_stream_set_skip_function(stream, skip_fn);
    opj_stream_set_seek_function(stream, seek_fn);
    opj_stream_set_user_data(stream, &stream_data, NULL);
    opj_stream_set_user_data_length(stream, src_len);

    opj_codec_t* codec = opj_create_decompress(OPJ_CODEC_J2K);
    if (!codec) {
        return -1;
    }

    // Signature check for JP2
    // Access src[0] through src[3] only if we have enough data
    if (src_len > 12 && src[0]==0 && src[1]==0 && src[2]==0 && src[3]==12) {
         opj_destroy_codec(codec);
         codec = opj_create_decompress(OPJ_CODEC_JP2);
         if (!codec) {
             return -1;
         }
    }

    opj_dparameters_t parameters;
    opj_set_default_decoder_parameters(&parameters);

    if (!opj_setup_decoder(codec, &parameters)) {
        opj_stream_destroy(stream);
        opj_destroy_codec(codec);
        return -2;
    }

    opj_image_t* image = NULL;
    if (!opj_read_header(stream, codec, &image)) {
        opj_stream_destroy(stream);
        opj_destroy_codec(codec);
        return -3;
    }

    if (!opj_decode(codec, stream, image)) {
        opj_stream_destroy(stream);
        opj_destroy_codec(codec);
        opj_image_destroy(image);
        return -4;
    }

    if (!opj_end_decompress(codec, stream)) { }

    int width = image->x1 - image->x0;
    int height = image->y1 - image->y0;
    int components = image->numcomps;
    int bytes_per_comp = (image->comps[0].prec > 8) ? 2 : 1;
    size_t dest_len = (size_t)width * height * components * bytes_per_comp;

    uint8_t* dest = (uint8_t*)malloc(dest_len);
    if (!dest) {
        opj_stream_destroy(stream);
        opj_destroy_codec(codec);
        opj_image_destroy(image);
        return -5;
    }

    for (int i = 0; i < width * height; i++) {
        for (int c = 0; c < components; c++) {
            int val = image->comps[c].data[i];
            size_t out_idx = (i * components + c) * bytes_per_comp;
            if (bytes_per_comp == 1) {
                dest[out_idx] = (uint8_t)val;
            } else {
                dest[out_idx] = (uint8_t)(val & 0xFF);
                dest[out_idx+1] = (uint8_t)((val >> 8) & 0xFF);
            }
        }
    }

    opj_stream_destroy(stream);
    opj_destroy_codec(codec);
    opj_image_destroy(image);

    set_result(dest, dest_len);
    return 0;
}

WASM_EXPORT int encode_jpeg2000(const uint8_t* pixel_data, size_t len, uint32_t width, uint32_t height, uint8_t bits_per_sample, uint8_t components, uint8_t lossless_flag, float quality_rate) {
    opj_cparameters_t parameters;
    opj_set_default_encoder_parameters(&parameters);

    if (components >= 3) parameters.tcp_mct = 1;
    parameters.tcp_numlayers = 1;

    if (lossless_flag) {
        // Lossless mode
        parameters.tcp_rates[0] = 0;
        parameters.cp_disto_alloc = 1;
    } else {
        // Lossy mode - use quality_rate (compression rate)
        // Lower rate = higher quality (e.g., 0.5 = 2:1 compression, 0.25 = 4:1 compression)
        // For high quality, use rates like 0.25-0.5, for lower quality use 0.1-0.25
        parameters.tcp_rates[0] = quality_rate > 0.0f ? quality_rate : 0.75f; // Default 0.75 rate (better quality)
        parameters.cp_disto_alloc = 0;
    }

    opj_image_cmptparm_t* cmptparm = (opj_image_cmptparm_t*)malloc(sizeof(opj_image_cmptparm_t) * components);
    memset(cmptparm, 0, sizeof(opj_image_cmptparm_t) * components);

    for (int c = 0; c < components; ++c) {
        cmptparm[c].prec = bits_per_sample;
        cmptparm[c].bpp = bits_per_sample;
        cmptparm[c].sgnd = 0;
        cmptparm[c].dx = 1;
        cmptparm[c].dy = 1;
        cmptparm[c].w = width;
        cmptparm[c].h = height;
    }

    OPJ_COLOR_SPACE color_space = (components >= 3) ? OPJ_CLRSPC_SRGB : OPJ_CLRSPC_GRAY;
    opj_image_t* image = opj_image_create(components, cmptparm, color_space);
    free(cmptparm);
    if (!image) return -1;

    image->x0 = 0;
    image->y0 = 0;
    image->x1 = width;
    image->y1 = height;

    int bytes_per_comp = (bits_per_sample > 8) ? 2 : 1;
    for (size_t i = 0; i < (size_t)width * height; i++) {
        for (int c = 0; c < components; c++) {
             size_t in_idx = (i * components + c) * bytes_per_comp;
             int val = 0;
             if (bytes_per_comp == 1) {
                 val = pixel_data[in_idx];
             } else {
                 val = pixel_data[in_idx] | (pixel_data[in_idx+1] << 8);
             }
             image->comps[c].data[i] = val;
        }
    }

    opj_codec_t* codec = opj_create_compress(OPJ_CODEC_J2K);
    opj_setup_encoder(codec, &parameters, image);

    MemWriteStream stream_data = { NULL, 0, 0, 0 };
    stream_data.capacity = len / 2; // Heuristic start
    stream_data.data = (uint8_t*)malloc(stream_data.capacity);

    opj_stream_t* stream = opj_stream_default_create(OPJ_FALSE);
    opj_stream_set_write_function(stream, write_fn);
    opj_stream_set_seek_function(stream, seek_fn);
    opj_stream_set_skip_function(stream, skip_fn);
    opj_stream_set_user_data(stream, &stream_data, NULL);

    if (!opj_start_compress(codec, image, stream)) {
         opj_destroy_codec(codec); opj_image_destroy(image); opj_stream_destroy(stream); free(stream_data.data);
         return -2;
    }
    if (!opj_encode(codec, stream)) {
         opj_destroy_codec(codec); opj_image_destroy(image); opj_stream_destroy(stream); free(stream_data.data);
         return -3;
    }
    if (!opj_end_compress(codec, stream)) {
         opj_destroy_codec(codec); opj_image_destroy(image); opj_stream_destroy(stream); free(stream_data.data);
         return -4;
    }

    opj_destroy_codec(codec);
    opj_stream_destroy(stream);
    opj_image_destroy(image);

    set_result(stream_data.data, stream_data.len);
    return 0;
}

}
