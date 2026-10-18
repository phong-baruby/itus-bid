"use client";

import { useCallback, useEffect, useState } from "react";
import { countdown, vnd } from "@/lib/format";
import { getSupabase, useMe } from "@/lib/supabase";
import type { AdminProfile, Jersey, Settings } from "@/lib/types";
import Header, { Avatar, GoogleButton } from "./Header";

type AdminJersey = Jersey & { leader_email: string | null };
type ListRes = { me: string; settings: Settings; jerseys: AdminJersey[]; profiles: AdminProfile[] };

async function api<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}) {
  const { data } = await getSupabase().auth.getSession();
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await r.json().catch(() => ({ ok: false, error: "Lỗi mạng" }));
  return { status: r.status, ...json } as { ok: boolean; error?: string; status: number } & Partial<T>;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls = "line w-full rounded-xl border bg-transparent px-3 py-2.5 outline-none focus:border-brand-500";
const btn = "rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50";

export default function AdminPanel() {
  const me = useMe();
  const [data, setData] = useState<ListRes | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await api<ListRes>("list");
    if (r.status === 401 || r.status === 403) return setDenied(r.error ?? "Không có quyền");
    if (!r.ok) return setMsg(r.error ?? "Lỗi");
    setDenied(null);
    setData(r as unknown as ListRes);
  }, []);

  useEffect(() => {
    if (me) load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [me, load]);

  const run = async (action: string, payload: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return false;
    setMsg(null);
    const r = await api(action, payload);
    if (!r.ok) setMsg(r.error ?? "Lỗi");
    await load();
    return r.ok;
  };

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <Header me={me} subtitle="Quản trị đấu giá" />
      {children}
    </div>
  );

  if (me === undefined) return shell(<p className="muted py-10 text-center">Đang tải…</p>);
  if (me === null)
    return shell(
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <p>Đăng nhập bằng email admin để vào trang quản trị.</p>
        <GoogleButton />
      </div>,
    );
  if (denied) return shell(<p className="card p-6 text-center text-sm text-red-600">{denied}</p>);
  if (!data) return shell(<p className="muted py-10 text-center">Đang tải…</p>);

  const ended = now >= new Date(data.settings.ends_at).getTime();
  const total = data.jerseys.reduce((s, j) => s + (j.current_price ?? 0), 0);
  const collected = data.jerseys.reduce((s, j) => s + (j.paid ? j.current_price ?? 0 : 0), 0);

  const exportCsv = () => {
    const rows = [["So ao", "Nguoi thang", "Email", "Gia chot", "Da thu"]];
    for (const j of data.jerseys) rows.push([String(j.number), j.leader_name ?? "", j.leader_email ?? "", String(j.current_price ?? ""), j.paid ? "x" : ""]);
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ket-qua-dau-gia-so-ao.csv`;
    a.click();
  };

  return shell(
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <a href="/" className="accent font-semibold underline">← Trang đấu giá</a>
        <span className="muted">Tổng {vnd(total)} · đã thu {vnd(collected)}</span>
      </div>

      {msg && <p className="card border-red-300 p-3 text-sm text-red-600">{msg}</p>}

      <SettingsForm settings={data.settings} ended={ended} now={now} onSave={(p) => run("updateSettings", p)} />

      <AddJerseys onAdd={(numbers, note) => run("createJerseys", { numbers, note })} />

      {/* Danh sách số */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Số áo đang đấu ({data.jerseys.length})</h2>
          {data.jerseys.length > 0 && (
            <button onClick={exportCsv} className={`${btn} line border`}>Tải kết quả CSV</button>
          )}
        </div>
        <div className="space-y-3">
          {data.jerseys.map((j) => (
            <div key={j.id} className="line rounded-2xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="num w-12 text-3xl font-bold">#{j.number}</span>
                  <div className="min-w-0 text-sm">
                    <p>
                      <b>{vnd(j.current_price)}</b> <span className="muted">· {j.bid_count} lượt</span>
                    </p>
                    <p className="muted truncate text-xs">{j.leader_name ? `${j.leader_name} · ${j.leader_email}` : "Chưa ai trả"}</p>
                  </div>
                </div>
                {j.current_price != null && (
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <input type="checkbox" checked={j.paid} onChange={(e) => run("updateJersey", { id: j.id, paid: e.target.checked })} className="h-5 w-5 accent-[#111b88]" />
                    Đã thu
                  </label>
                )}
              </div>
              {j.note && <p className="muted mt-1 text-xs">{j.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`${btn} line border`}
                  onClick={() => {
                    const v = prompt(`Ghi chú cho số ${j.number}`, j.note ?? "");
                    if (v !== null) run("updateJersey", { id: j.id, note: v });
                  }}
                >
                  Sửa ghi chú
                </button>
                {j.bid_count > 0 && (
                  <button className={`${btn} line border text-amber-600`} onClick={() => run("removeTopBid", { id: j.id }, `Huỷ lượt giá cao nhất (${vnd(j.current_price)} của ${j.leader_name})?`)}>
                    Huỷ giá cao nhất
                  </button>
                )}
                <button className={`${btn} line border text-red-600`} onClick={() => run("deleteJersey", { id: j.id }, `Xoá số ${j.number} và toàn bộ lượt trả giá?`)}>
                  Xoá
                </button>
              </div>
            </div>
          ))}
          {data.jerseys.length === 0 && <p className="muted text-sm">Chưa mở số nào.</p>}
        </div>
      </section>

      {/* Người tham gia */}
      <section className="card p-5">
        <h2 className="mb-1 text-lg font-bold">Người đã đăng nhập ({data.profiles.length})</h2>
        <p className="muted mb-3 text-sm">Ai đăng nhập Google là trả giá được. Thấy người lạ hoặc troll thì bấm Chặn.</p>
        <ul className="divide-y divide-[var(--line)]">
          {data.profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar src={p.avatar_url} name={p.name} />
                <span className="min-w-0">
                  <span className={`block truncate font-medium ${p.blocked ? "line-through opacity-60" : ""}`}>{p.name}</span>
                  <span className="muted block truncate text-xs">{p.email} · {p.bid_count} lượt</span>
                </span>
              </span>
              {p.blocked ? (
                <button className={`${btn} line border`} onClick={() => run("setBlocked", { id: p.id, blocked: false })}>Bỏ chặn</button>
              ) : (
                <button
                  className={`${btn} line border text-red-600`}
                  onClick={() => {
                    if (!confirm(`Chặn ${p.name} (${p.email}) trả giá?`)) return;
                    const purge = p.bid_count > 0 && confirm(`Xoá luôn ${p.bid_count} lượt trả giá của ${p.name}?`);
                    run("setBlocked", { id: p.id, blocked: true, purge });
                  }}
                >
                  Chặn
                </button>
              )}
            </li>
          ))}
          {data.profiles.length === 0 && <p className="muted py-2 text-sm">Chưa ai đăng nhập.</p>}
        </ul>
      </section>
    </div>,
  );
}

function SettingsForm({
  settings,
  ended,
  now,
  onSave,
}: {
  settings: Settings;
  ended: boolean;
  now: number;
  onSave: (p: Record<string, unknown>) => Promise<boolean>;
}) {
  const init = () => ({
    start_price: String(settings.start_price),
    min_increment: String(settings.min_increment),
    ends_at: toLocalInput(new Date(settings.ends_at)),
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  // Đồng bộ lại khi deadline bị gia hạn tự động
  useEffect(() => setF(init()), [settings.ends_at, settings.start_price, settings.min_increment]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          start_price: Number(f.start_price.replace(/\D/g, "")),
          min_increment: Number(f.min_increment.replace(/\D/g, "")),
          ends_at: new Date(f.ends_at).toISOString(),
        });
        setBusy(false);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Cài đặt chung</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ended ? "bg-gray-200 text-gray-700" : "accent-soft accent"}`}>
          {ended ? "Đã kết thúc" : `Còn ${countdown(new Date(settings.ends_at).getTime() - now)}`}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="muted">Giá khởi điểm (đ)</span>
          <input required inputMode="numeric" value={f.start_price} onChange={set("start_price")} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="muted">Bước giá tối thiểu (đ)</span>
          <input required inputMode="numeric" value={f.min_increment} onChange={set("min_increment")} className={inputCls} />
        </label>
        <label className="text-sm">
          <span className="muted">Deadline chung</span>
          <input required type="datetime-local" value={f.ends_at} onChange={set("ends_at")} className={inputCls} />
        </label>
      </div>
      <p className="muted text-xs">Áp dụng cho mọi số áo. Có người trả giá trong 2 phút cuối thì deadline tự lùi thêm 2 phút. Muốn chốt sớm thì đặt deadline về giờ hiện tại.</p>
      <button disabled={busy} className={`${btn} bg-brand-700 px-5 py-3 text-white`}>{busy ? "Đang lưu…" : "Lưu cài đặt"}</button>
    </form>
  );
}

function AddJerseys({ onAdd }: { onAdd: (numbers: string, note: string) => Promise<boolean> }) {
  const [numbers, setNumbers] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        if (await onAdd(numbers, note)) {
          setNumbers("");
          setNote("");
        }
        setBusy(false);
      }}
    >
      <h2 className="text-lg font-bold">Mở đấu giá số bị trùng</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="text-sm">
          <span className="muted">Số áo (nhiều số cách nhau dấu phẩy)</span>
          <input required value={numbers} onChange={(e) => setNumbers(e.target.value)} className={inputCls} placeholder="7, 10, 23" />
        </label>
        <label className="text-sm">
          <span className="muted">Ghi chú (tuỳ chọn)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Đăng ký: Tuấn, Hùng, Long" />
        </label>
      </div>
      <button disabled={busy || !numbers.trim()} className={`${btn} bg-brand-700 px-5 py-3 text-white`}>{busy ? "Đang mở…" : "Mở đấu giá"}</button>
    </form>
  );
}
