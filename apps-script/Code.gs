/** @OnlyCurrentDoc */
// 마음 챙김 독서 토론회 · 그림책 소감 v3 (공통 코드 + 별명)
// 「설정」 B1: 공통 코드 (띄어쓰기·'+'는 무시하고 비교)   「설정」 B2: 관리자 비밀번호
// 틀린 코드가 10분 안에 10번 쌓이면 10분 동안 입력을 쉽니다.
// 「소감」 탭의 숨김 칸을 체크하면 사이트에서 보이지 않습니다.
var BOOKS = ['frederick', 'rumphius', 'river', 'ganajittong', 'cat', 'swimmy'];
var MAX_FAILS = 10, WINDOW_SEC = 600, LOCK_SEC = 600;

function ss_() { return SpreadsheetApp.getActive(); }
function conf_() { return ss_().getSheetByName('설정'); }
function sheet_() {
  var sh = ss_().getSheetByName('소감');
  if (!sh) { sh = ss_().getSheets()[0]; sh.setName('소감'); }
  if (sh.getRange('A1').getValue() !== '시간') sh.getRange('A1:E1').setValues([['시간', '책', '이름', '소감', '숨김']]);
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

function doGet(e) {
  var book = String((e && e.parameter && e.parameter.book) || '');
  if (BOOKS.indexOf(book) < 0) return out_({ ok: false, error: 'book' });
  var items = sheet_().getDataRange().getValues().slice(1).filter(function (r) {
    return r[1] === book && r[4] !== true && String(r[4]).toUpperCase() !== 'TRUE' && r[3];
  }).map(function (r) { return { date: fmt_(r[0]), name: plain_(r[2]), text: plain_(r[3]) }; });
  return out_({ ok: true, items: items });
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: '잘못된 요청입니다.' }); }
  var action = String(d.action || 'comment');
  if (action.indexOf('admin_') === 0) return admin_(action, d);
  if (action !== 'comment') return out_({ ok: false, error: '알 수 없는 요청입니다.' });

  if (locked_('code')) return out_({ ok: false, locked: true, error: LOCK_MSG });
  var real = norm_(conf_().getRange('B1').getValue());
  if (!real || norm_(d.code) !== real) { fail_('code', MAX_FAILS); return out_({ ok: false, badCode: true, error: '공통 코드가 맞지 않습니다.' }); }
  ok_('code');
  var book = String(d.book || ''), name = clean_(d.name, 20), text = clean_(d.text, 1000);
  if (BOOKS.indexOf(book) < 0 || !name || !text) return out_({ ok: false, error: '별명과 소감을 적어 주세요.' });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = sheet_();
    sh.appendRow([new Date(), book, name, text, false]);
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
