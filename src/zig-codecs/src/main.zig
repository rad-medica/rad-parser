const std = @import("std");
const allocator = std.heap.wasm_allocator;
const builtin = @import("builtin");

var last_result_ptr: ?[*]u8 = null;
var last_result_len: usize = 0;

export fn get_result_ptr() ?[*]u8 {
    return last_result_ptr;
}
export fn get_result_len() usize {
    return last_result_len;
}

export fn alloc(len: usize) ?[*]u8 {
    const buf = allocator.alloc(u8, len) catch return null;
    return buf.ptr;
}

export fn free(ptr: [*]u8, len: usize) void {
    allocator.free(ptr[0..len]);
}

// --- CharLS C API ---
extern "C" fn CharlsJpeglsDecoderCreate() ?*anyopaque;
extern "C" fn CharlsJpeglsDecoderDestroy(?*anyopaque) void;
extern "C" fn CharlsJpeglsDecoderSetSourceBuffer(?*anyopaque, [*]const u8, usize) c_int;
extern "C" fn CharlsJpeglsDecoderReadHeader(?*anyopaque) c_int;
extern "C" fn CharlsJpeglsDecoderGetFrameInfo(?*anyopaque, *FrameInfo) c_int;
extern "C" fn CharlsJpeglsDecoderDecodeToBuffer(?*anyopaque, [*]u8, usize, u32) c_int;

extern "C" fn CharlsJpeglsEncoderCreate() ?*anyopaque;
extern "C" fn CharlsJpeglsEncoderDestroy(?*anyopaque) void;
extern "C" fn CharlsJpeglsEncoderSetFrameInfo(?*anyopaque, *const FrameInfo) c_int;
extern "C" fn CharlsJpeglsEncoderSetDestinationBuffer(?*anyopaque, [*]u8, usize) c_int;
extern "C" fn CharlsJpeglsEncoderEncodeFromBuffer(?*anyopaque, [*]const u8, usize, u32) c_int;
extern "C" fn CharlsJpeglsEncoderGetEstimatedDestinationSize(?*anyopaque, *usize) c_int;
extern "C" fn CharlsJpeglsEncoderGetBytesWritten(?*anyopaque, *usize) c_int;

const FrameInfo = extern struct {
    width: u32,
    height: u32,
    bitsPerSample: i32,
    componentCount: i32,
};

// --- TurboJPEG C API ---
extern "C" fn tjInitDecompress() ?*anyopaque;
extern "C" fn tjDecompressHeader3(?*anyopaque, [*]const u8, c_ulong, *c_int, *c_int, *c_int, *c_int) c_int;
extern "C" fn tjDecompress2(?*anyopaque, [*]const u8, c_ulong, [*]u8, c_int, c_int, c_int, c_int, c_int) c_int;
extern "C" fn tjDestroy(?*anyopaque) c_int;
extern "C" fn tjInitCompress() ?*anyopaque;
extern "C" fn tjCompress2(?*anyopaque, [*]const u8, c_int, c_int, c_int, c_int, *[*]u8, *c_ulong, c_int, c_int, c_int) c_int;
extern "C" fn tjFree([*]u8) void;

const TJPF_RGB = 0;
const TJSAMP_444 = 0;
const TJFLAG_FASTDCT = 2048;

// --- OpenJPEG C API ---
const OPJ_CODEC_J2K = 0;
const OPJ_CODEC_JP2 = 1;
const OPJ_CLRSPC_SRGB = 1;
const OPJ_CLRSPC_GRAY = 2;

const opj_dparameters_t = extern struct {
    cp_reduce: u32,
    cp_layer: u32,
    // ... other fields ignore for now, we use defaults
    padding: [100]u8,
};

const opj_image_comp_t = extern struct {
    dx: u32,
    dy: u32,
    w: u32,
    h: u32,
    x0: u32,
    y0: u32,
    prec: u32,
    bpp: u32,
    sgnd: u32,
    resno_decoded: u32,
    factor: u32,
    data: [*]i32,
    alpha: u16,
};

const opj_image_t = extern struct {
    x0: u32,
    y0: u32,
    x1: u32,
    y1: u32,
    numcomps: u32,
    color_space: u32,
    comps: [*]opj_image_comp_t,
    icc_profile_buf: [*]u8,
    icc_profile_len: u32,
};

const opj_cparameters_t = extern struct {
    tile_size_on: bool,
    cp_tx0: c_int,
    cp_ty0: c_int,
    cp_tdx: c_int,
    cp_tdy: c_int,
    cp_disto_alloc: c_int,
    cp_fixed_alloc: c_int,
    cp_fixed_quality: c_int,
    cp_matrice: ?*c_int,
    cp_comment: ?*c_char,
    csty: c_int,
    prog_order: c_int,
    poc_hefts: [32]opj_poc_t, // Simplify
    padding: [200]u8,
};
const opj_poc_t = extern struct { resno0: c_int, compno0: c_int, layno1: c_int, resno1: c_int, compno1: c_int, layno0: c_int, prg: c_int, tile: c_int, progorder: [5]c_char };

// Function pointers for helper
const opj_stream_read_fn = *const fn (p_buffer: [*]u8, p_nb_bytes: usize, p_user_data: ?*anyopaque) callconv(.c) usize;
const opj_stream_write_fn = *const fn (p_buffer: [*]u8, p_nb_bytes: usize, p_user_data: ?*anyopaque) callconv(.c) usize;
const opj_stream_skip_fn = *const fn (p_nb_bytes: i64, p_user_data: ?*anyopaque) callconv(.c) i64;
const opj_stream_seek_fn = *const fn (p_nb_bytes: i64, p_user_data: ?*anyopaque) callconv(.c) bool;

extern "C" fn opj_create_decompress(u32) ?*anyopaque;
extern "C" fn opj_destroy_codec(?*anyopaque) void;
extern "C" fn opj_set_default_decoder_parameters(*opj_dparameters_t) void;
extern "C" fn opj_setup_decoder(?*anyopaque, *opj_dparameters_t) bool;
extern "C" fn opj_read_header(?*anyopaque, ?*anyopaque, *?*opj_image_t) bool;
extern "C" fn opj_decode(?*anyopaque, ?*anyopaque, *?*opj_image_t) bool;
extern "C" fn opj_end_decompress(?*anyopaque, ?*anyopaque) bool;
extern "C" fn opj_image_destroy(?*opj_image_t) void;

// Encoding externs
extern "C" fn opj_create_compress(u32) ?*anyopaque;
extern "C" fn opj_setup_encoder(?*anyopaque, *opj_cparameters_t, *opj_image_t) bool;
extern "C" fn opj_start_compress(?*anyopaque, *opj_image_t, ?*anyopaque) bool;
extern "C" fn opj_encode(?*anyopaque, ?*anyopaque) bool;
extern "C" fn opj_end_compress(?*anyopaque, ?*anyopaque) bool;
extern "C" fn wrapper_create_cparameters() ?*anyopaque;
extern "C" fn wrapper_destroy_cparameters(?*anyopaque) void;
extern "C" fn wrapper_set_default_encoder_parameters(?*anyopaque) void;
extern "C" fn wrapper_setup_encoder_parameters(?*anyopaque, c_int, c_int) void;

extern "C" fn opj_image_create(u32, *opj_image_cmptparm_t, u32) ?*opj_image_t;

const opj_image_cmptparm_t = extern struct {
    dx: u32,
    dy: u32,
    w: u32,
    h: u32,
    x0: u32,
    y0: u32,
    prec: u32,
    bpp: u32,
    sgnd: u32,
};

extern "C" fn opj_stream_default_create(bool) ?*anyopaque;
extern "C" fn opj_stream_set_read_function(?*anyopaque, opj_stream_read_fn) void;
extern "C" fn opj_stream_set_write_function(?*anyopaque, opj_stream_write_fn) void;
extern "C" fn opj_stream_set_seek_function(?*anyopaque, opj_stream_seek_fn) void;
extern "C" fn opj_stream_set_skip_function(?*anyopaque, opj_stream_skip_fn) void;
extern "C" fn opj_stream_set_user_data(?*anyopaque, ?*anyopaque, ?*anyopaque) void;
extern "C" fn opj_stream_set_user_data_length(?*anyopaque, u64) void;
extern "C" fn opj_stream_destroy(?*anyopaque) void;

// Memory stream helper
const MemoryStream = struct {
    data: [*]const u8,
    len: usize,
    offset: usize,
    // For writing
    capacity: usize = 0,
    own_data: bool = false,
};

fn read_fn(p_buffer: [*]u8, p_nb_bytes: usize, p_user_data: ?*anyopaque) callconv(.c) usize {
    var stream = @as(*MemoryStream, @ptrCast(@alignCast(p_user_data)));
    if (stream.offset >= stream.len) return std.math.maxInt(usize); // -1 cast to size_t

    var count = p_nb_bytes;
    if (stream.offset + count > stream.len) {
        count = stream.len - stream.offset;
    }

    @memcpy(p_buffer[0..count], stream.data[stream.offset .. stream.offset + count]);
    stream.offset += count;
    return count;
}

fn skip_fn(p_nb_bytes: i64, p_user_data: ?*anyopaque) callconv(.c) i64 {
    var stream = @as(*MemoryStream, @ptrCast(@alignCast(p_user_data)));
    if (p_nb_bytes < 0) return -1;

    const inc = @as(usize, @intCast(p_nb_bytes));
    if (stream.offset + inc > stream.len) {
        stream.offset = stream.len;
        return @as(i64, @intCast(stream.len - (stream.offset - inc))); // Bytes skipped
    }
    stream.offset += inc;
    return p_nb_bytes;
}

fn seek_fn(p_nb_bytes: i64, p_user_data: ?*anyopaque) callconv(.c) bool {
    var stream = @as(*MemoryStream, @ptrCast(@alignCast(p_user_data)));
    if (p_nb_bytes < 0) return false;
    const off = @as(usize, @intCast(p_nb_bytes));
    if (off > stream.len) return false;
    stream.offset = off;
    return true;
}

// --- Implementation ---

export fn decode_jpegls(data_ptr: [*]const u8, data_len: usize) c_int {
    const decoder = CharlsJpeglsDecoderCreate();
    if (decoder == null) return -1;
    defer CharlsJpeglsDecoderDestroy(decoder);

    if (CharlsJpeglsDecoderSetSourceBuffer(decoder, data_ptr, data_len) != 0) return -2;
    if (CharlsJpeglsDecoderReadHeader(decoder) != 0) return -3;

    var info: FrameInfo = undefined;
    if (CharlsJpeglsDecoderGetFrameInfo(decoder, &info) != 0) return -4;

    const dest_len = @as(usize, info.width) * @as(usize, info.height) * @as(usize, @intCast(info.componentCount)) * (if (info.bitsPerSample > 8) @as(usize, 2) else @as(usize, 1));
    const result_buf = allocator.alloc(u8, dest_len) catch return -5;

    if (CharlsJpeglsDecoderDecodeToBuffer(decoder, result_buf.ptr, dest_len, 0) != 0) {
        allocator.free(result_buf);
        return -6;
    }

    last_result_ptr = result_buf.ptr;
    last_result_len = dest_len;
    return 0;
}

export fn encode_jpegls(pixel_data: [*]const u8, len: usize, width: u32, height: u32, bits_per_sample: i32, components: i32) c_int {
    const encoder = CharlsJpeglsEncoderCreate();
    if (encoder == null) return -1;
    defer CharlsJpeglsEncoderDestroy(encoder);

    const info = FrameInfo{ .width = width, .height = height, .bitsPerSample = bits_per_sample, .componentCount = components };

    if (CharlsJpeglsEncoderSetFrameInfo(encoder, &info) != 0) return -2;
    var est_size: usize = 0;
    if (CharlsJpeglsEncoderGetEstimatedDestinationSize(encoder, &est_size) != 0) return -3;

    const dest_buf = allocator.alloc(u8, est_size) catch return -4;

    if (CharlsJpeglsEncoderSetDestinationBuffer(encoder, dest_buf.ptr, est_size) != 0) {
        allocator.free(dest_buf);
        return -5;
    }
    if (CharlsJpeglsEncoderEncodeFromBuffer(encoder, pixel_data, len, 0) != 0) {
        allocator.free(dest_buf);
        return -6;
    }
    var written: usize = 0;
    if (CharlsJpeglsEncoderGetBytesWritten(encoder, &written) != 0) {
        allocator.free(dest_buf);
        return -7;
    }
    last_result_ptr = dest_buf.ptr;
    last_result_len = written;
    return 0;
}

export fn decode_jpeg(data_ptr: [*]const u8, data_len: usize) c_int {
    const handle = tjInitDecompress();
    if (handle == null) return -1;
    defer _ = tjDestroy(handle);

    var width: c_int = 0;
    var height: c_int = 0;
    var jpegSubsamp: c_int = 0;
    var jpegColorspace: c_int = 0;

    if (tjDecompressHeader3(handle, data_ptr, data_len, &width, &height, &jpegSubsamp, &jpegColorspace) != 0) return -2;

    const pixel_size: usize = 3;
    const pitch = width * @as(c_int, @intCast(pixel_size));
    const dest_len = @as(usize, @intCast(pitch * height));
    const result_buf = allocator.alloc(u8, dest_len) catch return -3;

    if (tjDecompress2(handle, data_ptr, data_len, result_buf.ptr, width, pitch, height, TJPF_RGB, TJFLAG_FASTDCT) != 0) {
        allocator.free(result_buf);
        return -4;
    }

    last_result_ptr = result_buf.ptr;
    last_result_len = dest_len;
    return 0;
}

const TJPF_GRAY = 2;
const TJSAMP_GRAY = 3;

// bits param added:
export fn encode_jpeg(pixel_data: [*]const u8, len: usize, width: u32, height: u32, components: i32, quality: u8, bits: i32) c_int {
    _ = len;

    // Check if we need to downscale
    var src_ptr = pixel_data;
    var temp_buf: ?[]u8 = null; // To hold downscaled data if needed

    if (bits > 8) {
        // Downscale 16-bit to 8-bit
        // Assuming Little Endian 16-bit (DICOM standard)
        // We will just take the lower 8 bits or high 8 bits?
        // Usually, if bits_stored > 8, the values are in the lower bits, but significant.
        // If we want to visualize it in 8-bit JPEG, we typically just take the stored values.
        // However, if values > 255, we clamp? Or shift?
        // Simple approach: Shift by (bits - 8).
        // If bits=12, shift right by 4.
        // If bits=16, shift right by 8.

        const num_pixels = @as(usize, width) * @as(usize, height) * @as(usize, @intCast(components));
        const alloc_len = num_pixels; // 8-bit

        temp_buf = allocator.alloc(u8, alloc_len) catch return -20;
        const out_ptr = temp_buf.?.ptr;

        const shift: u4 = if (bits > 8) @as(u4, @intCast(bits - 8)) else 0;

        // 16-bit input
        const src_u16 = @as([*]const u16, @ptrCast(@alignCast(pixel_data)));

        for (0..num_pixels) |i| {
            const val = src_u16[i];
            // Downscale
            out_ptr[i] = @as(u8, @intCast((val >> shift) & 0xFF));
        }

        src_ptr = out_ptr;
    }

    const handle = tjInitCompress();
    if (handle == null) {
        if (temp_buf) |buf| allocator.free(buf);
        return -999; // Unique error code to verify build
    }
    defer _ = tjDestroy(handle);

    var jpegBuf: [*]u8 = undefined;
    var jpegSize: c_ulong = 0;

    var pixelFormat: c_int = TJPF_RGB;
    var subsamp: c_int = TJSAMP_444;

    if (components == 1) {
        pixelFormat = TJPF_GRAY;
        subsamp = TJSAMP_GRAY;
    } else if (components == 3) {
        pixelFormat = TJPF_RGB;
        subsamp = TJSAMP_444;
    } else {
        if (temp_buf) |buf| allocator.free(buf);
        return -14; // Unsupported component count
    }

    if (tjCompress2(handle, src_ptr, @as(c_int, @intCast(width)), 0, @as(c_int, @intCast(height)), pixelFormat, &jpegBuf, &jpegSize, subsamp, @as(c_int, @intCast(quality)), TJFLAG_FASTDCT) != 0) {
        if (temp_buf) |buf| allocator.free(buf);
        return -12;
    }

    const result_buf = allocator.alloc(u8, jpegSize) catch {
        tjFree(jpegBuf);
        if (temp_buf) |buf| allocator.free(buf);
        return -13;
    };
    @memcpy(result_buf[0..jpegSize], jpegBuf[0..jpegSize]);
    tjFree(jpegBuf);

    if (temp_buf) |buf| allocator.free(buf); // Free temp downscaled buffer

    last_result_ptr = result_buf.ptr;
    last_result_len = jpegSize;
    return 0;
}

// --- JPEG 2000 ---

export fn decode_jpeg2000(data_ptr: [*]const u8, data_len: usize) c_int {
    // Detect JP2 vs J2K signatures
    // JP2 signature: 00 00 00 0c 6a 50 20 20 0d 0a 87 0a
    // J2K signature: ff 4f ff 51 (SOC)
    var codec_fmt: u32 = OPJ_CODEC_J2K;
    if (data_len >= 12 and std.mem.eql(u8, data_ptr[0..12], &[_]u8{ 0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a })) {
        codec_fmt = OPJ_CODEC_JP2;
    }

    const l_codec = opj_create_decompress(codec_fmt);
    if (l_codec == null) return -1;
    defer opj_destroy_codec(l_codec);

    var params: opj_dparameters_t = undefined;
    opj_set_default_decoder_parameters(&params);
    if (!opj_setup_decoder(l_codec, &params)) return -2;

    var stream_data = MemoryStream{ .data = data_ptr, .len = data_len, .offset = 0 };
    const l_stream = opj_stream_default_create(true);
    if (l_stream == null) return -3;
    defer opj_stream_destroy(l_stream);

    opj_stream_set_read_function(l_stream, read_fn);
    opj_stream_set_skip_function(l_stream, skip_fn);
    opj_stream_set_seek_function(l_stream, seek_fn);
    opj_stream_set_user_data(l_stream, &stream_data, null);
    opj_stream_set_user_data_length(l_stream, data_len);

    var image: ?*opj_image_t = null;
    if (!opj_read_header(l_stream, l_codec, &image)) return -4;

    // Decompress entire image
    if (!opj_decode(l_codec, l_stream, &image)) {
        if (image != null) opj_image_destroy(image);
        return -5;
    }
    if (!opj_end_decompress(l_codec, l_stream)) {
        if (image != null) opj_image_destroy(image);
        return -6;
    }

    if (image) |img| {
        // Interleave components into RGB/Gray buffer
        // Assumption: 8-bit or 16-bit.
        // dest size = w * h * components * (depth/8)

        const w = img.x1 - img.x0;
        const h = img.y1 - img.y0;
        const comps = img.numcomps;

        // Check depth
        const depth = img.comps[0].prec;
        const bytes_per = if (depth > 8) @as(usize, 2) else @as(usize, 1);

        const size = @as(usize, w) * @as(usize, h) * @as(usize, comps) * bytes_per;
        const out_buf = allocator.alloc(u8, size) catch {
            opj_image_destroy(image);
            return -7;
        };

        const total_pixels = w * h;
        for (0..total_pixels) |i| {
            for (0..comps) |c| {
                const comp_data = img.comps[c].data;
                const val = comp_data[i];
                const out_idx = i * comps * bytes_per + c * bytes_per;
                if (bytes_per == 1) {
                    out_buf[out_idx] = @as(u8, @intCast(@max(0, @min(255, val))));
                } else {
                    // Little endian 16-bit
                    const u16_val = @as(u16, @intCast(@max(0, @min(65535, val))));
                    out_buf[out_idx] = @as(u8, @intCast(u16_val & 0xFF));
                    out_buf[out_idx + 1] = @as(u8, @intCast((u16_val >> 8) & 0xFF));
                }
            }
        }

        opj_image_destroy(image);
        last_result_ptr = out_buf.ptr;
        last_result_len = size;
        return 0;
    }

    return -8;
}

fn write_fn(p_buffer: [*]u8, p_nb_bytes: usize, p_user_data: ?*anyopaque) callconv(.c) usize {
    var stream = @as(*MemoryStream, @ptrCast(@alignCast(p_user_data)));

    // We need to grow the buffer if needed.
    // Since 'stream.data' is const pointer in some contexts, we should use a separate writable buffer for encoding.
    // In MemoryStream struct, I added 'capacity'. We assume 'data' points to writable memory if we are writing?
    // Actually, 'data' is defined as '[*]const u8'. We need a way to support writing.
    // Let's assume for writing, we treat 'data' as '[*]u8' via casting, provided we allocated it.

    // Simplified: Check capacity
    // If not enough capacity, realloc? But allocator is global.
    // For simplicity, let's assume we pre-allocate a large buffer or use a dynamic array logic?
    // Dynamic array logic is better.

    // BUT, opj_stream callbacks don't easily support realloc because the stream might hold pointers?
    // Actually, we just update the pointer in our struct.

    // Hack: We need a writable buffer.
    // Let's cast away const, assuming the user initialized it correctly for writing.
    // Or better, add a 'write_buf: [*]u8' to MemoryStream?

    // Let's implement dynamic growth.
    const needed = stream.offset + p_nb_bytes;
    if (needed > stream.capacity) {
        // Grow
        var new_cap = stream.capacity;
        if (new_cap == 0) new_cap = 1024;
        while (new_cap < needed) new_cap *= 2;

        const old_ptr = @as([*]u8, @ptrCast(@constCast(stream.data))); // DANGEROUS unless we own it.
        // We will add a flag 'own_data' to MemoryStream.

        if (stream.own_data) {
            const new_buf_slice = allocator.realloc(old_ptr[0..stream.capacity], new_cap) catch return std.math.maxInt(usize); // Error
            stream.data = new_buf_slice.ptr;
            stream.capacity = new_buf_slice.len;
        } else {
            // Initial alloc
            const new_buf = allocator.alloc(u8, new_cap) catch return std.math.maxInt(usize);
            if (stream.len > 0) @memcpy(new_buf[0..stream.len], stream.data[0..stream.len]);
            stream.data = new_buf.ptr;
            stream.capacity = new_cap;
            stream.own_data = true;
        }
    }

    const ptr = @as([*]u8, @ptrCast(@constCast(stream.data)));
    @memcpy(ptr[stream.offset .. stream.offset + p_nb_bytes], p_buffer[0..p_nb_bytes]);
    stream.offset += p_nb_bytes;
    if (stream.offset > stream.len) stream.len = stream.offset;

    return p_nb_bytes;
}

export fn encode_jpeg2000(pixel_data: [*]const u8, len: usize, width: u32, height: u32, bits_per_sample: u8, components: u8) c_int {
    _ = len;

    // 1. Create opj_image_t
    var cmptparm: [3]opj_image_cmptparm_t = undefined;
    for (0..@as(usize, components)) |i| {
        cmptparm[i].dx = 1;
        cmptparm[i].dy = 1;
        cmptparm[i].w = width;
        cmptparm[i].h = height;
        cmptparm[i].x0 = 0;
        cmptparm[i].y0 = 0;
        cmptparm[i].prec = bits_per_sample;
        cmptparm[i].bpp = bits_per_sample;
        cmptparm[i].sgnd = 0;
    }

    const color_space: u32 = if (components >= 3) OPJ_CLRSPC_SRGB else OPJ_CLRSPC_GRAY;
    const image_opt = opj_image_create(@as(u32, components), &cmptparm[0], color_space);
    if (image_opt == null) return -1;
    defer opj_image_destroy(image_opt);
    const image = image_opt.?;

    image.*.x0 = 0;
    image.*.y0 = 0;
    image.*.x1 = width;
    image.*.y1 = height;

    // 2. Fill image data
    const bytes_per = if (bits_per_sample > 8) @as(usize, 2) else @as(usize, 1);
    const total_pixels = @as(usize, width) * @as(usize, height);

    for (0..total_pixels) |i| {
        for (0..@as(usize, components)) |c| {
            const in_idx = i * components * bytes_per + c * bytes_per;
            var val: i32 = 0;
            if (bytes_per == 1) {
                val = pixel_data[in_idx];
            } else {
                val = @as(i32, pixel_data[in_idx]) | (@as(i32, pixel_data[in_idx + 1]) << 8);
            }
            image.*.comps[c].data[i] = val;
        }
    }

    // 3. Compress
    // var params: opj_cparameters_t = undefined; // Too complex to alloc on stack
    const params_ptr = wrapper_create_cparameters();
    if (params_ptr == null) return -2;
    defer wrapper_destroy_cparameters(params_ptr);

    wrapper_set_default_encoder_parameters(params_ptr);

    const use_mct: c_int = if (components >= 3) 1 else 0;
    const lossless: c_int = 1;
    wrapper_setup_encoder_parameters(params_ptr, use_mct, lossless);

    const l_codec = opj_create_compress(OPJ_CODEC_J2K);
    if (l_codec == null) return -3;
    defer opj_destroy_codec(l_codec);

    if (!opj_setup_encoder(l_codec, @ptrCast(@alignCast(params_ptr)), image)) return -8;

    var stream_data = MemoryStream{ .data = undefined, .len = 0, .offset = 0, .capacity = 0, .own_data = false };
    const l_stream = opj_stream_default_create(false);
    if (l_stream == null) return -4;
    defer opj_stream_destroy(l_stream);

    opj_stream_set_write_function(l_stream, write_fn);
    opj_stream_set_seek_function(l_stream, seek_fn);
    opj_stream_set_skip_function(l_stream, skip_fn);
    opj_stream_set_user_data(l_stream, &stream_data, null);

    if (!opj_start_compress(l_codec, image, l_stream)) return -5;
    if (!opj_encode(l_codec, l_stream)) return -6;
    if (!opj_end_compress(l_codec, l_stream)) return -7;

    // Free internal buffer via Global allocator logic
    // We need to pass ownership to last_result_ptr
    if (stream_data.own_data) {
        last_result_ptr = @as([*]u8, @ptrCast(@constCast(stream_data.data)));
        last_result_len = stream_data.len;
    } else {
        // Unexpected if using write_fn as implemented above
        return -7;
    }

    return 0;
}

export fn decode_rle(data_ptr: [*]const u8, data_len: usize, width: u32, height: u32, components: u32) c_int {
    if (data_len < 64) return -1; // Header size

    // Read header (16 u32 le)
    const header = @as([*]const u32, @ptrCast(@alignCast(data_ptr)));
    const num_segments = header[0];
    if (num_segments != components) return -2; // Simplification: strict match

    // Validate offsets
    var offsets: [16]u32 = undefined;
    for (0..num_segments) |i| {
        offsets[i] = header[i + 1];
        if (offsets[i] >= data_len) return -3;
    }

    const num_pixels = width * height;
    const dest_len = num_pixels * components;
    const result_buf = allocator.alloc(u8, dest_len) catch return -4;

    for (0..num_segments) |s| {
        const start_offset = offsets[s];
        const end_offset = if (s + 1 < num_segments) offsets[s + 1] else data_len;

        var src_idx = start_offset;
        var dest_idx = s; // Planar to Interleaved: writes to s, s+components, ...

        while (src_idx < end_offset and dest_idx < dest_len) {
            if (src_idx >= data_len) break;
            const n = @as(i8, @bitCast(data_ptr[src_idx]));
            src_idx += 1;

            if (n >= 0) {
                // Literal run (n+1 bytes)
                const count = @as(usize, @intCast(n)) + 1;
                for (0..count) |_| {
                    if (src_idx >= data_len) break;
                    result_buf[dest_idx] = data_ptr[src_idx];
                    src_idx += 1;
                    dest_idx += components;
                }
            } else if (n > -128) {
                // Repeat run (-n + 1 times)
                const count = @as(usize, @intCast(-n)) + 1;
                if (src_idx >= data_len) break;
                const val = data_ptr[src_idx];
                src_idx += 1;
                for (0..count) |_| {
                    result_buf[dest_idx] = val;
                    dest_idx += components;
                }
            } else {
                // n == -128, No-op
            }
        }
    }

    last_result_ptr = result_buf.ptr;
    last_result_len = dest_len;
    return 0;
}

export fn encode_rle(pixel_data: [*]const u8, len: usize, width: u32, height: u32, components: u32) c_int {
    // Determine max size (worst case: each byte becomes 2 bytes)
    // plus header
    const max_size = len * 2 + 64;
    const dest_buf = allocator.alloc(u8, max_size) catch return -1;

    const header = @as([*]u32, @ptrCast(@alignCast(dest_buf.ptr)));
    header[0] = components;

    var current_offset: u32 = 64;

    for (0..components) |c| {
        header[c + 1] = current_offset;

        // Compress component c
        // Gather bytes for component c
        // We can do on-the-fly, but PackBits requires lookahead/buffer.
        // Simple approach: Extract plane, then compress.

        const num_pixels = width * height;
        // Optimization: Compress directly from interleaved source

        var src_idx = c;
        // We need to implement PackBits encoder.

        // Simple RLE Encoder
        var i: usize = 0;
        while (i < num_pixels) {
            // Check for run
            const start_val = pixel_data[src_idx];
            var run_len: usize = 1;
            var run_idx = src_idx + components;

            while (i + run_len < num_pixels and run_len < 128) {
                if (pixel_data[run_idx] != start_val) break;
                run_len += 1;
                run_idx += components;
            }

            if (run_len > 2) { // Determine heuristic for run vs literal?
                // Replicate run
                // Output: negate(run_len - 1)
                const n = -@as(i8, @intCast(run_len - 1));
                dest_buf[current_offset] = @as(u8, @bitCast(n));
                current_offset += 1;
                dest_buf[current_offset] = start_val;
                current_offset += 1;

                i += run_len;
                src_idx += components * run_len;
            } else {
                // Literal run
                // Find length of literals
                var lit_len: usize = 0;
                var lit_idx = src_idx;
                // Look ahead until we find a run > 2 or max 128
                while (i + lit_len < num_pixels and lit_len < 128) {
                    // Check if next 3 are same?
                    if (i + lit_len + 2 < num_pixels) {
                        const v1 = pixel_data[lit_idx];
                        const v2 = pixel_data[lit_idx + components];
                        const v3 = pixel_data[lit_idx + components * 2];
                        if (v1 == v2 and v2 == v3) break; // Found a run
                    }
                    lit_len += 1;
                    lit_idx += components;
                }

                const n = @as(i8, @intCast(lit_len - 1));
                dest_buf[current_offset] = @as(u8, @bitCast(n));
                current_offset += 1;

                var copy_idx = src_idx;
                for (0..lit_len) |_| {
                    dest_buf[current_offset] = pixel_data[copy_idx];
                    current_offset += 1;
                    copy_idx += components;
                }

                i += lit_len;
                src_idx += components * lit_len;
            }
        }
    }

    // Realloc strict size? Or just return size.
    // Return correct size buffer.
    const final_buf = allocator.realloc(dest_buf, current_offset) catch dest_buf; // ignore failure to shrink
    last_result_ptr = final_buf.ptr;
    last_result_len = current_offset;

    return 0;
}

pub fn main() void {}
