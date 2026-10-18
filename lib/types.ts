export type Jersey = {
  id: string;
  number: number;
  note: string | null;
  paid: boolean;
  created_at: string;
  current_price: number | null;
  leader_id: string | null;
  leader_name: string | null;
  leader_avatar: string | null;
  bid_count: number;
};

export type Settings = {
  start_price: number;
  min_increment: number;
  ends_at: string;
};

export type Bid = {
  id: number;
  jersey_id: string;
  user_id: string;
  amount: number;
  created_at: string;
  profiles: { name: string; avatar_url: string | null } | null;
};

export type Me = { id: string; email: string; name: string; avatar_url: string | null };

export type AdminProfile = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  blocked: boolean;
  created_at: string;
  bid_count: number;
};
