/**
 * Supabase Database Types
 *
 * These types mirror the actual Prisma schema and are used for Supabase client
 * type-safety. To regenerate from a live project, run:
 * npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          contract_address: string;
          name: string;
          description: string | null;
          category: string;
          chain_id: number;
          owner_address: string;
          is_verified: boolean;
          is_flagged: boolean;
          verified_at: string | null;
          flagged_at: string | null;
          flag_reason: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contract_address: string;
          name: string;
          description?: string | null;
          category: string;
          chain_id: number;
          owner_address: string;
          is_verified?: boolean;
          is_flagged?: boolean;
          verified_at?: string | null;
          flagged_at?: string | null;
          flag_reason?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          contract_address?: string;
          name?: string;
          description?: string | null;
          category?: string;
          chain_id?: number;
          owner_address?: string;
          is_verified?: boolean;
          is_flagged?: boolean;
          verified_at?: string | null;
          flagged_at?: string | null;
          flag_reason?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      trust_scores: {
        Row: {
          id: string;
          agent_id: string;
          overall_score: number;
          volume_score: number;
          proxy_score: number;
          uptime_score: number;
          oz_match_score: number;
          community_score: number;
          calculated_at: string;
          snapshot_data: Json | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          overall_score: number;
          volume_score: number;
          proxy_score: number;
          uptime_score: number;
          oz_match_score: number;
          community_score: number;
          calculated_at?: string;
          snapshot_data?: Json | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          overall_score?: number;
          volume_score?: number;
          proxy_score?: number;
          uptime_score?: number;
          oz_match_score?: number;
          community_score?: number;
          calculated_at?: string;
          snapshot_data?: Json | null;
        };
      };
      ratings: {
        Row: {
          id: string;
          agent_id: string;
          user_address: string;
          rating: number;
          review: string | null;
          tx_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          user_address: string;
          rating: number;
          review?: string | null;
          tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          user_address?: string;
          rating?: number;
          review?: string | null;
          tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      scanner_results: {
        Row: {
          id: string;
          agent_id: string;
          scan_type: string;
          status: string;
          findings: Json | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          scan_type: string;
          status?: string;
          findings?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          scan_type?: string;
          status?: string;
          findings?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
