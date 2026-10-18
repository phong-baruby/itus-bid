"use client";

import { useState } from "react";
import { vnd } from "@/lib/format";

export default function PaymentQR({
  amount,
  number,
  name,
  highlight,
}: {
  amount: number;
  number: number;
  name: string;
  highlight?: boolean;
}) {
  const content = `Ao so ${number} - ${name}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API không khả dụng (http / trình duyệt cũ) — bỏ qua, người dùng tự gõ tay
    }
  };

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-brand-500 accent-soft" : "line"}`}>
      <p className="mb-3 text-sm">{highlight ? "Quét mã Momo để đóng quỹ nhé 👇" : "Mã Momo quỹ đội cho người thắng:"}</p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/momo-qr.jpg" alt="QR Momo quỹ đội" width={220} height={220} className="rounded-xl bg-white object-contain" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="muted">Số tiền</dt>
          <dd className="font-bold">{vnd(amount)}</dd>
          <dt className="muted">Nội dung gợi ý</dt>
          <dd className="flex items-center gap-2">
            <span className="font-medium">{content}</span>
            <button type="button" onClick={copy} className="line shrink-0 rounded-lg border px-2 py-0.5 text-xs">
              {copied ? "Đã copy" : "Copy"}
            </button>
          </dd>
        </dl>
      </div>
      <p className="muted mt-3 text-xs">Tự gõ số tiền và nội dung vào app Momo khi chuyển khoản nhé.</p>
    </div>
  );
}
