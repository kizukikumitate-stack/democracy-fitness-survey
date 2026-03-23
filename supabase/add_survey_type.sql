-- responsesテーブルにsurvey_typeカラムを追加
-- 'attitude'（意識調査）または 'behavior'（行動実績）
-- 既存レコードはattitudeとして扱う

ALTER TABLE responses
ADD COLUMN IF NOT EXISTS survey_type TEXT DEFAULT 'attitude';
