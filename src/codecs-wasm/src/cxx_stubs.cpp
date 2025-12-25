// Stub implementations for C++ exception symbols required by WASM/WASI
// These allow linking CharLS which uses exceptions internally

#include <cstdlib>

extern "C" {

// C++ exception handling stubs for WASM
void __cxa_throw(void*, void*, void (*)(void*)) {
    __builtin_trap();
}

void* __cxa_allocate_exception(size_t) {
    return nullptr;
}

void __cxa_free_exception(void*) {
}

void* __cxa_begin_catch(void*) {
    return nullptr;
}

void __cxa_end_catch() {
}

void __cxa_rethrow() {
    __builtin_trap();
}

int __cxa_guard_acquire(long long*) {
    return 1;
}

void __cxa_guard_release(long long*) {
}

void __cxa_guard_abort(long long*) {
}

void* __cxa_get_exception_ptr(void*) {
    return nullptr;
}

}
