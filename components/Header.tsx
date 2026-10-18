"use client";

import { signInWithGoogle, signOut } from "@/lib/supabase";
import type { Me } from "@/lib/types";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <picture>
      <source srcSet="/logo-white.png" media="(prefers-color-scheme: dark)" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="fit@hcmus" width={367} height={64} className={className} />
    </picture>
  );
}

export function Avatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-700 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function GoogleButton({ label = "Đăng nhập Google", className = "" }: { label?: string; className?: string }) {
  return (
    <button
      onClick={() => signInWithGoogle()}
      className={`line inline-flex items-center justify-center gap-2 rounded-full border bg-[var(--card)] px-4 py-2 text-sm font-semibold shadow-sm ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {label}
    </button>
  );
}

export default function Header({ me, subtitle }: { me: Me | null | undefined; subtitle: string }) {
  return (
    <header className="flex items-center justify-between gap-3 pt-5 pb-4">
      <div className="min-w-0">
        <Logo className="h-7 w-auto sm:h-8" />
        <p className="muted mt-1 text-xs font-semibold tracking-widest uppercase">{subtitle}</p>
      </div>
      {me === undefined ? null : me ? (
        <button onClick={() => signOut()} className="card flex shrink-0 items-center gap-2 py-1.5 pr-3 pl-1.5 text-sm" title={`${me.email} — bấm để đăng xuất`}>
          <Avatar src={me.avatar_url} name={me.name} />
          <span className="max-w-28 truncate font-semibold">{me.name}</span>
          <span className="muted text-xs">thoát</span>
        </button>
      ) : (
        <GoogleButton className="shrink-0" />
      )}
    </header>
  );
}
