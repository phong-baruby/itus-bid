"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Me } from "./types";

let client: SupabaseClient | null = null;

// Tạo lazy để build không lỗi khi chưa có env
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}

export function signInWithGoogle() {
  // Bỏ ?code= cũ khỏi URL quay về
  const back = new URL(window.location.href);
  back.searchParams.delete("code");
  return getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: back.toString(), queryParams: { prompt: "select_account" } },
  });
}

export function signOut() {
  return getSupabase().auth.signOut();
}

/** Người đang đăng nhập (undefined = đang kiểm tra, null = chưa đăng nhập) */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    let sb: SupabaseClient;
    try {
      sb = getSupabase();
    } catch {
      setMe(null);
      return;
    }

    const resolve = async (user: { id: string; email?: string; user_metadata?: Record<string, string> } | null) => {
      if (!user) return setMe(null);
      const meta = user.user_metadata ?? {};
      const fallback: Me = {
        id: user.id,
        email: user.email ?? "",
        name: meta.full_name || meta.name || (user.email ?? "").split("@")[0],
        avatar_url: meta.avatar_url ?? null,
      };
      setMe(fallback);
      const { data } = await sb.from("profiles").select("name,avatar_url").eq("id", user.id).maybeSingle();
      if (data) setMe({ ...fallback, name: data.name, avatar_url: data.avatar_url });
    };

    sb.auth.getSession().then(({ data }) => resolve(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      resolve(session?.user ?? null);
      // Dọn ?code= trên URL sau khi đăng nhập xong
      if (session && window.location.search.includes("code=")) {
        const u = new URL(window.location.href);
        u.searchParams.delete("code");
        window.history.replaceState(null, "", u);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return me;
}
