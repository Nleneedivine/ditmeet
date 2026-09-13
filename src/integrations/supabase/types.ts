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
      meeting_agenda_items: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          meeting_id: string
          notes: string | null
          position: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          notes?: string | null
          position?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          position?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          email: string
          full_name: string
          hand_raised_at: string | null
          id: string
          is_admin: boolean
          joined_at: string
          left_at: string | null
          meeting_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          email: string
          full_name: string
          hand_raised_at?: string | null
          id?: string
          is_admin?: boolean
          joined_at?: string
          left_at?: string | null
          meeting_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          email?: string
          full_name?: string
          hand_raised_at?: string | null
          id?: string
          is_admin?: boolean
          joined_at?: string
          left_at?: string | null
          meeting_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_commitment_reactions: {
        Row: {
          attendee_id: string
          commitment_id: string
          created_at: string
          id: string
          kind: string
          note: string | null
          reactor_name: string
        }
        Insert: {
          attendee_id: string
          commitment_id: string
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          reactor_name: string
        }
        Update: {
          attendee_id?: string
          commitment_id?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          reactor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_commitment_reactions_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "meeting_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_commitment_reactions_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "meeting_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_commitments: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          meeting_id: string
          source: string
          speaker_attendee_id: string | null
          speaker_name: string
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          meeting_id: string
          source?: string
          speaker_attendee_id?: string | null
          speaker_name: string
          status?: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          meeting_id?: string
          source?: string
          speaker_attendee_id?: string | null
          speaker_name?: string
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_commitments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_commitments_speaker_attendee_id_fkey"
            columns: ["speaker_attendee_id"]
            isOneToOne: false
            referencedRelation: "meeting_attendees"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_highlights: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meeting_id: string
          note: string
          range_end: number | null
          range_start: number | null
          section: string | null
          summary_id: string | null
          transcript_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id: string
          note: string
          range_end?: number | null
          range_start?: number | null
          section?: string | null
          summary_id?: string | null
          transcript_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id?: string
          note?: string
          range_end?: number | null
          range_start?: number | null
          section?: string | null
          summary_id?: string | null
          transcript_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_highlights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_highlights_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "meeting_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_highlights_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "meeting_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_links: {
        Row: {
          added_by_name: string
          created_at: string
          id: string
          meeting_id: string
          title: string
          url: string
        }
        Insert: {
          added_by_name?: string
          created_at?: string
          id?: string
          meeting_id: string
          title: string
          url: string
        }
        Update: {
          added_by_name?: string
          created_at?: string
          id?: string
          meeting_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_links_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          meeting_id: string
          sender_name: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          meeting_id: string
          sender_name: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          meeting_id?: string
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_note_versions: {
        Row: {
          author_name: string | null
          content_html: string
          created_at: string
          id: string
          label: string | null
          meeting_id: string
          note_id: string
        }
        Insert: {
          author_name?: string | null
          content_html?: string
          created_at?: string
          id?: string
          label?: string | null
          meeting_id: string
          note_id: string
        }
        Update: {
          author_name?: string | null
          content_html?: string
          created_at?: string
          id?: string
          label?: string | null
          meeting_id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_note_versions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_note_versions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          allowed_editors: Json
          content_html: string
          content_text: string
          created_at: string
          edit_mode: string
          id: string
          meeting_id: string
          updated_at: string
          updated_by_name: string | null
        }
        Insert: {
          allowed_editors?: Json
          content_html?: string
          content_text?: string
          created_at?: string
          edit_mode?: string
          id?: string
          meeting_id: string
          updated_at?: string
          updated_by_name?: string | null
        }
        Update: {
          allowed_editors?: Json
          content_html?: string
          content_text?: string
          created_at?: string
          edit_mode?: string
          id?: string
          meeting_id?: string
          updated_at?: string
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_poll_votes: {
        Row: {
          attendee_id: string
          created_at: string
          id: string
          option_index: number
          poll_id: string
          voter_name: string
        }
        Insert: {
          attendee_id: string
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          voter_name: string
        }
        Update: {
          attendee_id?: string
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          voter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_poll_votes_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "meeting_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "meeting_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_polls: {
        Row: {
          anonymous: boolean
          closed_at: string | null
          created_at: string
          created_by: string | null
          creator_name: string
          expires_at: string | null
          id: string
          meeting_id: string
          options: Json
          question: string
          updated_at: string
        }
        Insert: {
          anonymous?: boolean
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          creator_name: string
          expires_at?: string | null
          id?: string
          meeting_id: string
          options: Json
          question: string
          updated_at?: string
        }
        Update: {
          anonymous?: boolean
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          creator_name?: string
          expires_at?: string | null
          id?: string
          meeting_id?: string
          options?: Json
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_polls_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_speaker_timers: {
        Row: {
          attendee_id: string
          created_by: string
          id: string
          meeting_id: string
          seconds: number
          started_at: string
        }
        Insert: {
          attendee_id: string
          created_by: string
          id?: string
          meeting_id: string
          seconds: number
          started_at?: string
        }
        Update: {
          attendee_id?: string
          created_by?: string
          id?: string
          meeting_id?: string
          seconds?: number
          started_at?: string
        }
        Relationships: []
      }
      meeting_summaries: {
        Row: {
          approved_at: string | null
          content: Json
          created_at: string
          host_notes: Json
          id: string
          meeting_id: string
          reminder_sent_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["summary_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          content?: Json
          created_at?: string
          host_notes?: Json
          id?: string
          meeting_id: string
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["summary_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          content?: Json
          created_at?: string
          host_notes?: Json
          id?: string
          meeting_id?: string
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["summary_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_transcripts: {
        Row: {
          attendee_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          is_interim: boolean
          meeting_id: string
          speaker_name: string
          speaker_user_id: string | null
          started_at: string
          text: string
          typo_flags: Json | null
        }
        Insert: {
          attendee_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_interim?: boolean
          meeting_id: string
          speaker_name: string
          speaker_user_id?: string | null
          started_at?: string
          text: string
          typo_flags?: Json | null
        }
        Update: {
          attendee_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_interim?: boolean
          meeting_id?: string
          speaker_name?: string
          speaker_user_id?: string | null
          started_at?: string
          text?: string
          typo_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcripts_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "meeting_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          recording_started_at: string | null
          room_name: string
          room_url: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
          waiting_room_enabled: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          recording_started_at?: string | null
          room_name: string
          room_url: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          recording_started_at?: string | null
          room_name?: string
          room_url?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
      summary_status: "pending_review" | "approved" | "sent"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "admin", "user"],
      summary_status: ["pending_review", "approved", "sent"],
    },
  },
} as const
