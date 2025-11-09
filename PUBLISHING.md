# Publishing to NPM

## Prerequisites

1. NPM account: https://www.npmjs.com/signup
2. Logged in via CLI: `npm login`

## Publishing Steps

### 1. Build the Project

```bash
npm install
npm run build
```

### 2. Test Locally

```bash
# Test the built package
node dist/index.js

# Should start MCP server without errors
```

### 3. Verify Package Contents

```bash
# See what will be published
npm pack --dry-run
```

Should include:
- `dist/**/*` - Compiled JavaScript
- `config/remotes.example.json` - Example config
- `README.md` - Documentation
- `LICENSE` - MIT License

### 4. Publish to NPM

```bash
# For first publish
npm publish --access public

# For updates
npm version patch  # or minor, or major
npm publish
```

### 5. Verify Published Package

```bash
# Check on npm
# https://www.npmjs.com/package/@analoguezone/remote-command-mcp

# Test installation
npx @analoguezone/remote-command-mcp
```

## After Publishing

Users can then use it with `npx`:

```json
{
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["npx", "-y", "@analoguezone/remote-command-mcp"],
      "enabled": true
    }
  }
}
```

## Version Management

- **Patch** (1.0.X): Bug fixes
- **Minor** (1.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

```bash
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0
npm publish
```

## Unpublishing (if needed)

```bash
# Unpublish within 72 hours only
npm unpublish @analoguezone/remote-command-mcp@1.0.0

# Deprecate instead (better option)
npm deprecate @analoguezone/remote-command-mcp@1.0.0 "Deprecated, use version X.X.X"
```

## Package Info

- **Name**: `@analoguezone/remote-command-mcp`
- **Scope**: `@analoguezone` (your organization)
- **Access**: Public
- **License**: MIT

## Notes

- The package will be built automatically before publishing (`prepublishOnly` script)
- Only files listed in `package.json` → `files` array will be included
- `.gitignore` and `.npmignore` are respected
