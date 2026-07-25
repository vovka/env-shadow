# Changelog

## 0.1.0

- Mask dotenv values using explicit `# secret`, `# shadow`, and `# blur` labels.
- Automatically detect common credential variable names.
- Support `# public`, `# reveal`, and `# visible` overrides.
- Preserve configurable leading and trailing characters.
- Protect quoted and multiline values.
- Add global, per-file, and per-secret reveal commands.
