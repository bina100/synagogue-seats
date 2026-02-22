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
      absences: {
        Row: {
          created_at: string
          id: string
          marked_by: string | null
          profile_id: string
          shabbat_date: string
          synagogue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_by?: string | null
          profile_id: string
          shabbat_date: string
          synagogue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_by?: string | null
          profile_id?: string
          shabbat_date?: string
          synagogue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_synagogue_id_fkey"
            columns: ["synagogue_id"]
            isOneToOne: false
            referencedRelation: "synagogues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_id: string
          created_at: string
          full_name: string
          id: string
          requires_password_change: boolean
          username: string
        }
        Insert: {
          auth_id: string
          created_at?: string
          full_name: string
          id?: string
          requires_password_change?: boolean
          username: string
        }
        Update: {
          auth_id?: string
          created_at?: string
          full_name?: string
          id?: string
          requires_password_change?: boolean
          username?: string
        }
        Relationships: []
      }
      seat_rows: {
        Row: {
          created_at: string
          id: string
          row_number: number
          seats_count: number
          section_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          row_number: number
          seats_count?: number
          section_id: string
        }
        Update: {
          created_at?: string
          id?: string
          row_number?: number
          seats_count?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          assigned_to: string | null
          created_at: string
          element_type: string | null
          id: string
          row_id: string
          seat_number: number
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          element_type?: string | null
          id?: string
          row_id: string
          seat_number: number
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          element_type?: string | null
          id?: string
          row_id?: string
          seat_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "seats_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "seat_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          synagogue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          synagogue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          synagogue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_synagogue_id_fkey"
            columns: ["synagogue_id"]
            isOneToOne: false
            referencedRelation: "synagogues"
            referencedColumns: ["id"]
          },
        ]
      }
      synagogue_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          synagogue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          synagogue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          synagogue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "synagogue_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synagogue_members_synagogue_id_fkey"
            columns: ["synagogue_id"]
            isOneToOne: false
            referencedRelation: "synagogues"
            referencedColumns: ["id"]
          },
        ]
      }
      synagogues: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "synagogues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          synagogue_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          synagogue_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          synagogue_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_synagogue_id_fkey"
            columns: ["synagogue_id"]
            isOneToOne: false
            referencedRelation: "synagogues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_synagogue: {
        Args: { _auth_id: string; _synagogue_id: string }
        Returns: boolean
      }
      get_profile_id: { Args: { _auth_id: string }; Returns: string }
      has_role: {
        Args: {
          _auth_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_gabbai_of: {
        Args: { _auth_id: string; _synagogue_id: string }
        Returns: boolean
      }
      is_member_of: {
        Args: { _auth_id: string; _synagogue_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "gabbai" | "member"
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
      app_role: ["super_admin", "gabbai", "member"],
    },
  },
} as const
