#!/bin/bash
# start-local-debug.sh
# Helper script to start ngrok and the local server for debugging

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting local debugging environment...${NC}"
echo ""

# Load .env then .env.local into environment (optional, helps detect Socket Mode)
set -a
if [ -f ".env" ]; then
    # shellcheck disable=SC1091
    source ".env"
fi
if [ -f ".env.local" ]; then
    # shellcheck disable=SC1091
    source ".env.local"
fi
set +a

# If Socket Mode is configured, skip ngrok and just start the server.
if [ "${NODE_ENV}" != "production" ] && [ -n "${SLACK_APP_TOKEN}" ] && [ "${SOCKET_MODE}" != "false" ]; then
    echo -e "${GREEN}Socket Mode detected (SLACK_APP_TOKEN set).${NC}"
    echo "Skipping ngrok. Starting Node.js server..."
    echo "Press Ctrl+C to stop"
    echo ""
    npm start
    exit 0
fi

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${YELLOW}Error: ngrok is not installed${NC}"
    echo "Install it with: brew install ngrok"
    echo "Or download from: https://ngrok.com/download"
    exit 1
fi

# Check if port 3000 is in use
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}Warning: Port 3000 is already in use${NC}"
    echo "Either stop the process using port 3000, or set PORT environment variable"
    exit 1
fi

# Start ngrok in background
echo "Starting ngrok tunnel..."
ngrok http 3000 > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "Waiting for ngrok to initialize..."
sleep 3

# Get ngrok URL
if command -v jq &> /dev/null; then
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null || echo "")
else
    # Fallback: try to extract from ngrok web interface
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok[^"]*' | head -1 || echo "")
fi

if [ -z "$NGROK_URL" ]; then
    echo -e "${YELLOW}Warning: Could not automatically detect ngrok URL${NC}"
    echo "Check ngrok web interface at: http://localhost:4040"
    echo "Or check /tmp/ngrok.log for the URL"
else
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}ngrok URL: ${NGROK_URL}${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Update your Slack app Request URL to:"
    echo -e "${YELLOW}${NGROK_URL}/slack/events${NC}"
    echo ""
    echo "View ngrok dashboard at: http://localhost:4040"
    echo -e "${GREEN}========================================${NC}"
    echo ""
fi

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping ngrok...${NC}"
    kill $NGROK_PID 2>/dev/null || true
    echo "Cleanup complete"
}

# Register cleanup on exit
trap cleanup EXIT INT TERM

# Start the server
echo "Starting Node.js server..."
echo "Press Ctrl+C to stop"
echo ""

npm start








