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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      balance_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          client_id: string
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          reason: string | null
          related_sale_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          client_id: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          reason?: string | null
          related_sale_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          client_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          reason?: string | null
          related_sale_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_related_sale_id_fkey"
            columns: ["related_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      class_series: {
        Row: {
          capacity: number | null
          created_at: string
          day_of_week: number
          duration_min: number
          hall_id: string | null
          id: string
          notes: string | null
          ticket_type: string
          time_of_day: string
          title: string | null
          trainer_id: string | null
          type: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          day_of_week: number
          duration_min?: number
          hall_id?: string | null
          id?: string
          notes?: string | null
          ticket_type: string
          time_of_day: string
          title?: string | null
          trainer_id?: string | null
          type?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          day_of_week?: number
          duration_min?: number
          hall_id?: string | null
          id?: string
          notes?: string | null
          ticket_type?: string
          time_of_day?: string
          title?: string | null
          trainer_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_series_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_series_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number | null
          choreo_stage: string | null
          created_at: string
          duration_min: number
          hall_id: string | null
          id: string
          is_cancelled: boolean
          notes: string | null
          series_id: string | null
          starts_at: string
          ticket_type: string
          title: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          choreo_stage?: string | null
          created_at?: string
          duration_min?: number
          hall_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          series_id?: string | null
          starts_at: string
          ticket_type: string
          title?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          choreo_stage?: string | null
          created_at?: string
          duration_min?: number
          hall_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          series_id?: string | null
          starts_at?: string
          ticket_type?: string
          title?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "class_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          instagram_username: string | null
          phone: string | null
          telegram_username: string | null
        }
        Insert: {
          client_id: string
          instagram_username?: string | null
          phone?: string | null
          telegram_username?: string | null
        }
        Update: {
          client_id?: string
          instagram_username?: string | null
          phone?: string | null
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      client_session_balances: {
        Row: {
          client_id: string
          sessions_balance: number
          ticket_type: string
        }
        Insert: {
          client_id: string
          sessions_balance?: number
          ticket_type: string
        }
        Update: {
          client_id?: string
          sessions_balance?: number
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_session_balances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_session_balances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_session_balances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_session_balances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          balance: number
          balance_updated_at: string | null
          created_at: string
          credit_limit: number | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          balance_updated_at?: string | null
          created_at?: string
          credit_limit?: number | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          balance_updated_at?: string | null
          created_at?: string
          credit_limit?: number | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          cancelled_from_status: string | null
          class_id: string
          client_id: string
          created_at: string
          hours_attended: number[] | null
          id: string
          notes: string | null
          sale_id: string | null
          sessions_used: number
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_from_status?: string | null
          class_id: string
          client_id: string
          created_at?: string
          hours_attended?: number[] | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_from_status?: string | null
          class_id?: string
          client_id?: string
          created_at?: string
          hours_attended?: number[] | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      halls: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          capacity: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount_given: number
          cash_holder: string | null
          client_id: string
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          price_paid: number
          sessions: number | null
          ticket_id: string | null
          ticket_name: string | null
          ticket_price: number | null
          ticket_type: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_given: number
          cash_holder?: string | null
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method: string
          price_paid: number
          sessions?: number | null
          ticket_id?: string | null
          ticket_name?: string | null
          ticket_price?: number | null
          ticket_type?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_given?: number
          cash_holder?: string | null
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          price_paid?: number
          sessions?: number | null
          ticket_id?: string | null
          ticket_name?: string | null
          ticket_price?: number | null
          ticket_type?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_holder_fkey"
            columns: ["cash_holder"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      series_clients: {
        Row: {
          client_id: string
          created_at: string
          hours_attended: number[] | null
          id: string
          series_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          hours_attended?: number[] | null
          id?: string
          series_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          hours_attended?: number[] | null
          id?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_negative_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_clients_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "class_series"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_expenses: {
        Row: {
          amount: number
          cash_holder: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          payment_method: string
          trainer_id: string | null
        }
        Insert: {
          amount: number
          cash_holder?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          payment_method: string
          trainer_id?: string | null
        }
        Update: {
          amount?: number
          cash_holder?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          payment_method?: string
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_expenses_cash_holder_fkey"
            columns: ["cash_holder"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_expenses_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          sessions: number
          ticket_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sessions: number
          ticket_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sessions?: number
          ticket_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainer_payments: {
        Row: {
          calculated_amount: number
          cash_holder: string | null
          created_at: string
          id: string
          notes: string | null
          paid_amount: number
          payment_date: string
          payment_method: string
          payment_type: string
          period_end: string
          period_start: string
          trainer_id: string
        }
        Insert: {
          calculated_amount?: number
          cash_holder?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_date?: string
          payment_method?: string
          payment_type?: string
          period_end: string
          period_start: string
          trainer_id: string
        }
        Update: {
          calculated_amount?: number
          cash_holder?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_date?: string
          payment_method?: string
          payment_type?: string
          period_end?: string
          period_start?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_payments_cash_holder_fkey"
            columns: ["cash_holder"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_payments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_rates: {
        Row: {
          created_at: string
          hall_id: string | null
          id: string
          studio_rate: number
          ticket_type: string
          trainer_id: string | null
          trainer_rate: number
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          hall_id?: string | null
          id?: string
          studio_rate?: number
          ticket_type: string
          trainer_id?: string | null
          trainer_rate: number
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          hall_id?: string | null
          id?: string
          studio_rate?: number
          ticket_type?: string
          trainer_id?: string | null
          trainer_rate?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_rates_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_rates_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          created_at: string
          id: string
          instagram_username: string | null
          is_active: boolean
          name: string
          telegram_username: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_username?: string | null
          is_active?: boolean
          name: string
          telegram_username?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instagram_username?: string | null
          is_active?: boolean
          name?: string
          telegram_username?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      training_types: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      clients_negative_balance: {
        Row: {
          balance: number | null
          balance_updated_at: string | null
          credit_limit: number | null
          first_name: string | null
          id: string | null
          last_name: string | null
        }
        Insert: {
          balance?: number | null
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Update: {
          balance?: number | null
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
      clients_with_contacts: {
        Row: {
          balance: number | null
          balance_updated_at: string | null
          created_at: string | null
          credit_limit: number | null
          first_name: string | null
          id: string | null
          instagram_username: string | null
          last_name: string | null
          phone: string | null
          telegram_username: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_client_balance_summary: {
        Row: {
          available_credit: number | null
          balance: number | null
          balance_status: string | null
          balance_updated_at: string | null
          credit_limit: number | null
          first_name: string | null
          id: string | null
          last_name: string | null
        }
        Insert: {
          available_credit?: never
          balance?: number | null
          balance_status?: never
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Update: {
          available_credit?: never
          balance?: number | null
          balance_status?: never
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      auto_close_classes: {
        Args: never
        Returns: {
          closed_count: number
        }[]
      }
      calc_trainer_salary: {
        Args: { p_end: string; p_start: string; p_trainer_id: string }
        Returns: {
          amount: number
          rate: number
          sessions_total: number
          ticket_type: string
        }[]
      }
      calc_trainer_salary_v2: {
        Args: { p_end: string; p_start: string; p_trainer_id: string }
        Returns: {
          class_id: string
          client_id: string
          client_name: string
          duration_min: number
          enrollment_status: string
          hall_name: string
          starts_at: string
          studio_amount: number
          ticket_type: string
          trainer_amount: number
        }[]
      }
      cancel_class_and_restore_sessions: {
        Args: { p_class_id: string }
        Returns: {
          error_message: string
          restored_count: number
          success: boolean
        }[]
      }
      cancellation_deadline: { Args: { p_starts_at: string }; Returns: string }
      change_enrollment_status: {
        Args: {
          p_enrollment_id: string
          p_force_no_charge?: boolean
          p_new_status: string
          p_sessions_used?: number
        }
        Returns: {
          charged: boolean
          error_message: string
          success: boolean
        }[]
      }
      check_class_conflicts: {
        Args: {
          p_duration_min: number
          p_exclude_id?: string
          p_hall_id?: string
          p_starts_at: string
          p_trainer_id?: string
        }
        Returns: {
          class_id: string
          conflict_type: string
          starts_at: string
          ticket_type: string
          title: string
        }[]
      }
      check_client_conflict: {
        Args: { p_class_id: string; p_client_id: string }
        Returns: {
          conflict_class_id: string
          starts_at: string
          ticket_type: string
        }[]
      }
      client_cancel: {
        Args: { p_enrollment_id: string }
        Returns: {
          charged: boolean
          error_message: string
          success: boolean
        }[]
      }
      client_enroll: {
        Args: { p_class_id: string }
        Returns: {
          enrollment_id: string
          error_message: string
          success: boolean
        }[]
      }
      create_sale: {
        Args: {
          p_amount_given?: number
          p_cash_holder?: string
          p_client_id: string
          p_created_at?: string
          p_notes?: string
          p_payment_method?: string
          p_price_paid?: number
          p_ticket_id?: string
          p_trainer_id?: string
        }
        Returns: {
          error_message: string
          sale_id: string
          success: boolean
        }[]
      }
      current_client_id: { Args: never; Returns: string }
      current_trainer_id: { Args: never; Returns: string }
      delete_sale: {
        Args: { p_sale_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      generate_week: {
        Args: { p_start_date: string; p_weeks?: number }
        Returns: {
          classes_created: number
          enrollments_created: number
        }[]
      }
      mark_attendance: {
        Args: { p_enrollment_id: string; p_sessions_used?: number }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      normalize_phone_ua: { Args: { p_phone: string }; Returns: string }
      restore_class: {
        Args: { p_class_id: string }
        Returns: {
          error_message: string
          restored_count: number
          success: boolean
        }[]
      }
      reverse_attendance: {
        Args: { p_enrollment_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_client_balance: {
        Args: {
          p_amount: number
          p_client_id: string
          p_description: string
          p_reason?: string
          p_related_sale_id?: string
          p_transaction_type: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
          transaction_id: string
        }[]
      }
      update_sale: {
        Args: {
          p_amount_given?: number
          p_cash_holder?: string
          p_client_id: string
          p_created_at?: string
          p_notes?: string
          p_payment_method?: string
          p_price_paid?: number
          p_sale_id: string
          p_sessions?: number
          p_ticket_id: string
          p_ticket_name?: string
          p_ticket_price?: number
          p_ticket_type?: string
          p_trainer_id: string
        }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
