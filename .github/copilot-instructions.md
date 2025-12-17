# GitHub Copilot Instructions for rad-parser

## Project Context

You are working on **rad-parser**, a high-performance DICOM parser written in TypeScript with WASM codecs compiled from Zig. This library provides zero-dependency DICOM parsing for Node.js, Bun, Deno, and browsers.

## Code Standards

### Formatting & Style

- **Quotes**: Always use double quotes (`"`) for strings
- **Line endings**: LF (Unix-style) for cross-platform compatibility
- **Indentation**: 4 spaces general, 2 spaces for TypeScript/JavaScript/JSON
- **Semicolons**: Required at end of statements
- **Trailing commas**: ES5 style in object/array literals

### TypeScript Guidelines

- Use strict TypeScript settings with comprehensive type checking
- Prefer `interface` over `type` for object shapes
- Avoid `any` type - create proper type definitions
- Use const assertions for immutable data
- Leverage utility types (`Pick`, `Omit`, `Partial`, `Required`)

## Architecture Overview

### Core Components

- **`src/core/`**: Pure TypeScript DICOM parser engine
    - `parser.ts`: Main parsing logic with multiple parse modes
    - `types.ts`: Comprehensive type definitions
    - `streaming.ts`: Incremental parsing for large files
    - `writer.ts`: DICOM file creation and modification
    - `registry.ts`: Plugin system for image codecs

- **`src/codecs/`**: Image compression/decompression
    - WASM modules compiled from Zig source
    - Support for JPEG, JPEG2000, RLE, PNG, JPEGLS
    - Automatic codec detection and loading

- **`src/utils/`**: Utility functions
    - Binary data manipulation
    - DICOM value parsing and formatting
    - Pixel data extraction and processing

### WASM Integration

- Zig-compiled codecs with WASI interface
- Binaryen optimization for size reduction
- Runtime loading with fallback mechanisms
- Memory-efficient binary operations

## Development Workflow

### Primary Commands

```bash
bun install           # Install dependencies with Bun
bun run build         # Build TypeScript and WASM codecs
bun run test          # Run comprehensive test suite
bun run benchmark     # Performance benchmarking
bun run check         # Code quality verification
bun run fix           # Auto-fix linting and formatting
```

### Build Process

1. TypeScript compilation with `tsc`
2. CJS bundle generation with esbuild
3. Zig WASM codec compilation
4. Binary optimization with `wasm-opt`

## Coding Patterns

### DICOM Tag Access

```typescript
// Preferred: hex notation for tags
const patientName = dataset.string(0x00100010);

// Alternative: string notation
const studyDate = dataset.string("x00080020");
```

### Error Handling

```typescript
import { DicomParseError, ValidationError } from "./core/errors";

try {
    const dataset = parse(buffer, { type: "full" });
    return processDataset(dataset);
} catch (error) {
    if (error instanceof DicomParseError) {
        throw new ValidationError(`DICOM parsing failed: ${error.message}`);
    }
    throw error;
}
```

### Codec Registration

```typescript
import { registry, Jpeg2000Decoder } from "rad-parser";

// Register custom codec
registry.register(new Jpeg2000Decoder(customJ2KDecoder));
```

### Memory-Efficient Operations

```typescript
// Use Uint8Array for binary data
const buffer = new Uint8Array(fileBuffer);

// Bounds checking for all binary operations
if (offset + length > buffer.length) {
    throw new RangeError("Buffer overflow detected");
}
```

## Performance Considerations

- **Zero-copy operations** where possible
- **Lazy loading** of WASM codecs
- **Bounds checking** on all binary parsing
- **Memory-efficient streaming** for large DICOM files
- **Minimal bundle size** through tree shaking

## Testing Strategy

- **Unit tests** for individual functions
- **Integration tests** for end-to-end workflows
- **Codec tests** for image compression/decompression
- **Performance tests** to prevent regressions
- **Cross-platform tests** for runtime compatibility

## Important Constraints

### Zero Dependencies

- No external runtime dependencies allowed
- Pure TypeScript implementation in core
- Self-contained WASM modules

### Multi-Runtime Support

- Code must work in Node.js, Bun, Deno, and browsers
- Conditional imports and feature detection
- Platform-specific optimizations

### Security Requirements

- All binary parsing includes bounds checking
- Input validation at all entry points
- Safe handling of malformed DICOM files

## AI Assistant Guidelines

When suggesting code:

1. **Maintain Architecture**: Follow established patterns and separation of concerns
2. **Type Safety**: Use proper TypeScript types, avoid `any`
3. **Performance**: Consider memory usage and execution speed
4. **Compatibility**: Ensure multi-runtime support
5. **Testing**: Suggest appropriate test cases for new functionality
6. **Documentation**: Add JSDoc comments for public APIs

## Common Anti-Patterns to Avoid

- Using `any` type instead of proper interfaces
- Synchronous file I/O in browser-compatible code
- Large bundle sizes from unnecessary imports
- Missing error handling in user-facing functions
- Platform-specific code without feature detection

## File Organization

- **Source code**: `src/` directory with clear module separation
- **Tests**: `tests/` mirroring source structure
- **Build outputs**: `dist/` for distribution files
- **Documentation**: `docs/` for detailed guides
- **Scripts**: `scripts/` for build and development tools

Remember: This is a medical imaging library where correctness and performance are critical. All suggestions should prioritize type safety, error handling, and cross-platform compatibility.
