# Changelog

All notable changes to the Helm YAML LSP IntelliJ plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-27

### Added

- Initial release of IntelliJ IDEA plugin
- LSP integration using IntelliJ Platform standard API (no external dependencies)
- Support for Argo Workflows templates
  - Go to definition for templateRef
  - Hover information for templates
  - Auto-completion for template names
  - Diagnostics for invalid template references
- Support for Helm chart templates and values
  - Go to definition for .Values references
  - Hover information for values
  - Auto-completion for value paths
  - Support for include/template functions
  - Support for Helm built-in functions (70+ functions)
- Support for ConfigMap and Secret references
  - Go to definition for configMapKeyRef/secretKeyRef
  - Hover information with value preview
  - Auto-completion for ConfigMap/Secret names and keys
  - Diagnostics for missing resources
- Settings UI for server configuration
  - Auto-detect server path
  - Custom server path option
  - Debug logging toggle
- Automatic LSP server detection (5 detection strategies)
- Project lifecycle management
- Compatible with IntelliJ IDEA 2023.3+

### Technical Details

- Built with Kotlin 1.9.22
- Minimum IntelliJ Platform: 2023.3 (build 233)
- Uses `com.intellij.platform.lsp.api` package
- Zero external dependencies (no LSP4IJ required)

[Unreleased]: https://github.com/anthropics/helm-yaml-lsp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anthropics/helm-yaml-lsp/releases/tag/v0.1.0
