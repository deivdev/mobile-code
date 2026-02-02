#!/bin/bash

echo "==============================="
echo "   Nomacode Installer"
echo "==============================="
echo ""

# Check if running in Termux
if [ -z "$TERMUX_VERSION" ]; then
    echo "Note: This script is optimized for Termux on Android."
    echo ""
fi

# Update package manager
echo "[1/5] Updating packages..."
if command -v pkg &> /dev/null; then
    pkg update -y && pkg upgrade -y
elif command -v apt &> /dev/null; then
    sudo apt update && sudo apt upgrade -y
elif command -v dnf &> /dev/null; then
    sudo dnf check-update || true
elif command -v pacman &> /dev/null; then
    sudo pacman -Sy
fi

# Install build dependencies (required for node-pty)
echo ""
echo "[2/5] Installing build dependencies..."
if command -v pkg &> /dev/null; then
    # Termux
    pkg install -y build-essential python
elif command -v apt &> /dev/null; then
    # Debian/Ubuntu
    sudo apt install -y build-essential python3 python-is-python3
elif command -v dnf &> /dev/null; then
    # Fedora/RHEL
    sudo dnf install -y gcc gcc-c++ make python3
elif command -v pacman &> /dev/null; then
    # Arch Linux
    sudo pacman -S --noconfirm base-devel python
elif command -v brew &> /dev/null; then
    # macOS (Xcode CLI tools provide make/gcc)
    xcode-select --install 2>/dev/null || true
    brew install python3
fi

# Install Node.js and git
echo ""
echo "[3/5] Installing Node.js and Git..."
if command -v pkg &> /dev/null; then
    pkg install -y nodejs git
elif command -v apt &> /dev/null; then
    sudo apt install -y nodejs npm git
elif command -v dnf &> /dev/null; then
    sudo dnf install -y nodejs npm git
elif command -v pacman &> /dev/null; then
    sudo pacman -S --noconfirm nodejs npm git
elif command -v brew &> /dev/null; then
    brew install node git
fi

# Verify Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v')
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18 or higher is required."
    exit 1
fi
echo "Node.js $(node -v) installed"

# Install project dependencies
echo ""
echo "[4/5] Installing Nomacode dependencies..."
cd "$(dirname "$0")/.." || exit 1
npm install

# Create symlink for global command
echo ""
echo "[5/5] Setting up global command..."
npm link 2>/dev/null || sudo npm link 2>/dev/null || echo "Note: Run 'npm start' to launch"

echo ""
echo "==============================="
echo "   Installation Complete!"
echo "==============================="
echo ""
echo "To start, run: nomacode"
echo "Or: npm start"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
