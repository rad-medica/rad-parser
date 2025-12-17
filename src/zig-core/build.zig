const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{
        .default_target = .{
            .cpu_arch = .wasm32,
            .os_tag = .freestanding,
        },
    });
    const optimize = b.standardOptimizeOption(.{ .preferred_optimize_mode = .ReleaseSmall });

    const lib_core = b.addExecutable(.{
        .name = "rad-core",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lib_core.addCSourceFile(.{
        .file = b.path("src/core.c"),
        .flags = &.{ "-O3", "-DNDEBUG", "-fno-builtin" },
    });

    lib_core.rdynamic = true;
    lib_core.entry = .disabled;
    b.installArtifact(lib_core);
}
