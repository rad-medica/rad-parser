#ifndef COMMON_H
#define COMMON_H

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#define WASM_EXPORT __attribute__((visibility("default"))) __attribute__((used))

// Shared Memory Management
extern "C" {
    WASM_EXPORT void* alloc(size_t size) { return malloc(size); }
    WASM_EXPORT void free_ptr(void* ptr) { free(ptr); }
    static uint8_t* last_result_ptr = NULL;
    static size_t last_result_len = 0;
    WASM_EXPORT uint8_t* get_result_ptr() { return last_result_ptr; }
    WASM_EXPORT size_t get_result_len() { return last_result_len; }
    WASM_EXPORT void set_result(uint8_t* ptr, size_t len) {
        if (last_result_ptr) free(last_result_ptr);
        last_result_ptr = ptr;
        last_result_len = len;
    }
}

#endif
