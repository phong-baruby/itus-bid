-- =========================================================
-- Đấu giá số áo — schema v2 (Google login, cấu hình chung)
-- Chạy toàn bộ file này trong Supabase > SQL Editor.
-- ⚠ File này XOÁ dữ liệu cũ của bản v1 (bảng players/PIN) nếu có.
-- =========================================================

-- ---------- Dọn bản v1 ----------
drop view if exists public.jersey_board;
drop function if exists public.place_bid(uuid, uuid, text, int);
drop function if exists public.verify_pin(uuid, text);
drop function if exists public._check_pin(uuid, text);
drop function if exists public.admin_upsert_player(text, text);
drop table if exists public.bids cascade;
drop table if exists public.player_secrets cascade;
drop table if exists public.players cascade;
drop table if exists public.jerseys cascade;

-- ---------- Bảng ----------
-- Hồ sơ người chơi, tự tạo khi đăng nhập Google lần đầu
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  avatar_url text,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cấu hình chung của cả cuộc đấu giá (đúng 1 dòng)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  start_price int not null default 50000 check (start_price >= 0),
  min_increment int not null default 10000 check (min_increment > 0),
  ends_at timestamptz not null default (now() + interval '3 days'),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Mỗi số áo bị trùng = 1 phiên (1 tab)
create table public.jerseys (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number between 0 and 99),
  note text,                       -- vd: "Đăng ký: Tuấn, Hùng, Long"
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bids (
  id bigint generated always as identity primary key,
  jersey_id uuid not null references public.jerseys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index bids_jersey_amount_idx on public.bids (jersey_id, amount desc, created_at);
create index bids_user_idx on public.bids (user_id);

-- ---------- Tự tạo profile khi user Google đăng nhập lần đầu ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, 'Ẩn danh'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bổ sung profile cho user đã đăng nhập trước khi chạy file này
insert into public.profiles (id, email, name, avatar_url)
select u.id, coalesce(u.email, ''),
       coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(coalesce(u.email, 'Ẩn danh'), '@', 1)),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ---------- View bảng đấu giá ----------
create or replace view public.jersey_board with (security_invoker = true) as
select
  j.id, j.number, j.note, j.paid, j.created_at,
  top.amount   as current_price,
  top.user_id  as leader_id,
  p.name       as leader_name,
  p.avatar_url as leader_avatar,
  (select count(*)::int from public.bids b where b.jersey_id = j.id) as bid_count
from public.jerseys j
left join lateral (
  select b.amount, b.user_id
  from public.bids b
  where b.jersey_id = j.id
  order by b.amount desc, b.created_at asc
  limit 1
) top on true
left join public.profiles p on p.id = top.user_id;

-- ---------- RLS: client chỉ đọc, mọi thao tác ghi qua function / API admin ----------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.jerseys  enable row level security;
alter table public.bids     enable row level security;

drop policy if exists "read profiles" on public.profiles;
drop policy if exists "read settings" on public.settings;
drop policy if exists "read jerseys"  on public.jerseys;
drop policy if exists "read bids"     on public.bids;
create policy "read profiles" on public.profiles for select using (true);
create policy "read settings" on public.settings for select using (true);
create policy "read jerseys"  on public.jerseys  for select using (true);
create policy "read bids"     on public.bids     for select using (true);

-- Email chỉ admin (service_role) đọc được; người chơi chỉ thấy tên + avatar
revoke select on public.profiles from anon, authenticated;
grant select (id, name, avatar_url) on public.profiles to anon, authenticated;
revoke insert, update, delete on public.profiles, public.settings, public.jerseys, public.bids from anon, authenticated;

-- ---------- Functions ----------
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;

-- Trả giá. Khoá dòng settings => mọi lượt trả giá xếp hàng tuần tự:
-- không thể 2 người thắng cùng mức giá, không thể 1 người "lách" dẫn 2 số cùng lúc.
create or replace function public.place_bid(p_jersey_id uuid, p_amount int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.settings%rowtype;
  v_number int;
  v_top int;
  v_top_user uuid;
  v_min int;
  v_other int;
  v_extended boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Bạn cần đăng nhập Google để trả giá', 'code', 'auth');
  end if;
  if exists (select 1 from public.profiles where id = v_uid and blocked) then
    return jsonb_build_object('ok', false, 'error', 'Tài khoản đã bị admin chặn trả giá');
  end if;

  select * into s from public.settings where id = 1 for update;
  if now() >= s.ends_at then
    return jsonb_build_object('ok', false, 'error', 'Cuộc đấu giá đã kết thúc');
  end if;

  select number into v_number from public.jerseys where id = p_jersey_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Không tìm thấy số áo này'); end if;

  select amount, user_id into v_top, v_top_user
    from public.bids where jersey_id = p_jersey_id
    order by amount desc, created_at asc limit 1;

  if v_top_user = v_uid then
    return jsonb_build_object('ok', false, 'error', 'Bạn đang giữ giá cao nhất số này rồi');
  end if;

  -- Luật: mỗi người chỉ dẫn đầu 1 số tại 1 thời điểm
  select jb.number into v_other
    from public.jersey_board jb
   where jb.leader_id = v_uid and jb.id <> p_jersey_id
   limit 1;
  if v_other is not null then
    return jsonb_build_object('ok', false, 'code', 'leading_other', 'other', v_other,
      'error', 'Bạn đang dẫn đầu số ' || v_other || '. Mỗi người chỉ giữ 1 số tại 1 thời điểm — chờ ai đó trả cao hơn ở số ' || v_other || ' nhé');
  end if;

  v_min := coalesce(v_top + s.min_increment, s.start_price);
  if p_amount < v_min then
    return jsonb_build_object('ok', false, 'min', v_min,
      'error', 'Giá tối thiểu hiện tại là ' || replace(to_char(v_min, 'FM999,999,999'), ',', '.') || 'đ');
  end if;

  insert into public.bids (jersey_id, user_id, amount) values (p_jersey_id, v_uid, p_amount);

  -- Chống "bắn tỉa": trả giá trong 2 phút cuối => deadline CHUNG lùi thêm 2 phút
  if s.ends_at - now() < interval '2 minutes' then
    update public.settings set ends_at = now() + interval '2 minutes', updated_at = now() where id = 1;
    v_extended := true;
  end if;

  return jsonb_build_object('ok', true, 'extended', v_extended);
end $$;

revoke all on function public.place_bid(uuid, int)   from public, anon;
grant execute on function public.place_bid(uuid, int) to authenticated;
grant execute on function public.server_time()        to anon, authenticated;

-- ---------- Realtime ----------
do $$ begin alter publication supabase_realtime add table public.bids;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.jerseys;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.settings; exception when duplicate_object then null; end $$;
