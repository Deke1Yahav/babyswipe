export type Role = "parent" | "sitter";
export type Verdict = "like" | "pass";

export interface Point { lat: number; lng: number }

export interface Profile {
  id: string; role: Role; display_name: string; verified_at: string | null;
  avatar_path: string | null; about: string; kids_text: string;
}

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
  occupation: string;
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
  verified: boolean;
  rating_avg: number | null;
  rating_count: number;
  avatar_path: string | null;
  occupation: string;
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
  other_verified: boolean;
  other_avatar: string | null;
}

export interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Filters { maxKm: number; maxPrice: number; nowOnly: boolean; verifiedOnly?: boolean; sort: "dist" | "price" | "rating" }

export interface Review {
  id: number;
  parent_id: string;
  parent_name: string;
  parent_verified: boolean;
  rating: number;
  body: string;
  sitter_reply: string | null;
  created_at: string;
  mine: boolean;
  parent_avatar: string | null;
}
