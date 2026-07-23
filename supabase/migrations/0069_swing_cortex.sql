-- 0069_swing_cortex.sql
-- SWING CORTEX — コーチング診断SaaS（GOLF WING Finder後継 / docs/modules/swing-cortex/SYSTEM.md）
--
-- 目的: 症状→原因/対処/生徒向け説明の診断ナレッジをGenesis共有DBに蓄積し、
--       WING NOTEの実レッスンコメントをAI/ルールで構造化して自己増殖させる（データフライホイール）。
--   (1) sc_symptoms      … 症状マスタ（球筋/体の動き/コースマネジメント）
--   (2) sc_checkpoints   … 症状ごとの確認項目（優先度順）
--   (3) sc_knowledge     … 3点セット（原因/対処/ドリル/生徒向け説明）
--   (4) sc_import_batches… 取込履歴（Excel/コメント）
--   (5) sc_comments      … 取込した生コメント＋ルール分類タグ（解析の原料）
--   (6) sc_patterns      … 局面×症状の集計（診断候補の並び最適化の源泉）
--   (7) sc_diagnoses     … 診断ログ（誰がいつ何を診てLINE送信したか）
--   (8) sc_feedback      … 効いた/効かない（重み付けの源泉）
--   (9) sc_favorites     … コーチ別お気に入り
-- 追加のみ（DECISIONS #2）。RLSはテナント標準（app.current_company_id()）。
-- service_role[adminクライアント]はRLSバイパス。関数を足す場合はEXECUTE付与必須（DB権限監査の教訓）。

-- ============ 1. 症状マスタ ============
create table if not exists sc_symptoms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  category text not null,                 -- 球筋 / 体の動き / コースマネジメント 等
  name text not null,                     -- スライス, 猫背 ...
  flight_dir text,                        -- 右に曲がる 等（表示補助）
  tags text[] not null default '{}',      -- 検索・分類タグ
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_symptoms_company on sc_symptoms (company_id, category, sort_order) where deleted_at is null;

-- ============ 2. 確認項目（優先度順） ============
create table if not exists sc_checkpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  symptom_id uuid not null references sc_symptoms(id) on delete cascade,
  priority int not null default 1,        -- No.1, No.2 ...
  title text not null,                    -- スタンス・アライメント 等
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_checkpoints_symptom on sc_checkpoints (symptom_id, priority) where deleted_at is null;

-- ============ 3. 3点セット本体 ============
create table if not exists sc_knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  checkpoint_id uuid not null references sc_checkpoints(id) on delete cascade,
  cause text not null,                    -- 原因
  fix text not null,                      -- 改善・対処法
  drill text,                             -- おすすめドリル
  client_explanation text not null,       -- お客様への説明（そのまま送れる）
  source text not null default 'manual'   -- manual / ai / seed / import
    check (source in ('manual','ai','seed','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_knowledge_checkpoint on sc_knowledge (checkpoint_id) where deleted_at is null;

-- ============ 4. 取込バッチ ============
create table if not exists sc_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  source text not null default 'excel',   -- excel / lesson-os / manual
  filename text,
  row_count int not null default 0,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sc_import_batches_company on sc_import_batches (company_id, created_at desc);

-- ============ 5. 生コメント（解析の原料） ============
create table if not exists sc_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  batch_id uuid references sc_import_batches(id) on delete set null,
  external_id text,                       -- WING NOTEのレコードID（重複取込の抑止に利用可）
  coach_name text,
  student_ref text,                       -- 顧客レコードID等（member_codeと将来突合）
  course text,
  body text not null,
  phases text[] not null default '{}',    -- ルール分類したスイング局面
  symptom_key text,                       -- ルール推定した主症状
  created_at timestamptz not null default now()
);
create index if not exists idx_sc_comments_company on sc_comments (company_id, created_at desc);
create index if not exists idx_sc_comments_batch on sc_comments (batch_id);

-- ============ 6. 局面×症状の集計 ============
create table if not exists sc_patterns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  phase text not null,                    -- テイクバック/BS 等
  symptom_key text not null,              -- スライス 等
  freq int not null default 0,            -- 出現回数
  weight numeric not null default 0,      -- freq × コーチ支持 × 生徒改善（後続で更新）
  updated_at timestamptz not null default now(),
  unique (company_id, phase, symptom_key)
);
create index if not exists idx_sc_patterns_company on sc_patterns (company_id, freq desc);

-- ============ 7. 診断ログ ============
create table if not exists sc_diagnoses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  coach_staff_id uuid references staff(id),
  symptom_id uuid references sc_symptoms(id),
  student_ref text,                       -- lesson-os生徒 or member_code（疎結合）
  input_text text,                        -- コーチが打ち込んだ症状文
  result_json jsonb not null default '{}'::jsonb,
  sent_line boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_sc_diagnoses_company on sc_diagnoses (company_id, created_at desc);

-- ============ 8. フィードバック ============
create table if not exists sc_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  diagnosis_id uuid references sc_diagnoses(id) on delete cascade,
  outcome text not null check (outcome in ('worked','na','worse')),
  note text,
  created_at timestamptz not null default now()
);

-- ============ 9. お気に入り ============
create table if not exists sc_favorites (
  company_id uuid not null references companies(id),
  coach_staff_id uuid not null references staff(id),
  knowledge_id uuid not null references sc_knowledge(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_staff_id, knowledge_id)
);

-- ============ updated_at トリガ ============
do $$
declare t text;
begin
  foreach t in array array['sc_symptoms','sc_checkpoints','sc_knowledge'] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- ============ RLS（テナント標準） ============
alter table sc_symptoms       enable row level security;
alter table sc_checkpoints    enable row level security;
alter table sc_knowledge      enable row level security;
alter table sc_import_batches enable row level security;
alter table sc_comments       enable row level security;
alter table sc_patterns       enable row level security;
alter table sc_diagnoses      enable row level security;
alter table sc_feedback       enable row level security;
alter table sc_favorites      enable row level security;
do $$
declare t text;
begin
  foreach t in array array[
    'sc_symptoms','sc_checkpoints','sc_knowledge','sc_import_batches',
    'sc_comments','sc_patterns','sc_diagnoses','sc_feedback','sc_favorites'
  ] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============ シード（starter知識 / 全テナントに配布） ============
-- SYSTEM.md「業界標準の種知識を共有シードとして提供」。既存があればスキップ（冪等）。
-- 自社5,939件の実コメントから一般化した最小セット。取込・AI解析で各テナントが上書き拡張する。
do $$
declare
  c record;
  v_sym uuid;
  v_cp uuid;
  sym record;
  cp record;
begin
  for c in select id as company_id from companies loop
    -- 既にこの会社にシード投入済みならスキップ
    if exists (select 1 from sc_symptoms s where s.company_id = c.company_id) then
      continue;
    end if;

    for sym in
      select * from (values
        ('球筋','スライス','右に曲がる', array['右に曲がる','アウトサイドイン'], 10),
        ('球筋','フック','左に曲がる', array['左に曲がる','インサイドアウト'], 20),
        ('体の動き','アドレス姿勢の不良','アドレス', array['アドレス','猫背','前傾'], 30),
        ('体の動き','捻転不足','回転・体重移動', array['捻転','軸回転'], 40),
        ('コースマネジメント','コースでのOBが多い','スコア', array['コースマネジメント'], 50)
      ) as v(category,name,flight_dir,tags,sort_order)
    loop
      insert into sc_symptoms (company_id, category, name, flight_dir, tags, sort_order, active)
      values (c.company_id, sym.category, sym.name, sym.flight_dir, sym.tags::text[], sym.sort_order, true)
      returning id into v_sym;

      for cp in
        select * from (values
          ('スライス','スタンス・アライメント',1,
            'オープンスタンスで外から内への軌道（カット軌道）になりフェースが開く',
            '目標にスクエアに立つ。肩・腰・つま先のラインを平行に',
            'アライメントスティックを2本置き、足と目標線を平行に確認する',
            '今はオープンに立つ癖でボールが右に逃げやすい状態です。まずは目標にまっすぐ立つことから整えていきましょう。'),
          ('スライス','グリップ',2,
            'ウィークグリップでインパクトでフェースが開いて戻る',
            '左手を少し被せてスクエア〜ややストロングに。左手甲が目標を向く形',
            'ハーフスイングでフェースの向きをチェックしながら10球',
            'グリップがやや薄く、当たる瞬間にフェースが開きやすいです。握りを少し整えると自然にボールがつかまります。'),
          ('フック','グリップ',1,
            'ストロンググリップでフェースが被る',
            '左手をやや戻しスクエアへ',
            '左手甲が正面を向く位置でハーフスイング',
            '握りが強くフェースが被りやすい状態です。少し戻すと左への引っかけが減ります。'),
          ('アドレス姿勢の不良','猫背',1,
            '背中が丸まった猫背のアドレスで重心が高くなりスイング軸が不安定、右肩がインパクトで前に出やすくなる',
            '胸を張って背筋を伸ばしたアドレスを取り、お尻を少し後ろに引いた姿勢でスイング軸を安定させる',
            'クラブを背中に当て、頭・背中・お尻の3点を一直線にして前傾',
            '背中が丸まると軸がぶれやすく、右肩が前に出てミスに繋がります。胸を張った姿勢を作ることを優先しましょう。'),
          ('捻転不足','腕引きのテイクバック',1,
            '腕でインに引いてしまい正しく軸回転ができず捻転不足になる',
            'バックスイングは腕と体を同調させ、股関節の内側で肩を捻転させる',
            '両手クロスドリル・足踏みドリルで同調感を作る',
            '腕だけで上げると体がねじれず力が伝わりません。体と腕を一緒に動かす感覚を優先しましょう。'),
          ('コースでのOBが多い','ターゲット選択',1,
            '安全な方向を無視してピンを狙いすぎる、またはリスクのある番手を選択している',
            '外側のバンカーや林など大きなハザードを避け、広いゾーンを目標にする',
            '各ホールで入れてはいけない場所を先に決めてから狙いを定める',
            'ピンを狙いすぎてOBが増えています。フェアウェイの広い部分を狙うだけで大きく改善します。')
        ) as v(sym_name,title,priority,cause,fix,drill,client)
        where sym.name = v.sym_name
        order by priority
      loop
        insert into sc_checkpoints (company_id, symptom_id, priority, title)
        values (c.company_id, v_sym, cp.priority, cp.title)
        returning id into v_cp;

        insert into sc_knowledge (company_id, checkpoint_id, cause, fix, drill, client_explanation, source)
        values (c.company_id, v_cp, cp.cause, cp.fix, cp.drill, cp.client, 'seed');
      end loop;
    end loop;
  end loop;
end $$;
