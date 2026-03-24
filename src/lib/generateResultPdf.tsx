import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

export interface MuscleScore {
  muscleIndex: number;
  muscleName: string;
  individual: number;
  organization: number;
}

// カラー定義
const C = {
  darkBg:   rgb(0.118, 0.157, 0.235), // #1e293b ヘッダー背景
  white:    rgb(1, 1, 1),
  light:    rgb(0.97, 0.98, 0.99),    // #f8fafc ページ背景
  slate500: rgb(0.39, 0.45, 0.55),
  slate700: rgb(0.20, 0.25, 0.34),
  blue600:  rgb(0.145, 0.380, 0.925), // 個人スコアバー
  green600: rgb(0.086, 0.647, 0.259), // 組織スコアバー
  orange:   rgb(0.96, 0.62, 0.04),    // 全体平均バー
  barBg:    rgb(0.886, 0.910, 0.941), // バー背景
  plus:     rgb(0.086, 0.502, 0.235), // +差分
  minus:    rgb(0.863, 0.196, 0.184), // -差分
  neutral:  rgb(0.58, 0.64, 0.70),
};

function clamp01(v: number) { return Math.min(Math.max(v / 5, 0), 1); }

function diffStr(diff: number) {
  return (diff >= 0 ? '+' : '') + diff.toFixed(2);
}

function quadrantLabel(ind: number, org: number) {
  if (ind >= 3 && org >= 3) return '発揮できている';
  if (ind >= 3 && org < 3)  return '環境が阻害中';
  if (ind < 3 && org >= 3)  return '個人が課題';
  return '両方に課題';
}

export async function generateResultPdfBuffer(params: {
  organizationName: string;
  respondentName: string;
  scores: MuscleScore[];
  avgScores: MuscleScore[] | null;
  surveyDate?: string;
}): Promise<Buffer> {
  const { organizationName, respondentName, scores, avgScores, surveyDate } = params;
  const date = surveyDate ?? new Date().toLocaleDateString('ja-JP');

  // フォント読み込み（複数パスを試みる）
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf'),
    path.join(process.cwd(), 'fonts', 'NotoSansJP-Regular.ttf'),
    path.join('/var/task/public/fonts/NotoSansJP-Regular.ttf'), // Vercel Lambda
  ];
  let fontBytes: Buffer | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      fontBytes = fs.readFileSync(p);
      console.log('Font loaded from:', p, 'size:', fontBytes.length);
      break;
    }
  }
  if (!fontBytes) {
    // フォントが見つからない場合はURLから取得
    console.log('Font file not found locally, fetching from URL...');
    const res = await fetch('https://democracy-fitness-survey.vercel.app/fonts/NotoSansJP-Regular.ttf');
    fontBytes = Buffer.from(await res.arrayBuffer());
    console.log('Font fetched from URL, size:', fontBytes.length);
  }

  const pdfDoc = await PDFDocument.create();

  // カスタムフォント（日本語）
  pdfDoc.registerFontkit(fontkit);
  const jpFont = await pdfDoc.embedFont(fontBytes);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  // ===== ヘッダー =====
  const headerH = 70;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: C.darkBg });
  page.drawText('デモクラシーフィットネス診断', { x: 24, y: height - 22, size: 8, font: jpFont, color: rgb(0.58, 0.64, 0.72) });
  page.drawText(organizationName, { x: 24, y: height - 40, size: 16, font: jpFont, color: C.white });
  page.drawText(`${respondentName} さんの診断結果レポート　${date}`, { x: 24, y: height - 58, size: 9, font: jpFont, color: rgb(0.78, 0.83, 0.90) });

  // ===== サマリーカード =====
  const avgInd = scores.reduce((s, sc) => s + sc.individual, 0) / scores.length;
  const avgOrg = scores.reduce((s, sc) => s + sc.organization, 0) / scores.length;
  const groupAvgInd = avgScores ? avgScores.reduce((s, sc) => s + sc.individual, 0) / avgScores.length : null;
  const groupAvgOrg = avgScores ? avgScores.reduce((s, sc) => s + sc.organization, 0) / avgScores.length : null;

  const cardY = height - headerH - 10;
  const cardH = 72;

  // 個人スコアカード（左）
  page.drawRectangle({ x: 24, y: cardY - cardH, width: 260, height: cardH, color: rgb(0.94, 0.97, 1.0), borderColor: rgb(0.75, 0.86, 0.99), borderWidth: 1 });
  page.drawText('個人スコア平均', { x: 36, y: cardY - 18, size: 8, font: jpFont, color: C.blue600 });
  page.drawText(avgInd.toFixed(2), { x: 36, y: cardY - 42, size: 22, font: monoFont, color: C.blue600 });
  if (groupAvgInd !== null) {
    const diff = avgInd - groupAvgInd;
    page.drawText(`全体平均 ${groupAvgInd.toFixed(2)}`, { x: 140, y: cardY - 36, size: 8, font: jpFont, color: C.slate500 });
    page.drawText(`全体比 ${diffStr(diff)}`, { x: 140, y: cardY - 52, size: 8, font: jpFont, color: diff >= 0.05 ? C.plus : diff <= -0.05 ? C.minus : C.neutral });
  }

  // 組織スコアカード（右）
  page.drawRectangle({ x: 308, y: cardY - cardH, width: 260, height: cardH, color: rgb(0.94, 1.0, 0.97), borderColor: rgb(0.73, 0.97, 0.82), borderWidth: 1 });
  page.drawText('組織スコア平均', { x: 320, y: cardY - 18, size: 8, font: jpFont, color: C.green600 });
  page.drawText(avgOrg.toFixed(2), { x: 320, y: cardY - 42, size: 22, font: monoFont, color: C.green600 });
  if (groupAvgOrg !== null) {
    const diff = avgOrg - groupAvgOrg;
    page.drawText(`全体平均 ${groupAvgOrg.toFixed(2)}`, { x: 424, y: cardY - 36, size: 8, font: jpFont, color: C.slate500 });
    page.drawText(`全体比 ${diffStr(diff)}`, { x: 424, y: cardY - 52, size: 8, font: jpFont, color: diff >= 0.05 ? C.plus : diff <= -0.05 ? C.minus : C.neutral });
  }

  // ===== 筋肉別スコア =====
  const tableStartY = cardY - cardH - 20;
  page.drawText('筋肉別スコア詳細', { x: 24, y: tableStartY, size: 10, font: jpFont, color: C.slate700 });

  const rowH = 46;
  const barMaxW = 160;
  const labelX = 24;
  const barX = 110;
  const orgBarX = 310;
  const scoreX = 276;
  const quadrantX = 460;

  scores.forEach((s, i) => {
    const rowY = tableStartY - 14 - i * rowH;
    const avgS = avgScores?.find(a => a.muscleIndex === s.muscleIndex);

    // 行区切り線
    page.drawLine({ start: { x: 24, y: rowY + rowH - 2 }, end: { x: 571, y: rowY + rowH - 2 }, thickness: 0.4, color: rgb(0.94, 0.95, 0.96) });

    // 筋肉名
    page.drawText(s.muscleName, { x: labelX, y: rowY + 28, size: 9, font: jpFont, color: C.slate700 });

    // 個人バー
    page.drawText('個人', { x: barX, y: rowY + 36, size: 7, font: jpFont, color: C.blue600 });
    page.drawRectangle({ x: barX, y: rowY + 26, width: barMaxW, height: 7, color: C.barBg });
    page.drawRectangle({ x: barX, y: rowY + 26, width: barMaxW * clamp01(s.individual), height: 7, color: C.blue600 });

    // 全体平均バー
    if (avgS) {
      page.drawText('全体', { x: barX, y: rowY + 20, size: 7, font: jpFont, color: C.orange });
      page.drawRectangle({ x: barX, y: rowY + 10, width: barMaxW, height: 7, color: C.barBg });
      page.drawRectangle({ x: barX, y: rowY + 10, width: barMaxW * clamp01(avgS.individual), height: 7, color: C.orange });
    }

    // 組織バー
    page.drawText('組織', { x: orgBarX, y: rowY + 36, size: 7, font: jpFont, color: C.green600 });
    page.drawRectangle({ x: orgBarX, y: rowY + 26, width: barMaxW, height: 7, color: C.barBg });
    page.drawRectangle({ x: orgBarX, y: rowY + 26, width: barMaxW * clamp01(s.organization), height: 7, color: C.green600 });

    // スコア数値
    page.drawText(`${s.individual.toFixed(2)}`, { x: scoreX, y: rowY + 28, size: 8, font: monoFont, color: C.blue600 });
    if (avgS) {
      const diff = s.individual - avgS.individual;
      page.drawText(diffStr(diff), { x: scoreX, y: rowY + 16, size: 7, font: monoFont, color: diff >= 0.05 ? C.plus : diff <= -0.05 ? C.minus : C.neutral });
    }

    // 象限ラベル
    const qlabel = quadrantLabel(s.individual, s.organization);
    page.drawText(qlabel, { x: quadrantX, y: rowY + 24, size: 7, font: jpFont, color: C.slate500 });
  });

  // ===== フィードバック =====
  const fbStartY = tableStartY - 14 - scores.length * rowH - 10;
  page.drawLine({ start: { x: 24, y: fbStartY + 14 }, end: { x: 571, y: fbStartY + 14 }, thickness: 0.5, color: rgb(0.88, 0.91, 0.94) });
  page.drawText('フィードバック', { x: 24, y: fbStartY, size: 10, font: jpFont, color: C.slate700 });

  // --- 結果ページと同じロジック ---
  const ownAvgInd = scores.reduce((s, sc) => s + sc.individual, 0) / scores.length;
  const sortedByInd = [...scores].sort((a, b) => b.individual - a.individual);

  interface FbLine { group: string; badge: string; text: string; badgeColor: typeof C.blue600 }
  const feedbackLines: FbLine[] = [];

  // 1. 他の筋肉との比較（強み・成長）
  sortedByInd.slice(0, 2).forEach(s => {
    if (s.individual - ownAvgInd >= 0.15) {
      feedbackLines.push({ group: '他の筋肉との比較', badge: '強み', text: `「${s.muscleName}」はあなたの10筋肉の中で最も発揮されている強みです（${s.individual.toFixed(2)}）。この力を活かして周囲との対話でリードしていきましょう。`, badgeColor: C.blue600 });
    }
  });
  sortedByInd.slice(-2).reverse().forEach(s => {
    if (ownAvgInd - s.individual >= 0.15) {
      feedbackLines.push({ group: '他の筋肉との比較', badge: '成長ポイント', text: `「${s.muscleName}」はあなたの筋肉の中で相対的に伸びしろのある領域です（${s.individual.toFixed(2)}）。意識的に取り組むことで全体的なバランスが高まります。`, badgeColor: rgb(0.78, 0.62, 0.04) });
    }
  });

  // 2. 全体平均との比較
  if (avgScores) {
    const avgMap = new Map(avgScores.map(s => [s.muscleIndex, s]));
    const diffs = scores
      .map(s => ({ ...s, diffInd: s.individual - (avgMap.get(s.muscleIndex)?.individual ?? s.individual) }))
      .sort((a, b) => b.diffInd - a.diffInd);
    diffs.filter(s => s.diffInd >= 0.3).slice(0, 2).forEach(s => {
      feedbackLines.push({ group: '全体平均との比較', badge: '平均以上', text: `「${s.muscleName}」は全体平均より+${s.diffInd.toFixed(2)}高く、チームの中でも際立った強みです。他のメンバーへの良い影響が期待できます。`, badgeColor: C.green600 });
    });
    diffs.filter(s => s.diffInd <= -0.3).slice(-2).reverse().forEach(s => {
      feedbackLines.push({ group: '全体平均との比較', badge: '要強化', text: `「${s.muscleName}」は全体平均より${s.diffInd.toFixed(2)}低い状態です。チーム全体と合わせて重点的に強化を検討する価値があります。`, badgeColor: C.minus });
    });
  }

  // 3. 個人と組織のギャップ（同一筋肉内）
  [...scores]
    .sort((a, b) => Math.abs(b.individual - b.organization) - Math.abs(a.individual - a.organization))
    .slice(0, 3)
    .forEach(s => {
      const gap = s.individual - s.organization;
      if (gap >= 0.8) {
        feedbackLines.push({ group: '個人と組織のギャップ', badge: '環境ギャップ', text: `「${s.muscleName}」は個人（${s.individual.toFixed(2)}）に比べ組織（${s.organization.toFixed(2)}）が低い状態です。力が発揮しやすい環境づくりを周囲に働きかけてみましょう。`, badgeColor: rgb(0.549, 0.114, 0.753) });
      } else if (gap <= -0.8) {
        feedbackLines.push({ group: '個人と組織のギャップ', badge: '実践ギャップ', text: `「${s.muscleName}」は組織（${s.organization.toFixed(2)}）に比べ個人（${s.individual.toFixed(2)}）が低い状態です。環境は整っているので、個人的な実践を増やすことで大きく伸びる可能性があります。`, badgeColor: rgb(0.047, 0.592, 0.694) });
      }
    });

  let currentGroup = '';
  let lineOffset = 0;
  feedbackLines.forEach((line) => {
    if (line.group !== currentGroup) {
      currentGroup = line.group;
      lineOffset += (lineOffset === 0 ? 0 : 6);
      page.drawText(line.group, { x: 24, y: fbStartY - 16 - lineOffset, size: 7, font: jpFont, color: C.slate500 });
      lineOffset += 13;
    }
    const lineY = fbStartY - 16 - lineOffset;
    page.drawText(`[${line.badge}]`, { x: 28, y: lineY, size: 7, font: jpFont, color: line.badgeColor });
    page.drawText(line.text, { x: 90, y: lineY, size: 7, font: jpFont, color: C.slate700 });
    lineOffset += 13;
  });

  // ===== 凡例・フッター =====
  const footerY = 20;
  page.drawLine({ start: { x: 24, y: footerY + 14 }, end: { x: 571, y: footerY + 14 }, thickness: 0.4, color: C.barBg });
  page.drawText('デモクラ筋診断　きづきくみたて工房', { x: 24, y: footerY, size: 7, font: jpFont, color: C.neutral });
  page.drawText('■個人（青）　■全体平均（橙）　■組織（緑）', { x: 350, y: footerY, size: 7, font: jpFont, color: C.neutral });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
