# nomacode

```
  _  _  __  __  _  ___  __  ___  ___
 | \| |/  \|  \/ |/   |/  \|   \| __|
 | .  | () | |\/| |   | () | |) | _|
 |_|\_|\__/|_|  |_|\___|\__/|___/|___|
       >> THE MOBILE NOMAD IDE <<
```

Code anywhere, like a local. Run Claude Code, OpenCode, or Codex directly from Android using Termux.

## Install

Open Termux, tap and hold to paste:

```bash
pkg install -y git nodejs && git clone https://github.com/deivdev/nomacode.git ~/nomacode && cd ~/nomacode && npm install && npm start
```

Browser opens automatically. Tap **⋮ → Add to Home Screen** for the full PWA experience.

---

## Start (after install)

```bash
cd ~/nomacode && npm start
```

Or just tap the Nomacode icon on your home screen.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+T` | New session |
| `Ctrl+W` | Close session |
| `Alt+1-9` | Switch to session |
| `n` | New session (welcome) |
| `c` | Clone repo (welcome) |
| `o` | Open repo (welcome) |

## Features

- Terminal emulator (xterm.js)
- Clone and manage git repositories
- Run Claude Code, OpenCode, Codex
- Multiple sessions with tabs
- Keyboard-driven interface

## License

MIT
