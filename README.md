# mobile-code

AI-powered coding assistant on your phone. Run Claude Code, OpenCode, or Codex directly from Android using Termux.

```
                 _     _ _                        _
  _ __ ___   ___ | |__ (_) | ___        ___ ___  __| | ___
 | '_ ` _ \ / _ \| '_ \| | |/ _ \_____ / __/ _ \/ _` |/ _ \
 | | | | | | (_) | |_) | | |  __/_____| (_| (_) | (_| |  __/
 |_| |_| |_|\___/|_.__/|_|_|\___|      \___\___/ \__,_|\___|
```

## Quick Install

### 1. Install Termux
Get it from [F-Droid](https://f-droid.org/en/packages/com.termux/) (NOT Play Store)

### 2. Open Termux and paste:

```bash
pkg install -y git nodejs && git clone https://github.com/deivdev/mobile-code.git ~/mobile-code && cd ~/mobile-code && npm install && npm start
```

### 3. Open browser
Go to `localhost:3000`

That's it! 🎉

---

## Usage

**Start server:**
```bash
cd ~/mobile-code && npm start
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+T` | New session |
| `Ctrl+W` | Close session |
| `Alt+1-9` | Switch to session |
| `n` | New session (welcome screen) |
| `c` | Clone repo (welcome screen) |
| `o` | Open repo (welcome screen) |

## Features

- 🖥️ Full terminal emulator (xterm.js)
- 📁 Clone and manage git repositories
- 🤖 Run Claude Code, OpenCode, Codex
- 📑 Multiple sessions with tabs
- ⌨️ Keyboard-driven interface
- 🌙 Dark terminal theme
- 📱 Mobile-optimized touch UI

## Requirements

- Android with Termux (from F-Droid)
- Node.js 18+
- Git

## License

MIT
