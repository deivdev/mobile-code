#!/bin/bash

echo "==============================="
echo "   Mobile Code Installer"
echo "==============================="
echo ""

# Check if running in Termux
if [ -z "$TERMUX_VERSION" ]; then
    echo "Note: This script is optimized for Termux on Android."
    echo ""
fi

# Update package manager
echo "[1/4] Updating packages..."
if command -v pkg &> /dev/null; then
    pkg update -y && pkg upgrade -y
elif command -v apt &> /dev/null; then
    sudo apt update && sudo apt upgrade -y
fi

# Install Node.js and git
echo ""
echo "[2/4] Installing Node.js and Git..."
if command -v pkg &> /dev/null; then
    pkg install -y nodejs git
elif command -v apt &> /dev/null; then
    sudo apt install -y nodejs npm git
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
echo "[3/4] Installing Mobile Code dependencies..."
cd "$(dirname "$0")/.." || exit 1
npm install

# Create symlink for global command
echo ""
echo "[4/4] Setting up global command..."
npm link 2>/dev/null || sudo npm link 2>/dev/null || echo "Note: Run 'npm start' to launch"

echo ""
echo "==============================="
echo "   Installation Complete!"
echo "==============================="
echo ""
echo "To start, run: mobile-code"
echo "Or: cd ~/mobile-code && npm start"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
