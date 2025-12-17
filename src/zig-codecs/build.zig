const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    });
    const optimize = .ReleaseSmall;

    // --- JPEG (LibJPEG-Turbo) ---
    const lib_jpeg = b.addExecutable(.{
        .name = "rad-codecs-jpeg",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lib_jpeg.addCSourceFile(.{ .file = b.path("src/jpeg.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG" } });

    lib_jpeg.addIncludePath(b.path("deps/libjpeg-turbo/src"));
    lib_jpeg.addIncludePath(b.path("deps/libjpeg-turbo"));
    lib_jpeg.addIncludePath(b.path("src/include")); // Mock setjmp

    addSources(b, lib_jpeg, "deps/libjpeg-turbo/src", &.{".c"}, &.{ "test", "bench", "example", "turbojpeg", "tj", "rd", "wr", "cdjpeg", "cjpeg.c", "djpeg.c", "jpegtran.c", "md5", "java", "simd", "transupp.c", "jstdhuff.c", "jdmrgext.c", "jdmrg565.c", "jdcol565.c", "jdcolext.c", "jccolext.c" }) catch |err| std.debug.print("Error adding JPG sources: {}\n", .{err});

    // Add specific TJ files
    const tj_flags = &.{ "-DINLINE=inline", "-O3", "-DNDEBUG" };
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
    b.installArtifact(lib_jpeg);

    // --- JPEG 2000 (OpenJPEG) ---
    const lib_j2k = b.addExecutable(.{
        .name = "rad-codecs-j2k",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lib_j2k.addCSourceFile(.{ .file = b.path("src/jpeg2000.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG" } });

    lib_j2k.addIncludePath(b.path("deps/openjpeg/src/lib/openjp2"));
    lib_j2k.root_module.addCMacro("OPJ_STATIC", "");
    lib_j2k.addCSourceFile(.{ .file = b.path("src/overrides/opj_clock.c"), .flags = &.{ "-O3", "-DNDEBUG" } });

    addSources(b, lib_j2k, "deps/openjpeg/src/lib/openjp2", &.{".c"}, &.{ "test", "bench", "opj_clock.c", "cidx_manager.c", "phix_manager.c", "ppix_manager.c", "thix_manager.c", "tpix_manager.c" }) catch |err| std.debug.print("Error adding OPJ sources: {}\n", .{err});
    lib_j2k.addCSourceFile(.{ .file = b.path("src/opj_dummy.c"), .flags = &.{} });

    lib_j2k.linkLibC();
    lib_j2k.linkLibCpp();
    lib_j2k.rdynamic = true;
    lib_j2k.entry = .disabled;
    b.installArtifact(lib_j2k);

    // --- JPEG-LS (CharLS) ---
    const lib_jpegls = b.addExecutable(.{
        .name = "rad-codecs-jpegls",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
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
    b.installArtifact(lib_jpegls);

    // --- RLE ---
    const lib_rle = b.addExecutable(.{
        .name = "rad-codecs-rle",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lib_rle.addCSourceFile(.{ .file = b.path("src/rle.cpp"), .flags = &.{ "-std=c++11", "-O3", "-DNDEBUG" } });

    lib_rle.linkLibC();
    lib_rle.linkLibCpp();
    lib_rle.rdynamic = true;
    lib_rle.entry = .disabled;
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
        var flags: []const []const u8 = &.{ "-O3", "-DNDEBUG", "-fno-sanitize=all", "-DINLINE=inline" };
        if (std.mem.eql(u8, ext, ".cpp")) {
            flags = &.{ "-O3", "-DNDEBUG", "-fno-sanitize=all", "-DINLINE=inline", "-std=c++17" };
        }

        lib.addCSourceFile(.{ .file = b.path(b.pathJoin(&.{ root, entry.path })), .flags = flags });
    }
}
