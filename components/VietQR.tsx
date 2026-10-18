"use client";

import { stripVN, vnd } from "@/lib/format";

const BANK = process.env.NEXT_PUBLIC_BANK_ID;
const ACC = process.env.NEXT_PUBLIC_BANK_ACCOUNT;
const ACC_NAME = process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || "";

export default function VietQR({
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
  if (!BANK || !ACC) {
    return <p className="muted text-sm">Chờ đóng quỹ — liên hệ thủ quỹ đội để chuyển khoản.</p>;
  }
  const info = stripVN(`Ao so ${number} ${name}`).slice(0, 50);
  const src = `https://img.vietqr.io/image/${BANK}-${ACC}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
    info,
  )}&accountName=${encodeURIComponent(ACC_NAME)}`;

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-brand-500 accent-soft" : "line"}`}>
      <p className="mb-3 text-sm">
        {highlight ? "Quét mã để đóng quỹ nhé 👇" : "Mã chuyển khoản cho người thắng:"}
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`VietQR ${vnd(amount)}`} width={220} height={260} className="rounded-xl bg-white" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="muted">Ngân hàng</dt>
          <dd className="font-medium">{BANK}</dd>
          <dt className="muted">Số TK</dt>
          <dd className="font-medium">{ACC}</dd>
          <dt className="muted">Chủ TK</dt>
          <dd className="font-medium">{ACC_NAME}</dd>
          <dt className="muted">Số tiền</dt>
          <dd className="font-bold">{vnd(amount)}</dd>
          <dt className="muted">Nội dung</dt>
          <dd className="font-medium">{info}</dd>
        </dl>
      </div>
    </div>
  );
}
