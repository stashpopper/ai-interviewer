#!/usr/bin/env bash
# Setup script for Better Uptime monitoring
#
# This script:
# 1. Commits and pushes the health check endpoint to your repo
# 2. Prints instructions to configure Better Uptime
#
# Prerequisites:
#   - You have a Better Uptime account (https://betteruptime.com)
#   - Your backend is deployed at https://ai-interviewer-ky0h.onrender.com
#
# After running this, go to Better Uptime and:
#   1. Create a new HTTP monitor
#   2. URL: https://ai-interviewer-ky0h.onrender.com/api/health
#   3. Check interval: 30 seconds (free plan minimum)
#   4. Add notification channels (email, SMS, Slack, etc.)
#
# The health endpoint returns 200 OK with { status: "ok" } which
# Better Uptime uses to confirm the backend is responding.

set -euo pipefail

echo "========================================="
echo "  Better Uptime Setup"
echo "========================================="
echo ""
echo "This will:"
echo "  1. Commit and push the /api/health endpoint"
echo "  2. Show you the Better Uptime configuration steps"
echo ""

read -p "Press Enter to continue..."

echo ""
echo "Committing and pushing health endpoint..."

cd "$(dirname "$0")"

git add apps/backend/index.ts
git commit -m "feat: add /api/health endpoint for uptime monitoring" 2>/dev/null || echo "(no changes or already committed)"
git push stashpopper main 2>&1 || echo "(push failed - may already be pushed)"

echo ""
echo "========================================="
echo "  Better Uptime Configuration Steps"
echo "========================================="
echo ""
echo "1. Go to https://betteruptime.com and sign in"
echo ""
echo "2. Click 'Monitors' > 'New Monitor'"
echo ""
echo "3. Fill in the monitor details:"
echo "     URL: https://ai-interviewer-ky0h.onrender.com/api/health"
echo "     Type: HTTP"
echo "     Check interval: 30 seconds (free plan)"
echo "     Name: AI Interviewer Backend"
echo ""
echo "4. Under 'Notifications', select:"
echo "     - Email (alerts when down/up)"
echo "     - SMS (optional, paid feature)"
echo "     - Slack/Teams webhook (optional)"
echo ""
echo "5. Click 'Create'"
echo ""
echo "That's it! Better Uptime will now ping your backend every 30"
echo "seconds, which keeps Render's free tier warm and prevents cold"
echo "starts for your website visitors."
echo ""
echo "========================================="
echo "  Done!"
echo "========================================="
