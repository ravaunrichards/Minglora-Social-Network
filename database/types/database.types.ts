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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      album_photos: {
        Row: {
          added_at: string
          album_id: string
          asset_id: string
          caption: string
          sort_order: number
        }
        Insert: {
          added_at?: string
          album_id: string
          asset_id: string
          caption?: string
          sort_order?: number
        }
        Update: {
          added_at?: string
          album_id?: string
          asset_id?: string
          caption?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "photo_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          request_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_participants: {
        Row: {
          call_id: string
          invitation_status: string
          joined_at: string | null
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          invitation_status?: string
          joined_at?: string | null
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          invitation_status?: string
          joined_at?: string | null
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          kind: string
          room_ref: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          kind: string
          room_ref?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          kind?: string
          room_ref?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          audience: string
          created_at: string
          id: string
          place_name: string
          place_provider: string | null
          place_ref: string | null
          post_id: string | null
          user_id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          place_name: string
          place_provider?: string | null
          place_ref?: string | null
          post_id?: string | null
          user_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          place_name?: string
          place_provider?: string | null
          place_ref?: string | null
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          muted_until: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_rights_requests: {
        Row: {
          completed_at: string | null
          expires_at: string | null
          failure_code: string | null
          id: string
          request_type: string
          requested_at: string
          result_storage_key: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          expires_at?: string | null
          failure_code?: string | null
          id?: string
          request_type: string
          requested_at?: string
          result_storage_key?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          expires_at?: string | null
          failure_code?: string | null
          id?: string
          request_type?: string
          requested_at?: string
          result_storage_key?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_rights_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          event_id: string
          responded_at: string
          response: string
          user_id: string
        }
        Insert: {
          event_id: string
          responded_at?: string
          response: string
          user_id: string
        }
        Update: {
          event_id?: string
          responded_at?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          creator_id: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string
          status: string
          time_zone: string
          title: string
          visibility: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string
          ends_at?: string | null
          id?: string
          starts_at: string
          status?: string
          time_zone: string
          title: string
          visibility?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string
          ends_at?: string | null
          id?: string
          starts_at?: string
          status?: string
          time_zone?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraiser_donations: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          donor_user_id: string | null
          fundraiser_id: string
          id: string
          provider: string
          provider_reference: string | null
          settled_at: string | null
          status: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          donor_user_id?: string | null
          fundraiser_id: string
          id?: string
          provider: string
          provider_reference?: string | null
          settled_at?: string | null
          status: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          donor_user_id?: string | null
          fundraiser_id?: string
          id?: string
          provider?: string
          provider_reference?: string | null
          settled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraiser_donations_donor_user_id_fkey"
            columns: ["donor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraiser_donations_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraisers: {
        Row: {
          beneficiary_user_id: string | null
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          goal_minor: number
          id: string
          organizer_id: string
          starts_at: string | null
          status: string
          title: string
        }
        Insert: {
          beneficiary_user_id?: string | null
          created_at?: string
          currency: string
          description?: string
          ends_at?: string | null
          goal_minor: number
          id?: string
          organizer_id: string
          starts_at?: string | null
          status?: string
          title: string
        }
        Update: {
          beneficiary_user_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          goal_minor?: number
          id?: string
          organizer_id?: string
          starts_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraisers_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraisers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "social_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          group_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "social_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_media: {
        Row: {
          asset_id: string
          listing_id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          listing_id: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          listing_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_media_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_broadcasts: {
        Row: {
          audience: string
          created_at: string
          description: string
          ended_at: string | null
          host_id: string
          id: string
          room_ref: string | null
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string
          ended_at?: string | null
          host_id: string
          id?: string
          room_ref?: string | null
          started_at?: string | null
          status?: string
          title: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          room_ref?: string | null
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_broadcasts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          broadcast_id: string
          joined_at: string | null
          left_at: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          joined_at?: string | null
          left_at?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "live_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category: string
          condition: string
          created_at: string
          currency: string | null
          description: string
          id: string
          location_label: string
          price_minor: number | null
          seller_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          condition?: string
          created_at?: string
          currency?: string | null
          description?: string
          id?: string
          location_label?: string
          price_minor?: number | null
          seller_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string
          currency?: string | null
          description?: string
          id?: string
          location_label?: string
          price_minor?: number | null
          seller_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          byte_size: number
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          media_type: string
          mime_type: string
          owner_id: string
          processing_status: string
          storage_key: string
          width: number | null
        }
        Insert: {
          byte_size: number
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type: string
          mime_type: string
          owner_id: string
          processing_status?: string
          storage_key: string
          width?: number | null
        }
        Update: {
          byte_size?: number
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          owner_id?: string
          processing_status?: string
          storage_key?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_exclusions: {
        Row: {
          created_at: string
          ends_on: string | null
          excluded_user_id: string | null
          id: string
          starts_on: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          excluded_user_id?: string | null
          id?: string
          starts_on?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          excluded_user_id?: string | null
          id?: string
          starts_on?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_exclusions_excluded_user_id_fkey"
            columns: ["excluded_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_exclusions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_preferences: {
        Row: {
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_asset_id: string | null
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          attachment_asset_id?: string | null
          body?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          attachment_asset_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_attachment_asset_id_fkey"
            columns: ["attachment_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      minglora_runtime_state: {
        Row: {
          created_at: string
          revision: number
          state: Json
          state_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          revision?: number
          state: Json
          state_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          revision?: number
          state?: Json
          state_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          event_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          event_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          event_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_follows: {
        Row: {
          created_at: string
          page_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          page_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_follows_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_posts: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string
          page_id: string
          published_by: string
          status: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string
          page_id: string
          published_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string
          page_id?: string
          published_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_posts_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_posts_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_roles: {
        Row: {
          created_at: string
          page_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          page_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          page_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_roles_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string
          handle: string
          id: string
          status: string
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string
          handle: string
          id?: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          handle?: string
          id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_albums: {
        Row: {
          audience: string
          cover_asset_id: string | null
          created_at: string
          description: string
          id: string
          owner_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          cover_asset_id?: string | null
          created_at?: string
          description?: string
          id?: string
          owner_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          cover_asset_id?: string | null
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_albums_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_albums_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_tags: {
        Row: {
          asset_id: string
          created_at: string
          status: string
          tagged_by: string
          tagged_user_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          status?: string
          tagged_by: string
          tagged_user_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          status?: string
          tagged_by?: string
          tagged_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_tags_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_tags_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_tags_tagged_user_id_fkey"
            columns: ["tagged_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          asset_id: string
          caption: string
          post_id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          caption?: string
          post_id: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          caption?: string
          post_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_media_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          audience: string
          author_id: string
          body: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_id: string
          body?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_asset_id: string | null
          avatar_url: string
          bio: string
          cover_asset_id: string | null
          cover_url: string
          created_at: string
          display_name: string
          id: string
          location: string
          updated_at: string
          username: string
          visibility: string
        }
        Insert: {
          avatar_asset_id?: string | null
          avatar_url?: string
          bio?: string
          cover_asset_id?: string | null
          cover_url?: string
          created_at?: string
          display_name: string
          id: string
          location?: string
          updated_at?: string
          username: string
          visibility?: string
        }
        Update: {
          avatar_asset_id?: string | null
          avatar_url?: string
          bio?: string
          cover_asset_id?: string | null
          cover_url?: string
          created_at?: string
          display_name?: string
          id?: string
          location?: string
          updated_at?: string
          username?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_avatar_asset_fk"
            columns: ["avatar_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_cover_asset_fk"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string
          created_at: string
          details: string
          id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: string
          id?: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: string
          id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          collection_name: string
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          collection_name?: string
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          collection_name?: string
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      short_video_play_events: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          video_id: string
          viewer_id: string
          watched_ms: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          video_id: string
          viewer_id: string
          watched_ms?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          video_id?: string
          viewer_id?: string
          watched_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "short_video_play_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "short_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_video_play_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      short_videos: {
        Row: {
          asset_id: string
          audience: string
          caption: string
          created_at: string
          creator_id: string
          duration_ms: number
          id: string
          sound_asset_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          audience?: string
          caption?: string
          created_at?: string
          creator_id: string
          duration_ms: number
          id?: string
          sound_asset_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          audience?: string
          caption?: string
          created_at?: string
          creator_id?: string
          duration_ms?: number
          id?: string
          sound_asset_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_videos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_videos_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_videos_sound_asset_id_fkey"
            columns: ["sound_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      social_groups: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          status: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          status?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          asset_id: string | null
          audience: string
          author_id: string
          created_at: string
          expires_at: string
          id: string
          image_url: string
          text: string
        }
        Insert: {
          asset_id?: string | null
          audience?: string
          author_id: string
          created_at?: string
          expires_at: string
          id?: string
          image_url?: string
          text?: string
        }
        Update: {
          asset_id?: string | null
          audience?: string
          author_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_watch_history: {
        Row: {
          last_watched_at: string
          position_ms: number
          user_id: string
          video_id: string
        }
        Insert: {
          last_watched_at?: string
          position_ms?: number
          user_id: string
          video_id: string
        }
        Update: {
          last_watched_at?: string
          position_ms?: number
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_watch_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_watch_history_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "short_videos"
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
    Enums: {},
  },
} as const
