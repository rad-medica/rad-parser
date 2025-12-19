# AI Agents Configuration Guide

This document provides a comprehensive overview of all AI coding assistants configured for the rad-parser project, ensuring consistent, high-quality code generation across different development environments.

## 🤖 Supported AI Agents

### 1. Cursor AI Editor

**Configuration File**: `.cursorrules`

Cursor is configured with detailed project context and coding standards for intelligent code suggestions within the editor.

#### Key Features:

- **Project Context**: Complete understanding of rad-parser as a DICOM parser
- **Architecture Awareness**: Knowledge of core parser, codec system, and utilities
- **Coding Standards**: Enforces double quotes, LF endings, TypeScript strict mode
- **Performance Focus**: Emphasizes memory efficiency and zero-copy operations
- **Development Workflow**: Familiar with Bun runtime and build processes

#### Configuration Highlights:

- Multi-runtime support (Node.js, Bun, Deno, browsers)
- WASM codec integration with Zig compilation
- Medical imaging domain expertise
- Zero-dependency architecture understanding

### 2. GitHub Copilot

**Configuration File**: `.github/copilot-instructions.md`

GitHub Copilot receives project-specific instructions to generate contextually appropriate code suggestions.

#### Key Features:

- **Project Overview**: Medical imaging parser with WASM codecs
- **Code Standards**: TypeScript guidelines, formatting rules, architecture patterns
- **Development Workflow**: Build commands, testing strategies, performance considerations
- **Security Focus**: Bounds checking, input validation, safe error handling

#### Integration Points:

- Repository-level instructions for all contributors
- GitHub-specific integration
- Cross-platform compatibility guidance
- Performance optimization patterns

### 3. Antigravity AI Assistant

**Configuration Files**:

- `.antigravity/rules.md` - Comprehensive coding guidelines
- `.antigravity/config.json` - Technical specifications and settings

Antigravity receives detailed behavioral guidelines and technical specifications for advanced code generation.

#### Key Features:

- **Technical Specifications**: Runtime environments, build tools, quality standards
- **Coding Patterns**: TypeScript conventions, error handling, memory management
- **Architecture Decisions**: WASM integration, multi-runtime support, streaming design
- **Quality Gates**: Type checking, linting, formatting, testing requirements

#### Configuration Structure:

- **Rules File**: Behavioral guidelines, coding patterns, anti-patterns
- **Config File**: Technical settings, performance targets, compatibility matrix

## 📋 Code Standards Enforced

All AI agents are configured to maintain these standards:

### 🌍 Environment Configuration

> [!IMPORTANT]
> **CRITICAL RULE**: All agents MUST check for the existence of `agent_environment.md` in the project root before starting work. This file contains specific environment details (OS, Shell, Paths) that supersede general defaults.

### Formatting & Style

- **Quotes**: Double quotes (`"`) for all strings
- **Line Endings**: LF (Unix-style) for cross-platform compatibility
- **Encoding**: UTF-8 for universal character support
- **Indentation**: 4 spaces (general), 2 spaces (JS/TS/JSON)
- **Semicolons**: Required at statement ends
- **Trailing Commas**: ES5 style in object/array literals

### TypeScript Guidelines

- **Strict Mode**: Comprehensive type checking enabled
- **Interface Preference**: Use `interface` over `type` for object shapes
- **Type Safety**: Never use `any`, create proper type definitions. WHEN WRITING TYPESCRIPT, BE STRICT WITH THE TYPES, NEVER USE ANY.
- **Const Assertions**: For immutable data structures
- **Utility Types**: Leverage `Pick`, `Omit`, `Partial`, `Required`

### Architecture Compliance

- **Modular Design**: Core parser, codec system, utilities separation
- **WASM Integration**: Zig-compiled codecs with WASI interface
- **Multi-Runtime**: Node.js, Bun, Deno, browser compatibility
- **Zero Dependencies**: No external runtime dependencies

## 🚀 Development Workflow Integration

### Build Commands

```bash
bun install              # Install dependencies
bun run build           # Build project and WASM codecs
bun run test            # Run comprehensive test suite
bun run check           # Quality gate verification
bun run fix             # Auto-fix linting and formatting
```

### Quality Gates

- **Type Checking**: `tsc --noEmit` passes
- **Linting**: ESLint with zero errors
- **Formatting**: Prettier consistency
- **Testing**: Vitest coverage requirements met
- **Building**: Clean compilation without warnings

## 🎯 AI Agent Behavioral Guidelines

### Code Generation Principles

1. **Type Safety First**: Strict TypeScript usage, comprehensive error handling. WHEN WRITING TYPESCRIPT, BE STRICT WITH THE TYPES, NEVER USE ANY.
2. **Performance Conscious**: Memory efficiency, zero-copy operations, bounds checking
3. **Cross-Platform**: Runtime compatibility, feature detection, conditional imports
4. **Architecture Compliant**: Follow established patterns, maintain separation of concerns
5. **Security Focused**: Input validation, safe error handling, bounds checking

### Suggestion Priorities

1. **Correctness**: Ensure code works as intended
2. **Type Safety**: Leverage TypeScript's type system
3. **Performance**: Optimize for speed and memory usage
4. **Maintainability**: Write readable, well-documented code
5. **Compatibility**: Support all target platforms (Node.js, Bun, Deno, browsers)

### Context Awareness

- **Domain Expertise**: Medical imaging, DICOM parsing, healthcare data
- **Technical Stack**: TypeScript, Zig, WASM, esbuild, Bun runtime
- **Architecture Knowledge**: Core parser, codec system, streaming capabilities
- **Performance Requirements**: Sub-10ms parsing, memory-efficient operations

## 📁 File Organization Standards

```
src/
├── core/           # Core parsing engine (TypeScript)
├── codecs/         # WASM-based image codecs
├── utils/          # Utility functions and helpers
└── cli.ts         # Command-line interface

tests/              # Test files mirroring src/
scripts/            # Build and benchmark scripts
docs/               # Documentation and guides
dist/               # Build outputs
```

## 🔧 Configuration Files Reference

### Cursor (`.cursorrules`)

- **Purpose**: Editor-integrated AI assistance
- **Scope**: Real-time code suggestions and completions
- **Integration**: Automatic context awareness

### GitHub Copilot (`.github/copilot-instructions.md`)

- **Purpose**: Repository-level AI assistance
- **Scope**: Code completion and suggestions
- **Integration**: GitHub platform integration

### Antigravity (`.antigravity/`)

- **Purpose**: Advanced AI code generation
- **Scope**: Comprehensive code writing and refactoring
- **Integration**: Standalone AI assistant integration

### VS Code (`.vscode/`)

- **Purpose**: IDE configuration and task automation
- **Scope**: Development environment setup
- **Integration**: Editor-specific tooling

## ⚡ Performance Considerations

### Benchmarks

- **Parse Speed**: Target < 10ms for typical DICOM files
- **Memory Usage**: Minimize allocations and copies
- **Bundle Size**: Keep under 500KB total
- **WASM Loading**: Sub-100ms codec initialization

### Optimization Patterns

- **Zero-Copy Operations**: Reference sharing where possible
- **Bounds Checking**: All binary operations validated
- **Lazy Loading**: WASM codecs loaded on demand
- **Memory Pools**: Efficient buffer management

## 🔒 Security Standards

### Input Validation

- **Bounds Checking**: All binary parsing operations
- **Type Validation**: Runtime type checking for critical operations
- **Size Limits**: Prevent excessive memory allocation
- **Format Verification**: DICOM file structure validation

### Error Handling

- **Descriptive Messages**: Clear error information for debugging
- **Safe Degradation**: Graceful handling of malformed data
- **Logging**: Appropriate error reporting without sensitive data
- **Recovery**: Continue processing when possible

## 🧪 Testing Strategy

### Test Categories

- **Unit Tests**: Individual functions and modules
- **Integration Tests**: End-to-end DICOM parsing workflows
- **Codec Tests**: Image compression/decompression verification
- **Performance Tests**: Benchmark regression detection
- **Cross-Platform Tests**: Runtime compatibility validation

### Quality Metrics

- **Coverage**: Minimum 80% code coverage
- **Performance**: No regression in benchmark timings
- **Compatibility**: All target runtimes supported
- **Reliability**: 100% success rate on test datasets

## 📚 Documentation Integration

### AI Agent Documentation

- **README.md**: Overview of AI agent integration
- **VS Code README**: IDE-specific configuration details
- **This File**: Comprehensive agent configuration reference

### Code Documentation

- **JSDoc Comments**: All public APIs documented
- **Type Definitions**: Comprehensive TypeScript interfaces
- **Usage Examples**: Practical code samples
- **Architecture Docs**: System design and patterns

## 🔄 Maintenance & Updates

### Configuration Sync

- **Version Control**: All agent configs tracked in Git
- **Consistency Checks**: Regular verification of standards compliance
- **Update Process**: Coordinated updates across all agent configurations
- **Feedback Loop**: Developer feedback incorporated into rules

### Best Practices

- **Regular Reviews**: Periodic assessment of agent effectiveness
- **Standards Evolution**: Update rules as project requirements change
- **Community Input**: Incorporate team feedback and improvements
- **Documentation Updates**: Keep all guides current and accurate

## 🎯 Success Metrics

### Code Quality

- **Type Safety**: Zero `any` types in production code
- **Linting**: Zero ESLint errors or warnings
- **Formatting**: 100% Prettier compliance
- **Testing**: All tests passing with good coverage

### Performance

- **Speed**: Maintain or improve benchmark timings
- **Memory**: No memory leaks or excessive usage
- **Bundle Size**: Stay within size constraints
- **Load Times**: Fast WASM codec initialization

### Compatibility

- **Runtimes**: Full support for all target platforms
- **Dependencies**: Maintain zero external dependencies
- **Standards**: Compliance with web standards and best practices
- **Accessibility**: Cross-platform and cross-environment compatibility

---

## 📝 Reporting & Output Standards

To maintain a clean repository, all agents must strictly follow the output generation rules defined in `docs/REPORTING_GUIDELINES.md`.

**Key Rule**: NEVER write generated files (benchmarks, logs, temporary test data) to the root directory. Always use the designated `output/` subdirectories.

---

## 📞 Support & Resources

### Configuration Files

- `.cursorrules` - Cursor AI editor rules
- `.github/copilot-instructions.md` - GitHub Copilot instructions
- `.antigravity/rules.md` - Antigravity behavioral guidelines
- `.antigravity/config.json` - Antigravity technical configuration
- `.vscode/` - VS Code integration settings

### Documentation

- `README.md` - Project overview and AI agent integration
- `.vscode/README.md` - VS Code configuration guide
- `docs/` - Comprehensive project documentation

### Development Tools

- **Primary Runtime**: Bun (for development and building)
- **Type Checking**: TypeScript with strict mode
- **Linting**: ESLint with Prettier integration
- **Testing**: Vitest with comprehensive coverage
- **Building**: esbuild with multi-format output

---

_This document serves as the central reference for all AI agent configurations in the rad-parser project. All AI assistants are tuned to maintain the highest standards of code quality, performance, and compatibility._
