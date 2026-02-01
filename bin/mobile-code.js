#!/usr/bin/env node

const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1], 10) || 3000;
    i++;
  }
  if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Mobile Code - AI Coding Assistant for Mobile

Usage: mobile-code [options]

Options:
  -p, --port <number>  Port to run the server on (default: 3000)
  -h, --help           Show this help message

Examples:
  mobile-code                    # Start on default port 3000
  mobile-code --port 8080        # Start on port 8080
`);
    process.exit(0);
  }
}

// Set port in environment for server to use
process.env.PORT = port;

// Start the server
require('../server/index.js');
