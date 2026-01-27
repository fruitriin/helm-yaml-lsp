# Helm YAML LSP - IntelliJ Plugin

IntelliJ IDEA plugin for Helm, Argo Workflows, and Kubernetes YAML files using Language Server Protocol (LSP).

## Features

- **Go to Definition** (Cmd+B / Ctrl+B)
  - Jump to template definitions
  - Jump to value definitions in values.yaml
  - Jump to ConfigMap/Secret definitions
- **Hover Information**
  - View template documentation
  - View value types and defaults
  - View ConfigMap/Secret contents
- **Auto-completion**
  - Template names
  - Value references
  - Parameter names
- **Error Diagnostics**
  - Invalid template references
  - Missing values
  - ConfigMap/Secret not found

## Installation

### From JetBrains Marketplace (Recommended)

1. Open IntelliJ IDEA
2. Go to **Settings** > **Plugins**
3. Search for "Helm YAML LSP"
4. Click **Install**

### From ZIP File

1. Build the plugin: `./gradlew buildPlugin`
2. Go to **Settings** > **Plugins** > ⚙️ > **Install Plugin from Disk...**
3. Select `build/distributions/helm-yaml-lsp-0.1.0.zip`

## Configuration

Go to **Settings** > **Tools** > **Helm YAML LSP** to configure:

- **Auto-detect server path**: Automatically find the LSP server
- **LSP Server Path**: Custom path to server.js (if auto-detect is disabled)
- **Enable debug logging**: Enable detailed logging for troubleshooting

## LSP Server Detection

The plugin automatically detects the LSP server in the following order:

1. Custom path (if specified in settings)
2. Bundled server (included with plugin)
3. Project's node_modules (`packages/server/dist/server.js`)
4. Global npm installation
5. System PATH

## Development

### Requirements

- JDK 17 or later
- Gradle 8.0 or later
- IntelliJ IDEA 2023.3 or later

### Build

```bash
cd packages/intellij-plugin
./gradlew build
```

### Run in Development Mode

```bash
./gradlew runIde
```

This will start IntelliJ IDEA with the plugin installed in a sandbox environment.

### Project Structure

```
packages/intellij-plugin/
├── build.gradle.kts               # Gradle build configuration
├── settings.gradle.kts            # Gradle settings
├── gradle.properties              # Gradle properties
└── src/
    └── main/
        ├── kotlin/
        │   └── com/anthropic/helm_yaml_lsp/
        │       ├── HelmYamlLspProjectListener.kt      # Project lifecycle
        │       ├── settings/
        │       │   ├── HelmYamlLspSettings.kt        # Settings persistence
        │       │   └── HelmYamlLspConfigurable.kt    # Settings UI
        │       └── lsp/
        │           └── HelmYamlLspServerSupportProvider.kt  # LSP integration
        └── resources/
            └── META-INF/
                └── plugin.xml                         # Plugin definition
```

## Architecture

This plugin uses **IntelliJ Platform's standard LSP API** (available since 2023.2):

```
IntelliJ Plugin (Kotlin)
  └─ IntelliJ Platform LSP API (com.intellij.platform.lsp.api)
       └─ LspServerSupportProvider
       └─ ProjectWideLspServerDescriptor
            ↕ LSP Protocol (stdio)
       LSP Server (Node.js)
         └─ packages/server/dist/server.js
```

**Benefits:**
- ✅ No external dependencies (LSP4IJ not needed)
- ✅ Small plugin size
- ✅ Official JetBrains support
- ✅ Uses the same LSP server as VSCode and Neovim

## Supported File Types

- Argo Workflows YAML (Workflow, WorkflowTemplate, ClusterWorkflowTemplate)
- Helm chart templates (templates/*.yaml)
- Kubernetes ConfigMap and Secret files

## Troubleshooting

### LSP Server Not Found

If you see "LSP server not found" errors:

1. Check **Settings** > **Tools** > **Helm YAML LSP**
2. Verify the server path is correct
3. Ensure Node.js is installed and in PATH
4. Check the **Event Log** for detailed error messages

### Enable Debug Logging

1. Go to **Settings** > **Tools** > **Helm YAML LSP**
2. Enable "Enable debug logging"
3. Restart IntelliJ IDEA
4. Check logs: **Help** > **Show Log in Finder/Explorer**

## License

See [LICENSE](../../LICENSE) in the root directory.

## Links

- [Project Repository](https://github.com/anthropics/helm-yaml-lsp)
- [Issue Tracker](https://github.com/anthropics/helm-yaml-lsp/issues)
- [VSCode Extension](../vscode-client)
- [Neovim Plugin](../nvim-client)
