# Supabase スキーマ管理

このディレクトリには Supabase の SQL 適用ファイルを置いています。
Supabase CLI は使わず、**Supabase Dashboard の SQL Editor に貼り付けて実行**する運用です。

## 適用済みファイル(歴史)

| ファイル | 内容 |
|---|---|
| `add_survey_type.sql` | responses テーブルに survey_type カラム追加(初期実装) |
| `create_diagnostic_responses.sql` | BEM 個人診断の回答テーブル作成 |

※ `customers` テーブルおよび `event_signups` テーブルは Supabase Dashboard の SQL Editor 上で
直接設計・適用済み。SQL 履歴は SQL Editor の保存クエリ(PRIVATE 配下)に残っている。
代表的な保存クエリ:

- **Customer Master Table** — `customers` の CREATE TABLE
- **Backfill BEM Diagnostic Results into Customers** — diagnostic_responses から customers への
  バックフィル(集計型 upsert)。`/api/diagnostic` の実装はこのパターンの「1件ずつインクリメント」版
- **Kit参加者を顧客・イベントサインアップに取り込み** — イベント参加者の upsert パターン
- **Customer Engagement Metrics Summary** — 顧客の集計分析

---

## 現在のスキーマ概要

### customers (顧客マスタ)

email を一意キーとする顧客台帳。チャネル別のカウンタと最終接触情報を1行で持つ。

| カラム | 型 | 用途 |
|---|---|---|
| email | text unique | キー。`lower(trim(...))` で正規化して入れる |
| name | text | 名前 |
| newsletter_opt_in | boolean | メルマガ同意(スティッキー true) |
| newsletter_consent_source | text | 初回同意のソース(例: `'bem-diagnostic'`) |
| newsletter_consent_at | timestamptz | 初回同意取得日時 |
| resend_synced_at | timestamptz | Resend Audience に同期済みの最終時刻 |
| bem_diagnostic_count | integer | BEM 診断の累積受診回数 |
| bem_diagnostic_last_at | timestamptz | BEM 診断の最終受診日時 |
| bem_diagnostic_last_type | text | 最終診断のタイプ(A〜E) |
| democracy_fitness_count | integer | デモクラ筋診断の累積回数 |
| democracy_fitness_last_at | timestamptz | デモクラ筋診断の最終回答日時 |
| event_count | integer | イベント参加の累積回数 |
| event_last_at | timestamptz | 最終イベント参加日時 |
| event_last_id | text | 最終イベントの event_id |
| attributes | jsonb | 任意の追加属性 |
| notes | text | 自由メモ |
| first_seen_at | timestamptz | 初回接点日時 |
| last_seen_at | timestamptz | 最終接点日時 |
| created_at / updated_at | timestamptz | 自動 |

**RLS**: service_role 経由でのみ操作可能。`/api/diagnostic` 等のサーバーサイド API ルートから
SUPABASE_SERVICE_ROLE_KEY を使って書き込む。

### event_signups (イベント参加履歴)

| カラム | 型 |
|---|---|
| id | uuid PK |
| email | text not null (customers と email で結ぶ) |
| name | text |
| event_id | text not null |
| event_name | text |
| attended | boolean |
| newsletter_opt_in | boolean |
| source | text (default `'event-form-v1'`) |
| metadata | jsonb |
| created_at | timestamptz |

### diagnostic_responses (BEM個人診断の回答ログ)

各回答1件 = 1行。`customers` には email で紐付く(FK は無いが運用上のキー)。

---

## /api/diagnostic の動き

`POST /api/diagnostic` が呼ばれると以下を実行:

1. **customers を email キーで upsert**(SUPABASE_SERVICE_ROLE_KEY 必須):
   - 既存顧客 → `bem_diagnostic_count` を +1、`bem_diagnostic_last_at`/`bem_diagnostic_last_type` を更新、
     `last_seen_at` を更新。メルマガ同意はスティッキー(初回ソース・日時を保持)
   - 新規顧客 → INSERT(bem_diagnostic_count=1、first_seen_at=now())
2. **diagnostic_responses に1件 INSERT**(回答ログ)
3. **メルマガ希望なら Resend Audience に追加**
4. **診断結果メールを Resend で送信**

1〜3 のいずれかが失敗してもメール送信(4)は続行する設計。

---

## 環境変数

`.env.local` に以下が必要:

```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # サーバーサイド専用、絶対に公開しない
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
RESEND_DIAGNOSTIC_AUDIENCE_ID=...
```

Vercel 側にも同じ env vars を登録(Sensitive 扱い)。

---

## 将来の拡張

新しい流入チャネル(例: Tally / Stripe / 名刺手入力)を追加するときは、
`src/app/api/<channel>/route.ts` を新設し、customers テーブルに対して以下のパターンで upsert:

```typescript
// 既存顧客なら増分、新規なら 1 で初期化
const channel_count_field = '<channel>_count';     // 既存スキーマに合わせる
const channel_last_at_field = '<channel>_last_at';
```

イベント系は `event_signups` への INSERT も併用(Kit参加者を顧客・イベントサインアップに取り込み の
保存クエリ参照)。
