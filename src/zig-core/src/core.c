// Core WASM utilities - freestanding implementation
// No libc dependency - uses bump allocator like minimal WASM

#define WASM_EXPORT __attribute__((visibility("default"))) __attribute__((used))

typedef unsigned char uint8_t;
typedef unsigned int uint32_t;
typedef int int32_t;
typedef unsigned long size_t;

// Simple bump allocator
static uint8_t heap[65536]; // 64KB
static size_t heap_offset = 0;

WASM_EXPORT void* alloc(size_t size) {
    if (heap_offset + size > sizeof(heap)) return 0;
    void* ptr = &heap[heap_offset];
    heap_offset = (heap_offset + size + 7) & ~7;
    return ptr;
}

WASM_EXPORT void free_ptr(void* ptr) { (void)ptr; }

static uint8_t* g_result_ptr = 0;
static size_t g_result_len = 0;

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

int main(void) { return 0; }
