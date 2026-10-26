// 마음 챙김 독서 토론회 · 회원 소감 (구글 시트 저장, 공통 코드 + 별명)
(function(){
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzWwJYICsZkb6UTc6OVny00Sf4_RxNjC0Astda6Hhi-p2gMJ7pCqbekZGgUFhDzTKmYoA/exec';
  var box = document.getElementById('voices'); if (!box) return;
  var book = box.getAttribute('data-book');
  var list = box.querySelector('.v-list'), form = box.querySelector('form'), msg = box.querySelector('.v-msg');
  var nameI = form.querySelector('[name=name]'), textI = form.querySelector('[name=text]'), codeI = form.querySelector('[name=code]'), passwordI = form.querySelector('[name=password]'), keep = form.querySelector('[name=keep]'), cnt = form.querySelector('.v-count'), btn = form.querySelector('button');
  try { var saved = JSON.parse(localStorage.getItem('mcb-member') || '{}'); if (saved.name) nameI.value = saved.name; if (saved.code) { codeI.value = saved.code; keep.checked = true; } } catch (e) {}
  textI.addEventListener('input', function(){ cnt.textContent = textI.value.length + ' / 1000'; });
  // 폼과 목록은 형제 요소입니다. 삭제 비밀번호는 브라우저 저장소에 기록하지 않습니다.
  list.tabIndex = -1;
  var listStatus = document.createElement('p'); listStatus.className = 'v-msg'; listStatus.setAttribute('role', 'status');
  list.parentNode.insertBefore(listStatus, list.nextSibling);
  function request(payload) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }).then(function(r){ return r.json(); });
  }
  function deleteControls(li, it, index) {
    if (!it.canDelete || !it.id) {
      var legacy = document.createElement('p'); legacy.className = 'v-delete-note';
      legacy.textContent = '삭제 비밀번호 없이 작성한 예전 소감입니다. 삭제는 대표 선생님께 요청해 주세요.'; li.appendChild(legacy); return;
    }
    var panel = document.createElement('details'); panel.className = 'v-delete';
    var summary = document.createElement('summary'); summary.textContent = '내 소감 삭제'; summary.setAttribute('aria-label', it.name + '님의 ' + it.date + ' 소감 삭제'); panel.appendChild(summary);
    var df = document.createElement('form'); df.className = 'v-delete-form';
    var label = document.createElement('label'); label.textContent = '작성할 때 정한 삭제 비밀번호';
    var input = document.createElement('input'); input.type = 'password'; input.name = 'password'; input.required = true; input.minLength = 6; input.maxLength = 128; input.autocomplete = 'current-password';
    input.setAttribute('aria-describedby', 'delete-help-' + index); label.appendChild(input); df.appendChild(label);
    var help = document.createElement('p'); help.id = 'delete-help-' + index; help.className = 'v-delete-note'; help.textContent = '삭제하면 복구할 수 없습니다. 비밀번호를 잊었다면 대표 선생님께 요청해 주세요.'; df.appendChild(help);
    var actions = document.createElement('div'); actions.className = 'v-delete-actions';
    var submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '영구 삭제'; actions.appendChild(submit);
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'v-cancel'; cancel.textContent = '취소'; actions.appendChild(cancel); df.appendChild(actions);
    var status = document.createElement('p'); status.className = 'v-msg'; status.setAttribute('role', 'status'); df.appendChild(status);
    cancel.addEventListener('click', function(){ input.value = ''; status.textContent = ''; panel.open = false; summary.focus(); });
    panel.addEventListener('toggle', function(){ if (panel.open) input.focus(); else input.value = ''; });
    df.addEventListener('submit', function(ev){
      ev.preventDefault();
      if (input.value.length < 6 || input.value.length > 128) { status.textContent = '삭제 비밀번호는 6~128자입니다.'; input.focus(); return; }
      if (!window.confirm('이 소감을 영구 삭제할까요? 삭제한 소감은 복구할 수 없습니다.')) return;
      submit.disabled = true; cancel.disabled = true; status.textContent = '삭제하는 중…';
      request({ action: 'delete', id: it.id, book: book, password: input.value }).then(function(d){
        input.value = '';
        if (d.ok) { listStatus.textContent = '소감을 영구 삭제했습니다.'; return load().then(function(){ list.focus(); }); }
        status.textContent = d.error || '삭제하지 못했습니다. 소감은 그대로 있습니다.'; input.focus();
      }).catch(function(){ input.value = ''; status.textContent = '삭제 결과를 확인하지 못했습니다. 잠시 뒤 목록을 새로고침해 확인해 주세요.'; input.focus(); })
        .then(function(){ submit.disabled = false; cancel.disabled = false; });
    });
    panel.appendChild(df); li.appendChild(panel);
  }
  function render(items){
    list.innerHTML = '';
    if (!items.length) { var p = document.createElement('p'); p.className = 'v-empty'; p.textContent = '아직 남긴 소감이 없습니다. 첫 소감을 남겨 주세요.'; list.appendChild(p); return; }
    items.forEach(function(it, index){
      var li = document.createElement('li'); var h = document.createElement('div'); h.className = 'v-meta';
      var b = document.createElement('b'); b.textContent = it.name; var s = document.createElement('span'); s.textContent = it.date;
      h.appendChild(b); h.appendChild(s); var t = document.createElement('p'); t.textContent = it.text; li.appendChild(h); li.appendChild(t); deleteControls(li, it, index); list.appendChild(li);
    });
  }
  function load(){
    return fetch(ENDPOINT + '?book=' + encodeURIComponent(book)).then(function(r){ return r.json(); })
      .then(function(d){ if (d.ok) render(d.items); else list.textContent = '소감을 불러오지 못했습니다.'; })
      .catch(function(){ list.textContent = '소감을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'; });
  }
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var payload = { book: book, name: nameI.value.trim(), text: textI.value.trim(), code: codeI.value.trim(), password: passwordI.value };
    if (!payload.name || !payload.text) { msg.textContent = '별명과 소감을 적어 주세요.'; return; }
    if (!payload.code) { msg.textContent = '공통 코드를 적어 주세요.'; return; }
    if (payload.password.length < 6 || payload.password.length > 128) { msg.textContent = '삭제 비밀번호를 6~128자로 정해 주세요. 앞뒤 공백도 포함됩니다.'; passwordI.focus(); return; }
    btn.disabled = true; msg.textContent = '남기는 중…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.ok) {
          msg.textContent = '소감을 남겼습니다. 고맙습니다.'; textI.value = ''; passwordI.value = ''; cnt.textContent = '0 / 1000';
          try { localStorage.setItem('mcb-member', JSON.stringify({ name: payload.name, code: keep.checked ? payload.code : '' })); } catch (e) {}
          load();
        } else if (d.badCode) {
          msg.textContent = '공통 코드가 맞지 않습니다. 코드가 바뀌었을 수 있어요. 공지된 새 코드를 넣어 주세요. 쓰신 소감은 그대로 있어요.';
          codeI.value = '';
          try { localStorage.setItem('mcb-member', JSON.stringify({ name: payload.name, code: '' })); } catch (e) {}
          codeI.focus();
        } else { msg.textContent = d.error || '남기지 못했습니다.'; }
      })
      .catch(function(){ msg.textContent = '연결이 원활하지 않습니다. 잠시 뒤 다시 시도해 주세요.'; })
      .then(function(){ btn.disabled = false; });
  });
  load();
})();
