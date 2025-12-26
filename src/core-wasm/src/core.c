// Core WASM utilities - freestanding implementation
// Ported from Zig/freestanding C to Emscripten
#include <stdint.h>
#include <stddef.h>
#include <emscripten.h>

#define WASM_EXPORT EMSCRIPTEN_KEEPALIVE

// Simple bump allocator
static uint8_t heap[16 * 1024 * 1024];
static size_t heap_offset = 0;

static uint8_t* g_result_ptr = 0;
static size_t g_result_len = 0;

WASM_EXPORT void* alloc(size_t size) {
    if (heap_offset + size > sizeof(heap)) return 0;
    void* ptr = &heap[heap_offset];
    heap_offset = (heap_offset + size + 7) & ~7;
    return ptr;
}

WASM_EXPORT void reset_memory(void) {
    heap_offset = 0;
    g_result_ptr = 0;
    g_result_len = 0;
}

WASM_EXPORT void free_ptr(void* ptr) { (void)ptr; }

WASM_EXPORT uint8_t* get_result_ptr(void) { return g_result_ptr; }
WASM_EXPORT size_t get_result_len(void) { return g_result_len; }
WASM_EXPORT void set_result(uint8_t* ptr, size_t len) {
    g_result_ptr = ptr;
    g_result_len = len;
}

// ==================== Helpers ====================

static int is_ws(uint8_t c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }

static int32_t parse_int(const uint8_t* s, size_t len) {
    if (len == 0) return 0;
    int32_t result = 0;
    int neg = 0;
    size_t i = 0;
    if (s[0] == '-') { neg = 1; i = 1; }
    else if (s[0] == '+') { i = 1; }
    while (i < len && s[i] >= '0' && s[i] <= '9') {
        result = result * 10 + (s[i] - '0');
        i++;
    }
    return neg ? -result : result;
}

static double parse_double_one(const uint8_t* s, size_t len) {
    if (len == 0) return 0.0;
    double res = 0.0;
    int sign = 1;
    size_t i = 0;

    // Skip whitespace
    while (i < len && is_ws(s[i])) i++;
    if (i >= len) return 0.0;

    if (s[i] == '-') { sign = -1; i++; }
    else if (s[i] == '+') { i++; }

    while (i < len && s[i] >= '0' && s[i] <= '9') {
        res = res * 10.0 + (s[i] - '0');
        i++;
    }

    if (i < len && s[i] == '.') {
        i++;
        double frac = 0.1;
        while (i < len && s[i] >= '0' && s[i] <= '9') {
            res += (s[i] - '0') * frac;
            frac *= 0.1;
            i++;
        }
    }

    if (i < len && (s[i] == 'e' || s[i] == 'E')) {
        i++;
        int esign = 1;
        if (i < len && s[i] == '-') { esign = -1; i++; }
        else if (i < len && s[i] == '+') { i++; }

        int exp = 0;
        while (i < len && s[i] >= '0' && s[i] <= '9') {
            exp = exp * 10 + (s[i] - '0');
            i++;
        }

        while (exp > 0) {
            if (esign == 1) res *= 10.0;
            else res /= 10.0;
            exp--;
        }
    }

    return sign * res;
}

// ==================== IS Parsing ====================

static int32_t g_is[256];
static size_t g_is_count = 0;

WASM_EXPORT int32_t parse_is(const uint8_t* input, size_t len) {
    g_is_count = 0;
    size_t i = 0;
    while (i < len && g_is_count < 256) {
        while (i < len && is_ws(input[i])) i++;
        if (i >= len) break;
        size_t start = i;
        while (i < len && input[i] != '\\') i++;
        size_t end = i;
        while (end > start && is_ws(input[end-1])) end--;
        if (end > start) g_is[g_is_count++] = parse_int(input + start, end - start);
        i++;
    }
    return (int32_t)g_is_count;
}

WASM_EXPORT int32_t get_is_value(int32_t idx) {
    return (size_t)idx < g_is_count ? g_is[idx] : 0;
}

// ==================== Date (DA) ====================

static uint8_t g_date[16];

WASM_EXPORT const uint8_t* parse_date(const uint8_t* input, size_t len) {
    if (len != 8) {
        size_t n = len < 15 ? len : 15;
        for (size_t j = 0; j < n; j++) g_date[j] = input[j];
        g_date[n] = 0;
        return g_date;
    }
    int32_t y = parse_int(input, 4);
    int32_t m = parse_int(input + 4, 2);
    int32_t d = parse_int(input + 6, 2);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        g_date[0] = '0' + (y / 1000);
        g_date[1] = '0' + ((y / 100) % 10);
        g_date[2] = '0' + ((y / 10) % 10);
        g_date[3] = '0' + (y % 10);
        g_date[4] = '-';
        g_date[5] = '0' + (m / 10);
        g_date[6] = '0' + (m % 10);
        g_date[7] = '-';
        g_date[8] = '0' + (d / 10);
        g_date[9] = '0' + (d % 10);
        g_date[10] = 0;
    } else {
        for (size_t j = 0; j < 8; j++) g_date[j] = input[j];
        g_date[8] = 0;
    }
    return g_date;
}

// ==================== Time (TM) ====================

static uint8_t g_time[32];

WASM_EXPORT const uint8_t* parse_time(const uint8_t* input, size_t len) {
   if (len < 6) {
        size_t n = len < 31 ? len : 31;
        for (size_t j = 0; j < n; j++) g_time[j] = input[j];
        g_time[n] = 0;
        return g_time;
    }
    int32_t h = parse_int(input, 2);
    int32_t m = parse_int(input + 2, 2);
    int32_t s = parse_int(input + 4, 2);
    if (h < 24 && m < 60 && s < 60) {
        g_time[0] = '0' + (h / 10);
        g_time[1] = '0' + (h % 10);
        g_time[2] = ':';
        g_time[3] = '0' + (m / 10);
        g_time[4] = '0' + (m % 10);
        g_time[5] = ':';
        g_time[6] = '0' + (s / 10);
        g_time[7] = '0' + (s % 10);
        if (len > 6) {
            size_t wp = 8;
            for (size_t j = 6; j < len && wp < 31; j++) g_time[wp++] = input[j];
            g_time[wp] = 0;
        } else g_time[8] = 0;
    } else {
        size_t n = len < 31 ? len : 31;
        for (size_t j = 0; j < n; j++) g_time[j] = input[j];
        g_time[n] = 0;
    }
    return g_time;
}

// ==================== DS (Decimal String) ====================

static double g_ds[256];
static size_t g_ds_count = 0;

WASM_EXPORT int32_t parse_ds(const uint8_t* input, size_t len) {
    g_ds_count = 0;
    size_t i = 0;
    while (i < len && g_ds_count < 256) {
        while (i < len && is_ws(input[i])) i++;
        if (i >= len) break;
        size_t start = i;
        while (i < len && input[i] != '\\') i++;
        size_t end = i;
        while (end > start && is_ws(input[end-1])) end--;
        if (end > start) g_ds[g_ds_count++] = parse_double_one(input + start, end - start);
        i++;
    }
    return (int32_t)g_ds_count;
}

WASM_EXPORT double get_ds_value(int32_t idx) {
    return (size_t)idx < g_ds_count ? g_ds[idx] : 0.0;
}

// ==================== PN (Person Name) ====================

static size_t g_pn_offsets[5];
static size_t g_pn_lengths[5];

WASM_EXPORT void parse_pn(const uint8_t* input, size_t len) {
    // Reset
    for (int i = 0; i < 5; i++) {
        g_pn_offsets[i] = 0;
        g_pn_lengths[i] = 0;
    }

    if (len == 0) return;

    size_t comp_idx = 0;
    size_t current_start = 0;
    size_t i = 0;

    while (i < len && comp_idx < 5) {
        if (input[i] == '^') {
            g_pn_offsets[comp_idx] = current_start;
            g_pn_lengths[comp_idx] = i - current_start;
            comp_idx++;
            current_start = i + 1;
        } else if (input[i] == '=') {
            break;
        }
        i++;
    }

    if (comp_idx < 5 && current_start < len) {
        g_pn_offsets[comp_idx] = current_start;
        g_pn_lengths[comp_idx] = i - current_start;
    }
}

WASM_EXPORT size_t get_pn_offset(int idx) {
    if (idx < 0 || idx >= 5) return 0;
    return g_pn_offsets[idx];
}

WASM_EXPORT size_t get_pn_length(int idx) {
    if (idx < 0 || idx >= 5) return 0;
    return g_pn_lengths[idx];
}

// ==================== UID Validation ====================

WASM_EXPORT int validate_uid(const uint8_t* input, size_t len) {
    if (len == 0 || len > 64) return 0;

    for (size_t i = 0; i < len; i++) {
        uint8_t c = input[i];
        if (c == 0 && i == len - 1) continue;
        if (!((c >= '0' && c <= '9') || c == '.')) {
            return 0;
        }
    }
    return 1;
}

// ==================== Sequence Delimiter ====================

WASM_EXPORT int32_t find_sequence_delimiter(const uint8_t* start, size_t len) {
    if (len < 4) return -1;
    const uint8_t* end = start + len - 3;
    const uint8_t* p = start;
    while (p < end) {
        if (p[0] == 0xFE && p[1] == 0xFF && p[2] == 0xDD && p[3] == 0xE0) {
            return (int32_t)(p - start);
        }
        p++;
    }
    return -1;
}

// ==================== Modality LUT ====================

WASM_EXPORT int32_t apply_modality_lut(const uint8_t* ptr, size_t len, double slope, double intercept, int bits, int representation) {
    size_t num_pixels = 0;
    int bytes_per_pixel = 0;

    if (bits <= 8) bytes_per_pixel = 1;
    else if (bits <= 16) bytes_per_pixel = 2;
    else if (bits <= 32) bytes_per_pixel = 4;
    else return -1;

    num_pixels = len / bytes_per_pixel;
    size_t out_size_bytes = num_pixels * sizeof(float);

    float* out = (float*)alloc(out_size_bytes);
    if (!out) return -1;

    set_result((uint8_t*)out, out_size_bytes);

    if (bytes_per_pixel == 1) {
         for (size_t i = 0; i < num_pixels; i++) {
             int32_t val = ptr[i];
             out[i] = (float)(val * slope + intercept);
         }
    } else if (bytes_per_pixel == 2) {
        const uint16_t* p16 = (const uint16_t*)ptr;
        if (representation == 1) { // Signed (SS)
            const int16_t* p16s = (const int16_t*)ptr;
            for (size_t i = 0; i < num_pixels; i++) {
                out[i] = (float)(p16s[i] * slope + intercept);
            }
        } else { // Unsigned (US)
            for (size_t i = 0; i < num_pixels; i++) {
                out[i] = (float)(p16[i] * slope + intercept);
            }
        }
    } else if (bytes_per_pixel == 4) {
         if (representation == 1) {
            const int32_t* p32s = (const int32_t*)ptr;
            for (size_t i = 0; i < num_pixels; i++) {
                out[i] = (float)(p32s[i] * slope + intercept);
            }
        } else {
            const uint32_t* p32 = (const uint32_t*)ptr;
            for (size_t i = 0; i < num_pixels; i++) {
                out[i] = (float)(p32[i] * slope + intercept);
            }
        }
    }

    return 0; // Success
}

// ==================== VOI LUT ====================

static inline uint8_t clamp_u8(double v) {
    if (v < 0.0) return 0;
    if (v > 255.0) return 255;
    return (uint8_t)v;
}

WASM_EXPORT int32_t apply_voi_lut(const float* ptr, size_t len, double wc, double ww) {
    if (ww < 1.0) ww = 1.0;
    size_t count = len / sizeof(float);
    uint8_t* out = (uint8_t*)alloc(count);
    if (!out) return -1;
    set_result(out, count);
    for (size_t i = 0; i < count; i++) {
        double val = ptr[i];
        if (val <= (wc - 0.5 - (ww - 1.0) / 2.0)) {
            out[i] = 0;
        } else if (val > (wc - 0.5 + (ww - 1.0) / 2.0)) {
            out[i] = 255;
        } else {
            double res = ((val - (wc - 0.5)) / (ww - 1.0) + 0.5) * 255.0;
            out[i] = clamp_u8(res);
        }
    }
    return 0;
}
