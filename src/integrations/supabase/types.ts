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
      comparison_results: {
        Row: {
          change_type: Database["public"]["Enums"]["comparison_change_type"]
          created_at: string
          current_condition:
            | Database["public"]["Enums"]["condition_type"]
            | null
          description: string | null
          id: string
          inspection_id: string
          item_name: string
          previous_condition:
            | Database["public"]["Enums"]["condition_type"]
            | null
          room_id: string
          severity: Database["public"]["Enums"]["comparison_severity"]
          status: Database["public"]["Enums"]["comparison_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          change_type: Database["public"]["Enums"]["comparison_change_type"]
          created_at?: string
          current_condition?:
            | Database["public"]["Enums"]["condition_type"]
            | null
          description?: string | null
          id?: string
          inspection_id: string
          item_name: string
          previous_condition?:
            | Database["public"]["Enums"]["condition_type"]
            | null
          room_id: string
          severity?: Database["public"]["Enums"]["comparison_severity"]
          status?: Database["public"]["Enums"]["comparison_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          change_type?: Database["public"]["Enums"]["comparison_change_type"]
          created_at?: string
          current_condition?:
            | Database["public"]["Enums"]["condition_type"]
            | null
          description?: string | null
          id?: string
          inspection_id?: string
          item_name?: string
          previous_condition?:
            | Database["public"]["Enums"]["condition_type"]
            | null
          room_id?: string
          severity?: Database["public"]["Enums"]["comparison_severity"]
          status?: Database["public"]["Enums"]["comparison_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparison_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparison_results_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          condition: Database["public"]["Enums"]["condition_type"]
          confidence: number | null
          created_at: string
          description: string | null
          id: string
          inspection_id: string
          item_name: string
          maintenance_notes: string | null
          maintenance_required: boolean
          room_id: string
          sort_order: number
          sources: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          condition?: Database["public"]["Enums"]["condition_type"]
          confidence?: number | null
          created_at?: string
          description?: string | null
          id?: string
          inspection_id: string
          item_name: string
          maintenance_notes?: string | null
          maintenance_required?: boolean
          room_id: string
          sort_order?: number
          sources?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: Database["public"]["Enums"]["condition_type"]
          confidence?: number | null
          created_at?: string
          description?: string | null
          id?: string
          inspection_id?: string
          item_name?: string
          maintenance_notes?: string | null
          maintenance_required?: boolean
          room_id?: string
          sort_order?: number
          sources?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_photos: {
        Row: {
          ai_classification: Json | null
          captured_at: string
          created_at: string
          id: string
          inspection_id: string
          inspection_item_id: string | null
          photo_url: string
          room_id: string
          user_id: string
          voice_transcript: string | null
        }
        Insert: {
          ai_classification?: Json | null
          captured_at?: string
          created_at?: string
          id?: string
          inspection_id: string
          inspection_item_id?: string | null
          photo_url: string
          room_id: string
          user_id: string
          voice_transcript?: string | null
        }
        Update: {
          ai_classification?: Json | null
          captured_at?: string
          created_at?: string
          id?: string
          inspection_id?: string
          inspection_item_id?: string | null
          photo_url?: string
          room_id?: string
          user_id?: string
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_photos_inspection_item_id_fkey"
            columns: ["inspection_item_id"]
            isOneToOne: false
            referencedRelation: "inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_photos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_signatures: {
        Row: {
          created_at: string
          id: string
          inspection_id: string
          ip_address: string | null
          signature_data: string
          signed_at: string
          signer_name: string
          signer_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          ip_address?: string | null
          signature_data: string
          signed_at?: string
          signer_name: string
          signer_role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          ip_address?: string | null
          signature_data?: string
          signed_at?: string
          signer_name?: string
          signer_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          inspection_date: string
          inspection_type: Database["public"]["Enums"]["inspection_type"]
          inspector_name: string
          notes: string | null
          property_id: string
          status: Database["public"]["Enums"]["inspection_status"]
          tenant_names: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inspection_date?: string
          inspection_type: Database["public"]["Enums"]["inspection_type"]
          inspector_name: string
          notes?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["inspection_status"]
          tenant_names?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inspection_date?: string
          inspection_type?: Database["public"]["Enums"]["inspection_type"]
          inspector_name?: string
          notes?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["inspection_status"]
          tenant_names?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          bathrooms: number
          bedrooms: number
          city: string
          created_at: string
          id: string
          postcode: string
          property_type: string
          suburb: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          bathrooms: number
          bedrooms: number
          city?: string
          created_at?: string
          id?: string
          postcode: string
          property_type: string
          suburb: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          bathrooms?: number
          bedrooms?: number
          city?: string
          created_at?: string
          id?: string
          postcode?: string
          property_type?: string
          suburb?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          name: string
          property_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          property_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          property_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
      comparison_change_type:
        | "new"
        | "removed"
        | "deterioration"
        | "improvement"
        | "new_damage"
        | "repair"
      comparison_severity: "minor" | "moderate" | "significant"
      comparison_status: "pending" | "confirmed" | "dismissed"
      condition_type: "good" | "fair" | "poor" | "damaged"
      inspection_status: "in_progress" | "completed" | "signed"
      inspection_type: "entry" | "routine" | "exit"
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
      comparison_change_type: [
        "new",
        "removed",
        "deterioration",
        "improvement",
        "new_damage",
        "repair",
      ],
      comparison_severity: ["minor", "moderate", "significant"],
      comparison_status: ["pending", "confirmed", "dismissed"],
      condition_type: ["good", "fair", "poor", "damaged"],
      inspection_status: ["in_progress", "completed", "signed"],
      inspection_type: ["entry", "routine", "exit"],
    },
  },
} as const
