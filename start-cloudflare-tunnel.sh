#!/bin/bash
# start-cloudflare-tunnel.sh
# Helper script to start Cloudflare Tunnel for local development

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "Cloudflare Tunnel Setup"
echo "========================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}Error: cloudflared is not installed${NC}"
    echo ""
    echo "Install it with:"
    echo "  brew install cloudflare/cloudflare/cloudflared"
    echo ""
    echo "Or download from:"
    echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    exit 1
fi

echo -e "${GREEN}✓ cloudflared is installed${NC}"
echo ""

# Check if a named tunnel exists
TUNNEL_NAME="t1-triage-bot"
TUNNEL_EXISTS=$(cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME" && echo "yes" || echo "no")

if [ "$TUNNEL_EXISTS" = "yes" ]; then
    echo -e "${GREEN}✓ Found named tunnel: $TUNNEL_NAME${NC}"
    echo ""
    echo "Starting persistent tunnel..."
    echo "This will use the same URL every time."
    echo ""
    echo "========================================="
    echo "Starting tunnel..."
    echo "========================================="
    echo ""
    
    # Start the named tunnel
    cloudflared tunnel run "$TUNNEL_NAME"
else
    echo -e "${YELLOW}⚠ No named tunnel found. Starting quick tunnel...${NC}"
    echo ""
    echo "Note: Quick tunnel URLs change each time."
    echo "For a persistent URL, run:"
    echo "  1. cloudflared tunnel login"
    echo "  2. cloudflared tunnel create $TUNNEL_NAME"
    echo "  3. Update .cloudflared/config.yml with your tunnel ID"
    echo "  4. Run this script again"
    echo ""
    echo "========================================="
    echo "Starting quick tunnel..."
    echo "========================================="
    echo ""
    echo -e "${GREEN}Your tunnel URL will appear below:${NC}"
    echo ""
    
    # Start quick tunnel
    cloudflared tunnel --url http://localhost:3000
fi






