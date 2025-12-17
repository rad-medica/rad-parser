// common.h - Shared WASM helpers
#ifndef COMMON_H
#define COMMON_H

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>

#define WASM_EXPORT __attribute__((visibility("default")))

// Global result buffer for returning data to JS
static uint8_t* g_result_ptr = nullptr;
static size_t g_result_len = 0;

static inline void set_result(uint8_t* ptr, size_t len) {
    g_result_ptr = ptr;
    g_result_len = len;
}

extern "C" {
    WASM_EXPORT void* alloc(size_t size) {
        return malloc(size);
    }
    
    WASM_EXPORT void free_ptr(void* ptr, size_t size) {
        (void)size;
        free(ptr);
    }
    
    WASM_EXPORT uint8_t* get_result_ptr() {
        return g_result_ptr;
    }
    
    WASM_EXPORT size_t get_result_len() {
        return g_result_len;
    }
}

#endif // COMMON_H
