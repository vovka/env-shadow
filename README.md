# env-shadow

`env-shadow` is a small Bash CLI that redacts secrets when you display dotenv files. It includes Bash wrappers for `cat` and `less`, so normal commands such as `cat .env` and `less .env.production` show a safe view while the files on disk remain unchanged.

## Example

```dotenv
APP_NAME=my-app
DATABASE_PASSWORD=correct-horse-battery-staple # secret
GITHUB_TOKEN=ghp_1234567890abcdef
DEMO_PASSWORD=not-sensitive # public
```

```console
$ cat .env
APP_NAME=my-app
DATABASE_PASSWORD=cor...ple # secret
GITHUB_TOKEN=ghp...def
DEMO_PASSWORD=not-sensitive # public
```

## How lines are selected

A dotenv assignment is redacted when either:

1. Its inline comment ends with `secret`, `shadow`, or `blur` (case-insensitive).
2. Its variable name matches a built-in secret-name pattern, including `PASSWORD`, `PASSWD`, `PASSPHRASE`, `TOKEN`, `SECRET`, `API_KEY`, `ACCESS_KEY`, `PRIVATE_KEY`, `CLIENT_SECRET`, `AUTH_KEY`, or `CREDENTIAL(S)`. Common credential-bearing connection variables such as `DATABASE_URL`, `REDIS_URL`, `MONGODB_URI`, `AMQP_URL`, `BROKER_URL`, and `SENTRY_DSN` are also included.

A final `# public`, `# reveal`, or `# visible` marker overrides automatic detection:

```dotenv
REAL_PASSWORD=correct-horse-battery-staple # secret
LEGACY_VALUE=abcdefghij # blur
API_TOKEN=abcdefghij
DEMO_PASSWORD=not-sensitive # public
```

Quoted values, spacing, `export`, and inline comments are preserved. By default, the first and last three characters remain visible. Values too short to hide safely are completely replaced with `*` characters.

Multiline quoted secrets are collapsed to a single `<multiline secret hidden>` placeholder so private keys and certificates cannot leak line by line.

## Install

```bash
git clone https://github.com/vovka/env-shadow.git
cd env-shadow
bash install.sh
source ~/.bashrc
```

The installer copies the program to `~/.local/share/env-shadow`, creates `~/.local/bin/env-shadow`, and adds one `source` line to `~/.bashrc`.

The wrappers intercept these filename forms:

- `.env`
- `.env.local`, `.env.production`, and other `.env.*` files
- `app.env` and `app.env.*`

Other files still go directly to the real `cat` or `less`. To redact another filename explicitly, use `env-shadow path/to/file`.

## CLI

```console
$ env-shadow --help
Usage: env-shadow [options] [file ...]

Options:
  -k, --keep N          Keep N characters at both ends
  -m, --mask TEXT       Text used between visible ends
      --labels LIST     Comma-separated redaction labels
      --public-labels L Comma-separated opt-out labels
      --key-regex REGEX Bash regex for automatic key detection
      --no-auto         Redact only explicitly marked lines
```

Examples:

```bash
env-shadow .env
env-shadow --keep 4 .env.production
env-shadow --no-auto .env
cat .env | env-shadow
```

Environment-variable defaults are also available:

```bash
export ENV_SHADOW_KEEP=4
export ENV_SHADOW_MASK='***'
export ENV_SHADOW_LABELS='secret,private,hide'
export ENV_SHADOW_PUBLIC_LABELS='public,show'
export ENV_SHADOW_KEY_REGEX='(^|_)(PASSWORD|TOKEN|SECRET)($|_)'
```

## Uninstall

```bash
bash uninstall.sh
source ~/.bashrc
```

## Tests

```bash
bash test/test.sh
```

## Security boundaries

This is an output-safety convenience, not encryption or access control. It does not alter or protect the `.env` file itself. The wrapper can be bypassed with `command cat`, an absolute path such as `/bin/cat`, another program such as `grep`, or a shell that has not sourced the wrapper. Secrets may also appear in process environments, logs, shell history, editors, backups, and crash reports.
