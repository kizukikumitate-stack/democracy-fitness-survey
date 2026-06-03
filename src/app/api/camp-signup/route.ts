import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';

const EVENT_ID = 'df-camp-2026-08';
const EVENT_NAME = 'デモクラシーフィットネス キャンプ2026 in 北軽井沢';
const EVENT_DATES = '2026年8月11日（火）〜12日（水）';
const VENUE = 'TAKIVIVA（群馬県・北軽井沢）';
const LP_URL = 'https://kizukikumitate.com/democracy-fitness-camp-0811.html';

// 早割の締切（含む）
const EARLY_BIRD_DEADLINE = '2026-06-30T23:59:59+09:00';

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8181',
  'http://127.0.0.1:8181',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}

/**
 * 価格判定（プログラム参加費。宿泊費は会場TAKIVIVAへ直接支払いのため含まない）:
 *   定価: 42,900円（税込／税抜39,000円）
 *   早割 or ペア割: 35,200円（税込／税抜32,000円）（▼¥7,000）
 *   ペア早割: 26,400円（税込／税抜24,000円）（▼¥15,000）
 */
function determinePricing(hasPair: boolean, signupDate: Date): {
  tier: 'pair-early' | 'early' | 'pair' | 'standard';
  tierLabel: string;
  amount: number;
  amountWithTax: number;
} {
  const isEarly = signupDate <= new Date(EARLY_BIRD_DEADLINE);
  const tier = hasPair && isEarly
    ? 'pair-early'
    : isEarly
      ? 'early'
      : hasPair
        ? 'pair'
        : 'standard';
  const tierLabel = {
    'pair-early': 'ペア早割',
    'early': '早割',
    'pair': 'ペア割',
    'standard': '定価',
  }[tier];
  const amount = {
    'pair-early': 24000,
    'early': 32000,
    'pair': 32000,
    'standard': 39000,
  }[tier];
  const amountWithTax = Math.round(amount * 1.1);
  return { tier, tierLabel, amount, amountWithTax };
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const {
      source,
      name,
      furigana,
      email,
      phone,
      roomType,
      pairPartnerName,
      dietaryRestrictions,
      careNotes,
      emergencyContactName,
      emergencyContactRelation,
      emergencyContactPhone,
      pickupGo,
      pickupBack,
      referralSource,
      pastParticipation,
      consentTerms,
    } = body as Record<string, unknown>;

    // 1. ソース検証
    if (source !== 'camp-signup-v1') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400, headers: cors });
    }

    // 2. 必須項目検証
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '氏名は必須です' }, { status: 400, headers: cors });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400, headers: cors });
    }
    if (typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json({ error: '電話番号は必須です' }, { status: 400, headers: cors });
    }
    if (roomType !== 'rego' && roomType !== 'private') {
      return NextResponse.json({ error: '部屋タイプを選択してください' }, { status: 400, headers: cors });
    }
    if (consentTerms !== true) {
      return NextResponse.json({ error: '参加規約への同意が必要です' }, { status: 400, headers: cors });
    }

    // 3. 入力の正規化
    const trimmedName = name.trim();
    const trimmedFurigana = typeof furigana === 'string' ? furigana.trim() : '';
    const emailNormalized = email.toLowerCase().trim();
    const trimmedPhone = phone.trim();
    const roomTypeLabel = roomType === 'rego' ? 'ReGo（個人スペース）' : '個室';
    const trimmedPairPartner = typeof pairPartnerName === 'string' ? pairPartnerName.trim() : '';
    const hasPair = trimmedPairPartner.length > 0;

    const now = new Date();
    const pricing = determinePricing(hasPair, now);

    // 4. metadata jsonb に詰める（イベント固有フィールド）
    const metadata = {
      furigana: trimmedFurigana || null,
      phone: trimmedPhone,
      roomType,
      roomTypeLabel,
      pairPartnerName: trimmedPairPartner || null,
      dietaryRestrictions: typeof dietaryRestrictions === 'string' ? dietaryRestrictions.trim() : '',
      careNotes: typeof careNotes === 'string' ? careNotes.trim() : '',
      emergencyContact: {
        name: typeof emergencyContactName === 'string' ? emergencyContactName.trim() : '',
        relation: typeof emergencyContactRelation === 'string' ? emergencyContactRelation.trim() : '',
        phone: typeof emergencyContactPhone === 'string' ? emergencyContactPhone.trim() : '',
      },
      pickup: {
        go: typeof pickupGo === 'string' ? pickupGo.trim() : '',
        back: typeof pickupBack === 'string' ? pickupBack.trim() : '',
      },
      referralSource: typeof referralSource === 'string' ? referralSource.trim() : '',
      pastParticipation: pastParticipation === true,
      pricing,
      consentTermsAt: now.toISOString(),
    };

    // 5. Supabase 書き込み（admin client）
    let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      supabaseAdmin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/camp-signup admin client init error:', e);
    }

    if (supabaseAdmin) {
      // 5a. customers upsert（event_count を +1、新規ならINSERT）
      try {
        const nowIso = now.toISOString();
        const { data: existing, error: selErr } = await supabaseAdmin
          .from('customers')
          .select('email, name, event_count, first_seen_at')
          .eq('email', emailNormalized)
          .maybeSingle();
        if (selErr) {
          console.error('POST /api/camp-signup customers select error:', selErr);
        }

        if (existing) {
          const updates: Record<string, unknown> = {
            event_count: (existing.event_count ?? 0) + 1,
            event_last_at: nowIso,
            event_last_id: EVENT_ID,
            last_seen_at: nowIso,
          };
          if (!existing.name && trimmedName) {
            updates.name = trimmedName;
          }
          const { error: updErr } = await supabaseAdmin
            .from('customers')
            .update(updates)
            .eq('email', emailNormalized);
          if (updErr) {
            console.error('POST /api/camp-signup customers update error:', updErr);
          }
        } else {
          const { error: insErr } = await supabaseAdmin
            .from('customers')
            .insert({
              email: emailNormalized,
              name: trimmedName,
              event_count: 1,
              event_last_at: nowIso,
              event_last_id: EVENT_ID,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
            });
          if (insErr) {
            console.error('POST /api/camp-signup customers insert error:', insErr);
          }
        }
      } catch (e) {
        console.error('POST /api/camp-signup customers exception:', e);
      }
    }

    // 5b. event_signups に履歴INSERT（admin client が無くても anon client でもRLS次第で動く可能性。
    //     失敗してもメール送信は続行）
    try {
      const client = supabaseAdmin ?? supabase;
      const { error: dbError } = await client
        .from('event_signups')
        .insert({
          email: emailNormalized,
          name: trimmedName,
          event_id: EVENT_ID,
          event_name: EVENT_NAME,
          attended: false,
          newsletter_opt_in: false,
          source: 'camp-signup-v1',
          metadata,
        });
      if (dbError) {
        console.error('POST /api/camp-signup event_signups insert error:', dbError);
      }
    } catch (e) {
      console.error('POST /api/camp-signup event_signups exception:', e);
    }

    // 6. Resend で2通送信（参加者宛 + 森本さん宛）
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('POST /api/camp-signup: RESEND_API_KEY not set');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500, headers: cors });
    }
    const resend = new Resend(apiKey);

    // 6a. 参加者宛の申込受付メール
    const participantHtml = buildParticipantHtml({
      name: trimmedName,
      pricing,
      roomTypeLabel,
      hasPair,
      pairPartnerName: trimmedPairPartner,
    });
    const { error: participantMailErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `【受付】${EVENT_NAME} お申込みを受け付けました`,
      html: participantHtml,
    });
    if (participantMailErr) {
      console.error('POST /api/camp-signup participant resend error:', participantMailErr);
    }

    // 6b. 森本さん宛の通知メール
    const adminHtml = buildAdminHtml({
      name: trimmedName,
      furigana: trimmedFurigana,
      email: emailNormalized,
      phone: trimmedPhone,
      roomTypeLabel,
      pairPartnerName: trimmedPairPartner,
      pricing,
      metadata,
    });
    const { error: adminMailErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: `【合宿申込】${trimmedName} 様（${pricing.tierLabel}）`,
      html: adminHtml,
    });
    if (adminMailErr) {
      console.error('POST /api/camp-signup admin resend error:', adminMailErr);
    }

    return NextResponse.json(
      {
        success: true,
        pricing: {
          tier: pricing.tier,
          tierLabel: pricing.tierLabel,
          amount: pricing.amount,
          amountWithTax: pricing.amountWithTax,
        },
      },
      { status: 200, headers: cors },
    );
  } catch (err) {
    console.error('POST /api/camp-signup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors });
  }
}

// =============================================================
// 参加者宛メール
// =============================================================
function buildParticipantHtml(p: {
  name: string;
  pricing: { tier: string; tierLabel: string; amount: number; amountWithTax: number };
  roomTypeLabel: string;
  hasPair: boolean;
  pairPartnerName: string;
}): string {
  const amountWithTaxFormatted = p.pricing.amountWithTax.toLocaleString();
  const amountFormatted = p.pricing.amount.toLocaleString();

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6ff;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#1c3329;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#f0b429;letter-spacing:0.15em;">DEMOCRACY FITNESS CAMP 2026</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">お申込みを受け付けました</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${escapeHtml(p.name)} 様</p>

    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.9;">
      この度は「${EVENT_NAME}」へのお申込みありがとうございます。<br>
      以下の内容で受け付けました。
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:13px;">
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;width:35%;color:#475569;font-weight:600;">日程</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${EVENT_DATES}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">会場</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${VENUE}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">部屋タイプ</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${escapeHtml(p.roomTypeLabel)}</td>
      </tr>
      ${p.hasPair ? `<tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">ペア相手</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${escapeHtml(p.pairPartnerName)} 様</td>
      </tr>` : ''}
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">適用価格</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${escapeHtml(p.pricing.tierLabel)}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">プログラム参加費</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;"><strong style="font-size:16px;">¥${amountWithTaxFormatted}（税込）</strong><br><span style="font-size:12px;color:#5a5880;">税抜 ¥${amountFormatted}　※宿泊費は別途</span></td>
      </tr>
    </table>

    <div style="background:#fef3e0;border-left:4px solid #e85d26;padding:18px 20px;margin:24px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a2e;">▼ お支払いについて</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8;">
        <strong>プログラム参加費</strong>のお振込先は、別途このメールアドレス宛にご案内いたします（数日以内）。振込手数料はご負担をお願いいたします。<br><br>
        <strong>宿泊費（1泊・全食事込み）は、会場TAKIVIVA様へ直接お支払い</strong>いただきます。ご予約の確定・お支払い方法（当日精算等）は、TAKIVIVA様より直接ご案内いたします。
      </p>
    </div>

    <p style="margin:24px 0 12px;font-size:14px;color:#475569;line-height:1.9;">
      合宿に向けたご案内や、当日の持ち物・アクセス情報は、開催が近くなりましたら改めてお送りします。
      ご質問やご要望がございましたら、このメールへの返信、または
      <a href="mailto:y.morimoto@kizukikumitate.com" style="color:#e85d26;">y.morimoto@kizukikumitate.com</a>
      までお気軽にご連絡ください。
    </p>

    <p style="margin:24px 0 8px;text-align:center;">
      <a href="${LP_URL}" style="display:inline-block;background:#1c3329;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:13px;">
        合宿ページを再度確認する
      </a>
    </p>
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">株式会社きづきくみたてワンダーラボ</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.7);">
      <a href="https://kizukikumitate.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">kizukikumitate.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// =============================================================
// 森本さん宛の通知メール（運営側）
// =============================================================
function buildAdminHtml(p: {
  name: string;
  furigana: string;
  email: string;
  phone: string;
  roomTypeLabel: string;
  pairPartnerName: string;
  pricing: { tier: string; tierLabel: string; amount: number; amountWithTax: number };
  metadata: Record<string, unknown>;
}): string {
  const m = p.metadata as {
    dietaryRestrictions?: string;
    careNotes?: string;
    emergencyContact?: { name?: string; relation?: string; phone?: string };
    pickup?: { go?: string; back?: string };
    referralSource?: string;
    pastParticipation?: boolean;
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
  <tr><td style="background:#1e293b;padding:18px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:16px;color:#ffffff;">【合宿申込】${escapeHtml(p.name)} 様 — ${escapeHtml(p.pricing.tierLabel)}</h1>
  </td></tr>
  <tr><td style="padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
      ${row('氏名', p.name)}
      ${row('ふりがな', p.furigana || '（未記入）')}
      ${row('メール', `<a href="mailto:${p.email}" style="color:#1d4ed8;">${p.email}</a>`)}
      ${row('電話', p.phone)}
      ${row('部屋タイプ', p.roomTypeLabel)}
      ${row('ペア相手', p.pairPartnerName || '（一人での申込）')}
      ${row('価格', `<strong>${p.pricing.tierLabel}：¥${p.pricing.amountWithTax.toLocaleString()}（税込／税抜 ¥${p.pricing.amount.toLocaleString()}）</strong>`)}
      ${row('食事制限・アレルギー', escapeHtml(m.dietaryRestrictions || '（なし）'))}
      ${row('気をつけてほしいこと', escapeHtml(m.careNotes || '（なし）'))}
      ${row('緊急連絡先', m.emergencyContact?.name
        ? `${escapeHtml(m.emergencyContact.name)}（${escapeHtml(m.emergencyContact.relation || '続柄未記入')}）／ ${escapeHtml(m.emergencyContact.phone || '電話未記入')}`
        : '（未記入）')}
      ${row('送迎（軽井沢駅→会場）', escapeHtml(m.pickup?.go || '（不要 or 未記入）'))}
      ${row('送迎（会場→軽井沢駅）', escapeHtml(m.pickup?.back || '（不要 or 未記入）'))}
      ${row('知ったきっかけ', escapeHtml(m.referralSource || '（未記入）'))}
      ${row('過去の体験会参加', m.pastParticipation ? 'あり' : 'なし')}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Supabase event_signups と customers に書き込まれました。<br>
      早割締切：${EARLY_BIRD_DEADLINE.slice(0, 10)} ／ 申込締切：2026-07-31
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;width:30%;color:#475569;font-weight:600;vertical-align:top;">${escapeHtml(label)}</th>
    <td style="padding:8px 10px;border:1px solid #e2e8f0;color:#1e293b;line-height:1.7;">${value}</td>
  </tr>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
