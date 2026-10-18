"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, useMe } from "@/lib/supabase";
import { countdown, timeAgo, vnd } from "@/lib/format";
import type { Bid, Jersey, Me, Settings } from "@/lib/types";
import Header, { Avatar, GoogleButton } from "./Header";
import VietQR from "./VietQR";

function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

export default function AuctionBoard() {
  const me = useMe();
  const [jerseys, setJerseys] = useState<Jersey[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = useServerNow(offset);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [board, st] = await Promise.all([
      sb.from("jersey_board").select("*").order("number"),
      sb.from("settings").select("start_price,min_increment,ends_at").eq("id", 1).single(),
    ]);
    if (board.error || st.error) setError((board.error ?? st.error)!.message);
    else {
      setJerseys((board.data ?? []) as Jersey[]);
      setSettings(st.data as Settings);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let sb;
    try {
      sb = getSupabase();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      return;
    }
    load();
    sb.rpc("server_time").then(({ data }) => {
      if (data) setOffset(new Date(data as string).getTime() - Date.now());
    });
    const ch = sb
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "jerseys" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, load)
      .subscribe();
    const poll = setInterval(load, 20000); // dự phòng khi realtime rớt
    return () => {
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [load]);

  // Tab mặc định: ?so=7 trên URL, không thì số đầu tiên
  useEffect(() => {
    if (jerseys.length === 0) return;
    if (selectedId && jerseys.some((j) => j.id === selectedId)) return;
    const so = new URLSearchParams(window.location.search).get("so");
    const fromUrl = so != null ? jerseys.find((j) => String(j.number) === so) : undefined;
    setSelectedId((fromUrl ?? jerseys[0]).id);
  }, [jerseys, selectedId]);

  const selectTab = (j: Jersey) => {
    setSelectedId(j.id);
    const url = new URL(window.location.href);
    url.searchParams.set("so", String(j.number));
    window.history.replaceState(null, "", url);
  };

  const endsAt = settings ? new Date(settings.ends_at).getTime() : 0;
  const closed = !!settings && now >= endsAt;
  const left = endsAt - now;
  const myLead = me ? jerseys.find((j) => j.leader_id === me.id) ?? null : null;
  const selected = jerseys.find((j) => j.id === selectedId) ?? null;

  const totals = useMemo(() => {
    let sum = 0, collected = 0;
    for (const j of jerseys) {
      if (j.current_price == null) continue;
      sum += j.current_price;
      if (j.paid) collected += j.current_price;
    }
    return { sum, collected };
  }, [jerseys]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <Header me={me} subtitle="Đấu giá số áo" />

      {/* Deadline chung */}
      {settings && (
        <section
          className={`mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white ${
            closed ? "bg-gray-600" : left < 600_000 ? "bg-amber-600" : "bg-brand-700"
          }`}
        >
          <div>
            <p className="text-xs text-white/70">{closed ? "Đấu giá đã kết thúc" : "Kết thúc toàn bộ sau"}</p>
            <p className="num text-2xl leading-tight font-bold">{closed ? "Đã chốt số áo" : countdown(left)}</p>
          </div>
          <p className="text-right text-xs text-white/80">
            {new Date(settings.ends_at).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            <br />
            Bước giá {vnd(settings.min_increment)}
          </p>
        </section>
      )}

      {/* Tổng quỹ */}
      <section className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Số đấu giá" value={String(jerseys.length)} />
        <Stat label={closed ? "Tổng quỹ" : "Đang đấu"} value={vnd(totals.sum)} />
        <Stat label="Đã thu" value={vnd(totals.collected)} highlight />
      </section>

      {/* Trạng thái của tôi */}
      {me && myLead && !closed && (
        <p className="accent-soft accent mb-4 rounded-2xl px-4 py-3 text-sm font-medium">
          Bạn đang dẫn đầu <b>số {myLead.number}</b> ({vnd(myLead.current_price)}). Mỗi người chỉ giữ 1 số tại 1 thời điểm.
        </p>
      )}
      {me === null && !closed && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Đăng nhập Google để tham gia trả giá.</p>
          <GoogleButton />
        </div>
      )}

      {loading && <p className="muted py-10 text-center">Đang tải…</p>}
      {error && <p className="card p-4 text-sm text-red-600">Lỗi: {error}</p>}
      {!loading && !error && jerseys.length === 0 && (
        <p className="card muted p-8 text-center">Chưa có số áo nào được mở đấu giá.</p>
      )}

      {/* Tabs số áo */}
      {jerseys.length > 0 && (
        <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pt-2 pb-1" role="tablist">
          {jerseys.map((j) => {
            const active = j.id === selectedId;
            const mine = !!me && j.leader_id === me.id;
            return (
              <button
                key={j.id}
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(j)}
                className={[
                  "relative flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-2xl border px-3 pt-1.5 pb-2 transition",
                  active ? "border-brand-700 bg-brand-700 text-white shadow-md" : "line bg-[var(--card)]",
                ].join(" ")}
              >
                <span className="num text-2xl leading-tight font-bold">{j.number}</span>
                <span className={`text-[10px] leading-tight ${active ? "text-white/80" : "muted"}`}>
                  {j.current_price == null ? "chưa có giá" : vnd(j.current_price)}
                </span>
                {mine && (
                  <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black">bạn</span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {selected && settings && (
        <JerseyPanel
          key={selected.id}
          jersey={selected}
          settings={settings}
          closed={closed}
          now={now}
          me={me ?? null}
          myLead={myLead}
          onGoTo={(j) => selectTab(j)}
          onBidPlaced={load}
        />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card px-2 py-2.5">
      <p className="muted text-[11px]">{label}</p>
      <p className={`text-sm font-bold sm:text-base ${highlight ? "accent" : ""}`}>{value}</p>
    </div>
  );
}

function JerseyPanel({
  jersey,
  settings,
  closed,
  now,
  me,
  myLead,
  onGoTo,
  onBidPlaced,
}: {
  jersey: Jersey;
  settings: Settings;
  closed: boolean;
  now: number;
  me: Me | null;
  myLead: Jersey | null;
  onGoTo: (j: Jersey) => void;
  onBidPlaced: () => void;
}) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const lastPrice = useRef(jersey.current_price);

  const minNext = jersey.current_price == null ? settings.start_price : jersey.current_price + settings.min_increment;
  const iLead = !!me && jersey.leader_id === me.id;
  const leadingOther = !!me && !!myLead && myLead.id !== jersey.id;

  useEffect(() => {
    getSupabase()
      .from("bids")
      .select("id,jersey_id,user_id,amount,created_at,profiles(name,avatar_url)")
      .eq("jersey_id", jersey.id)
      .order("amount", { ascending: false })
      .limit(30)
      .then(({ data }) => setBids((data ?? []) as unknown as Bid[]));
  }, [jersey.id, jersey.bid_count]);

  useEffect(() => {
    if (lastPrice.current !== jersey.current_price && priceRef.current) {
      priceRef.current.classList.remove("flash");
      void priceRef.current.offsetWidth;
      priceRef.current.classList.add("flash");
    }
    lastPrice.current = jersey.current_price;
  }, [jersey.current_price]);

  const bid = async (value: number) => {
    if (!me) return;
    if (!Number.isFinite(value) || value < minNext) {
      setMsg({ type: "err", text: `Giá tối thiểu là ${vnd(minNext)}` });
      return;
    }
    if (value >= minNext * 3 && !confirm(`Xác nhận trả ${vnd(value)} cho số ${jersey.number}?`)) return;

    setBusy(true);
    setMsg(null);
    const { data, error } = await getSupabase().rpc("place_bid", { p_jersey_id: jersey.id, p_amount: value });
    setBusy(false);
    if (error) return setMsg({ type: "err", text: error.message });
    const res = data as { ok: boolean; error?: string; extended?: boolean };
    if (!res.ok) return setMsg({ type: "err", text: res.error ?? "Không trả giá được" });
    setAmount("");
    setMsg({ type: "ok", text: res.extended ? `Đã trả ${vnd(value)} — deadline chung được lùi thêm 2 phút` : `Đã trả ${vnd(value)} 🎉` });
    onBidPlaced();
  };

  const quick = [minNext, minNext + settings.min_increment, minNext + settings.min_increment * 4];

  return (
    <section className="card overflow-hidden">
      {/* Hero */}
      <div className="flex items-end justify-between gap-4 bg-brand-900 px-5 pt-5 pb-5 text-white">
        <div>
          <p className="text-xs tracking-widest text-white/60 uppercase">Số áo</p>
          <p className="num text-7xl leading-none font-bold">{jersey.number}</p>
        </div>
        {jersey.note && <p className="max-w-[60%] text-right text-sm text-white/75">{jersey.note}</p>}
      </div>

      {/* Giá hiện tại */}
      <div ref={priceRef} className="line border-b px-5 py-4">
        <p className="muted text-xs">{closed ? "Giá chốt" : jersey.current_price == null ? "Giá khởi điểm" : "Giá cao nhất"}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-3xl font-bold">{vnd(jersey.current_price ?? settings.start_price)}</p>
          {jersey.leader_name ? (
            <p className="flex items-center gap-2 text-sm">
              <span className="muted">{closed ? "🏆" : "Dẫn đầu"}</span>
              <Avatar src={jersey.leader_avatar} name={jersey.leader_name} size={24} />
              <b className={iLead ? "accent" : ""}>{iLead ? "Bạn" : jersey.leader_name}</b>
            </p>
          ) : (
            <p className="muted text-sm">Chưa ai trả giá</p>
          )}
        </div>
      </div>

      {/* Khu trả giá / kết quả */}
      <div className="px-5 py-4">
        {closed ? (
          <ClosedResult jersey={jersey} me={me} />
        ) : !me ? (
          <div className="flex flex-col items-start gap-2">
            <p className="muted text-sm">Đăng nhập để trả giá số {jersey.number}.</p>
            <GoogleButton />
          </div>
        ) : iLead ? (
          <p className="accent-soft accent rounded-xl px-4 py-3 text-sm font-medium">
            Bạn đang giữ giá cao nhất số này. Ai trả cao hơn thì trang tự cập nhật.
          </p>
        ) : leadingOther ? (
          <div className="rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
            Bạn đang dẫn đầu <b>số {myLead!.number}</b> nên chưa trả giá số {jersey.number} được. Nếu có người vượt giá bạn ở số {myLead!.number}, bạn sẽ được trả giá số khác.
            <button onClick={() => onGoTo(myLead!)} className="accent mt-2 block font-semibold underline">
              Xem số {myLead!.number} →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {quick.map((v, i) => (
                <button
                  key={v}
                  disabled={busy}
                  onClick={() => bid(v)}
                  className={[
                    "rounded-xl px-2 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50",
                    i === 0 ? "bg-brand-700 text-white" : "line border bg-[var(--card)]",
                  ].join(" ")}
                >
                  {vnd(v)}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                bid(Number(amount));
              }}
            >
              <input
                inputMode="numeric"
                placeholder={`Nhập giá ≥ ${minNext.toLocaleString("vi-VN")}`}
                value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                className="line min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-3 text-base outline-none focus:border-brand-500"
              />
              <button disabled={busy || !amount} className="rounded-xl bg-[var(--ink)] px-4 font-semibold text-[var(--bg)] disabled:opacity-40">
                {busy ? "…" : "Trả giá"}
              </button>
            </form>
          </div>
        )}
        {msg && <p className={`mt-3 text-sm font-medium ${msg.type === "ok" ? "accent" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      {/* Lịch sử */}
      <div className="line border-t px-5 py-4">
        <p className="mb-2 text-sm font-semibold">Lịch sử trả giá ({jersey.bid_count})</p>
        {bids.length === 0 ? (
          <p className="muted text-sm">Chưa có lượt nào.</p>
        ) : (
          <ol className="space-y-2">
            {bids.map((b, i) => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <span className={`flex min-w-0 items-center gap-2 ${i === 0 ? "font-semibold" : ""}`}>
                  <Avatar src={b.profiles?.avatar_url ?? null} name={b.profiles?.name ?? "?"} size={22} />
                  <span className="truncate">
                    {b.profiles?.name ?? "?"}
                    {me?.id === b.user_id && <span className="accent"> (bạn)</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="muted text-xs">{timeAgo(b.created_at, now)}</span>
                  <span className={i === 0 ? "font-bold" : ""}>{vnd(b.amount)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ClosedResult({ jersey, me }: { jersey: Jersey; me: Me | null }) {
  if (!jersey.leader_name || jersey.current_price == null) {
    return <p className="muted text-sm">Không ai trả giá số này.</p>;
  }
  const isWinner = me?.id === jersey.leader_id;
  return (
    <div className="space-y-3">
      <p className="text-base">
        Số <b>{jersey.number}</b> thuộc về <b className="accent">{isWinner ? "bạn" : jersey.leader_name}</b> với giá <b>{vnd(jersey.current_price)}</b>.
      </p>
      {jersey.paid ? (
        <p className="accent-soft accent inline-block rounded-full px-3 py-1 text-sm font-semibold">✓ Đã đóng quỹ</p>
      ) : (
        <VietQR amount={jersey.current_price} number={jersey.number} name={jersey.leader_name} highlight={isWinner} />
      )}
    </div>
  );
}
