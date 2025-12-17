

#include <cstdlib>
#include <cstring>
#include <vector>

// Include necessary headers from libjpeg-lj
// We assume we have the include paths set up correctly in build.zig
#include "interface/types.hpp"
#include "interface/hooks.hpp"
#include "interface/tagitem.hpp"
#include "interface/parameters.hpp"
#include "interface/jpeg.hpp"
#include "cmd/bitmaphook.hpp" // Reusing BitmapHook for output

// Define WASM_EXPORT
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WASM_EXPORT __attribute__((visibility("default"))) __attribute__((used))
#endif

// Global result buffer management
static uint8_t* g_result_data = nullptr;
static size_t g_result_len = 0;

// Dummy main for WASI executable build
int main() { return 0; }

extern "C" {

WASM_EXPORT void* get_result_ptr() { return g_result_data; }
WASM_EXPORT size_t get_result_size() { return g_result_len; }
WASM_EXPORT void free_result() {
    if (g_result_data) free(g_result_data);
    g_result_data = nullptr;
    g_result_len = 0;
}

static void set_result(uint8_t* data, size_t len) {
    free_result();
    g_result_data = data;
    g_result_len = len;
}

struct MemContext {
    const uint8_t* start;
    size_t size;
    size_t pos;
};

// Memory IO Hook
JPG_LONG MemoryHook(struct JPG_Hook *hook, struct JPG_TagItem *tags)
{
  MemContext *ctx = (MemContext *)(hook->hk_pData);
  if (!ctx) return -1;

  switch(tags->GetTagData(JPGTAG_FIO_ACTION)) {
  case JPGFLAG_ACTION_READ:
    {
      UBYTE *buffer = (UBYTE *)tags->GetTagPtr(JPGTAG_FIO_BUFFER);
      ULONG  size   = (ULONG  )tags->GetTagData(JPGTAG_FIO_SIZE);
      
      size_t available = ctx->size - ctx->pos;
      if (size > available) size = available;
      if (size == 0) return 0;

      memcpy(buffer, ctx->start + ctx->pos, size);
      ctx->pos += size;
      return size;
    }
    break;
  case JPGFLAG_ACTION_WRITE:
    // Read-only
    return 0;
    break;
  case JPGFLAG_ACTION_SEEK:
    {
      LONG mode   = tags->GetTagData(JPGTAG_FIO_SEEKMODE);
      LONG offset = tags->GetTagData(JPGTAG_FIO_OFFSET);
      size_t new_pos = ctx->pos;

      switch(mode) {
      case JPGFLAG_OFFSET_CURRENT:
        new_pos = ctx->pos + offset;
        break;
      case JPGFLAG_OFFSET_BEGINNING:
         new_pos = offset;
        break;
      case JPGFLAG_OFFSET_END:
        new_pos = ctx->size + offset;
        break;
      }
      
      if (new_pos > ctx->size) new_pos = ctx->size; // Clamp or error? fseek allows past end but we are memory.
      // Actually standard behavior is allow beyond end but read returns 0.
      // But for safety let's just clamp to size (or should we?)
      // Let's trust logic not to go wild.
      ctx->pos = new_pos;
      return 0; // Success
    }
    break;
  case JPGFLAG_ACTION_QUERY:
    return 0;
  }
  return -1;
}

WASM_EXPORT int decode_ljpeg(const uint8_t* src, size_t src_len) {
    if (!src || src_len == 0) return -1;

    MemContext ctx = { src, src_len, 0 };
    struct JPG_Hook memhook(MemoryHook, &ctx);

    JPEG *jpeg = JPEG::Construct(NULL);
    if (!jpeg) return -2;

    int res = 0;

    struct JPG_TagItem tags[] = {
        JPG_PointerTag(JPGTAG_HOOK_IOHOOK, &memhook),
        JPG_PointerTag(JPGTAG_HOOK_IOSTREAM, &ctx), // Passed as context to hook
        JPG_EndTag
    };

    if (jpeg->Read(tags)) {
        UBYTE subx[256], suby[256];
         struct JPG_TagItem itags[] = {
          JPG_ValueTag(JPGTAG_IMAGE_WIDTH,0),
          JPG_ValueTag(JPGTAG_IMAGE_HEIGHT,0),
          JPG_ValueTag(JPGTAG_IMAGE_DEPTH,0),
          JPG_ValueTag(JPGTAG_IMAGE_PRECISION,0),
          JPG_ValueTag(JPGTAG_IMAGE_IS_FLOAT,false),
          JPG_ValueTag(JPGTAG_IMAGE_OUTPUT_CONVERSION,true), // Ensure output is converted to standard format
          JPG_PointerTag(JPGTAG_IMAGE_SUBX,subx),
          JPG_PointerTag(JPGTAG_IMAGE_SUBY,suby),
          JPG_ValueTag(JPGTAG_IMAGE_SUBLENGTH,4),
          JPG_EndTag
        };

        if (jpeg->GetInformation(itags)) {
             ULONG width  = itags->GetTagData(JPGTAG_IMAGE_WIDTH);
             ULONG height = itags->GetTagData(JPGTAG_IMAGE_HEIGHT);
             UBYTE depth  = (UBYTE)itags->GetTagData(JPGTAG_IMAGE_DEPTH);
             UBYTE prec   = (UBYTE)itags->GetTagData(JPGTAG_IMAGE_PRECISION);
             // bool  pfm    = itags->GetTagData(JPGTAG_IMAGE_IS_FLOAT);

             UBYTE bytesperpixel = (prec > 8) ? 2 : 1;
             UBYTE pixeltype     = (prec > 8) ? CTYP_UWORD : CTYP_UBYTE;
             
             size_t total_size = width * height * depth * bytesperpixel;
             uint8_t* out_buf = (uint8_t*)malloc(total_size);
             
             if (out_buf) {
                 struct BitmapMemory bmm;
                 memset(&bmm, 0, sizeof(bmm));
                 bmm.bmm_pMemPtr      = out_buf;
                 bmm.bmm_ulWidth      = width;
                 bmm.bmm_ulHeight     = height;
                 bmm.bmm_usDepth      = depth;
                 bmm.bmm_ucPixelType  = pixeltype;
                 bmm.bmm_bBigEndian   = false; // WASM is little endian usually.
                 // Wait, bmm.bmm_bBigEndian controls output format?
                 // If true, it swaps bytes on little endian systems. 
                 // We want native endianness for WASM (Little Endian).
                 // So set to false?
                 // reconstruct.cpp sets it to true? Maybe it wants Big Endian output for PGM files?
                 // "bmm_bBigEndian   = true;" in reconstruct.cpp
                 // PGM standard is usually binary Big Endian.
                 // We want native array for JS. So Little Endian.
                 
                 bmm.bmm_bNoOutputConversion = false; // We want conversion (e.g. YCbCr -> RGB if needed, but Process 14 is usually raw)

                 struct JPG_Hook bmhook(BitmapHook, &bmm);
                 
                 // Decode whole image
                 struct JPG_TagItem dtags[] = {
                    JPG_PointerTag(JPGTAG_BIH_HOOK, &bmhook),
                    JPG_ValueTag(JPGTAG_DECODER_MINY, 0),
                    JPG_ValueTag(JPGTAG_DECODER_MAXY, height - 1),
                    JPG_ValueTag(JPGTAG_DECODER_UPSAMPLE, true), // Force upsampling (4:2:0 -> 4:4:4) if any
                    JPG_ValueTag(JPGTAG_DECODER_MINCOMPONENT, 0),
                    JPG_ValueTag(JPGTAG_DECODER_MAXCOMPONENT, depth - 1),
                    JPG_EndTag
                 };

                 if (jpeg->DisplayRectangle(dtags)) {
                     set_result(out_buf, total_size);
                     res = 0;
                 } else {
                     free(out_buf);
                     res = -4; // Display failed
                 }

             } else {
                 res = -3; // OOM
             }
        } else {
            res = -2; // GetInfo failed
        }
    } else {
        res = -1; // Read failed
    }

    JPEG::Destruct(jpeg);
    return res;
}

}
