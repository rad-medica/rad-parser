const std = @import("std");

fn tuneWasmArtifact(lib: *std.Build.Step.Compile) void {
    // Reduce size without sacrificing ReleaseFast performance.
    lib.link_function_sections = true;
    lib.link_data_sections = true;
    lib.link_gc_sections = true;
    lib.discard_local_symbols = true;
    lib.lto = .thin;
}

pub fn build(b: *std.Build) void {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    });
    const optimize = .ReleaseFast;

    // --- JPEG (LibJPEG-Turbo) ---
    const lib_jpeg = b.addExecutable(.{
        .name = "rad-codecs-jpeg",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    lib_jpeg.addCSourceFile(.{ .file = b.path("src/jpeg.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG", "-ffunction-sections", "-fdata-sections" } });

    lib_jpeg.addIncludePath(b.path("deps/libjpeg-turbo/src"));
    lib_jpeg.addIncludePath(b.path("deps/libjpeg-turbo"));
    lib_jpeg.addIncludePath(b.path("src/include")); // Mock setjmp

    addSources(b, lib_jpeg, "deps/libjpeg-turbo/src", &.{".c"}, &.{ "test", "bench", "example", "turbojpeg", "tj", "rd", "wr", "cdjpeg", "cjpeg.c", "djpeg.c", "jpegtran.c", "md5", "java", "simd", "transupp.c", "jstdhuff.c", "jdmrgext.c", "jdmrg565.c", "jdcol565.c", "jdcolext.c", "jccolext.c" }) catch |err| std.debug.print("Error adding JPG sources: {}\n", .{err});

    // Add specific TJ files
    const tj_flags = &.{ "-DINLINE=inline", "-O3", "-DNDEBUG", "-ffunction-sections", "-fdata-sections" };
    lib_jpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-turbo/src/turbojpeg.c"), .flags = tj_flags });
    lib_jpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-turbo/src/transupp.c"), .flags = tj_flags });

    // Add 12-bit function stubs for 8-bit only build
    lib_jpeg.addCSourceFile(.{ .file = b.path("src/j12_stubs.c"), .flags = tj_flags });

    // Add TurboJPEG memory source/destination handlers
    lib_jpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-turbo/src/jdatasrc-tj.c"), .flags = tj_flags });
    lib_jpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-turbo/src/jdatadst-tj.c"), .flags = tj_flags });

    // 12-bit support disabled for now - requires complex CMake-style configuration
    // TODO: Re-enable once 12-bit compilation strategy is resolved
    // const flags12 = &.{ "-DINLINE=inline", "-O3", "-DNDEBUG", "-DBITS_IN_JSAMPLE=12" };
    // const wrapper_files_12: []const []const u8 = &.{
    //     "jcmainct-12.c", "jcprepct-12.c", "jccoefct-12.c", "jccolor-12.c", "jcsample-12.c", "jcdctmgr-12.c",
    //     "jfdctint-12.c", "jfdctfst-12.c",
    //     "jdmainct-12.c", "jdcoefct-12.c", "jdpostct-12.c", "jddctmgr-12.c", "jdsample-12.c", "jdcolor-12.c",
    //     "jquant1-12.c", "jquant2-12.c", "jdmerge-12.c",
    //     "jidctint-12.c", "jidctfst-12.c", "jidctflt-12.c", "jidctred-12.c",
    //     "jutils-12.c"
    // };
    // for (wrapper_files_12) |f| {
    //      const path = b.fmt("deps/libjpeg-turbo/src/wrapper/{s}", .{f});
    //      lib_jpeg.addCSourceFile(.{ .file = b.path(path), .flags = flags12 });
    // }

    lib_jpeg.linkLibC();
    lib_jpeg.linkLibCpp(); // For jpeg.cpp
    lib_jpeg.rdynamic = true;
    lib_jpeg.entry = .disabled;
    tuneWasmArtifact(lib_jpeg);
    b.installArtifact(lib_jpeg);

    // --- JPEG 2000 (OpenJPEG) ---
    const lib_j2k = b.addExecutable(.{
        .name = "rad-codecs-j2k",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    lib_j2k.addCSourceFile(.{ .file = b.path("src/jpeg2000.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG", "-ffunction-sections", "-fdata-sections" } });
    lib_j2k.addIncludePath(b.path("src/include"));
    lib_j2k.addIncludePath(b.path("deps/openjpeg/src/lib/openjp2"));

    const openjpeg_c_flags = &.{ "-std=c99", "-O3", "-DNDEBUG", "-DOPJ_HAVE_FSEEKO=0", "-ffunction-sections", "-fdata-sections" };
    const openjpeg_srcs = [_][]const u8{
        "deps/openjpeg/src/lib/openjp2/thread.c",
        "deps/openjpeg/src/lib/openjp2/bio.c",
        "deps/openjpeg/src/lib/openjp2/cio.c",
        "deps/openjpeg/src/lib/openjp2/dwt.c",
        "deps/openjpeg/src/lib/openjp2/event.c",
        "deps/openjpeg/src/lib/openjp2/image.c",
        "deps/openjpeg/src/lib/openjp2/ht_dec.c",
        "deps/openjpeg/src/lib/openjp2/invert.c",
        "deps/openjpeg/src/lib/openjp2/j2k.c",
        "deps/openjpeg/src/lib/openjp2/jp2.c",
        "deps/openjpeg/src/lib/openjp2/mct.c",
        "deps/openjpeg/src/lib/openjp2/mqc.c",
        "deps/openjpeg/src/lib/openjp2/openjpeg.c",
        // "deps/openjpeg/src/lib/openjp2/opj_clock.c", // Replaced by overrides
        "deps/openjpeg/src/lib/openjp2/pi.c",
        "deps/openjpeg/src/lib/openjp2/t1.c",
        "deps/openjpeg/src/lib/openjp2/t2.c",
        "deps/openjpeg/src/lib/openjp2/tcd.c",
        "deps/openjpeg/src/lib/openjp2/tgt.c",
        "deps/openjpeg/src/lib/openjp2/function_list.c",
        "deps/openjpeg/src/lib/openjp2/opj_malloc.c",
        "deps/openjpeg/src/lib/openjp2/sparse_array.c",
    };
    for (openjpeg_srcs) |src| {
        lib_j2k.addCSourceFile(.{ .file = b.path(src), .flags = openjpeg_c_flags });
    }
    lib_j2k.addCSourceFile(.{ .file = b.path("src/overrides/opj_clock.c"), .flags = openjpeg_c_flags });
    lib_j2k.linkLibCpp();
    lib_j2k.entry = .disabled;
    lib_j2k.rdynamic = true;
    tuneWasmArtifact(lib_j2k);
    b.installArtifact(lib_j2k);

    // --- HTJ2K (OpenJPH) ---
    const lib_htj2k = b.addExecutable(.{
        .name = "rad-codecs-htj2k",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    const htj2k_flags = &.{ "-std=c++11", "-O3", "-DNDEBUG", "-DOJPH_DISABLE_INTEL_SIMD", "-ffunction-sections", "-fdata-sections" };
    lib_htj2k.addCSourceFile(.{ .file = b.path("src/htj2k.cpp"), .flags = htj2k_flags });
    lib_htj2k.addIncludePath(b.path("deps/openjph/src/core/common"));

    const openjph_srcs = [_][]const u8{
        // Codestream
        "deps/openjph/src/core/codestream/ojph_codeblock.cpp",
        "deps/openjph/src/core/codestream/ojph_codeblock_fun.cpp",
        "deps/openjph/src/core/codestream/ojph_codestream.cpp",
        "deps/openjph/src/core/codestream/ojph_codestream_gen.cpp",
        "deps/openjph/src/core/codestream/ojph_codestream_local.cpp",
        "deps/openjph/src/core/codestream/ojph_params.cpp",
        "deps/openjph/src/core/codestream/ojph_precinct.cpp",
        "deps/openjph/src/core/codestream/ojph_resolution.cpp",
        "deps/openjph/src/core/codestream/ojph_subband.cpp",
        "deps/openjph/src/core/codestream/ojph_tile.cpp",
        "deps/openjph/src/core/codestream/ojph_tile_comp.cpp",
        // Coding
        "deps/openjph/src/core/coding/ojph_block_common.cpp",
        "deps/openjph/src/core/coding/ojph_block_decoder32.cpp",
        "deps/openjph/src/core/coding/ojph_block_decoder64.cpp",
        "deps/openjph/src/core/coding/ojph_block_encoder.cpp",
        // Others
        "deps/openjph/src/core/others/ojph_arch.cpp",
        "deps/openjph/src/core/others/ojph_file.cpp",
        "deps/openjph/src/core/others/ojph_mem.cpp",
        "deps/openjph/src/core/others/ojph_message.cpp",
        // Transform
        "deps/openjph/src/core/transform/ojph_colour.cpp",
        "deps/openjph/src/core/transform/ojph_transform.cpp",
    };
    lib_htj2k.addCSourceFile(.{ .file = b.path("src/cxx_stubs.cpp"), .flags = htj2k_flags });
    for (openjph_srcs) |src| {
        lib_htj2k.addCSourceFile(.{ .file = b.path(src), .flags = htj2k_flags });
    }
    lib_htj2k.linkLibC();
    lib_htj2k.linkLibCpp();
    lib_htj2k.entry = .disabled;
    lib_htj2k.rdynamic = true;
    tuneWasmArtifact(lib_htj2k);
    b.installArtifact(lib_htj2k);

    // --- JPEG Lossless (libjpeg-lj) ---
    const lib_ljpeg = b.addExecutable(.{
        .name = "rad-codecs-ljpeg",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    const ljpeg_flags = &.{ "-std=c++17", "-O3", "-DNDEBUG", "-fno-sanitize=all", "-DINLINE=inline", "-ffunction-sections", "-fdata-sections" };
    lib_ljpeg.addCSourceFile(.{ .file = b.path("src/ljpeg.cpp"), .flags = ljpeg_flags });
    lib_ljpeg.addCSourceFile(.{ .file = b.path("src/cxx_stubs.cpp"), .flags = ljpeg_flags });
    // Zig 0.15 Build API: `addCSourceFile` compiles both C and C++ based on file extension/flags.
    lib_ljpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-lj/io/bytestream.cpp"), .flags = ljpeg_flags });
    // libjpeg-lj expects the legacy BitmapHook() implementation (defined in cmd/bitmaphook.cpp).
    // Pull only that file (not the full cmd/ directory) to avoid dragging in duplicate/CLI-only code.
    lib_ljpeg.addCSourceFile(.{ .file = b.path("deps/libjpeg-lj/cmd/bitmaphook.cpp"), .flags = ljpeg_flags });
    lib_ljpeg.addIncludePath(b.path("deps/libjpeg-lj"));
    lib_ljpeg.addIncludePath(b.path("src/include"));
    lib_ljpeg.root_module.addCMacro("BUILD_LIB", "1");

    const ljpeg_excludes = &.{ "test", "bench", "fuzz", "cmd", "bytestream.cpp" };
    const ljpeg_dirs = [_][]const u8{
        "deps/libjpeg-lj/boxes",
        "deps/libjpeg-lj/codestream",
        "deps/libjpeg-lj/coding",
        "deps/libjpeg-lj/colortrafo",
        "deps/libjpeg-lj/control",
        "deps/libjpeg-lj/dct",
        "deps/libjpeg-lj/interface",
        "deps/libjpeg-lj/io",
        "deps/libjpeg-lj/marker",
        "deps/libjpeg-lj/std",
        "deps/libjpeg-lj/tools",
        "deps/libjpeg-lj/upsampling",
    };
    for (ljpeg_dirs) |dir| {
        addSources(b, lib_ljpeg, dir, &.{ ".cpp", ".c" }, ljpeg_excludes) catch |err|
            std.debug.print("Error adding LJPEG sources from {s}: {}\n", .{ dir, err });
    }

    // Commands helper - ensure only one bitmaphook is used. interface/bitmaphook.cpp is added by addSources.
    // cmd/bitmaphook.cpp is NOT added.

    lib_ljpeg.linkLibC();
    lib_ljpeg.linkLibCpp();
    lib_ljpeg.entry = .disabled;
    lib_ljpeg.rdynamic = true;
    tuneWasmArtifact(lib_ljpeg);
    b.installArtifact(lib_ljpeg);

    // --- JPEG-LS (CharLS) ---
    const lib_jpegls = b.addExecutable(.{
        .name = "rad-codecs-jpegls",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    // Note: CharLS requires C++14/17
    lib_jpegls.addCSourceFile(.{ .file = b.path("src/jpegls.cpp"), .flags = &.{ "-std=c++17", "-O3", "-DNDEBUG" } });
    lib_jpegls.addCSourceFile(.{ .file = b.path("src/cxx_stubs.cpp"), .flags = &.{ "-std=c++17", "-O3", "-DNDEBUG" } });

    lib_jpegls.addIncludePath(b.path("deps/charls/include"));
    lib_jpegls.addIncludePath(b.path("deps/charls/src"));
    lib_jpegls.root_module.addCMacro("CHARLS_STATIC", "");

    addSources(b, lib_jpegls, "deps/charls/src", &.{".cpp"}, &.{ "test", "bench", "fuzz" }) catch |err| std.debug.print("Error adding CharLS sources: {}\n", .{err});

    lib_jpegls.linkLibC();
    lib_jpegls.linkLibCpp();
    lib_jpegls.rdynamic = true;
    lib_jpegls.entry = .disabled;
    tuneWasmArtifact(lib_jpegls);
    b.installArtifact(lib_jpegls);

    // --- RLE ---
    const lib_rle = b.addExecutable(.{
        .name = "rad-codecs-rle",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .strip = true,
            .single_threaded = true,
        }),
    });

    lib_rle.addCSourceFile(.{ .file = b.path("src/rle.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG", "-ffunction-sections", "-fdata-sections" } });

    lib_rle.linkLibC();
    lib_rle.linkLibCpp();
    lib_rle.rdynamic = true;
    lib_rle.entry = .disabled;
    tuneWasmArtifact(lib_rle);
    b.installArtifact(lib_rle);
}

fn addSources(b: *std.Build, lib: *std.Build.Step.Compile, root: []const u8, exts: []const []const u8, excludes: []const []const u8) !void {
    var dir = try std.fs.cwd().openDir(root, .{ .iterate = true });
    defer dir.close();
    var walker = try dir.walk(b.allocator);
    defer walker.deinit();

    while (try walker.next()) |entry| {
        if (entry.kind != .file) continue;
        const ext = std.fs.path.extension(entry.basename);
        var match = false;
        for (exts) |e| {
            if (std.mem.eql(u8, ext, e)) {
                match = true;
                break;
            }
        }
        if (!match) continue;

        var excluded = false;
        for (excludes) |ex| {
            if (std.mem.indexOf(u8, entry.path, ex) != null) {
                excluded = true;
                break;
            }
            if (std.mem.indexOf(u8, entry.basename, ex) != null) {
                excluded = true;
                break;
            }
        }
        if (excluded) continue;

        // Check for specific flags needed per file
        var flags: []const []const u8 = &.{ "-O3", "-DNDEBUG", "-fno-sanitize=all", "-DINLINE=inline", "-ffunction-sections", "-fdata-sections" };
        if (std.mem.eql(u8, ext, ".cpp")) {
            flags = &.{ "-O3", "-DNDEBUG", "-fno-sanitize=all", "-DINLINE=inline", "-std=c++17", "-ffunction-sections", "-fdata-sections" };
        }

        lib.addCSourceFile(.{ .file = b.path(b.pathJoin(&.{ root, entry.path })), .flags = flags });
    }
}
