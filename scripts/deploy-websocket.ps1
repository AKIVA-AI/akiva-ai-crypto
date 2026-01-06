# Deploy WebSocket Market Data Stream Edge Function
# This script deploys the new market-data-stream function to Supabase

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying WebSocket Market Data Stream..." -ForegroundColor Cyan
Write-Host ""

# Check if supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
} catch {
    Write-Host "❌ Error: Supabase CLI is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    $null = supabase projects list 2>&1
} catch {
    Write-Host "❌ Error: Not logged in to Supabase" -ForegroundColor Red
    Write-Host "Login with: supabase login" -ForegroundColor Yellow
    exit 1
}

Write-Host "📦 Deploying market-data-stream function..." -ForegroundColor Yellow
supabase functions deploy market-data-stream

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next steps:" -ForegroundColor Cyan
Write-Host "1. Test the WebSocket connection in your browser console"
Write-Host "2. Monitor logs with: supabase functions logs market-data-stream"
Write-Host "3. Check for any errors in the Supabase dashboard"
Write-Host ""
Write-Host "🔍 Test URL:" -ForegroundColor Cyan
Write-Host "https://YOUR_PROJECT.supabase.co/functions/v1/market-data-stream?symbols=BTCUSDT,ETHUSDT"
Write-Host ""
Write-Host "📝 Documentation: docs/WEBSOCKET_IMPLEMENTATION.md" -ForegroundColor Cyan

