export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          capabilities: string[]
          config: Json
          cpu_usage: number
          created_at: string
          error_message: string | null
          id: string
          last_heartbeat: string
          memory_usage: number
          name: string
          status: string
          type: string
          updated_at: string
          uptime: number
          version: string
        }
        Insert: {
          capabilities?: string[]
          config?: Json
          cpu_usage?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string
          memory_usage?: number
          name: string
          status?: string
          type: string
          updated_at?: string
          uptime?: number
          version?: string
        }
        Update: {
          capabilities?: string[]
          config?: Json
          cpu_usage?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string
          memory_usage?: number
          name?: string
          status?: string
          type?: string
          updated_at?: string
          uptime?: number
          version?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          is_resolved: boolean
          message: string
          metadata: Json
          severity: Database["public"]["Enums"]["alert_severity"]
          source: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          message: string
          metadata?: Json
          severity?: Database["public"]["Enums"]["alert_severity"]
          source: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          message?: string
          metadata?: Json
          severity?: Database["public"]["Enums"]["alert_severity"]
          source?: string
          title?: string
        }
        Relationships: []
      }
      arbitrage_executions: {
        Row: {
          buy_exchange: string
          buy_order_id: string | null
          buy_price: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          gross_profit: number
          id: string
          metadata: Json
          net_profit: number
          opportunity_id: string
          quantity: number
          sell_exchange: string
          sell_order_id: string | null
          sell_price: number
          slippage: number
          spread_percent: number
          status: string
          symbol: string
          trading_fees: number
          updated_at: string
          withdrawal_fee: number
        }
        Insert: {
          buy_exchange: string
          buy_order_id?: string | null
          buy_price: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          gross_profit: number
          id?: string
          metadata?: Json
          net_profit: number
          opportunity_id: string
          quantity: number
          sell_exchange: string
          sell_order_id?: string | null
          sell_price: number
          slippage?: number
          spread_percent: number
          status?: string
          symbol: string
          trading_fees?: number
          updated_at?: string
          withdrawal_fee?: number
        }
        Update: {
          buy_exchange?: string
          buy_order_id?: string | null
          buy_price?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          gross_profit?: number
          id?: string
          metadata?: Json
          net_profit?: number
          opportunity_id?: string
          quantity?: number
          sell_exchange?: string
          sell_order_id?: string | null
          sell_price?: number
          slippage?: number
          spread_percent?: number
          status?: string
          symbol?: string
          trading_fees?: number
          updated_at?: string
          withdrawal_fee?: number
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          book_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          severity: Database["public"]["Enums"]["alert_severity"]
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          book_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          book_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_budgets: {
        Row: {
          allocated_capital: number
          book_id: string
          created_at: string
          current_daily_pnl: number
          id: string
          max_daily_loss: number
          period_end: string
          period_start: string
          updated_at: string
          used_capital: number
        }
        Insert: {
          allocated_capital?: number
          book_id: string
          created_at?: string
          current_daily_pnl?: number
          id?: string
          max_daily_loss?: number
          period_end: string
          period_start: string
          updated_at?: string
          used_capital?: number
        }
        Update: {
          allocated_capital?: number
          book_id?: string
          created_at?: string
          current_daily_pnl?: number
          id?: string
          max_daily_loss?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          used_capital?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_budgets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          capital_allocated: number
          created_at: string
          current_exposure: number
          id: string
          max_drawdown_limit: number
          name: string
          risk_tier: number
          status: Database["public"]["Enums"]["book_status"]
          type: Database["public"]["Enums"]["book_type"]
          updated_at: string
        }
        Insert: {
          capital_allocated?: number
          created_at?: string
          current_exposure?: number
          id?: string
          max_drawdown_limit?: number
          name: string
          risk_tier?: number
          status?: Database["public"]["Enums"]["book_status"]
          type: Database["public"]["Enums"]["book_type"]
          updated_at?: string
        }
        Update: {
          capital_allocated?: number
          created_at?: string
          current_exposure?: number
          id?: string
          max_drawdown_limit?: number
          name?: string
          risk_tier?: number
          status?: Database["public"]["Enums"]["book_status"]
          type?: Database["public"]["Enums"]["book_type"]
          updated_at?: string
        }
        Relationships: []
      }
      circuit_breaker_events: {
        Row: {
          action_taken: string
          book_id: string | null
          created_at: string
          id: string
          metadata: Json
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          action_taken: string
          book_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          trigger_type: string
          triggered_by?: string | null
        }
        Update: {
          action_taken?: string
          book_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuit_breaker_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_traces: {
        Row: {
          block_reasons: string[] | null
          confidence: number
          costs: Json
          created_at: string
          decision: string
          direction: string
          explanation: string
          gates_checked: Json
          id: string
          instrument: string
          reason_codes: string[] | null
          regime: Json
          signal_strength: number
          strategy_id: string | null
          strategy_name: string
          target_exposure_usd: number
          timestamp: string
          trace_id: string
        }
        Insert: {
          block_reasons?: string[] | null
          confidence: number
          costs?: Json
          created_at?: string
          decision: string
          direction: string
          explanation: string
          gates_checked?: Json
          id?: string
          instrument: string
          reason_codes?: string[] | null
          regime?: Json
          signal_strength: number
          strategy_id?: string | null
          strategy_name: string
          target_exposure_usd: number
          timestamp?: string
          trace_id: string
        }
        Update: {
          block_reasons?: string[] | null
          confidence?: number
          costs?: Json
          created_at?: string
          decision?: string
          direction?: string
          explanation?: string
          gates_checked?: Json
          id?: string
          instrument?: string
          reason_codes?: string[] | null
          regime?: Json
          signal_strength?: number
          strategy_id?: string | null
          strategy_name?: string
          target_exposure_usd?: number
          timestamp?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_traces_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          book_id: string
          config: Json
          created_at: string
          deployed_at: string | null
          deployed_by: string | null
          error_message: string | null
          id: string
          status: string
          strategy_id: string
          terminated_at: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          book_id: string
          config?: Json
          created_at?: string
          deployed_at?: string | null
          deployed_by?: string | null
          error_message?: string | null
          id?: string
          status?: string
          strategy_id: string
          terminated_at?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          book_id?: string
          config?: Json
          created_at?: string
          deployed_at?: string | null
          deployed_by?: string | null
          error_message?: string | null
          id?: string
          status?: string
          strategy_id?: string
          terminated_at?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployments_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      derivatives_metrics: {
        Row: {
          funding_rate: number | null
          id: string
          instrument: string
          liquidations_24h_long: number | null
          liquidations_24h_short: number | null
          long_short_ratio: number | null
          next_funding_time: string | null
          oi_change_24h: number | null
          open_interest: number | null
          recorded_at: string
          top_trader_long_ratio: number | null
          top_trader_short_ratio: number | null
          venue: string
        }
        Insert: {
          funding_rate?: number | null
          id?: string
          instrument: string
          liquidations_24h_long?: number | null
          liquidations_24h_short?: number | null
          long_short_ratio?: number | null
          next_funding_time?: string | null
          oi_change_24h?: number | null
          open_interest?: number | null
          recorded_at?: string
          top_trader_long_ratio?: number | null
          top_trader_short_ratio?: number | null
          venue: string
        }
        Update: {
          funding_rate?: number | null
          id?: string
          instrument?: string
          liquidations_24h_long?: number | null
          liquidations_24h_short?: number | null
          long_short_ratio?: number | null
          next_funding_time?: string | null
          oi_change_24h?: number | null
          open_interest?: number | null
          recorded_at?: string
          top_trader_long_ratio?: number | null
          top_trader_short_ratio?: number | null
          venue?: string
        }
        Relationships: []
      }
      fills: {
        Row: {
          created_at: string
          executed_at: string
          fee: number
          id: string
          instrument: string
          order_id: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          size: number
          venue_fill_id: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          instrument: string
          order_id: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          size: number
          venue_fill_id?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          instrument?: string
          order_id?: string
          price?: number
          side?: Database["public"]["Enums"]["order_side"]
          size?: number
          venue_fill_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fills_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          api_base_url: string
          dex_venues_enabled: boolean
          global_kill_switch: boolean
          id: string
          meme_module_enabled: boolean
          paper_trading_mode: boolean
          reduce_only_mode: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_base_url?: string
          dex_venues_enabled?: boolean
          global_kill_switch?: boolean
          id?: string
          meme_module_enabled?: boolean
          paper_trading_mode?: boolean
          reduce_only_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_base_url?: string
          dex_venues_enabled?: boolean
          global_kill_switch?: boolean
          id?: string
          meme_module_enabled?: boolean
          paper_trading_mode?: boolean
          reduce_only_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      intelligence_signals: {
        Row: {
          composite_score: number | null
          confidence: number | null
          created_at: string
          direction: string
          expires_at: string | null
          factor_scores: Json | null
          id: string
          instrument: string
          is_high_probability: boolean | null
          product_type: string | null
          reasoning: string | null
          signal_type: string
          source_data: Json | null
          strength: number | null
          tier: number | null
          venue: string | null
        }
        Insert: {
          composite_score?: number | null
          confidence?: number | null
          created_at?: string
          direction: string
          expires_at?: string | null
          factor_scores?: Json | null
          id?: string
          instrument: string
          is_high_probability?: boolean | null
          product_type?: string | null
          reasoning?: string | null
          signal_type: string
          source_data?: Json | null
          strength?: number | null
          tier?: number | null
          venue?: string | null
        }
        Update: {
          composite_score?: number | null
          confidence?: number | null
          created_at?: string
          direction?: string
          expires_at?: string | null
          factor_scores?: Json | null
          id?: string
          instrument?: string
          is_high_probability?: boolean | null
          product_type?: string | null
          reasoning?: string | null
          signal_type?: string
          source_data?: Json | null
          strength?: number | null
          tier?: number | null
          venue?: string | null
        }
        Relationships: []
      }
      market_data_metrics: {
        Row: {
          avg_latency_ms: number | null
          cache_hits: number | null
          cache_misses: number | null
          endpoint: string
          id: string
          rate_limit_hits: number | null
          recorded_at: string
          request_count: number | null
          symbol: string | null
        }
        Insert: {
          avg_latency_ms?: number | null
          cache_hits?: number | null
          cache_misses?: number | null
          endpoint: string
          id?: string
          rate_limit_hits?: number | null
          recorded_at?: string
          request_count?: number | null
          symbol?: string | null
        }
        Update: {
          avg_latency_ms?: number | null
          cache_hits?: number | null
          cache_misses?: number | null
          endpoint?: string
          id?: string
          rate_limit_hits?: number | null
          recorded_at?: string
          request_count?: number | null
          symbol?: string | null
        }
        Relationships: []
      }
      market_news: {
        Row: {
          created_at: string
          id: string
          impact_score: number | null
          instruments: string[] | null
          published_at: string
          raw_content: string | null
          sentiment_score: number | null
          source: string
          summary: string | null
          tags: string[] | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          impact_score?: number | null
          instruments?: string[] | null
          published_at: string
          raw_content?: string | null
          sentiment_score?: number | null
          source: string
          summary?: string | null
          tags?: string[] | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          impact_score?: number | null
          instruments?: string[] | null
          published_at?: string
          raw_content?: string | null
          sentiment_score?: number | null
          source?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      market_snapshots: {
        Row: {
          ask: number
          bid: number
          id: string
          instrument: string
          last_price: number
          recorded_at: string
          venue_id: string
          volume_24h: number | null
        }
        Insert: {
          ask: number
          bid: number
          id?: string
          instrument: string
          last_price: number
          recorded_at?: string
          venue_id: string
          volume_24h?: number | null
        }
        Update: {
          ask?: number
          bid?: number
          id?: string
          instrument?: string
          last_price?: number
          recorded_at?: string
          venue_id?: string
          volume_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      meme_metrics: {
        Row: {
          exit_progress: number
          id: string
          incident_count: number
          liquidity_health: number
          pnl: number
          project_id: string
          recorded_at: string
          slippage: number
        }
        Insert: {
          exit_progress?: number
          id?: string
          incident_count?: number
          liquidity_health?: number
          pnl?: number
          project_id: string
          recorded_at?: string
          slippage?: number
        }
        Update: {
          exit_progress?: number
          id?: string
          incident_count?: number
          liquidity_health?: number
          pnl?: number
          project_id?: string
          recorded_at?: string
          slippage?: number
        }
        Relationships: [
          {
            foreignKeyName: "meme_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "meme_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meme_projects: {
        Row: {
          approved_by: string | null
          created_at: string
          go_no_go_approved: boolean
          holder_concentration: number
          id: string
          liquidity_signal: string | null
          name: string
          narrative_tags: string[]
          social_velocity: number
          stage: Database["public"]["Enums"]["meme_project_stage"]
          ticker: string
          updated_at: string
          viral_score: number
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          go_no_go_approved?: boolean
          holder_concentration?: number
          id?: string
          liquidity_signal?: string | null
          name: string
          narrative_tags?: string[]
          social_velocity?: number
          stage?: Database["public"]["Enums"]["meme_project_stage"]
          ticker: string
          updated_at?: string
          viral_score?: number
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          go_no_go_approved?: boolean
          holder_concentration?: number
          id?: string
          liquidity_signal?: string | null
          name?: string
          narrative_tags?: string[]
          social_velocity?: number
          stage?: Database["public"]["Enums"]["meme_project_stage"]
          ticker?: string
          updated_at?: string
          viral_score?: number
        }
        Relationships: []
      }
      meme_tasks: {
        Row: {
          category: string
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          notes: string | null
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meme_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "meme_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          alert_types: string[]
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          name: string
          type: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          alert_types?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          type: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          alert_types?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          type?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          alert_id: string | null
          channel_id: string | null
          error_message: string | null
          id: string
          sent_at: string
          status: string
        }
        Insert: {
          alert_id?: string | null
          channel_id?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string
          status: string
        }
        Update: {
          alert_id?: string | null
          channel_id?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      onchain_metrics: {
        Row: {
          active_addresses: number | null
          exchange_inflow: number | null
          exchange_outflow: number | null
          gas_used: number | null
          holder_concentration: number | null
          holder_count: number | null
          id: string
          instrument: string
          network: string
          recorded_at: string
          smart_money_flow: number | null
          transaction_count: number | null
          whale_transactions: number | null
        }
        Insert: {
          active_addresses?: number | null
          exchange_inflow?: number | null
          exchange_outflow?: number | null
          gas_used?: number | null
          holder_concentration?: number | null
          holder_count?: number | null
          id?: string
          instrument: string
          network: string
          recorded_at?: string
          smart_money_flow?: number | null
          transaction_count?: number | null
          whale_transactions?: number | null
        }
        Update: {
          active_addresses?: number | null
          exchange_inflow?: number | null
          exchange_outflow?: number | null
          gas_used?: number | null
          holder_concentration?: number | null
          holder_count?: number | null
          id?: string
          instrument?: string
          network?: string
          recorded_at?: string
          smart_money_flow?: number | null
          transaction_count?: number | null
          whale_transactions?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          book_id: string
          created_at: string
          filled_price: number | null
          filled_size: number
          id: string
          instrument: string
          latency_ms: number | null
          price: number | null
          side: Database["public"]["Enums"]["order_side"]
          size: number
          slippage: number | null
          status: Database["public"]["Enums"]["order_status"]
          strategy_id: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          book_id: string
          created_at?: string
          filled_price?: number | null
          filled_size?: number
          id?: string
          instrument: string
          latency_ms?: number | null
          price?: number | null
          side: Database["public"]["Enums"]["order_side"]
          size: number
          slippage?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          strategy_id?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          book_id?: string
          created_at?: string
          filled_price?: number | null
          filled_size?: number
          id?: string
          instrument?: string
          latency_ms?: number | null
          price?: number | null
          side?: Database["public"]["Enums"]["order_side"]
          size?: number
          slippage?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          strategy_id?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          endpoint: string | null
          error_message: string | null
          function_name: string
          id: string
          latency_ms: number
          metadata: Json | null
          recorded_at: string
          status_code: number | null
          success: boolean
        }
        Insert: {
          endpoint?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          latency_ms: number
          metadata?: Json | null
          recorded_at?: string
          status_code?: number | null
          success?: boolean
        }
        Update: {
          endpoint?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          latency_ms?: number
          metadata?: Json | null
          recorded_at?: string
          status_code?: number | null
          success?: boolean
        }
        Relationships: []
      }
      positions: {
        Row: {
          book_id: string
          created_at: string
          entry_price: number
          id: string
          instrument: string
          is_open: boolean
          leverage: number
          liquidation_price: number | null
          mark_price: number
          realized_pnl: number
          side: Database["public"]["Enums"]["order_side"]
          size: number
          strategy_id: string | null
          unrealized_pnl: number
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          book_id: string
          created_at?: string
          entry_price: number
          id?: string
          instrument: string
          is_open?: boolean
          leverage?: number
          liquidation_price?: number | null
          mark_price: number
          realized_pnl?: number
          side: Database["public"]["Enums"]["order_side"]
          size: number
          strategy_id?: string | null
          unrealized_pnl?: number
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          book_id?: string
          created_at?: string
          entry_price?: number
          id?: string
          instrument?: string
          is_open?: boolean
          leverage?: number
          liquidation_price?: number | null
          mark_price?: number
          realized_pnl?: number
          side?: Database["public"]["Enums"]["order_side"]
          size?: number
          strategy_id?: string | null
          unrealized_pnl?: number
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_breaches: {
        Row: {
          book_id: string
          breach_type: string
          created_at: string
          current_value: number
          description: string
          id: string
          is_resolved: boolean
          limit_value: number
          recommended_action: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          book_id: string
          breach_type: string
          created_at?: string
          current_value: number
          description: string
          id?: string
          is_resolved?: boolean
          limit_value: number
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          book_id?: string
          breach_type?: string
          created_at?: string
          current_value?: number
          description?: string
          id?: string
          is_resolved?: boolean
          limit_value?: number
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "risk_breaches_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_limits: {
        Row: {
          book_id: string
          created_at: string
          id: string
          max_concentration: number
          max_correlation_exposure: number
          max_daily_loss: number
          max_intraday_drawdown: number
          max_leverage: number
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          max_concentration: number
          max_correlation_exposure?: number
          max_daily_loss: number
          max_intraday_drawdown: number
          max_leverage: number
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          max_concentration?: number
          max_correlation_exposure?: number
          max_daily_loss?: number
          max_intraday_drawdown?: number
          max_leverage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_limits_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      social_sentiment: {
        Row: {
          id: string
          influential_posts: Json | null
          instrument: string
          mention_count: number | null
          negative_count: number | null
          neutral_count: number | null
          platform: string
          positive_count: number | null
          recorded_at: string
          sentiment_score: number | null
          velocity: number | null
        }
        Insert: {
          id?: string
          influential_posts?: Json | null
          instrument: string
          mention_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          platform: string
          positive_count?: number | null
          recorded_at?: string
          sentiment_score?: number | null
          velocity?: number | null
        }
        Update: {
          id?: string
          influential_posts?: Json | null
          instrument?: string
          mention_count?: number | null
          negative_count?: number | null
          neutral_count?: number | null
          platform?: string
          positive_count?: number | null
          recorded_at?: string
          sentiment_score?: number | null
          velocity?: number | null
        }
        Relationships: []
      }
      strategies: {
        Row: {
          asset_class: string
          book_id: string
          config_metadata: Json
          consecutive_losses: number | null
          created_at: string
          execution_quality: number | null
          id: string
          intent_schema: Json
          last_signal_time: string | null
          lifecycle_changed_at: string | null
          lifecycle_reason: string | null
          lifecycle_state: string | null
          max_drawdown: number
          name: string
          pnl: number
          quarantine_count_30d: number | null
          quarantine_expires_at: string | null
          risk_tier: number
          status: Database["public"]["Enums"]["strategy_status"]
          timeframe: string
          updated_at: string
          venue_scope: string[]
        }
        Insert: {
          asset_class?: string
          book_id: string
          config_metadata?: Json
          consecutive_losses?: number | null
          created_at?: string
          execution_quality?: number | null
          id?: string
          intent_schema?: Json
          last_signal_time?: string | null
          lifecycle_changed_at?: string | null
          lifecycle_reason?: string | null
          lifecycle_state?: string | null
          max_drawdown?: number
          name: string
          pnl?: number
          quarantine_count_30d?: number | null
          quarantine_expires_at?: string | null
          risk_tier?: number
          status?: Database["public"]["Enums"]["strategy_status"]
          timeframe: string
          updated_at?: string
          venue_scope?: string[]
        }
        Update: {
          asset_class?: string
          book_id?: string
          config_metadata?: Json
          consecutive_losses?: number | null
          created_at?: string
          execution_quality?: number | null
          id?: string
          intent_schema?: Json
          last_signal_time?: string | null
          lifecycle_changed_at?: string | null
          lifecycle_reason?: string | null
          lifecycle_state?: string | null
          max_drawdown?: number
          name?: string
          pnl?: number
          quarantine_count_30d?: number | null
          quarantine_expires_at?: string | null
          risk_tier?: number
          status?: Database["public"]["Enums"]["strategy_status"]
          timeframe?: string
          updated_at?: string
          venue_scope?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "strategies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_lifecycle_events: {
        Row: {
          created_at: string
          from_state: string
          id: string
          metadata: Json | null
          reason: string
          strategy_id: string
          to_state: string
          triggered_by: string
        }
        Insert: {
          created_at?: string
          from_state: string
          id?: string
          metadata?: Json | null
          reason: string
          strategy_id: string
          to_state: string
          triggered_by: string
        }
        Update: {
          created_at?: string
          from_state?: string
          id?: string
          metadata?: Json | null
          reason?: string
          strategy_id?: string
          to_state?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_lifecycle_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_signals: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["order_side"]
          id: string
          instrument: string
          metadata: Json
          signal_type: string
          strategy_id: string
          strength: number
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["order_side"]
          id?: string
          instrument: string
          metadata?: Json
          signal_type: string
          strategy_id: string
          strength: number
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["order_side"]
          id?: string
          instrument?: string
          metadata?: Json
          signal_type?: string
          strategy_id?: string
          strength?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health: {
        Row: {
          component: string
          details: Json | null
          error_message: string | null
          id: string
          last_check_at: string
          status: string
        }
        Insert: {
          component: string
          details?: Json | null
          error_message?: string | null
          id?: string
          last_check_at?: string
          status: string
        }
        Update: {
          component?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          last_check_at?: string
          status?: string
        }
        Relationships: []
      }
      trade_intents: {
        Row: {
          book_id: string
          confidence: number
          created_at: string
          direction: Database["public"]["Enums"]["order_side"]
          horizon_minutes: number
          id: string
          instrument: string
          invalidation_price: number | null
          liquidity_requirement: string
          max_loss_usd: number
          metadata: Json
          processed_at: string | null
          risk_decision: Json | null
          status: string
          strategy_id: string
          target_exposure_usd: number
        }
        Insert: {
          book_id: string
          confidence: number
          created_at?: string
          direction: Database["public"]["Enums"]["order_side"]
          horizon_minutes?: number
          id?: string
          instrument: string
          invalidation_price?: number | null
          liquidity_requirement?: string
          max_loss_usd: number
          metadata?: Json
          processed_at?: string | null
          risk_decision?: Json | null
          status?: string
          strategy_id: string
          target_exposure_usd: number
        }
        Update: {
          book_id?: string
          confidence?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["order_side"]
          horizon_minutes?: number
          id?: string
          instrument?: string
          invalidation_price?: number | null
          liquidity_requirement?: string
          max_loss_usd?: number
          metadata?: Json
          processed_at?: string | null
          risk_decision?: Json | null
          status?: string
          strategy_id?: string
          target_exposure_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "trade_intents_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_intents_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      tradeable_instruments: {
        Row: {
          base_asset: string
          created_at: string
          id: string
          is_active: boolean
          is_us_compliant: boolean
          last_verified_at: string | null
          maker_fee: number | null
          min_order_size: number | null
          product_type: string
          quote_asset: string
          symbol: string
          taker_fee: number | null
          tick_size: number | null
          tier: number
          updated_at: string
          venue: string
          volume_24h: number | null
        }
        Insert: {
          base_asset: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_us_compliant?: boolean
          last_verified_at?: string | null
          maker_fee?: number | null
          min_order_size?: number | null
          product_type?: string
          quote_asset?: string
          symbol: string
          taker_fee?: number | null
          tick_size?: number | null
          tier?: number
          updated_at?: string
          venue: string
          volume_24h?: number | null
        }
        Update: {
          base_asset?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_us_compliant?: boolean
          last_verified_at?: string | null
          maker_fee?: number | null
          min_order_size?: number | null
          product_type?: string
          quote_asset?: string
          symbol?: string
          taker_fee?: number | null
          tick_size?: number | null
          tier?: number
          updated_at?: string
          venue?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_health: {
        Row: {
          error_rate: number
          id: string
          last_error: string | null
          last_order_time: string | null
          latency_ms: number
          metadata: Json
          order_success_rate: number
          recorded_at: string
          status: string
          venue_id: string
        }
        Insert: {
          error_rate?: number
          id?: string
          last_error?: string | null
          last_order_time?: string | null
          latency_ms?: number
          metadata?: Json
          order_success_rate?: number
          recorded_at?: string
          status?: string
          venue_id: string
        }
        Update: {
          error_rate?: number
          id?: string
          last_error?: string | null
          last_order_time?: string | null
          latency_ms?: number
          metadata?: Json
          order_success_rate?: number
          recorded_at?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          error_rate: number
          fee_tier: string
          id: string
          is_enabled: boolean
          last_heartbeat: string
          latency_ms: number
          max_order_size: number | null
          name: string
          restricted_order_types: string[]
          status: Database["public"]["Enums"]["venue_status"]
          supported_instruments: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_rate?: number
          fee_tier?: string
          id?: string
          is_enabled?: boolean
          last_heartbeat?: string
          latency_ms?: number
          max_order_size?: number | null
          name: string
          restricted_order_types?: string[]
          status?: Database["public"]["Enums"]["venue_status"]
          supported_instruments?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_rate?: number
          fee_tier?: string
          id?: string
          is_enabled?: boolean
          last_heartbeat?: string
          latency_ms?: number
          max_order_size?: number | null
          name?: string
          restricted_order_types?: string[]
          status?: Database["public"]["Enums"]["venue_status"]
          supported_instruments?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          address: string
          balance: number
          created_at: string
          currency: string
          id: string
          is_watch_only: boolean
          last_synced_at: string | null
          metadata: Json
          name: string
          network: string
          pending_approvals: number
          required_signers: number
          signers: number
          type: string
          updated_at: string
          usd_value: number
        }
        Insert: {
          address: string
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_watch_only?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name: string
          network: string
          pending_approvals?: number
          required_signers?: number
          signers?: number
          type?: string
          updated_at?: string
          usd_value?: number
        }
        Update: {
          address?: string
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_watch_only?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name?: string
          network?: string
          pending_approvals?: number
          required_signers?: number
          signers?: number
          type?: string
          updated_at?: string
          usd_value?: number
        }
        Relationships: []
      }
      whale_transactions: {
        Row: {
          amount: number
          block_number: number | null
          created_at: string
          direction: string
          from_address: string
          gas_price: number | null
          id: string
          instrument: string
          network: string
          to_address: string
          tx_hash: string
          usd_value: number | null
          wallet_id: string | null
        }
        Insert: {
          amount: number
          block_number?: number | null
          created_at?: string
          direction: string
          from_address: string
          gas_price?: number | null
          id?: string
          instrument: string
          network: string
          to_address: string
          tx_hash: string
          usd_value?: number | null
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          block_number?: number | null
          created_at?: string
          direction?: string
          from_address?: string
          gas_price?: number | null
          id?: string
          instrument?: string
          network?: string
          to_address?: string
          tx_hash?: string
          usd_value?: number | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whale_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "whale_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_wallets: {
        Row: {
          address: string
          balance: number | null
          category: string | null
          created_at: string
          id: string
          is_tracked: boolean | null
          label: string | null
          last_activity_at: string | null
          network: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address: string
          balance?: number | null
          category?: string | null
          created_at?: string
          id?: string
          is_tracked?: boolean | null
          label?: string | null
          last_activity_at?: string | null
          network: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          balance?: number | null
          category?: string | null
          created_at?: string
          id?: string
          is_tracked?: boolean | null
          label?: string | null
          last_activity_at?: string | null
          network?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_metrics: { Args: never; Returns: undefined }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role:
        | "admin"
        | "cio"
        | "trader"
        | "research"
        | "ops"
        | "auditor"
        | "viewer"
      book_status: "active" | "frozen" | "halted" | "reduce_only"
      book_type: "HEDGE" | "PROP" | "MEME"
      meme_project_stage:
        | "opportunity"
        | "build"
        | "launch"
        | "post_launch"
        | "completed"
      order_side: "buy" | "sell"
      order_status: "open" | "filled" | "rejected" | "cancelled"
      strategy_status: "off" | "paper" | "live"
      venue_status: "healthy" | "degraded" | "offline"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["info", "warning", "critical"],
      app_role: [
        "admin",
        "cio",
        "trader",
        "research",
        "ops",
        "auditor",
        "viewer",
      ],
      book_status: ["active", "frozen", "halted", "reduce_only"],
      book_type: ["HEDGE", "PROP", "MEME"],
      meme_project_stage: [
        "opportunity",
        "build",
        "launch",
        "post_launch",
        "completed",
      ],
      order_side: ["buy", "sell"],
      order_status: ["open", "filled", "rejected", "cancelled"],
      strategy_status: ["off", "paper", "live"],
      venue_status: ["healthy", "degraded", "offline"],
    },
  },
} as const
