/* 🌸 민성이의 하루 - 텔레그램 알림 v2 (GitHub Actions, 15분마다 실행)
   기능 1: ⏰ 시간 지정 할일 알람 (시간이 지난 미완료 할일, 1회만 발송)
   기능 2: 🔔 저녁 6시(베트남) 미완료 할일 요약 (하루 1회만 발송)
   필요한 GitHub Secrets: FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FB_EMAIL, FB_PASSWORD, TG_TOKEN, TG_CHAT_ID
*/

const API_KEY = process.env.FIREBASE_API_KEY;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const EMAIL = process.env.FB_EMAIL;
const PASSWORD = process.env.FB_PASSWORD;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;

const VN = 'Asia/Ho_Chi_Minh';
function vnDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: VN }).format(new Date()); }
function vnHHMM() { return new Intl.DateTimeFormat('en-GB', { timeZone: VN, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
function vnHour() { return parseInt(vnHHMM().slice(0, 2), 10); }

const FS = () => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function sendTg(text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text }),
  });
  const j = await res.json();
  if (!j.ok) { console.error('❌ 텔레그램 발송 실패:', JSON.stringify(j)); process.exit(1); }
}

async function patchDoc(path, fields, mask, idToken) {
  const params = mask.map((m) => 'updateMask.fieldPaths=' + m).join('&');
  const res = await fetch(`${FS()}/${path}?${params}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) console.error('⚠️ 문서 업데이트 실패:', path, res.status);
}

async function main() {
  for (const [k, v] of Object.entries({ API_KEY, PROJECT, EMAIL, PASSWORD, TG_TOKEN, TG_CHAT })) {
    if (!v) { console.error('❌ 설정 누락:', k); process.exit(1); }
  }

  // 1) Firebase 로그인
  const loginRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  const login = await loginRes.json();
  if (!login.idToken) { console.error('❌ Firebase 로그인 실패:', JSON.stringify(login.error || login)); process.exit(1); }
  const { idToken, localId } = login;
  console.log('✅ Firebase 로그인 성공');

  // 2) 미완료 할일 조회
  const queryRes = await fetch(`${FS()}/users/${localId}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'todos' }],
      where: { fieldFilter: { field: { fieldPath: 'done' }, op: 'EQUAL', value: { booleanValue: false } } },
    }}),
  });
  const rows = await queryRes.json();
  if (!Array.isArray(rows)) { console.error('❌ 할일 조회 실패:', JSON.stringify(rows)); process.exit(1); }

  const today = vnDate(), now = vnHHMM();
  const all = rows.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return {
      id: r.document.name.split('/').pop(),
      text: f.text?.stringValue || '',
      date: f.date?.stringValue || '',
      time: f.time?.stringValue || null,
      timeNotified: f.timeNotified?.booleanValue || false,
      isEx: f.isExercise?.booleanValue || false,
    };
  });

  // ── 기능 1: ⏰ 시간 알람 ──
  const due = all.filter((t) => t.date === today && t.time && t.time <= now && !t.timeNotified);
  console.log(`⏰ 시간 도달 할일: ${due.length}개 (현재 ${now})`);
  if (due.length) {
    const lines = due.map((t) => `• ${t.time} - ${t.isEx ? '🏃 ' : ''}${t.text}`).join('\n');
    await sendTg(`⏰ 민성이의 하루 - 일정 시간이에요!\n\n${lines}\n\n지금 시작해 보세요 🌷`);
    for (const t of due) {
      await patchDoc(`users/${localId}/todos/${t.id}`, { timeNotified: { booleanValue: true } }, ['timeNotified'], idToken);
    }
    console.log('✅ 시간 알람 발송 완료');
  }

  // ── 기능 2: 🔔 저녁 6시 요약 (하루 1회) ──
  if (vnHour() >= 18) {
    let last = null;
    const metaRes = await fetch(`${FS()}/users/${localId}/meta/daily`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (metaRes.ok) { const m = await metaRes.json(); last = m.fields?.lastSummaryDate?.stringValue || null; }
    if (last === today) { console.log('🔕 오늘 저녁 요약은 이미 보냈음'); }
    else {
      const open = all.filter((t) => t.date && t.date <= today);
      console.log(`📋 오늘(${today}) 기준 미완료 할일: ${open.length}개`);
      if (open.length) {
        const lines = open.map((t, i) => `${i + 1}. ${t.isEx ? '🏃 ' : ''}${t.text}${t.time ? ' (⏰' + t.time + ')' : ''}`).join('\n');
        await sendTg(`🌸 민성이의 하루 - 저녁 6시 알림 🔔\n\n아직 못 끝낸 할일이 ${open.length}개 있어요!\n\n${lines}\n\n앱에서 [취소 ❌] 또는 [내일로 ➡️]를 선택해 주세요 🌷`);
        console.log('✅ 저녁 요약 발송 완료');
      } else console.log('🎉 미완료 할일 없음 → 요약 생략');
      await patchDoc(`users/${localId}/meta/daily`, { lastSummaryDate: { stringValue: today } }, ['lastSummaryDate'], idToken);
    }
  } else console.log(`🕕 아직 저녁 6시 전 (베트남 ${now}) → 요약 건너뜀`);
}

main().catch((e) => { console.error('❌ 오류:', e); process.exit(1); });
