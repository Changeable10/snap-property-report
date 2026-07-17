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
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      healthy_homes_assessments: {
        Row: {
          created_at: string
          draught_data: Json
          heating_data: Json
          id: string
          inspection_id: string
          insulation_data: Json
          moisture_data: Json
          overall_status: string
          property_id: string
          smoke_alarms_data: Json
          team_id: string | null
          updated_at: string
          user_id: string
          ventilation_data: Json
        }
        Insert: {
          created_at?: string
          draught_data?: Json
          heating_data?: Json
          id?: string
          inspection_id: string
          insulation_data?: Json
          moisture_data?: Json
          overall_status?: string
          property_id: string
          smoke_alarms_data?: Json
          team_id?: string | null
          updated_at?: string
          user_id: string
          ventilation_data?: Json
        }
        Update: {
          created_at?: string
          draught_data?: Json
          heating_data?: Json
          id?: string
          inspection_id?: string
          insulation_data?: Json
          moisture_data?: Json
          overall_status?: string
          property_id?: string
          smoke_alarms_data?: Json
          team_id?: string | null
          updated_at?: string
          user_id?: string
          ventilation_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "healthy_homes_assessments_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: true
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "healthy_homes_assessments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "healthy_homes_assessments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          maintenance_priority: Database["public"]["Enums"]["maintenance_priority"]
          maintenance_required: boolean
          maintenance_resolved: boolean
          maintenance_resolved_at: string | null
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
          maintenance_priority?: Database["public"]["Enums"]["maintenance_priority"]
          maintenance_required?: boolean
          maintenance_resolved?: boolean
          maintenance_resolved_at?: string | null
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
          maintenance_priority?: Database["public"]["Enums"]["maintenance_priority"]
          maintenance_required?: boolean
          maintenance_resolved?: boolean
          maintenance_resolved_at?: string | null
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
          team_id: string | null
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
          team_id?: string | null
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
          team_id?: string | null
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
          {
            foreignKeyName: "inspections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          captured_at: string
          enhanced_url: string | null
          featured: boolean
          id: string
          is_hero: boolean
          listing_id: string
          photo_url: string
          quality_reason: string | null
          quality_score: number | null
          room_id: string | null
          source: Database["public"]["Enums"]["listing_photo_source"]
          staged_url: string | null
          staging_style: string | null
          team_id: string | null
          user_id: string
        }
        Insert: {
          captured_at?: string
          enhanced_url?: string | null
          featured?: boolean
          id?: string
          is_hero?: boolean
          listing_id: string
          photo_url: string
          quality_reason?: string | null
          quality_score?: number | null
          room_id?: string | null
          source?: Database["public"]["Enums"]["listing_photo_source"]
          staged_url?: string | null
          staging_style?: string | null
          team_id?: string | null
          user_id: string
        }
        Update: {
          captured_at?: string
          enhanced_url?: string | null
          featured?: boolean
          id?: string
          is_hero?: boolean
          listing_id?: string
          photo_url?: string
          quality_reason?: string | null
          quality_score?: number | null
          room_id?: string | null
          source?: Database["public"]["Enums"]["listing_photo_source"]
          staged_url?: string | null
          staging_style?: string | null
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_rooms: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          notes: string | null
          room_id: string
          team_id: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          notes?: string | null
          room_id: string
          team_id?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          notes?: string | null
          room_id?: string
          team_id?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_rooms_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_rooms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          ai_generated_at: string | null
          asking_price: string | null
          bathrooms: number | null
          bedrooms: number | null
          created_at: string
          description: string | null
          features: string | null
          id: string
          key_features: string | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          property_id: string
          status: Database["public"]["Enums"]["listing_status"]
          target_portal: Database["public"]["Enums"]["listing_portal"]
          team_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_generated_at?: string | null
          asking_price?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          description?: string | null
          features?: string | null
          id?: string
          key_features?: string | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          property_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          target_portal: Database["public"]["Enums"]["listing_portal"]
          team_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_generated_at?: string | null
          asking_price?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          description?: string | null
          features?: string | null
          id?: string
          key_features?: string | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          property_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          target_portal?: Database["public"]["Enums"]["listing_portal"]
          team_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          team_id: string | null
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
          team_id?: string | null
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
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contacts: {
        Row: {
          company: string | null
          contact_name: string
          contact_role: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          property_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          contact_name: string
          contact_role: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          property_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          contact_name?: string
          contact_role?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          property_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
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
      signature_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          inspection_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          inspection_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          inspection_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_tokens_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_usage: {
        Row: {
          created_at: string
          id: string
          listing_photo_id: string
          style: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_photo_id: string
          style?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_photo_id?: string
          style?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_usage_listing_photo_id_fkey"
            columns: ["listing_photo_id"]
            isOneToOne: false
            referencedRelation: "listing_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_branding: {
        Row: {
          address: string | null
          brand_colour: string
          company_name: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          phone: string | null
          rex_account_email: string | null
          rex_api_token: string | null
          rex_connected: boolean
          team_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_colour?: string
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          rex_account_email?: string | null
          rex_api_token?: string | null
          rex_connected?: boolean
          team_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_colour?: string
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          rex_account_email?: string | null
          rex_api_token?: string | null
          rex_connected?: boolean
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_branding_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invite_tokens: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_email: string
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_email: string
          role: string
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invite_tokens_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string
          invited_email: string
          joined_at: string | null
          role: string
          status: string
          team_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string
          invited_email: string
          joined_at?: string | null
          role?: string
          status?: string
          team_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string
          invited_email?: string
          joined_at?: string | null
          role?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_team_invites: { Args: never; Returns: number }
      get_user_team_id: { Args: { _user_id: string }; Returns: string }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_team_role: {
        Args: { _roles: string[]; _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_owner: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
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
      inspection_type: "entry" | "routine" | "exit" | "healthy_homes"
      listing_photo_source: "photo" | "video_frame"
      listing_portal: "trademe" | "realestate" | "general" | "airbnb"
      listing_status: "draft" | "published"
      listing_type: "for_sale" | "for_rent" | "holiday" | "development"
      maintenance_priority: "low" | "medium" | "high"
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
      inspection_type: ["entry", "routine", "exit", "healthy_homes"],
      listing_photo_source: ["photo", "video_frame"],
      listing_portal: ["trademe", "realestate", "general", "airbnb"],
      listing_status: ["draft", "published"],
      listing_type: ["for_sale", "for_rent", "holiday", "development"],
      maintenance_priority: ["low", "medium", "high"],
    },
  },
} as const
