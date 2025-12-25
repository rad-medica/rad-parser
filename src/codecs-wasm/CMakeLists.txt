cmake_minimum_required(VERSION 3.16)
project(rad-codecs-wasm)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# Emscripten-specific settings
if(EMSCRIPTEN)
    # Enable exception handling (required for CharLS)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fexceptions")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")

    # Common Emscripten link flags for all modules
    set(EMSCRIPTEN_COMMON_FLAGS
        "-s WASM=1"
        "-s MODULARIZE=1"
        "-s EXPORT_ES6=1"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s INITIAL_MEMORY=67108864"  # 64MB
        "-s MAXIMUM_MEMORY=536870912" # 512MB
        "-s STACK_SIZE=8388608"       # 8MB
        "-s NO_EXIT_RUNTIME=1"
        "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','HEAPU8']"
        "-s ENVIRONMENT=node"
        "-s FILESYSTEM=0"
        "-s DISABLE_EXCEPTION_CATCHING=0"  # Enable exceptions
        "-O3"
        "--no-entry"
    )
    string(REPLACE ";" " " EMSCRIPTEN_COMMON_FLAGS_STR "${EMSCRIPTEN_COMMON_FLAGS}")
endif()

# Base paths
set(DEPS_DIR "${CMAKE_SOURCE_DIR}/deps")
set(ZIG_SRC_DIR "${CMAKE_SOURCE_DIR}/src")

# ============================================================
# JPEG (libjpeg-turbo)
# ============================================================
set(JPEG_SOURCES
    ${ZIG_SRC_DIR}/jpeg.cpp
    ${DEPS_DIR}/libjpeg-turbo/src/jcapimin.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcapistd.c
    ${DEPS_DIR}/libjpeg-turbo/src/jaricom.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcarith.c
    ${DEPS_DIR}/libjpeg-turbo/src/jccoefct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jccolor.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcdctmgr.c
    ${DEPS_DIR}/libjpeg-turbo/src/jchuff.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcicc.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcinit.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcmainct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcmarker.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcmaster.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcomapi.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcparam.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcphuff.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcprepct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jcsample.c
    ${DEPS_DIR}/libjpeg-turbo/src/jctrans.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdapimin.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdapistd.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdarith.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdatadst.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdatasrc.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdcoefct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdcolor.c
    ${DEPS_DIR}/libjpeg-turbo/src/jddctmgr.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdhuff.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdicc.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdinput.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdmainct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdmarker.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdmaster.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdmerge.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdphuff.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdpostct.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdsample.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdtrans.c
    ${DEPS_DIR}/libjpeg-turbo/src/jerror.c
    ${DEPS_DIR}/libjpeg-turbo/src/jfdctflt.c
    ${DEPS_DIR}/libjpeg-turbo/src/jfdctfst.c
    ${DEPS_DIR}/libjpeg-turbo/src/jfdctint.c
    ${DEPS_DIR}/libjpeg-turbo/src/jidctflt.c
    ${DEPS_DIR}/libjpeg-turbo/src/jidctfst.c
    ${DEPS_DIR}/libjpeg-turbo/src/jidctint.c
    ${DEPS_DIR}/libjpeg-turbo/src/jidctred.c
    ${DEPS_DIR}/libjpeg-turbo/src/jmemmgr.c
    ${DEPS_DIR}/libjpeg-turbo/src/jmemnobs.c
    ${DEPS_DIR}/libjpeg-turbo/src/jquant1.c
    ${DEPS_DIR}/libjpeg-turbo/src/jquant2.c
    ${DEPS_DIR}/libjpeg-turbo/src/jutils.c
    ${DEPS_DIR}/libjpeg-turbo/src/turbojpeg.c
    ${DEPS_DIR}/libjpeg-turbo/src/transupp.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdatasrc-tj.c
    ${DEPS_DIR}/libjpeg-turbo/src/jdatadst-tj.c
    ${DEPS_DIR}/libjpeg-turbo/src/jpeg_nbits.c
)

add_executable(rad-codecs-jpeg ${JPEG_SOURCES})
target_include_directories(rad-codecs-jpeg PRIVATE
    ${DEPS_DIR}/libjpeg-turbo/src
    ${DEPS_DIR}/libjpeg-turbo
    ${ZIG_SRC_DIR}/include
)
target_compile_definitions(rad-codecs-jpeg PRIVATE INLINE=inline NDEBUG)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-jpeg PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsJpeg' -s EXPORTED_FUNCTIONS=['_encode_jpeg','_decode_jpeg','_malloc','_free'] -s ERROR_ON_UNDEFINED_SYMBOLS=0"
    )
endif()

# ============================================================
# JPEG 2000 (OpenJPEG)
# ============================================================
file(GLOB OPENJPEG_SOURCES ${DEPS_DIR}/openjpeg/src/lib/openjp2/*.c)
# Remove files we don't want
list(FILTER OPENJPEG_SOURCES EXCLUDE REGEX "test|bench|cidx_manager|phix_manager|ppix_manager|thix_manager|tpix_manager")
# Explicitly remove opj_clock.c as we override it
list(REMOVE_ITEM OPENJPEG_SOURCES "${DEPS_DIR}/openjpeg/src/lib/openjp2/opj_clock.c")

add_executable(rad-codecs-j2k
    ${ZIG_SRC_DIR}/jpeg2000.cpp
    ${ZIG_SRC_DIR}/overrides/opj_clock.c
    ${OPENJPEG_SOURCES}
)
target_include_directories(rad-codecs-j2k PRIVATE
    ${DEPS_DIR}/openjpeg/src/lib/openjp2
    ${ZIG_SRC_DIR}/include
)
target_compile_definitions(rad-codecs-j2k PRIVATE OPJ_HAVE_FSEEKO=0 NDEBUG)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-j2k PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsJ2k' -s EXPORTED_FUNCTIONS=['_encode_jpeg2000','_decode_jpeg2000','_malloc','_free']"
    )
endif()

# ============================================================
# HTJ2K (OpenJPH)
# ============================================================
file(GLOB_RECURSE OPENJPH_SOURCES
    ${DEPS_DIR}/openjph/src/core/codestream/*.cpp
    ${DEPS_DIR}/openjph/src/core/coding/*.cpp
    ${DEPS_DIR}/openjph/src/core/others/*.cpp
    ${DEPS_DIR}/openjph/src/core/transform/*.cpp
)
# Remove files we don't want (SIMD optimizations for WASM which require -msimd128)
list(FILTER OPENJPH_SOURCES EXCLUDE REGEX ".*_wasm\\.cpp$")

add_executable(rad-codecs-htj2k
    ${ZIG_SRC_DIR}/htj2k.cpp
    ${OPENJPH_SOURCES}
)
target_include_directories(rad-codecs-htj2k PRIVATE
    ${DEPS_DIR}/openjph/src/core/common
)
target_compile_definitions(rad-codecs-htj2k PRIVATE OJPH_DISABLE_INTEL_SIMD NDEBUG)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-htj2k PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsHtj2k' -s EXPORTED_FUNCTIONS=['_decode_htj2k','_malloc','_free']"
    )
endif()

# ============================================================
# JPEG-LS (CharLS)
# ============================================================
file(GLOB CHARLS_SOURCES ${DEPS_DIR}/charls/src/*.cpp)
list(FILTER CHARLS_SOURCES EXCLUDE REGEX "test|bench|fuzz")

add_executable(rad-codecs-jpegls
    ${ZIG_SRC_DIR}/jpegls_c_api.cpp
    ${CHARLS_SOURCES}
)
target_include_directories(rad-codecs-jpegls PRIVATE
    ${DEPS_DIR}/charls/include
    ${DEPS_DIR}/charls/include/charls
    ${DEPS_DIR}/charls/src
)
target_compile_definitions(rad-codecs-jpegls PRIVATE CHARLS_STATIC NDEBUG)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-jpegls PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsJpegLs' -s EXPORTED_FUNCTIONS=['_encode_jpegls','_free_encoded_data','_malloc','_free']"
    )
endif()

# ============================================================
# JPEG Lossless (libjpeg-lj)
# ============================================================
file(GLOB_RECURSE LJPEG_SOURCES
    ${DEPS_DIR}/libjpeg-lj/boxes/*.cpp
    ${DEPS_DIR}/libjpeg-lj/codestream/*.cpp
    ${DEPS_DIR}/libjpeg-lj/coding/*.cpp
    ${DEPS_DIR}/libjpeg-lj/colortrafo/*.cpp
    ${DEPS_DIR}/libjpeg-lj/control/*.cpp
    ${DEPS_DIR}/libjpeg-lj/dct/*.cpp
    ${DEPS_DIR}/libjpeg-lj/interface/*.cpp
    ${DEPS_DIR}/libjpeg-lj/io/*.cpp
    ${DEPS_DIR}/libjpeg-lj/marker/*.cpp
    ${DEPS_DIR}/libjpeg-lj/std/*.cpp
    ${DEPS_DIR}/libjpeg-lj/tools/*.cpp
    ${DEPS_DIR}/libjpeg-lj/upsampling/*.cpp
)
list(FILTER LJPEG_SOURCES EXCLUDE REGEX "test|bench|fuzz|cmd")
# Explicitly remove bytestream.cpp as we use the io/ one explicitly
list(REMOVE_ITEM LJPEG_SOURCES "${DEPS_DIR}/libjpeg-lj/io/bytestream.cpp")

add_executable(rad-codecs-ljpeg
    ${ZIG_SRC_DIR}/ljpeg.cpp
    ${DEPS_DIR}/libjpeg-lj/io/bytestream.cpp
    ${DEPS_DIR}/libjpeg-lj/cmd/bitmaphook.cpp
    ${LJPEG_SOURCES}
)
target_include_directories(rad-codecs-ljpeg PRIVATE
    ${DEPS_DIR}/libjpeg-lj
    ${ZIG_SRC_DIR}/include
)
target_compile_definitions(rad-codecs-ljpeg PRIVATE BUILD_LIB NDEBUG)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-ljpeg PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsLjpeg' -s EXPORTED_FUNCTIONS=['_decode_ljpeg','_malloc','_free']"
    )
endif()

# ============================================================
# RLE
# ============================================================
add_executable(rad-codecs-rle
    ${ZIG_SRC_DIR}/rle.cpp
)
if(EMSCRIPTEN)
    set_target_properties(rad-codecs-rle PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "${EMSCRIPTEN_COMMON_FLAGS_STR} -s EXPORT_NAME='RadCodecsRle' -s EXPORTED_FUNCTIONS=['_encode_rle','_decode_rle','_malloc','_free']"
    )
endif()
