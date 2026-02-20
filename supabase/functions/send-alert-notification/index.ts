import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecureCorsHeaders, RATE_LIMITS, rateLimitMiddleware, validateAuth } from "../_shared/security.ts";

interface AlertPayload {
  alertId: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  channelId?: string;
}

serve(async (req) => {
  const corsHeaders = getSecureCorsHeaders(req.headers.get('Origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: AlertPayload = await req.json();
    const { alertId, title, message, severity, source, channelId } = payload;

    // Fetch enabled notification channels
    let query = supabase
      .from('notification_channels')
      .select('*')
      .eq('is_enabled', true);
    
    if (channelId) {
      query = query.eq('id', channelId);
    }

    const { data: channels, error: channelsError } = await query;

    if (channelsError) {
      throw new Error(`Failed to fetch channels: ${channelsError.message}`);
    }

    if (!channels?.length) {
      return new Response(JSON.stringify({ message: 'No active notification channels' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const channel of channels) {
      // Check if this channel should receive this severity level
      if (!channel.alert_types.includes(severity)) {
        continue;
      }

      let webhookPayload: Record<string, unknown> = {};
      let success = false;
      let errorMessage = '';

      try {
        switch (channel.type) {
          case 'discord':
            // Discord webhook format
            const discordColor = severity === 'critical' ? 0xff0000 : severity === 'warning' ? 0xffa500 : 0x00ff00;
            webhookPayload = {
              embeds: [{
                title: `🔔 ${title}`,
                description: message,
                color: discordColor,
                fields: [
                  { name: 'Severity', value: severity.toUpperCase(), inline: true },
                  { name: 'Source', value: source, inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Trading Dashboard Alert' },
              }],
            };
            break;

          case 'telegram': {
            // Telegram format - use bot API with stored chat ID
            const emoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
            const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
            const chatIdMatch = channel.webhook_url.match(/telegram:\/\/(.+)/);
            const telegramChatId = chatIdMatch ? chatIdMatch[1] : Deno.env.get('TELEGRAM_CHAT_ID');
            
            if (telegramBotToken && telegramChatId) {
              // Send via Telegram Bot API directly
              const telegramText = `${emoji} *${title}*\n\n${message}\n\n*Severity:* ${severity.toUpperCase()}\n*Source:* ${source}`;
              const telegramResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: telegramChatId,
                  text: telegramText,
                  parse_mode: 'Markdown',
                  disable_web_page_preview: true,
                }),
              });
              success = telegramResp.ok;
              if (!success) {
                errorMessage = `Telegram API error: ${await telegramResp.text()}`;
              }
              // Skip the generic webhook send below
              results.push({ channel: channel.name, success, error: errorMessage || null });
              await supabase.from('notification_logs').insert({
                channel_id: channel.id,
                alert_id: alertId || null,
                status: success ? 'sent' : 'failed',
                error_message: errorMessage || null,
              });
              continue;
            }
            
            webhookPayload = {
              text: `${emoji} *${title}*\n\n${message}\n\n*Severity:* ${severity.toUpperCase()}\n*Source:* ${source}`,
              parse_mode: 'Markdown',
            };
            break;
          }

          case 'slack':
            // Slack webhook format
            const slackColor = severity === 'critical' ? '#ff0000' : severity === 'warning' ? '#ffa500' : '#00ff00';
            webhookPayload = {
              attachments: [{
                color: slackColor,
                title: `🔔 ${title}`,
                text: message,
                fields: [
                  { title: 'Severity', value: severity.toUpperCase(), short: true },
                  { title: 'Source', value: source, short: true },
                ],
                ts: Math.floor(Date.now() / 1000),
              }],
            };
            break;

          default:
            // Generic webhook
            webhookPayload = {
              alert_id: alertId,
              title,
              message,
              severity,
              source,
              timestamp: new Date().toISOString(),
            };
        }

        const response = await fetch(channel.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        success = true;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to send to ${channel.name}:`, errorMessage);
      }

      // Log the notification attempt
      await supabase.from('notification_logs').insert({
        channel_id: channel.id,
        alert_id: alertId || null,
        status: success ? 'sent' : 'failed',
        error_message: errorMessage || null,
      });

      results.push({
        channel: channel.name,
        success,
        error: errorMessage || null,
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
