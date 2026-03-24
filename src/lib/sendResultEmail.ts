import { Resend } from 'resend';
import { MUSCLES, QUESTIONS, transformScore } from './questions';
import { generateResultPdfBuffer } from './generateResultPdf';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

interface MuscleScore {
  muscleIndex: number;
  muscleName: string;
  individual: number;
  organization: number;
}

function getQuadrantLabel(ind: number, org: number): string {
  if (ind >= 3.0 && org >= 3.0) return '発揮できている';
  if (ind >= 3.0 && org < 3.0) return '環境が阻害中';
  if (ind < 3.0 && org >= 3.0) return '個人が課題';
  return '両方に課題';
}

function getQuadrantColor(ind: number, org: number): string {
  if (ind >= 3.0 && org >= 3.0) return '#16a34a';
  if (ind >= 3.0 && org < 3.0) return '#d97706';
  if (ind < 3.0 && org >= 3.0) return '#2563eb';
  return '#dc2626';
}

function scoreBar(score: number, color: string): string {
  const pct = Math.round((score / 5) * 100);
  return `<div style="background:#f1f5f9;border-radius:4px;height:8px;width:100%;"><div style="background:${color};border-radius:4px;height:8px;width:${pct}%;"></div></div>`;
}

function buildHtml(
  organizationName: string,
  respondentName: string,
  scores: MuscleScore[],
): string {
  const avgInd = scores.reduce((s, sc) => s + sc.individual, 0) / scores.length;
  const avgOrg = scores.reduce((s, sc) => s + sc.organization, 0) / scores.length;

  const sortedByInd = [...scores].sort((a, b) => b.individual - a.individual);
  const top2 = sortedByInd.slice(0, 2).map(s => `「${s.muscleName}」`).join('・');
  const bottom2 = sortedByInd.slice(-2).reverse().map(s => `「${s.muscleName}」`).join('・');

  const scoreRows = scores.map(s => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 12px;font-size:13px;color:#334155;white-space:nowrap;">${s.muscleName}</td>
      <td style="padding:10px 12px;min-width:80px;">
        <div style="font-size:12px;color:#64748b;margin-bottom:4px;">個人 <strong style="color:#2563eb;">${s.individual.toFixed(2)}</strong></div>
        ${scoreBar(s.individual, '#2563eb')}
      </td>
      <td style="padding:10px 12px;min-width:80px;">
        <div style="font-size:12px;color:#64748b;margin-bottom:4px;">組織 <strong style="color:#16a34a;">${s.organization.toFixed(2)}</strong></div>
        ${scoreBar(s.organization, '#16a34a')}
      </td>
      <td style="padding:10px 12px;white-space:nowrap;">
        <span style="font-size:11px;font-weight:600;color:${getQuadrantColor(s.individual, s.organization)};background:${getQuadrantColor(s.individual, s.organization)}18;padding:2px 8px;border-radius:99px;">
          ${getQuadrantLabel(s.individual, s.organization)}
        </span>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

      <!-- Header -->
      <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:24px 28px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;letter-spacing:0.05em;">デモクラシーフィットネス診断</p>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${organizationName}</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;">${respondentName} さんの診断結果</p>
      </td></tr>

      <!-- Summary cards -->
      <tr><td style="background:#ffffff;padding:24px 28px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding-right:8px;">
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.05em;">個人スコア平均</p>
                <p style="margin:0;font-size:32px;font-weight:800;color:#1d4ed8;">${avgInd.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">/ 5.00</p>
              </div>
            </td>
            <td width="50%" style="padding-left:8px;">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;">組織スコア平均</p>
                <p style="margin:0;font-size:32px;font-weight:800;color:#15803d;">${avgOrg.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">/ 5.00</p>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Feedback highlights -->
      <tr><td style="background:#ffffff;padding:20px 28px 0;">
        <div style="background:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:16px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#854d0e;">あなたの診断ハイライト</p>
          <p style="margin:0 0 8px;font-size:13px;color:#713f12;">
            <strong style="color:#15803d;">強み：</strong>${top2} が特に高いスコアを示しています。
          </p>
          <p style="margin:0;font-size:13px;color:#713f12;">
            <strong style="color:#b45309;">成長ポイント：</strong>${bottom2} は伸びしろのある領域です。
          </p>
        </div>
      </td></tr>

      <!-- Score table -->
      <tr><td style="background:#ffffff;padding:20px 28px;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e293b;">筋肉別スコア（10項目）</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:separate;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-align:left;">筋肉</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#2563eb;text-align:left;">個人</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#16a34a;text-align:left;">組織</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-align:left;">診断</th>
            </tr>
          </thead>
          <tbody>${scoreRows}</tbody>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f1f5f9;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#475569;">デモクラ筋診断</p>
        <p style="margin:0;font-size:11px;color:#94a3b8;">きづきくみたて工房</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function computeScoresFromAnswers(answers: Record<string, number>): Promise<MuscleScore[]> {
  return MUSCLES.map(muscle => {
    const layer1Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 1);
    const layer2Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 2);

    const indScores = layer1Questions.map(q => transformScore(answers[q.id] ?? 3, q.reversed));
    const individual = indScores.reduce((s, v) => s + v, 0) / indScores.length;

    const orgScores = layer2Questions.map(q => transformScore(answers[q.id] ?? 3, q.reversed));
    const organization = orgScores.reduce((s, v) => s + v, 0) / orgScores.length;

    return { muscleIndex: muscle.index, muscleName: muscle.name, individual, organization };
  });
}

export async function sendResultEmail({
  to,
  organizationName,
  respondentName,
  answers,
  avgScores,
}: {
  to: string;
  organizationName: string;
  respondentName: string;
  answers: Record<string, number>;
  avgScores?: MuscleScore[] | null;
}) {
  const scores = await computeScoresFromAnswers(answers);
  const name = respondentName || '回答者';
  const html = buildHtml(organizationName, name, scores);

  // PDF生成（失敗してもメール本文は送る）
  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await generateResultPdfBuffer({
      organizationName,
      respondentName: name,
      scores,
      avgScores: avgScores ?? null,
    });
  } catch (e) {
    console.error('PDF generation failed (non-fatal):', e);
  }

  const attachments = pdfBuffer
    ? [{ filename: `${organizationName}_診断結果.pdf`, content: pdfBuffer }]
    : [];

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `【デモクラ筋診断】${organizationName} の診断結果`,
    html,
    attachments,
  });

  if (error) {
    console.error('sendResultEmail error:', error);
    throw error;
  }
}
