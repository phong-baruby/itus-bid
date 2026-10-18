import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  // ---- Xác thực: token Google (Supabase) + email nằm trong ADMIN_EMAILS ----
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return bad("Chưa đăng nhập", 401);
  const db = getAdminClient();
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth.user) return bad("Phiên đăng nhập hết hạn, đăng nhập lại nhé", 401);
  const email = (auth.user.email ?? "").toLowerCase();
  if (!adminEmails().includes(email)) return bad(`${email} không có quyền admin`, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Body không hợp lệ");
  }

  switch (String(body.action ?? "")) {
    case "list": {
      const [settings, board, profiles, bids] = await Promise.all([
        db.from("settings").select("start_price,min_increment,ends_at").eq("id", 1).single(),
        db.from("jersey_board").select("*").order("number"),
        db.from("profiles").select("id,email,name,avatar_url,blocked,created_at").order("created_at"),
        db.from("bids").select("user_id"),
      ]);
      const err = settings.error ?? board.error ?? profiles.error ?? bids.error;
      if (err) return bad(err.message, 500);
      const counts = new Map<string, number>();
      for (const b of bids.data ?? []) counts.set(b.user_id, (counts.get(b.user_id) ?? 0) + 1);
      const emailById = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
      return NextResponse.json({
        ok: true,
        me: email,
        settings: settings.data,
        jerseys: (board.data ?? []).map((j) => ({ ...j, leader_email: j.leader_id ? emailById.get(j.leader_id) ?? null : null })),
        profiles: (profiles.data ?? []).map((p) => ({ ...p, bid_count: counts.get(p.id) ?? 0 })),
      });
    }

    case "updateSettings": {
      const start_price = Number(body.start_price);
      const min_increment = Number(body.min_increment);
      const ends_at = String(body.ends_at ?? "");
      if (!(Number.isInteger(start_price) && start_price >= 0)) return bad("Giá khởi điểm không hợp lệ");
      if (!(Number.isInteger(min_increment) && min_increment > 0)) return bad("Bước giá phải > 0");
      if (Number.isNaN(Date.parse(ends_at))) return bad("Deadline không hợp lệ");
      const { error } = await db
        .from("settings")
        .update({ start_price, min_increment, ends_at, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    // "7, 10, 23" => mở 3 số cùng lúc
    case "createJerseys": {
      const nums = [...new Set(String(body.numbers ?? "").split(/[\s,;]+/).filter(Boolean).map(Number))];
      if (nums.length === 0) return bad("Nhập ít nhất 1 số áo");
      const invalid = nums.filter((n) => !Number.isInteger(n) || n < 0 || n > 99);
      if (invalid.length) return bad(`Số không hợp lệ: ${invalid.join(", ")} (chỉ 0–99)`);
      const note = body.note ? String(body.note) : null;
      const { error } = await db
        .from("jerseys")
        .upsert(nums.map((number) => ({ number, note })), { onConflict: "number", ignoreDuplicates: true });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "updateJersey": {
      const patch: Record<string, unknown> = {};
      if (typeof body.paid === "boolean") patch.paid = body.paid;
      if (typeof body.note === "string") patch.note = body.note.trim() || null;
      if (Object.keys(patch).length === 0) return bad("Không có gì để cập nhật");
      const { error } = await db.from("jerseys").update(patch).eq("id", String(body.id));
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "deleteJersey": {
      const { error } = await db.from("jerseys").delete().eq("id", String(body.id));
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    // Huỷ lượt giá cao nhất (trả nhầm / troll)
    case "removeTopBid": {
      const { data, error } = await db
        .from("bids")
        .select("id")
        .eq("jersey_id", String(body.id))
        .order("amount", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return bad(error.message, 500);
      if (!data) return bad("Số này chưa có lượt trả giá");
      const del = await db.from("bids").delete().eq("id", data.id);
      if (del.error) return bad(del.error.message, 500);
      return NextResponse.json({ ok: true });
    }

    // Chặn người ngoài / troll. purge=true thì xoá luôn mọi lượt trả giá của họ
    case "setBlocked": {
      const id = String(body.id);
      const { error } = await db.from("profiles").update({ blocked: !!body.blocked }).eq("id", id);
      if (error) return bad(error.message, 500);
      if (body.blocked && body.purge) {
        const del = await db.from("bids").delete().eq("user_id", id);
        if (del.error) return bad(del.error.message, 500);
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return bad("Action không hợp lệ");
  }
}
