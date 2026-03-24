import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import path from 'path';

// ===== 型定義 =====
export interface MuscleScore {
  muscleIndex: number;
  muscleName: string;
  individual: number;
  organization: number;
}

// ===== フォント登録 =====
let fontRegistered = false;
function ensureFont() {
  if (fontRegistered) return;
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf');
  Font.register({ family: 'JP', src: fontPath });
  Font.register({ family: 'JP', src: fontPath, fontWeight: 'bold' });
  fontRegistered = true;
}

// ===== スタイル =====
const S = StyleSheet.create({
  page: { fontFamily: 'JP', backgroundColor: '#f8fafc', padding: 0 },

  // ヘッダー
  header: { backgroundColor: '#1e293b', padding: '20 28', marginBottom: 0 },
  headerSub: { fontSize: 8, color: '#94a3b8', marginBottom: 3, letterSpacing: 0.5 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#ffffff', marginBottom: 2 },
  headerName: { fontSize: 10, color: '#cbd5e1' },

  body: { padding: '14 28 20' },

  // サマリーカード
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  card: { flex: 1, borderRadius: 8, padding: '10 12', border: '1 solid' },
  cardBlue: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  cardGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  cardLabel: { fontSize: 7, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 4 },
  cardLabelBlue: { color: '#2563eb' },
  cardLabelGreen: { color: '#16a34a' },
  cardScore: { fontSize: 24, fontWeight: 'bold', marginBottom: 2 },
  cardScoreBlue: { color: '#1d4ed8' },
  cardScoreGreen: { color: '#15803d' },
  cardAvg: { fontSize: 8, color: '#64748b' },
  cardDiff: { fontSize: 8, marginTop: 2 },

  // セクション
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },

  // 筋肉スコア表
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottom: '0.5 solid #f1f5f9' },
  tableMuscleName: { width: 70, fontSize: 9, color: '#334155' },
  tableScoreBlock: { flex: 1, marginRight: 6 },
  tableScoreLabel: { fontSize: 7, color: '#64748b', marginBottom: 2 },
  barBg: { backgroundColor: '#e2e8f0', borderRadius: 2, height: 6, width: '100%' },
  barFill: { borderRadius: 2, height: 6 },
  barBlue: { backgroundColor: '#2563eb' },
  barGreen: { backgroundColor: '#16a34a' },
  barOrange: { backgroundColor: '#f59e0b' },
  tableQuadrant: { width: 60, fontSize: 7, fontWeight: 'bold', textAlign: 'center', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 4 },

  // フィードバック
  feedbackBox: { borderRadius: 8, padding: '10 12', marginBottom: 6, border: '1 solid' },
  feedbackYellow: { backgroundColor: '#fefce8', borderColor: '#fef08a' },
  feedbackTitle: { fontSize: 8, fontWeight: 'bold', color: '#854d0e', marginBottom: 5 },
  feedbackRow: { flexDirection: 'row', marginBottom: 3 },
  feedbackBadge: { fontSize: 7, fontWeight: 'bold', borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5, marginRight: 6, alignSelf: 'flex-start' },
  feedbackBadgeBlue: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  feedbackBadgeYellow: { backgroundColor: '#fef9c3', color: '#854d0e' },
  feedbackBadgeGreen: { backgroundColor: '#dcfce7', color: '#15803d' },
  feedbackBadgeRed: { backgroundColor: '#fee2e2', color: '#b91c1c' },
  feedbackText: { fontSize: 8, color: '#713f12', flex: 1, lineHeight: 1.4 },

  // 全体比較セクション
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottom: '0.5 solid #f1f5f9' },
  compareName: { width: 70, fontSize: 9, color: '#334155' },
  compareBarBlock: { flex: 1, marginRight: 8 },
  compareScoreText: { width: 32, fontSize: 8, textAlign: 'right' },
  compareDiffText: { width: 38, fontSize: 8, textAlign: 'right' },

  footer: { borderTop: '0.5 solid #e2e8f0', marginTop: 10, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#94a3b8' },
});

// ===== ヘルパー =====
function clamp(v: number) { return Math.min(Math.max(v, 0), 100); }
function pct(score: number) { return clamp(Math.round((score / 5) * 100)); }
function quadrantLabel(ind: number, org: number) {
  if (ind >= 3 && org >= 3) return '発揮できている';
  if (ind >= 3 && org < 3) return '環境が阻害中';
  if (ind < 3 && org >= 3) return '個人が課題';
  return '両方に課題';
}
function quadrantStyle(ind: number, org: number) {
  if (ind >= 3 && org >= 3) return { backgroundColor: '#dcfce7', color: '#15803d' };
  if (ind >= 3 && org < 3) return { backgroundColor: '#fef3c7', color: '#b45309' };
  if (ind < 3 && org >= 3) return { backgroundColor: '#dbeafe', color: '#1d4ed8' };
  return { backgroundColor: '#fee2e2', color: '#b91c1c' };
}
function diffColor(diff: number) {
  if (diff >= 0.1) return '#15803d';
  if (diff <= -0.1) return '#dc2626';
  return '#94a3b8';
}
function diffText(diff: number) {
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}`;
}

// ===== PDF コンポーネント =====
function ResultDocument({
  organizationName,
  respondentName,
  scores,
  avgScores,
  surveyDate,
}: {
  organizationName: string;
  respondentName: string;
  scores: MuscleScore[];
  avgScores: MuscleScore[] | null;
  surveyDate: string;
}) {
  const avgInd = scores.reduce((s, sc) => s + sc.individual, 0) / scores.length;
  const avgOrg = scores.reduce((s, sc) => s + sc.organization, 0) / scores.length;

  const groupAvgInd = avgScores ? avgScores.reduce((s, sc) => s + sc.individual, 0) / avgScores.length : null;
  const groupAvgOrg = avgScores ? avgScores.reduce((s, sc) => s + sc.organization, 0) / avgScores.length : null;

  const sortedByInd = [...scores].sort((a, b) => b.individual - a.individual);
  const top2 = sortedByInd.slice(0, 2);
  const bottom2 = sortedByInd.slice(-2).reverse();

  // 全体平均比で際立つ筋肉
  const aboveAvg = avgScores
    ? scores
        .map(s => ({ ...s, diff: s.individual - (avgScores.find(a => a.muscleIndex === s.muscleIndex)?.individual ?? s.individual) }))
        .filter(s => s.diff >= 0.3)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 2)
    : [];
  const belowAvg = avgScores
    ? scores
        .map(s => ({ ...s, diff: s.individual - (avgScores.find(a => a.muscleIndex === s.muscleIndex)?.individual ?? s.individual) }))
        .filter(s => s.diff <= -0.3)
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 2)
    : [];

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ヘッダー */}
        <View style={S.header}>
          <Text style={S.headerSub}>デモクラシーフィットネス診断</Text>
          <Text style={S.headerTitle}>{organizationName}</Text>
          <Text style={S.headerName}>{respondentName} さんの診断結果レポート　{surveyDate}</Text>
        </View>

        <View style={S.body}>
          {/* サマリーカード */}
          <View style={S.summaryRow}>
            <View style={[S.card, S.cardBlue]}>
              <Text style={[S.cardLabel, S.cardLabelBlue]}>個人スコア平均</Text>
              <Text style={[S.cardScore, S.cardScoreBlue]}>{avgInd.toFixed(2)}</Text>
              {groupAvgInd !== null && (
                <>
                  <Text style={S.cardAvg}>全体平均 {groupAvgInd.toFixed(2)}</Text>
                  <Text style={[S.cardDiff, { color: diffColor(avgInd - groupAvgInd) }]}>
                    全体比 {diffText(avgInd - groupAvgInd)}
                  </Text>
                </>
              )}
            </View>
            <View style={[S.card, S.cardGreen]}>
              <Text style={[S.cardLabel, S.cardLabelGreen]}>組織スコア平均</Text>
              <Text style={[S.cardScore, S.cardScoreGreen]}>{avgOrg.toFixed(2)}</Text>
              {groupAvgOrg !== null && (
                <>
                  <Text style={S.cardAvg}>全体平均 {groupAvgOrg.toFixed(2)}</Text>
                  <Text style={[S.cardDiff, { color: diffColor(avgOrg - groupAvgOrg) }]}>
                    全体比 {diffText(avgOrg - groupAvgOrg)}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* 筋肉別スコア（個人 vs 全体平均） */}
          <Text style={S.sectionTitle}>筋肉別スコア詳細</Text>
          {scores.map(s => {
            const avgS = avgScores?.find(a => a.muscleIndex === s.muscleIndex);
            const diff = avgS ? s.individual - avgS.individual : null;
            return (
              <View key={s.muscleIndex} style={S.tableRow}>
                <Text style={S.tableMuscleName}>{s.muscleName}</Text>

                {/* 個人スコアバー */}
                <View style={S.tableScoreBlock}>
                  <Text style={S.tableScoreLabel}>個人 {s.individual.toFixed(2)}{diff !== null ? `  全体比 ${diffText(diff)}` : ''}</Text>
                  <View style={S.barBg}>
                    <View style={[S.barFill, S.barBlue, { width: `${pct(s.individual)}%` }]} />
                  </View>
                  {avgS && (
                    <>
                      <Text style={[S.tableScoreLabel, { marginTop: 3 }]}>全体平均 {avgS.individual.toFixed(2)}</Text>
                      <View style={S.barBg}>
                        <View style={[S.barFill, S.barOrange, { width: `${pct(avgS.individual)}%` }]} />
                      </View>
                    </>
                  )}
                </View>

                {/* 組織スコアバー */}
                <View style={[S.tableScoreBlock, { marginRight: 8 }]}>
                  <Text style={S.tableScoreLabel}>組織 {s.organization.toFixed(2)}</Text>
                  <View style={S.barBg}>
                    <View style={[S.barFill, S.barGreen, { width: `${pct(s.organization)}%` }]} />
                  </View>
                </View>

                {/* 診断 */}
                <Text style={[S.tableQuadrant, quadrantStyle(s.individual, s.organization)]}>
                  {quadrantLabel(s.individual, s.organization)}
                </Text>
              </View>
            );
          })}

          {/* フィードバック */}
          <View style={{ marginTop: 14 }}>
            <Text style={S.sectionTitle}>フィードバック</Text>

            <View style={[S.feedbackBox, S.feedbackYellow]}>
              <Text style={S.feedbackTitle}>個人内の強み・成長ポイント</Text>
              {top2.map(s => (
                <View key={`top-${s.muscleIndex}`} style={S.feedbackRow}>
                  <Text style={[S.feedbackBadge, S.feedbackBadgeBlue]}>強み</Text>
                  <Text style={S.feedbackText}>「{s.muscleName}」はあなたの10筋肉の中で特に発揮されている強みです（{s.individual.toFixed(2)}）。</Text>
                </View>
              ))}
              {bottom2.map(s => (
                <View key={`bot-${s.muscleIndex}`} style={S.feedbackRow}>
                  <Text style={[S.feedbackBadge, S.feedbackBadgeYellow]}>成長</Text>
                  <Text style={S.feedbackText}>「{s.muscleName}」は相対的に伸びしろのある領域です（{s.individual.toFixed(2)}）。</Text>
                </View>
              ))}
            </View>

            {avgScores && (aboveAvg.length > 0 || belowAvg.length > 0) && (
              <View style={[S.feedbackBox, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                <Text style={[S.feedbackTitle, { color: '#334155' }]}>全体平均との比較</Text>
                {aboveAvg.map(s => (
                  <View key={`above-${s.muscleIndex}`} style={S.feedbackRow}>
                    <Text style={[S.feedbackBadge, S.feedbackBadgeGreen]}>平均以上</Text>
                    <Text style={[S.feedbackText, { color: '#334155' }]}>「{s.muscleName}」は全体平均より{diffText(s.diff)}高く、チームの中でも際立った強みです。</Text>
                  </View>
                ))}
                {belowAvg.map(s => (
                  <View key={`below-${s.muscleIndex}`} style={S.feedbackRow}>
                    <Text style={[S.feedbackBadge, S.feedbackBadgeRed]}>要強化</Text>
                    <Text style={[S.feedbackText, { color: '#334155' }]}>「{s.muscleName}」は全体平均より{diffText(s.diff)}低い状態です。チームと合わせて強化を検討してみましょう。</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* フッター */}
          <View style={S.footer}>
            <Text style={S.footerText}>デモクラ筋診断　きづきくみたて工房</Text>
            <Text style={S.footerText}>■個人（青）　■全体平均（橙）　■組織（緑）</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ===== 外部公開関数 =====
export async function generateResultPdfBuffer(params: {
  organizationName: string;
  respondentName: string;
  scores: MuscleScore[];
  avgScores: MuscleScore[] | null;
  surveyDate?: string;
}): Promise<Buffer> {
  ensureFont();
  const date = params.surveyDate ?? new Date().toLocaleDateString('ja-JP');
  const element = React.createElement(ResultDocument, { ...params, surveyDate: date });
  return await renderToBuffer(element as React.ReactElement<DocumentProps>);
}

// renderToBuffer の型宣言補助
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocumentProps = any;
