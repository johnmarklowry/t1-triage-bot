# Local Debugging Guide for Slack Bolt App

This guide explains how to debug your Slack Bolt app locally using Cloudflare Tunnel (recommended) or ngrok, and VS Code.

## Prerequisites

1. **Cloudflare Tunnel (cloudflared)** - Recommended for consistent URLs
   ```bash
   # macOS
   brew install cloudflare/cloudflare/cloudflared
   
   # Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

   OR

   **ngrok** - Alternative option
   ```bash
   # macOS
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Slack App Configuration** - You'll need:
   - Bot Token (starts with `xoxb-`)
   - Signing Secret
   - App Token (starts with `xapp-`) - for Socket Mode (optional, alternative to ngrok)

## Setup Steps

## Option 1: Cloudflare Tunnel (Recommended)

Cloudflare Tunnel provides a persistent URL that doesn't change, making it ideal for consistent local development.

### 1. Install cloudflared (if not already installed)

```bash
# Check if cloudflared is installed
cloudflared --version

# If not installed, use Homebrew on macOS:
brew install cloudflare/cloudflare/cloudflared

# Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

### 2. Create a Cloudflare Tunnel

#### Quick Setup (Temporary Tunnel - URL changes each time)

For a quick start without authentication:

```bash
cloudflared tunnel --url http://localhost:3000
```

This will output a URL like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-subdomain.trycloudflare.com                                                |
+--------------------------------------------------------------------------------------------+
```

**Copy the HTTPS URL** (e.g., `https://random-subdomain.trycloudflare.com`)

#### Persistent Setup (Recommended - Same URL every time)

For a persistent tunnel that keeps the same URL:

1. **Login to Cloudflare** (free account required):
   ```bash
   cloudflared tunnel login
   ```
   This will open a browser window for authentication.

2. **Create a named tunnel**:
   ```bash
   cloudflared tunnel create t1-triage-bot
   ```
   This creates a tunnel and saves credentials to `~/.cloudflared/YOUR_TUNNEL_ID.json`

3. **Configure the tunnel**:
   The configuration file is already created at `.cloudflared/config.yml`. Update it with your tunnel ID:
   ```bash
   # Find your tunnel ID
   cloudflared tunnel list
   
   # Edit .cloudflared/config.yml and replace YOUR_TUNNEL_ID with the actual ID
   # Also replace YOUR_DOMAIN with your desired subdomain (or use trycloudflare.com for free)
   ```

4. **Create a DNS route** (optional, for custom domain):
   ```bash
   # For trycloudflare.com (free, no setup needed)
   # Just use the URL provided when you start the tunnel
   
   # For custom domain (requires Cloudflare-managed domain):
   cloudflared tunnel route dns t1-triage-bot dev.yourdomain.com
   ```

5. **Start the tunnel**:
   ```bash
   cloudflared tunnel run t1-triage-bot
   ```
   
   Or use the helper script:
   ```bash
   ./start-cloudflare-tunnel.sh
   ```

### 3. Update Slack App Settings

1. Go to https://api.slack.com/apps
2. Select your app
3. Go to **Features > Event Subscriptions**
   - Enable Events
   - Set **Request URL** to: `https://your-cloudflare-url.trycloudflare.com/slack/events`
     (or your custom domain if configured)
   - Slack will verify the URL (you should see a checkmark)
4. Go to **Features > Interactivity & Shortcuts**
   - Enable Interactivity
   - Set **Request URL** to: `https://your-cloudflare-url.trycloudflare.com/slack/events`
5. Go to **Features > Slash Commands**
   - For each command, ensure the Request URL is set correctly
6. Go to **Features > App Home**
   - Enable Home Tab

**Note**: With a persistent Cloudflare tunnel, you only need to set these URLs once!

## Option 2: ngrok (Alternative)

### 1. Install ngrok (if not already installed)

```bash
# Check if ngrok is installed
ngrok version

# If not installed, download from https://ngrok.com/download
# Or use Homebrew on macOS:
brew install ngrok
```

### 2. Start ngrok tunnel

In a separate terminal, start ngrok to expose your local server:

```bash
ngrok http 3000
```

This will output something like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

**Note**: Free ngrok accounts get a new URL each time. You'll need to update Slack app settings every time you restart ngrok.

### 4. Configure Environment Variables

Create a `.env` file (or copy from `env.example`):

```bash
cp env.example .env
```

Update `.env` with your local values:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here  # Optional for Socket Mode
ADMIN_CHANNEL_ID=C1234567890

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/triage_bot
# OR use your Railway database URL for testing

# Application Configuration
PORT=3000
NODE_ENV=development

# Migration Configuration
USE_PRISMA_MIGRATIONS=true
```

### 5. Start the Local Server

#### Option A: Using npm script
```bash
npm start
```

#### Option B: Using VS Code Debugger
1. Press `F5` or go to **Run > Start Debugging**
2. Select "Debug Slack Bot (Local)" configuration
3. Set breakpoints in your code
4. Interact with your Slack app to trigger breakpoints

#### Option C: Using Node directly
```bash
node server.js
```

### 6. Test Your App

1. Open your Slack workspace
2. Invite your bot to a channel (if needed)
3. Try commands like `/admin-sprints` or `/admin-disciplines`
4. Check your terminal/VS Code debug console for logs
5. Use breakpoints to debug specific code paths

## Debugging Tips

### Setting Breakpoints

In VS Code:
- Click in the gutter (left of line numbers) to set breakpoints
- Red dots indicate active breakpoints
- Use the Debug panel to view variables, call stack, etc.

### Common Debugging Scenarios

1. **Slash Commands Not Working**
   - Check ngrok URL is correct in Slack app settings
   - Verify `SLACK_SIGNING_SECRET` matches your app
   - Check server logs for errors

2. **Events Not Firing**
   - Ensure Event Subscriptions are enabled
   - Verify Request URL in Slack app settings
   - Check that your bot is subscribed to the events you need

3. **Database Connection Issues**
   - Verify `DATABASE_URL` is correct
   - Check if database is accessible from your machine
   - For Railway database, ensure your IP is whitelisted (if required)

### Using Socket Mode (Alternative to ngrok)

Socket Mode is recommended for local development (no tunnel needed):

1. Enable Socket Mode in your Slack app settings
2. Get your App-Level Token (starts with `xapp-`)
3. Set `SLACK_APP_TOKEN` in your `.env` (starts with `xapp-`)
4. Ensure `NODE_ENV=development` (default in `env.example`)
5. Start the app (Socket Mode will be used automatically when `SLACK_APP_TOKEN` is present):

```bash
npm start
```

To force HTTP mode locally (for ngrok/cloudflared testing), set:

```env
SOCKET_MODE=false
```

## Troubleshooting

### ngrok URL Changes Every Time

**Free ngrok accounts** get a new URL each time. Solutions:
1. Use ngrok authtoken and reserved domains (paid feature)
2. Update Slack app settings each time you restart ngrok
3. Use Socket Mode instead

### Port Already in Use

If port 3000 is already in use:
```bash
# Find what's using the port
lsof -i :3000

# Kill the process or change PORT in .env
PORT=3001 npm start
# Then update ngrok: ngrok http 3001
```

### Database Migrations

If you need to run migrations locally:
```bash
# Prisma migrations
npx prisma migrate deploy

# Or custom migrations (if USE_PRISMA_MIGRATIONS=false)
npm run migrate
```

## Quick Start Scripts

### Cloudflare Tunnel Script

A helper script is provided to start the Cloudflare tunnel:

```bash
chmod +x start-cloudflare-tunnel.sh
./start-cloudflare-tunnel.sh
```

This script will:
1. Check if cloudflared is installed
2. Start a quick tunnel (or use persistent tunnel if configured)
3. Display the URL for you to use in Slack app settings
4. Keep the tunnel running until you press Ctrl+C

### ngrok Script (Alternative)

A helper script for ngrok is also available:

```bash
chmod +x start-local-debug.sh
./start-local-debug.sh
```

This script will:
1. Start ngrok in the background
2. Wait for it to initialize
3. Display the ngrok URL
4. Start your local server
5. Clean up ngrok when you stop the script

## Additional Resources

- [Slack Bolt Framework Docs](https://slack.dev/bolt-js/concepts)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [ngrok Documentation](https://ngrok.com/docs)
- [VS Code Debugging Guide](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)

## Why Cloudflare Tunnel?

Cloudflare Tunnel offers several advantages over ngrok for local development:

1. **Persistent URLs**: With a named tunnel, you get the same URL every time
2. **Free**: No paid plan needed for basic usage
3. **No URL Changes**: Set your Slack app URLs once and forget it
4. **Better Performance**: Cloudflare's global network
5. **No Rate Limits**: More generous limits than free ngrok

The main trade-off is the initial setup is slightly more involved, but it's worth it for consistent development.



