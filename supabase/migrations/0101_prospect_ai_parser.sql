-- 0101_prospect_ai_parser.sql
-- 一覧ページの読み取りにAIを使えるようにする（DECISIONS #117）
--
-- 正規表現での抽出はサイトごとのHTML構造に依存し、#114では「詳細ページに見出しが無く
-- titleが全ページ共通」という構造で全滅した。読み取りだけをAIに任せれば、
-- どんな構造の名簿・ディレクトリでも設定なしで拾える＝他業種へ応用できる。
--
-- ⚠ AIに「探させ」はしない。渡したHTMLに書かれていることを写させるだけ。
--    列挙をAIにさせると実在しない事業所を作り、営業リストに架空の宛先が混ざる。

alter table prs_sources
  add column if not exists parser text not null default 'auto';

alter table prs_sources
  drop constraint if exists prs_sources_parser_chk;
alter table prs_sources
  add constraint prs_sources_parser_chk check (parser in ('auto', 'rules', 'ai'));

comment on column prs_sources.parser is
  '一覧ページの読み取り方。auto=規則で試しダメならAI（既定）／rules=規則のみ／ai=最初からAI。AIは「HTMLに書かれていることを写す」だけで、探させはしない（#117）';
