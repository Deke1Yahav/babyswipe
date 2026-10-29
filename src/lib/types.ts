export type Role = "parent" | "sitter";
export type Verdict = "like" | "pass";

export interface Point { lat: number; lng: number }

export interface Profile { id: string; role: Role; display_name: string }

export interface SitterListing {
  id: string;
  age: number | null;
  bio: string;
  hourly_price: number;
  years_experience: number;
  tags: string[];
  available_text: string;
  available_until: string | null;
  lat: number;
  lng: number;
  is_active: boolean;
}

export interface NearbySitter {
  id: string;
  display_name: string;
  age: number | null;
  bio: string;
  hourly_price: number;
  years_experience: number;
  tags: string[];
  available_text: string;
  available_now: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  my_verdict: Verdict | null;
}

export interface ConversationSummary {
  id: string;
  other_id: string;
  other_name: string;
  other_role: Role;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
  unread: number;
  blocked: boolean;
}

export interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Filters { maxKm: number; maxPrice: number; nowOnly: boolean; sort: "dist" | "price" }
