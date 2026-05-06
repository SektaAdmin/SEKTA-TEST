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
      classes: {
        Row: {
          capacity: number | null
          created_at: string
          duration_min: number
          hall_id: string | null
          id: string
          is_cancelled: boolean
          notes: string | null
          starts_at: string
          ticket_type: string
          title: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          duration_min?: number
          hall_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          starts_at: string
          ticket_type: string
          title?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          duration_min?: number
          hall_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
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
            foreignKeyName: "classes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
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
          instagram_username: string | null
          last_name: string | null
          phone: string | null
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          balance_updated_at?: string | null
          created_at?: string
          credit_limit?: number | null
          first_name?: string | null
          id?: string
          instagram_username?: string | null
          last_name?: string | null
          phone?: string | null
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          balance_updated_at?: string | null
          created_at?: string
          credit_limit?: number | null
          first_name?: string | null
          id?: string
          instagram_username?: string | null
          last_name?: string | null
          phone?: string | null
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          client_id: string
          created_at: string
          id: string
          notes: string | null
          sale_id: string | null
          sessions_used: number
          status: string
          updated_at: string
        }
        Insert: {
          class_id: string
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          sale_id?: string | null
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          client_id?: string
          created_at?: string
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
      trainers: {
        Row: {
          created_at: string
          id: string
          instagram_username: string | null
          is_active: boolean
          name: string
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_username?: string | null
          is_active?: boolean
          name: string
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instagram_username?: string | null
          is_active?: boolean
          name?: string
          telegram_username?: string | null
          updated_at?: string
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
          phone: string | null
        }
        Insert: {
          balance?: number | null
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          phone?: string | null
        }
        Update: {
          balance?: number | null
          balance_updated_at?: string | null
          credit_limit?: number | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          phone?: string | null
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
      auto_close_classes: { Args: never; Returns: undefined }
      create_sale: {
        Args: {
          p_amount_given?: number
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
      delete_sale: {
        Args: { p_sale_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      mark_attendance: {
        Args: { p_enrollment_id: string; p_sessions_used?: number }
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
          p_description?: string
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
          p_amount_given: number
          p_client_id: string
          p_created_at?: string
          p_notes: string
          p_payment_method: string
          p_price_paid: number
          p_sale_id: string
          p_sessions: number
          p_ticket_id: string
          p_ticket_name: string
          p_ticket_price: number
          p_ticket_type: string
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
