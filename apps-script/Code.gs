/** @OnlyCurrentDoc */
// 마음 챙김 독서 토론회 · 그림책 소감 v4 (공통 코드 + 별명 + 글별 삭제 비밀번호)
// 「설정」 B1: 공통 코드 (띄어쓰기·'+'는 무시하고 비교)   「설정」 B2: 관리자 비밀번호
// 틀린 코드가 10분 안에 10번 쌓이면 10분 동안 입력을 쉽니다.
// 「소감」 탭의 숨김 칸을 체크하면 사이트에서 보이지 않습니다.
var BOOKS = ['frederick', 'rumphius', 'river', 'ganajittong', 'cat', 'swimmy'];
var MAX_FAILS = 10, WINDOW_SEC = 600, LOCK_SEC = 600;
var DELETE_MAX_FAILS = 5, DELETE_WINDOW_MS = 600000;
// A:E는 기존 구조 그대로, F:H는 새 글의 ID / 소금값 / HMAC만 저장합니다.
// 삭제 비밀번호 원문은 시트·속성·로그에 저장하지 않습니다.

function ss_() { return SpreadsheetApp.getActive(); }
function conf_() { return ss_().getSheetByName('설정'); }
function sheet_() {
  var sh = ss_().getSheetByName('소감');
  if (!sh) { sh = ss_().getSheets()[0]; sh.setName('소감'); }
  if (sh.getRange('A1').getValue() !== '시간') sh.getRange('A1:E1').setValues([['시간', '책', '이름', '소감', '숨김']]);
  if (sh.getRange('F1').getValue() !== 'ID') sh.getRange('F1:H1').setValues([['ID', '소금값', '삭제 검증값']]);
  return sh;
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function clean_(s, max) {
  s = String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function norm_(s) { return String(s || '').replace(/[\s+]/g, '').toLowerCase(); }
function fmt_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy.MM.dd') : String(v || ''); }
function plain_(v) { return String(v || '').replace(/^'/, ''); }

// 틀린 시도 제한 (kind: 'code' | 'admin')
function locked_(kind) { return CacheService.getScriptCache().get('lock_' + kind) === '1'; }
function fail_(kind, max) {
  var c = CacheService.getScriptCache(), n = Number(c.get('fail_' + kind) || 0) + 1;
  if (n >= max) { c.put('lock_' + kind, '1', LOCK_SEC); c.remove('fail_' + kind); }
  else c.put('fail_' + kind, String(n), WINDOW_SEC);
}
function ok_(kind) { CacheService.getScriptCache().remove('fail_' + kind); }
var LOCK_MSG = '틀린 코드가 여러 번 입력되어 잠시 입력을 멈췄습니다. 10분 뒤 다시 시도해 주세요.';

function passwordValid_(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
// 반드시 script lock 안에서 호출합니다. 기존 비밀키를 임의로 바꾸면 삭제 검증이 불가능합니다.
function secret_() {
  var props = PropertiesService.getScriptProperties(), secret = props.getProperty('DELETE_HMAC_SECRET');
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('DELETE_HMAC_SECRET', secret); }
  return secret;
}
function passwordHash_(id, book, salt, password) {
  return hex_(Utilities.computeHmacSha256Signature(JSON.stringify([id, book, salt, password]), secret_(), Utilities.Charset.UTF_8));
}
function sameHash_(a, b) {
  a = String(a); b = String(b); var diff = a.length ^ b.length;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// 예전 행은 수정하거나 소유권을 부여하지 않습니다. 공개용 임의 ID만 별도 속성에 기억합니다.
function legacyId_(r, occurrence) {
  var fingerprint = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(r.slice(0, 4)), Utilities.Charset.UTF_8));
  var key = 'legacy_id_' + fingerprint + '_' + occurrence;
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(key);
  if (!id) { id = Utilities.getUuid(); props.setProperty(key, id); }
  return id;
}
function doGet(e) {
  var book = String((e && e.parameter && e.parameter.book) || '');
  if (BOOKS.indexOf(book) < 0) return out_({ ok: false, error: 'book' });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var seen = {}, items = [];
    sheet_().getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[1] !== book || !r[3]) return;
      var canDelete = !!(r[5] && r[6] && r[7]), id = String(r[5] || '');
      if (!id) {
        var fingerprint = JSON.stringify(r.slice(0, 4));
        seen[fingerprint] = (seen[fingerprint] || 0) + 1;
        id = legacyId_(r, seen[fingerprint]);
      }
      if (r[4] === true || String(r[4]).toUpperCase() === 'TRUE') return;
      items.push({ id: id, canDelete: canDelete, date: fmt_(r[0]), name: plain_(r[2]), text: plain_(r[3]) });
    });
    return out_({ ok: true, items: items });
  } finally { lock.releaseLock(); }
}

function delete_(d) {
  var id = typeof d.id === 'string' ? d.id : '', book = String(d.book || '');
  if (!/^[a-f0-9-]{36}$/i.test(id) || BOOKS.indexOf(book) < 0 || !passwordValid_(d.password)) {
    return out_({ ok: false, error: '글 정보와 삭제 비밀번호(6~128자)를 확인해 주세요.' });
  }
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = sheet_(), rows = sh.getDataRange().getValues(), row = -1;
    // 요청에서 행 번호를 받지 않습니다. 잠금을 얻은 뒤 현재 ID와 책을 다시 찾습니다.
    for (var i = 1; i < rows.length; i++) if (rows[i][5] === id && rows[i][1] === book) { row = i; break; }
    if (row < 0 || !rows[row][6] || !rows[row][7]) return out_({ ok: false, error: '삭제할 소감을 찾지 못했습니다. 예전 소감은 대표 선생님께 삭제를 요청해 주세요.' });
    var props = PropertiesService.getScriptProperties(), key = 'delete_fails_' + id, now = Date.now();
    var failures = JSON.parse(props.getProperty(key) || '[]').filter(function (t) { return t > now - DELETE_WINDOW_MS; });
    var lockMessage = '이 소감의 삭제 비밀번호가 여러 번 틀렸습니다. 10분 뒤 다시 시도해 주세요.';
    if (failures.length >= DELETE_MAX_FAILS) return out_({ ok: false, locked: true, error: lockMessage });
    if (!sameHash_(rows[row][7], passwordHash_(id, book, String(rows[row][6]), d.password))) {
      failures.push(now); props.setProperty(key, JSON.stringify(failures));
      return out_({ ok: false, badPassword: true, locked: failures.length >= DELETE_MAX_FAILS, error: failures.length >= DELETE_MAX_FAILS ? lockMessage : '삭제 비밀번호가 맞지 않습니다. 소감은 그대로 있으니 다시 입력해 주세요.' });
    }
    sh.deleteRow(row + 1);
    props.deleteProperty(key);
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: '잘못된 요청입니다.' }); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out_({ ok: false, error: '잘못된 요청입니다.' });
  var action = String(d.action || 'comment');
  if (action.indexOf('admin_') === 0) return admin_(action, d);
  if (action === 'delete') return delete_(d);
  if (action !== 'comment') return out_({ ok: false, error: '알 수 없는 요청입니다.' });

  if (typeof d.password !== 'string') return out_({ ok: false, refresh: true, error: '삭제 비밀번호가 필요한 새 버전입니다. 이 페이지를 새로고침한 뒤 삭제 비밀번호를 정해 다시 남겨 주세요.' });
  if (!passwordValid_(d.password)) return out_({ ok: false, error: '삭제 비밀번호는 6~128자로 정해 주세요. 앞뒤 공백도 비밀번호에 포함됩니다.' });
  if (locked_('code')) return out_({ ok: false, locked: true, error: LOCK_MSG });
  var real = norm_(conf_().getRange('B1').getValue());
  if (!real || norm_(d.code) !== real) { fail_('code', MAX_FAILS); return out_({ ok: false, badCode: true, error: '공통 코드가 맞지 않습니다.' }); }
  ok_('code');
  var book = String(d.book || ''), name = clean_(d.name, 20), text = clean_(d.text, 1000);
  if (BOOKS.indexOf(book) < 0 || !name || !text) return out_({ ok: false, error: '별명과 소감을 적어 주세요.' });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = sheet_();
    var id = Utilities.getUuid(), salt = Utilities.getUuid();
    sh.appendRow([new Date(), book, name, text, false, id, salt, passwordHash_(id, book, salt, d.password)]);
    sh.getRange(sh.getLastRow(), 5).insertCheckboxes();
  } finally { lock.releaseLock(); }
  return out_({ ok: true });
}

function admin_(action, d) {
  if (locked_('admin')) return out_({ ok: false, error: '관리자 비밀번호가 여러 번 틀려 10분 동안 잠겼습니다.' });
  var pw = String(conf_().getRange('B2').getValue()).trim();
  if (pw.length < 8 || String(d.admin || '') !== pw) { fail_('admin', 5); Utilities.sleep(600); return out_({ ok: false, error: '관리자 비밀번호가 맞지 않습니다.' }); }
  ok_('admin');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (action === 'admin_state') return out_({ ok: true, code: String(conf_().getRange('B1').getValue()), posts: posts_() });
    if (action === 'admin_set_code') {
      var code = String(d.code || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 30);
      if (norm_(code).length < 2) return out_({ ok: false, error: '공통 코드는 두 글자 이상으로 정해 주세요.' });
      conf_().getRange('B1').setValue("'" + code);
      CacheService.getScriptCache().remove('lock_code'); CacheService.getScriptCache().remove('fail_code');
      return out_({ ok: true, code: code });
    }
    if (action === 'admin_hide') {
      var sh = sheet_(), row = Number(d.row), ts = Number(d.ts);
      if (!(row >= 2 && row <= sh.getLastRow())) return out_({ ok: false, error: '그 소감을 찾지 못했습니다. 새로고침해 주세요.' });
      var v = sh.getRange(row, 1).getValue();
      if (!(v instanceof Date) || v.getTime() !== ts) return out_({ ok: false, error: '목록이 바뀌었습니다. 새로고침 뒤 다시 시도해 주세요.' });
      sh.getRange(row, 5).setValue(!!d.hidden);
      return out_({ ok: true, posts: posts_() });
    }
    return out_({ ok: false, error: '알 수 없는 요청입니다.' });
  } finally { lock.releaseLock(); }
}

function posts_() {
  var vals = sheet_().getDataRange().getValues(), list = [];
  for (var i = vals.length - 1; i >= 1 && list.length < 100; i--) {
    var r = vals[i]; if (!r[3]) continue;
    list.push({ row: i + 1, ts: r[0] instanceof Date ? r[0].getTime() : 0, date: fmt_(r[0]), book: String(r[1]), name: plain_(r[2]), text: plain_(r[3]), hidden: r[4] === true || String(r[4]).toUpperCase() === 'TRUE' });
  }
  return list;
}
