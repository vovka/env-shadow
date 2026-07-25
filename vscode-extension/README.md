# Env Shadow for VS Code

Env Shadow visually masks secrets in dotenv files without modifying the file on disk. It follows the same conventions as the Bash [`env-shadow`](https://github.com/vovka/env-shadow) CLI, so terminal output and VS Code use compatible rules.

```dotenv
APP_NAME=my-app
DATABASE_PASSWORD=correct-horse-battery-staple # secret
GITHUB_TOKEN=ghp_1234567890abcdef
DEMO_PASSWORD=not-sensitive # public
```

The editor keeps the first and last three characters visible and covers the middle of matching values. Short values are fully covered. Multiline values such as private keys are protected across every line.

## Detection rules

An assignment is masked when either:

1. Its inline comment ends with `secret`, `shadow`, or `blur`.
2. Its variable name matches the built-in secret pattern, including `PASSWORD`, `TOKEN`, `SECRET`, `API_KEY`, `PRIVATE_KEY`, `CLIENT_SECRET`, `DATABASE_URL`, and similar names.

A final `# public`, `# reveal`, or `# visible` marker overrides automatic detection.

```dotenv
REAL_PASSWORD=correct-horse-battery-staple # secret
API_TOKEN=abcdefghij
DEMO_PASSWORD=not-sensitive # public
```

## Commands

Open the Command Palette and run:

- **Env Shadow: Toggle Masking** — turn masking on or off globally for the current VS Code window.
- **Env Shadow: Toggle Current File** — reveal or hide all secrets in the active file.
- **Env Shadow: Toggle Secret Under Cursor** — reveal or hide one assignment.
- **Env Shadow: Hide All Secrets** — restore masking everywhere.

The status-bar eye control toggles the active file.

## Settings

```json
{
  "envShadow.autoDetect": true,
  "envShadow.keepStart": 3,
  "envShadow.keepEnd": 3,
  "envShadow.labels": ["secret", "shadow", "blur"],
  "envShadow.publicLabels": ["public", "reveal", "visible"]
}
```

`envShadow.keyPattern` and `envShadow.filePattern` can be replaced with case-insensitive JavaScript regular expressions.

## Local development

```bash
git clone https://github.com/vovka/env-shadow.git
cd env-shadow/vscode-extension
npm test
code .
```

Press **F5** in VS Code to start an Extension Development Host. Open an `.env` file there to test masking.

To build an installable package:

```bash
npm install
npm run package
code --install-extension env-shadow-0.1.0.vsix
```

Every Marketplace extension needs a publisher identifier in `package.json`; change `publisher` before publishing if your Marketplace publisher ID is not `vovka`.

## Security boundaries

This extension is a visual convenience, not encryption or access control. The original secret remains in the document and on disk. It may still be exposed by copying text, selecting it, searching, source control, another editor, extensions, logs, backups, process environments, or opening the file with masking disabled. Use proper file permissions and a secrets manager for actual protection.
