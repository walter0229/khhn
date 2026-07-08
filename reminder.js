/* 🌸 민성이의 하루 - 저녁 8시 텔레그램 알림 (GitHub Actions에서 자동 실행)
   필요한 GitHub Secrets:
   FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FB_EMAIL, FB_PASSWORD, TG_TOKEN, TG_CHAT_ID
*/

const API_KEY = process.env.FIREBASE_API_KEY;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const EMAIL = process.env.FB_EMAIL;
const PASSWORD = process.env.FB_PASSWORD;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;

function vnDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

async function main() {
  for (const [k, v] of Object.entries({ API_KEY, PROJECT, EMAIL, PASSWORD, TG_TOKEN, TG_CHAT })) {
    if (!v) { console.error('❌ 설정 누락:', k); process.exit(1); }
  }

  // 1) Firebase 로그인
  const loginRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  );
  const login = await loginRes.json();
  if (!login.idToken) { console.error('❌ Firebase 로그인 실패:', JSON.stringify(login.error || login)); process.exit(1); }
  const { idToken, localId } = login;
  console.log('✅ Firebase 로그인 성공');

  // 2) 미완료 할일 조회 (done == false)
  const queryRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${localId}:runQuery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'todos' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'done' },
              op: 'EQUAL',
              value: { booleanValue: false },
            },
          },
        },
      }),
    }
  );
  const rows = await queryRes.json();
  if (!Array.isArray(rows)) { console.error('❌ 할일 조회 실패:', JSON.stringify(rows)); process.exit(1); }

  const today = vnDate();
  const open = rows
    .filter((r) => r.document)
    .map((r) => {
      const f = r.document.fields || {};
      return {
        text: f.text?.stringValue || '',
        date: f.date?.stringValue || '',
        isEx: f.isExercise?.booleanValue || false,
      };
    })
    .filter((t) => t.date && t.date <= today);

  console.log(`📋 오늘(${today}) 기준 미완료 할일: ${open.length}개`);
  if (open.length === 0) { console.log('🎉 미완료 할일 없음 → 알림 생략'); return; }

  // 3) 텔레그램 발송
  const lines = open.map((t, i) => `${i + 1}. ${t.isEx ? '🏃 ' : ''}${t.text}`).join('\n');
  const msg = `🌸 민성이의 하루 - 저녁 8시 알림 🔔\n\n아직 못 끝낸 할일이 ${open.length}개 있어요!\n\n${lines}\n\n앱에서 [취소 ❌] 또는 [내일로 ➡️]를 선택해 주세요 🌷`;

  const tgRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg }),
  });
  const tg = await tgRes.json();
  if (!tg.ok) { console.error('❌ 텔레그램 발송 실패:', JSON.stringify(tg)); process.exit(1); }
  console.log('✅ 텔레그램 알림 발송 완료!');
}

main().catch((e) => { console.error('❌ 오류:', e); process.exit(1); });
