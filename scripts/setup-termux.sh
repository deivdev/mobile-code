#!/bin/bash

echo "==============================="
echo "   Termux Setup Script"
echo "==============================="
echo ""
echo "This script sets up your Termux environment for Nomacode."
echo ""

# Request storage permission
echo "[1/4] Requesting storage permission..."
termux-setup-storage 2>/dev/null || echo "Note: Run 'termux-setup-storage' manually if needed"

# Update and upgrade
echo ""
echo "[2/4] Updating Termux packages..."
pkg update -y && pkg upgrade -y

# Install essential packages (including build tools for node-pty)
echo ""
echo "[3/4] Installing essential packages..."
pkg install -y \
    nodejs \
    git \
    openssh \
    curl \
    wget \
    vim \
    python \
    make \
    clang \
    build-essential

# Set up extra keys (helpful for terminal usage)
echo ""
echo "[4/4] Configuring Termux..."

# Create termux.properties if it doesn't exist
mkdir -p ~/.termux
if [ ! -f ~/.termux/termux.properties ]; then
    cat > ~/.termux/termux.properties << 'EOF'
# Enable extra keys row
extra-keys = [['ESC','/','-','HOME','UP','END','PGUP'],['TAB','CTRL','ALT','LEFT','DOWN','RIGHT','PGDN']]

# Terminal styling
use-black-ui = true
EOF
    termux-reload-settings 2>/dev/null || echo "Run 'termux-reload-settings' to apply changes"
fi

echo ""
echo "==============================="
echo "   Termux Setup Complete!"
echo "==============================="
echo ""
echo "Now run the Nomacode installer:"
echo "  ./scripts/install.sh"
echo ""
