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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          analyzed_at: string
          conversation_id: string | null
          conversion_likelihood: string | null
          created_at: string
          ended: boolean
          highlights: Json
          id: string
          improvements: Json
          operator_id: string | null
          quality_score: number | null
          raw_response: Json | null
          response_time_assessment: string | null
          sentiment: string | null
          status: string | null
          summary: string | null
          topics: Json
          updated_at: string
        }
        Insert: {
          analyzed_at?: string
          conversation_id?: string | null
          conversion_likelihood?: string | null
          created_at?: string
          ended?: boolean
          highlights?: Json
          id?: string
          improvements?: Json
          operator_id?: string | null
          quality_score?: number | null
          raw_response?: Json | null
          response_time_assessment?: string | null
          sentiment?: string | null
          status?: string | null
          summary?: string | null
          topics?: Json
          updated_at?: string
        }
        Update: {
          analyzed_at?: string
          conversation_id?: string | null
          conversion_likelihood?: string | null
          created_at?: string
          ended?: boolean
          highlights?: Json
          id?: string
          improvements?: Json
          operator_id?: string | null
          quality_score?: number | null
          raw_response?: Json | null
          response_time_assessment?: string | null
          sentiment?: string | null
          status?: string | null
          summary?: string | null
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analyses_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          avg_response_time_s: number | null
          converted: boolean
          created_at: string
          ended_at: string | null
          id: string
          instance_name: string
          lead_name: string | null
          lead_phone: string
          operator_id: string
          remote_jid: string
          score_sac: number | null
          started_at: string
          status: string
          total_messages: number
          updated_at: string
        }
        Insert: {
          avg_response_time_s?: number | null
          converted?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          instance_name: string
          lead_name?: string | null
          lead_phone: string
          operator_id: string
          remote_jid: string
          score_sac?: number | null
          started_at?: string
          status?: string
          total_messages?: number
          updated_at?: string
        }
        Update: {
          avg_response_time_s?: number | null
          converted?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          instance_name?: string
          lead_name?: string | null
          lead_phone?: string
          operator_id?: string
          remote_jid?: string
          score_sac?: number | null
          started_at?: string
          status?: string
          total_messages?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          from_role: string
          id: string
          lead_name: string | null
          lead_phone: string | null
          message_text: string | null
          message_type: string
          operator_id: string
          raw_payload: Json | null
          received_at: string
          response_time_s: number | null
          sent_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_role: string
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          message_text?: string | null
          message_type?: string
          operator_id: string
          raw_payload?: Json | null
          received_at?: string
          response_time_s?: number | null
          sent_at: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_role?: string
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          message_text?: string | null
          message_type?: string
          operator_id?: string
          raw_payload?: Json | null
          received_at?: string
          response_time_s?: number | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      n8n_historico_mensagens: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      operators: {
        Row: {
          channel: string
          created_at: string
          description: string | null
          id: string
          instance_name: string
          last_received_at: string | null
          messages_today: number
          name: string
          status: string
          token: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          instance_name: string
          last_received_at?: string | null
          messages_today?: number
          name: string
          status?: string
          token?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          instance_name?: string
          last_received_at?: string | null
          messages_today?: number
          name?: string
          status?: string
          token?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      secretaria: {
        Row: {
          created_at: string
          id: number
          id_mensagem: string | null
          mensagem: string | null
          telefone: number | null
          timestamp: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          id_mensagem?: string | null
          mensagem?: string | null
          telefone?: number | null
          timestamp?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          id_mensagem?: string | null
          mensagem?: string | null
          telefone?: number | null
          timestamp?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          error_message: string | null
          http_status: number | null
          id: string
          operator_id: string | null
          origin_ip: string | null
          payload_raw: Json | null
          processed: boolean
          received_at: string
        }
        Insert: {
          error_message?: string | null
          http_status?: number | null
          id?: string
          operator_id?: string | null
          origin_ip?: string | null
          payload_raw?: Json | null
          processed?: boolean
          received_at?: string
        }
        Update: {
          error_message?: string | null
          http_status?: number | null
          id?: string
          operator_id?: string | null
          origin_ip?: string | null
          payload_raw?: Json | null
          processed?: boolean
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
