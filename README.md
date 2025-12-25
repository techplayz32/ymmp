# ymmp
Command-line interface for patching Yandex Music with [TheKing-OfTime's modifications](https://github.com/TheKing-OfTime/YandexMusicModClient).

## install
Download latest executable file for your system from latest release.

## usage

### patch
Install mod on Yandex Music.
```bash
ymmp patch
```

Available options:
- `-t, --type <type>` - Patch type: `default` or `devtoolsOnly`
- `-p, --path <path>` - Custom path to Yandex Music installation
- `--token <token>` - GitHub token for API requests
- `-f, --force` - Force close Yandex Music without prompting
- `--no-cache` - Force redownload of mod files
- `--keep-cache` - Keep cache after patching

### check
Check if patching is possible.
```bash
ymmp check
```

Available options:
- `-p, --path <path>` - Custom path to Yandex Music installation

### info
Show information about installed mod.
```bash
ymmp info
```

Available options:
- `-p, --path <path>` - Custom path to Yandex Music installation

### update
Check for updates and install if available.
```bash
ymmp update
```

Available options:
- `--token <token>` - GitHub token for API requests
- `-f, --force` - Force close Yandex Music if running

### cache
Manage cache.
```bash
ymmp cache --stats
ymmp cache --clear
```

Available options:
- `-s, --stats` - Show cache statistics
- `-c, --clear` - Clear cache

### config
Manage configuration.
```bash
ymmp config
ymmp config set token <token>
ymmp config set path <path>
```

Available actions:
- `list` - Show current configuration (default)
- `get <key>` - Get configuration value
- `set <key> <value>` - Set configuration value

## configuration
Configuration file is stored at `~/.ymmp-config.json` or in your default home folder on your OS.

### github token
Set GitHub token to avoid API rate limits.
```bash
ymmp config set token YOUR_TOKEN
```

Create PAT token at https://github.com/settings/personal-access-tokens with `Public repositories` access enabled.

### custom path
Set custom Yandex Music installation path.
```bash
ymmp config set path /path/to/yandex/music
```

Default paths:
- Windows: `%LOCALAPPDATA%\Programs\YandexMusic`
- macOS: `/Applications/Яндекс Музыка.app`
- Linux: `/opt/Яндекс Музыка`

## troubleshooting

### GitHub Rate Limit Exceeded
Set up GitHub token.
```bash
ymmp config set token YOUR_TOKEN
```

### Yandex Music is running
Close app manually or use `--force` flag.
```bash
ymmp patch --force
```

### No write permissions
Run command with elevated privileges.

### Custom installation path not detected
Specify installation path.
```bash
ymmp patch --path /your/custom/path
```

## development

### build
```bash
bun install
bun run build
```

### run
```bash
bun run dev
```

## credits
- [YandexMusicModPatcher](https://github.com/TheKing-OfTime/YandexMusicModClient) - Took some code references from original patcher
- [YandexMusicModClient](https://github.com/TheKing-OfTime/YandexMusicModClient) - Modification source