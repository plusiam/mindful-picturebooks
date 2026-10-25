// 마음 챙김 독서 토론회 · 회원 소감 (구글 시트 저장, 공통 코드 + 별명)
(function(){
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzWwJYICsZkb6UTc6OVny00Sf4_RxNjC0Astda6Hhi-p2gMJ7pCqbekZGgUFhDzTKmYoA/exec';
  var box = document.getElementById('voices'); if (!box) return;
  var book = box.getAttribute('data-book');
  var list = box.querySelector('.v-list'), form = box.querySelector('form'), msg = box.querySelector('.v-msg');
  var nameI = form.querySelector('[name=name]'), textI = form.querySelector('[name=text]'), codeI = form.querySelector('[name=code]'), keep = form.querySelector('[name=keep]'), cnt = form.querySelector('.v-count'), btn = form.querySelector('button');
  try { var saved = JSON.parse(localStorage.getItem('mcb-member') || '{}'); if (saved.name) nameI.value = saved.name; if (saved.code) { codeI.value = saved.code; keep.checked = true; } } catch (e) {}
  textI.addEventListener('input', function(){ cnt.textContent = textI.value.length + ' / 1000'; });
  function render(items){
    list.innerHTML = '';
    if (!items.length) { var p = document.createElement('p'); p.className = 'v-empty'; p.textContent = '아직 남긴 소감이 없습니다. 첫 소감을 남겨 주세요.'; list.appendChild(p); return; }
    items.forEach(function(it){
      var li = document.createElement('li'); var h = document.createElement('div'); h.className = 'v-meta';
      var b = document.createElement('b'); b.textContent = it.name; var s = document.createElement('span'); s.textContent = it.date;
      h.appendChild(b); h.appendChild(s); var t = document.createElement('p'); t.textContent = it.text; li.appendChild(h); li.appendChild(t); list.appendChild(li);
    });
  }
  function load(){
    fetch(ENDPOINT + '?book=' + encodeURIComponent(book)).then(function(r){ return r.json(); })
      .then(function(d){ if (d.ok) render(d.items); else list.textContent = '소감을 불러오지 못했습니다.'; })
      .catch(function(){ list.textContent = '소감을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'; });
  }
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var payload = { book: book, name: nameI.value.trim(), text: textI.value.trim(), code: codeI.value.trim() };
    if (!payload.name || !payload.text) { msg.textContent = '별명과 소감을 적어 주세요.'; return; }
    if (!payload.code) { msg.textContent = '공통 코드를 적어 주세요.'; return; }
    btn.disabled = true; msg.textContent = '남기는 중…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.ok) {
          msg.textContent = '소감을 남겼습니다. 고맙습니다.'; textI.value = ''; cnt.textContent = '0 / 1000';
          try { localStorage.setItem('mcb-member', JSON.stringify({ name: payload.name, code: keep.checked ? payload.code : '' })); } catch (e) {}
          load();
        } else if (d.badCode) {
          msg.textContent = '공통 코드가 맞지 않습니다. 코드가 바뀌었을 수 있어요. 공지된 새 코드를 넣어 주세요. 쓰신 소감은 그대로 있어요.';
          codeI.value = ''; keep.checked = false;
          try { localStorage.setItem('mcb-member', JSON.stringify({ name: payload.name, code: '' })); } catch (e) {}
          codeI.focus();
        } else { msg.textContent = d.error || '남기지 못했습니다.'; }
      })
      .catch(function(){ msg.textContent = '연결이 원활하지 않습니다. 잠시 뒤 다시 시도해 주세요.'; })
      .then(function(){ btn.disabled = false; });
  });
  load();
})();
