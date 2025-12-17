# Antigravity AI Assistant Rules for rad-parser

## Project Identity

**rad-parser** is a high-performance, zero-dependency DICOM parser built with TypeScript and WASM codecs compiled from Zig. It provides medical imaging parsing capabilities for Node.js, Bun, Deno, and browser environments.

## Technical Specifications

### Runtime Environment

- **Primary Development**: Bun runtime
- **Compatibility**: Node.js, npm, Deno, browsers
- **Module System**: ESM with CJS fallbacks
- **Build Tools**: esbuild, Zig compiler, Binaryen

### Code Quality Standards

- **Language**: TypeScript 5.0+ with strict mode
- **Linting**: ESLint with Prettier integration
- **Testing**: Vitest with comprehensive coverage
- **Formatting**: Prettier with double quotes, LF line endings

### Architecture Layers

1. **Core Parser** (`src/core/`): Pure TypeScript DICOM parsing engine
2. **Codec System** (`src/codecs/`): WASM-based image decompression
3. **Utilities** (`src/utils/`): Binary data manipulation and DICOM value handling
4. **CLI** (`src/cli.ts`): Command-line interface for file operations

## Coding Standards & Patterns

### TypeScript Conventions

```typescript
// Interface definitions preferred over types
interface DicomDataSet {
    readonly elements: Record<string, DicomElement>;
    string(tag: string | number): string | undefined;
    uint8Array(tag: string | number): Uint8Array | undefined;
}

// Const assertions for immutable data
const DICOM_VR_TYPES = [
    "AE",
    "AS",
    "AT",
    "CS",
    "DA",
    "DS",
    "DT",
    "FL",
    "FD",
    "IS",
    "LO",
    "LT",
    "OB",
    "OD",
    "OF",
    "OL",
    "OV",
    "OW",
    "PN",
    "SH",
    "SL",
    "SQ",
    "SS",
    "ST",
    "SV",
    "TM",
    "UC",
    "UI",
    "UL",
    "UN",
    "UR",
    "US",
    "UT",
    "UV",
] as const;

// Utility types for common patterns
type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;
```

### Error Handling Patterns

```typescript
import { DicomParseError, ValidationError } from "./core/errors";

export function parseDicomFile(buffer: Uint8Array): DicomDataSet {
    // Input validation
    if (!buffer || buffer.length === 0) {
        throw new ValidationError("Empty or null buffer provided");
    }

    try {
        // Parse operation
        const dataset = parse(buffer, { type: "full" });
        return dataset;
    } catch (error) {
        // Error transformation
        if (error instanceof DicomParseError) {
            throw new ValidationError(`DICOM parsing failed: ${error.message}`);
        }
        // Re-throw unknown errors
        throw error;
    }
}
```

### Memory Management

```typescript
// Zero-copy operations where possible
export function extractPixelData(dataset: DicomDataSet): Uint8Array {
    const pixelDataElement = dataset.elements["x7fe00010"];
    if (!pixelDataElement?.Value) {
        throw new ValidationError("No pixel data found");
    }

    // Return reference, not copy
    return pixelDataElement.Value as Uint8Array;
}

// Bounds checking for all binary operations
function readUint16LE(buffer: Uint8Array, offset: number): number {
    if (offset + 2 > buffer.length) {
        throw new RangeError(`Buffer overflow: ${offset + 2} > ${buffer.length}`);
    }
    return (buffer[offset + 1] << 8) | buffer[offset];
}
```

## Development Workflow Integration

### Build Commands

- `bun install` - Dependency installation
- `bun run build` - Full project build
- `bun run test` - Test execution
- `bun run benchmark` - Performance testing
- `bun run check` - Code quality verification
- `bun run fix` - Auto-fix issues

### Quality Gates

- **Type Checking**: `tsc --noEmit` passes
- **Linting**: ESLint with zero errors
- **Formatting**: Prettier consistency
- **Testing**: Vitest passes with coverage requirements
- **Build**: Clean compilation without warnings

## AI Assistant Behavioral Guidelines

### Code Generation Principles

1. **Type Safety First**: Never use `any`, create proper type definitions
2. **Performance Conscious**: Consider memory usage and execution speed
3. **Cross-Platform**: Ensure compatibility across all target runtimes
4. **Zero Dependencies**: Avoid external runtime dependencies
5. **Error Resilient**: Include proper error handling and validation

### Suggestion Priorities

1. **Correctness**: Ensure code works as intended
2. **Type Safety**: Leverage TypeScript's type system
3. **Performance**: Optimize for speed and memory
4. **Maintainability**: Write readable, well-documented code
5. **Compatibility**: Support all target platforms

### Anti-Patterns to Avoid

- Using `any` type instead of proper interfaces
- Synchronous operations in async contexts
- Large bundle sizes from unnecessary imports
- Missing bounds checking in binary operations
- Platform-specific code without feature detection
- Missing error handling in user-facing APIs

## Architecture Decision Records

### WASM Codec Integration

- Zig-compiled codecs for performance
- WASI interface for system operations
- Lazy loading with fallback mechanisms
- Binaryen optimization for size reduction

### Multi-Runtime Support

- ESM-first with CJS compatibility
- Conditional imports for platform detection
- Feature detection over user-agent sniffing
- Runtime-specific optimizations

### Streaming Parser Design

- Backpressure-friendly incremental parsing
- Memory-efficient processing of large files
- Configurable buffer sizes
- Progress callbacks for long operations

## File Organization Standards

```
src/
├── core/           # Core parsing engine
├── codecs/         # Image compression codecs
├── utils/          # Utility functions
└── cli.ts         # Command-line interface

tests/              # Test files mirroring src/
scripts/            # Build and development scripts
docs/               # Documentation
dist/               # Build outputs
```

dist/ # Build outputs

```

## Documentation & Reporting Standards

- **Source of Truth**: `docs/AGENTS.md`
- **Guidelines**: `docs/REPORTING_GUIDELINES.md`
- **Output Location**: All generated artifacts must go to `output/`
- **Markdown**: Follow h1/h2 hierarchy and Github alerts style.

## Performance Benchmarks

- **Parse Speed**: Target < 10ms for typical DICOM files
- **Memory Usage**: Minimize allocations and copies
- **Bundle Size**: Keep under 500KB total
- **WASM Loading**: Sub-100ms codec initialization

## Security Considerations

- Bounds checking on all binary operations
- Input validation at API boundaries
- Safe handling of malformed DICOM data
- No execution of untrusted code paths

Remember: This codebase handles medical imaging data where accuracy and performance are critical. All suggestions must maintain the highest standards of code quality and runtime compatibility.
```
