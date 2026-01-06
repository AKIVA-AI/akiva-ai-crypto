#!/bin/bash

# Deploy WebSocket Market Data Stream Edge Function
# This script deploys the new market-data-stream function to Supabase

set -e

echo "🚀 Deploying WebSocket Market Data Stream..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Login with: supabase login"
    exit 1
fi

echo "📦 Deploying market-data-stream function..."
supabase functions deploy market-data-stream

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Next steps:"
echo "1. Test the WebSocket connection in your browser console"
echo "2. Monitor logs with: supabase functions logs market-data-stream"
echo "3. Check for any errors in the Supabase dashboard"
echo ""
echo "🔍 Test URL:"
echo "https://YOUR_PROJECT.supabase.co/functions/v1/market-data-stream?symbols=BTCUSDT,ETHUSDT"
echo ""
echo "📝 Documentation: docs/WEBSOCKET_IMPLEMENTATION.md"

