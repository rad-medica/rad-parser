/* jconfigint.h.  Generated manually for WASM.  */

#define BITS_IN_JSAMPLE 8
#define HAVE_MEMCPY 1
#define HAVE_MEMSET 1
#define SIZEOF_SIZE_T 4
#define INLINE inline
#undef RIGHT_SHIFT_IS_UNSIGNED

#ifndef FALLTHROUGH
#define FALLTHROUGH ((void)0)
#endif

#ifndef THREAD_LOCAL
#define THREAD_LOCAL
#endif

#ifndef HIDDEN
#if defined(__GNUC__) || defined(__clang__)
#define HIDDEN __attribute__((visibility("hidden")))
#else
#define HIDDEN
#endif
#endif

#ifndef BUILD
#define BUILD "2025-12-17"
#endif

#ifndef VERSION
#define VERSION "3.0.0"
#endif
