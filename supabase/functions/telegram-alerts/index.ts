import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface AlertMessage {
  type: 'whale' | 'signal' | 'trigger' | 'risk' | 'custom';
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

async function sendTelegramMessage(config: TelegramConfig, alert: AlertMessage): Promise<boolean> {
  const { botToken, chatId } = config;
  
  // Format message with emoji based on type and severity
  const typeEmojis: Record<string, string> = {
    whale: '🐋',
    signal: '📊',
    trigger: '⚡',
    risk: '🚨',
    custom: '📢',
  };
  
  const severityEmojis: Record<string, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🔴',
  };
  
  const emoji = typeEmojis[alert.type] || '📢';
  const severityEmoji = alert.severity ? severityEmojis[alert.severity] : '';
  
  const formattedMessage = `
${emoji} *${alert.title}* ${severityEmoji}

${alert.message}

${alert.metadata ? `\`\`\`\n${JSON.stringify(alert.metadata, null, 2)}\n\`\`\`` : ''}

_Sent via Trading Intelligence System_
`.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedMessage,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    
    const result = await response.json();
    console.log('Telegram API response:', result);
    return result.ok === true;
  } catch (error) {
    console.error('Telegram send error:', error);
    return false;
  }
}

async function testConnection(config: TelegramConfig): Promise<{ success: boolean; message: string }> {
  try {
    // Verify bot token by getting bot info
    const botResponse = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
    const botResult = await botResponse.json();
    
    if (!botResult.ok) {
      return { success: false, message: 'Invalid bot token' };
    }
    
    // Send test message
    const testAlert: AlertMessage = {
      type: 'custom',
      title: 'Connection Test',
      message: '✅ Your Telegram bot is successfully connected to the Trading Intelligence System!',
      severity: 'info',
    };
    
    const sent = await sendTelegramMessage(config, testAlert);
    
    if (sent) {
      return { success: true, message: `Connected to bot @${botResult.result.username}` };
    } else {
      return { success: false, message: 'Bot connected but failed to send message. Check chat ID.' };
    }
  } catch (error) {
    console.error('Test connection error:', error);
    return { success: false, message: 'Failed to connect to Telegram API' };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, botToken, chatId, alert, channelId } = await req.json();

    switch (action) {
      case 'test_connection': {
        if (!botToken || !chatId) {
          return new Response(
            JSON.stringify({ error: 'Bot token and chat ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const result = await testConnection({ botToken, chatId });
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'save_config': {
        if (!botToken || !chatId) {
          return new Response(
            JSON.stringify({ error: 'Bot token and chat ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Store in notification_channels table
        const { data, error } = await supabase
          .from('notification_channels')
          .upsert({
            id: channelId || crypto.randomUUID(),
            name: 'Telegram Bot',
            type: 'telegram',
            webhook_url: `telegram://${chatId}`, // Store chat ID in webhook_url field
            is_enabled: true,
            alert_types: ['whale', 'signal', 'trigger', 'risk'],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' })
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, channel: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'send_alert': {
        if (!alert) {
          return new Response(
            JSON.stringify({ error: 'Alert data required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get Telegram channel config
        const { data: channels } = await supabase
          .from('notification_channels')
          .select('*')
          .eq('type', 'telegram')
          .eq('is_enabled', true);

        if (!channels || channels.length === 0) {
          return new Response(
            JSON.stringify({ error: 'No Telegram channels configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Note: In production, you'd store the bot token securely
        // For now, we'll require it to be passed or stored as a secret
        const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        
        if (!telegramBotToken) {
          return new Response(
            JSON.stringify({ error: 'Telegram bot token not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const results = [];
        for (const channel of channels) {
          // Extract chat ID from webhook_url
          const chatIdMatch = channel.webhook_url.match(/telegram:\/\/(.+)/);
          if (chatIdMatch) {
            const success = await sendTelegramMessage(
              { botToken: telegramBotToken, chatId: chatIdMatch[1] },
              alert
            );
            results.push({ channelId: channel.id, success });

            // Log the notification
            await supabase.from('notification_logs').insert({
              channel_id: channel.id,
              status: success ? 'sent' : 'failed',
              error_message: success ? null : 'Failed to send Telegram message',
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_config': {
        const { data: channels } = await supabase
          .from('notification_channels')
          .select('*')
          .eq('type', 'telegram');

        return new Response(
          JSON.stringify({ channels: channels || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Telegram alerts error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
