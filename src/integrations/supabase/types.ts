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
      strategies: {
        Row: {
          asset_class: string
          book_id: string
          config_metadata: Json
          created_at: string
          id: string
          intent_schema: Json
          last_signal_time: string | null
          max_drawdown: number
          name: string
          pnl: number
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
          created_at?: string
          id?: string
          intent_schema?: Json
          last_signal_time?: string | null
          max_drawdown?: number
          name: string
          pnl?: number
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
          created_at?: string
          id?: string
          intent_schema?: Json
          last_signal_time?: string | null
          max_drawdown?: number
          name?: string
          pnl?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      book_status: "active" | "frozen"
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
      book_status: ["active", "frozen"],
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
