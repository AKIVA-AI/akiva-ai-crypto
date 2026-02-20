# Secret Rotation Guide

## Why Rotate?

If API keys were ever committed to version control (even temporarily), they should be considered compromised and rotated immediately.

## Secrets That Need Rotation

Rotate the following in their respective platforms, then update them as Supabase secrets:

| Secret | Where to Rotate | Supabase Secret Name |
|--------|----------------|---------------------|
| Telegram Bot Token | [@BotFather](https://t.me/BotFather) → `/revoke` → `/newtoken` | `TELEGRAM_BOT_TOKEN` |
| Binance.US API Key | [Binance.US API Management](https://www.binance.us/settings/api-management) | `BINANCE_US_API_KEY`, `BINANCE_US_API_SECRET` |
| Coinbase API Key | [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) | `COINBASE_API_KEY`, `COINBASE_API_SECRET` |
| Kraken API Key | [Kraken API Settings](https://www.kraken.com/u/settings/api) | `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` |
| CoinGecko API Key | [CoinGecko Developer Dashboard](https://www.coingecko.com/en/developers/dashboard) | `COINGECKO_API_KEY` |

## Steps

### 1. Rotate on the Platform

For each secret above:
1. Go to the platform's API management page
2. **Delete** or **revoke** the old key
3. Generate a **new** key
4. Copy the new key securely (don't paste it anywhere except step 2)

### 2. Update Supabase Secrets

```bash
# Via Supabase CLI
supabase secrets set TELEGRAM_BOT_TOKEN=new-token-here --project-ref amvakxshlojoshdfcqos

# Or via Dashboard:
# Project Settings → Edge Functions → Secrets
```

Dashboard link: [Edge Function Secrets](https://supabase.com/dashboard/project/amvakxshlojoshdfcqos/settings/functions)

### 3. Scrub Git History (If Needed)

If keys were previously committed, use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/):

```bash
# Install BFG
brew install bfg  # macOS

# Create a file with patterns to remove
echo "old-telegram-bot-token" >> secrets.txt
echo "old-binance-api-key" >> secrets.txt

# Run BFG
bfg --replace-text secrets.txt

# Force push cleaned history
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

⚠️ **Warning:** Force-pushing rewrites history for all collaborators. Coordinate before doing this on a shared repo.

### 4. Verify

After rotation, test each integration:
- **Telegram**: Send a test alert via the `send-alert-notification` edge function
- **Exchanges**: Check the market-data edge function returns live prices
- **CoinGecko**: Verify price feeds on the dashboard

## Prevention

- **Never** commit `.env` files (already in `.gitignore`)
- Use Supabase secrets for all private keys
- Only publishable/anon keys belong in the codebase
- Enable GitHub's [secret scanning](https://docs.github.com/en/code-security/secret-scanning) on the repo
