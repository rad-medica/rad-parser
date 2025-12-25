Loading jpegls...
Loading WASM for jpegls from: C:\Users\aroja\CODE\rad-parser\src\zig-codecs\zig-out\bin\rad-codecs-jpegls.wasm
Exports: [
  "memory", "__wasm_call_ctors", "_start", "malloc", "free", "strcasecmp_l", "strncasecmp_l", "_Znwm",
  "_Znam", "_ZdlPv", "_ZdlPvm", "_ZdaPv", "_ZdaPvm", "_ZnwmSt11align_val_t", "_ZnamSt11align_val_t",
  "_ZdlPvSt11align_val_t", "_ZdlPvmSt11align_val_t", "_ZdaPvSt11align_val_t", "_ZdaPvmSt11align_val_t",
  "get_static_buffer", "free_encoded_data", "encode_jpegls"
]
Encoding 1x1 8-bit image...
[DEBUG] encodeJpegLs: Type=Uint8Array, Len=1, ByteLen=1, W=1, H=1, Bits=8, Comps=1
[DEBUG] Alloc ptr=42000096 len=1 (alloc=129)
[DEBUG] Calling encode_jpegls(ptr=42000096, len=1, w=1, h=1, bits=8, comps=1)
[WASI stdout/stderr]: DEBUG: w=1 h=1 b=8 c=1 size=1
[WASI stdout/stderr]: 

[WASI stdout/stderr]: DEBUG: Malloc Result struct success

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Encoder created

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Frame info set

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Estimated size: 1059

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Stride: 1

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Encode success

[WASI stdout/stderr]: 
Encoded 8-bit size: 31
Encoding 64x64 16-bit image...
[DEBUG] encodeJpegLs: Type=Uint8Array, Len=8192, ByteLen=8192, W=64, H=64, Bits=16, Comps=1
[DEBUG] Alloc ptr=42000096 len=8192 (alloc=8320)
[DEBUG] Calling encode_jpegls(ptr=42000096, len=8192, w=64, h=64, bits=16, comps=1)
[WASI stdout/stderr]: DEBUG: w=64 h=64 b=16 c=1 size=8192

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Malloc Result struct success

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Encoder created

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Frame info set

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Estimated size: 9250

[WASI stdout/stderr]: 
[WASI stdout/stderr]: DEBUG: Stride: 128

[WASI stdout/stderr]: 
Error: 599 | 
600 |         console.log(
601 |             `[DEBUG] Calling encode_jpegls(ptr=${ptr}, len=${pixels.length}, w=${width}, h=${height}, bits=${bitsPerSample}, comps=${comps})`
602 |         );
603 | 
604 |         const resPtr = exports.encode_jpegls(
      ^
RuntimeError: Unreachable code should not be executed (evaluating 'exports.encode_jpegls(ptr, pixels.length, width, height, bitsPerSample, comps)')
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at unknown:1:1
      at encodeJpegLs (C:\Users\aroja\CODE\rad-parser\src\codecs\zig-codecs.ts:604:32)

