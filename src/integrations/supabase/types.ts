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
      constitution_rules: {
        Row: {
          behavior_contract: string
          created_at: string
          cycle_number: number
          effect_size: number
          id: string
          is_active: boolean
          is_core: boolean
          retired_at: string | null
          retired_reason: string | null
          rule_code: string
          source_citations: Json
          test_cases: Json
          trigger_description: string
          updated_at: string
          validation_score: number
        }
        Insert: {
          behavior_contract: string
          created_at?: string
          cycle_number?: number
          effect_size?: number
          id?: string
          is_active?: boolean
          is_core?: boolean
          retired_at?: string | null
          retired_reason?: string | null
          rule_code: string
          source_citations?: Json
          test_cases?: Json
          trigger_description: string
          updated_at?: string
          validation_score?: number
        }
        Update: {
          behavior_contract?: string
          created_at?: string
          cycle_number?: number
          effect_size?: number
          id?: string
          is_active?: boolean
          is_core?: boolean
          retired_at?: string | null
          retired_reason?: string | null
          rule_code?: string
          source_citations?: Json
          test_cases?: Json
          trigger_description?: string
          updated_at?: string
          validation_score?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      distillation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          cycles_completed: number
          error: string | null
          fragments_extracted: number
          id: string
          protocol_log: Json
          rules_proposed: number
          rules_rejected: number
          rules_validated: number
          scope: string
          scope_ref: string | null
          status: string
          termination_reason: string | null
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cycles_completed?: number
          error?: string | null
          fragments_extracted?: number
          id?: string
          protocol_log?: Json
          rules_proposed?: number
          rules_rejected?: number
          rules_validated?: number
          scope?: string
          scope_ref?: string | null
          status?: string
          termination_reason?: string | null
          trigger_type?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cycles_completed?: number
          error?: string | null
          fragments_extracted?: number
          id?: string
          protocol_log?: Json
          rules_proposed?: number
          rules_rejected?: number
          rules_validated?: number
          scope?: string
          scope_ref?: string | null
          status?: string
          termination_reason?: string | null
          trigger_type?: string
        }
        Relationships: []
      }
      executions: {
        Row: {
          code: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          field_impact: Json | null
          id: string
          intent: string | null
          invariant_results: Json
          invariant_status: string
          language: string
          output: string | null
          postconditions: Json
          preconditions: Json
          safety_score: number
          script_id: string
          status: string
        }
        Insert: {
          code: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          field_impact?: Json | null
          id?: string
          intent?: string | null
          invariant_results?: Json
          invariant_status?: string
          language?: string
          output?: string | null
          postconditions?: Json
          preconditions?: Json
          safety_score?: number
          script_id?: string
          status?: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          field_impact?: Json | null
          id?: string
          intent?: string | null
          invariant_results?: Json
          invariant_status?: string
          language?: string
          output?: string | null
          postconditions?: Json
          preconditions?: Json
          safety_score?: number
          script_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_corona: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          significance: number
          source_conversation_id: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          significance?: number
          source_conversation_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          significance?: number
          source_conversation_id?: string | null
        }
        Relationships: []
      }
      memory_eigenstates: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          significance: number
          source_conversation_id: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          significance?: number
          source_conversation_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          significance?: number
          source_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_eigenstates_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_friction: {
        Row: {
          category: string
          created_at: string
          description: string
          first_seen: string
          id: string
          last_seen: string
          occurrence_count: number
          resistance_strength: number
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          first_seen?: string
          id?: string
          last_seen?: string
          occurrence_count?: number
          resistance_strength?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          first_seen?: string
          id?: string
          last_seen?: string
          occurrence_count?: number
          resistance_strength?: number
        }
        Relationships: []
      }
      memory_limbus: {
        Row: {
          category: string
          created_at: string
          first_seen: string
          id: string
          key_terms: string[] | null
          last_seen: string
          mean_significance: number
          observation_count: number
          summary: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          first_seen?: string
          id?: string
          key_terms?: string[] | null
          last_seen?: string
          mean_significance?: number
          observation_count?: number
          summary: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          first_seen?: string
          id?: string
          key_terms?: string[] | null
          last_seen?: string
          mean_significance?: number
          observation_count?: number
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      memory_vortex: {
        Row: {
          created_at: string
          description: string
          id: string
          pattern_name: string
          related_categories: string[] | null
          stability: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          pattern_name: string
          related_categories?: string[] | null
          stability?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          pattern_name?: string
          related_categories?: string[] | null
          stability?: number
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          image_url: string | null
          role: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          role: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      raap_episodes: {
        Row: {
          action: string | null
          actual_outcome: string | null
          confidence: number | null
          created_at: string
          discrepancy: number | null
          expected_outcome: string | null
          id: string
          phase: string
          reflection: string | null
          run_id: string
          step_index: number
          sub_goal: string | null
        }
        Insert: {
          action?: string | null
          actual_outcome?: string | null
          confidence?: number | null
          created_at?: string
          discrepancy?: number | null
          expected_outcome?: string | null
          id?: string
          phase: string
          reflection?: string | null
          run_id: string
          step_index: number
          sub_goal?: string | null
        }
        Update: {
          action?: string | null
          actual_outcome?: string | null
          confidence?: number | null
          created_at?: string
          discrepancy?: number | null
          expected_outcome?: string | null
          id?: string
          phase?: string
          reflection?: string | null
          run_id?: string
          step_index?: number
          sub_goal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raap_episodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "raap_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      raap_heuristics: {
        Row: {
          created_at: string
          evidence_count: number
          id: string
          is_active: boolean
          pattern: string
          problem_class: string | null
          recommendation: string
          source_run_ids: string[] | null
          success_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_count?: number
          id?: string
          is_active?: boolean
          pattern: string
          problem_class?: string | null
          recommendation: string
          source_run_ids?: string[] | null
          success_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_count?: number
          id?: string
          is_active?: boolean
          pattern?: string
          problem_class?: string | null
          recommendation?: string
          source_run_ids?: string[] | null
          success_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      raap_runs: {
        Row: {
          backtracks: number
          branches_explored: number
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          depth: string
          duration_ms: number | null
          error: string | null
          final_answer: string | null
          goal: string
          id: string
          llm_calls: number
          plan_dag: Json
          status: string
          strategy: string | null
          trigger_reason: string | null
          trigger_type: string
        }
        Insert: {
          backtracks?: number
          branches_explored?: number
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          depth?: string
          duration_ms?: number | null
          error?: string | null
          final_answer?: string | null
          goal: string
          id?: string
          llm_calls?: number
          plan_dag?: Json
          status?: string
          strategy?: string | null
          trigger_reason?: string | null
          trigger_type?: string
        }
        Update: {
          backtracks?: number
          branches_explored?: number
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          depth?: string
          duration_ms?: number | null
          error?: string | null
          final_answer?: string | null
          goal?: string
          id?: string
          llm_calls?: number
          plan_dag?: Json
          status?: string
          strategy?: string | null
          trigger_reason?: string | null
          trigger_type?: string
        }
        Relationships: []
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
