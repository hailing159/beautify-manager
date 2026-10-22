(function () {
  'use strict';
  const EXT = 'beautify-manager';
  const STORE_KEY = 'beautify_manager_v1';
  const STYLE_ID = 'bm-active-style';
  const HOST_ID = 'beautify-manager-inline';

  // ---------- 默认内容 ----------
  const DEFAULT_NAME = '默认美化';
  const DEFAULT_CSS = `/* 代码简单美化后固定高度+隐藏滚动条 */
/* 代码美化后固定高度 */
pre, code {
    max-height: 300px !important;
    overflow-y: auto !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
}

@media screen and (max-width: 1000px) {
    * {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    *::-webkit-scrollbar {
        display: none;
    }
}

/* 底栏QR按键隐藏 */
#send_form:hover #qr--bar {    height: 40px;    transition: all 0.5s ease;}#qr--bar {    height: 0.1px;}

code span.comment {
    color: #999;
    font-style: italic;
}

/* 修改方便翻阅正则 */
.regex-script-label {
    border: 1px solid #000; /* 保留边框用于区分 */
    display: inline-flex;
    width: auto;
    max-width: 80%;
    box-sizing: border-box;
}


/*用户角色管理修改*/
#user_avatar_block {
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
}

#user_avatar_block .avatar-container {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    margin: 5px 0;
    padding: 10px;
    border-radius: 12px;
    cursor: pointer;
    width: 100%;
    background-color: var(--white30a) !important;
    transition: all 0.5s ease;
    border: 1px solid var(--SmartThemeBorderColor);
}

#user_avatar_block .avatar-container:hover {
    background-color: color-mix(in srgb, var(--customThemeColor-gray) 20%, transparent 50%) !important;
    filter: brightness(1);
}

#user_avatar_block .avatar-container.selected {
    border: 1.5px solid var(--customThemeColor-gray);
    background: var(--white30a) !important;
}

#user_avatar_block .avatar-container.default_persona .avatar {
    outline: 0 solid var(--customThemeColor-gray);
}

/* 角色收藏滚动条 */
  #HotSwapWrapper > div {
    overflow: auto hidden;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 8px;
    min-height: calc(var(--avatar-base-height)* 1.5);
  }

  #HotSwapWrapper > div::-webkit-scrollbar-thumb {
    background-color: var(--scrollBarColor);
  }

  #HotSwapWrapper {
    overflow: hidden;
  }

/*隐藏输入框内容*/
#nonQRFormItems:has(#send_textarea:placeholder-shown)::before {
    content: "";
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
    position: absolute !important;
    z-index: -1 !important;
}

#send_textarea::placeholder {
    color: transparent !important;
    text-shadow: none !important;
}

#script-settings-content {
    border: 1px solid #000; /* 保留边框用于区分 */
    display: inline-flex;
    width: auto;
    max-width: 95%;
    box-sizing: border-box;
}
`;

  // ---------- 1. 工具函数（必须最先） ----------
  const uid = () => 'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function safeFileName(n) {
    return String(n || '美化').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim().slice(0, 80) || '美化';
  }
  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('读取文件失败：' + (file && file.name)));
      fr.readAsText(file, 'utf-8');
    });
  }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }
  function todayStr() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  // ---------- 2. 纯数据函数 ----------
  function defaultData() {
    const id = uid();
    return { items: [{ id, name: DEFAULT_NAME, css: DEFAULT_CSS, enabled: true }], current: id };
  }
  function normalize(x) {
    const items = [];
    const src = x && Array.isArray(x.items) ? x.items : [];
    src.forEach(it => {
      if (!it || typeof it !== 'object') return;
      items.push({
        id: String(it.id || uid()),
        name: String(it.name || '未命名'),
        css: String(it.css || ''),
        enabled: !!it.enabled
      });
    });
    let current = x && x.current;
    if (!items.some(i => i.id === current)) current = items[0] ? items[0].id : null;
    return { items, current };
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { console.warn(`[${EXT}]`, e); }
    if (raw === null || raw === undefined) return defaultData();   // 第一次使用：塞入默认美化
    try { return normalize(JSON.parse(raw)); } catch (e) { console.warn(`[${EXT}]`, e); return defaultData(); }
  }

  const MARK_RE = /^[ \t]*\/\*\s*={3,}\s*美化[:：]\s*(.*?)\s*={3,}\s*\*\/[ \t]*$/;

  // 解析导入的 txt：单个文件=一条美化（文件名即名称）；"合并下载"的文件带分隔标记，会拆成多条
  function parseImport(text, fileName) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const base = (fileName ? String(fileName).replace(/\.[^.]+$/, '') : '') || '导入的美化';
    const lines = text.split('\n');
    const out = [];
    const head = [];
    let cur = null;
    lines.forEach(ln => {
      const m = MARK_RE.exec(ln);
      if (m) { cur = { name: m[1] || base, css: [] }; out.push(cur); }
      else if (cur) cur.css.push(ln);
      else head.push(ln);
    });
    if (!out.length) return text.trim() ? [{ name: base, css: text.replace(/\n+$/, '') }] : [];
    const h = head.join('\n').trim();
    if (h) out.unshift({ name: base, css: h });
    return out.map(o => ({ name: o.name, css: Array.isArray(o.css) ? o.css.join('\n').replace(/^\n+|\n+$/g, '') : o.css }));
  }
  function buildCombined(items) {
    return items.map(i => `/* ===== 美化：${i.name} ===== */\n${i.css}`).join('\n\n') + '\n';
  }

  // ---------- 3. 状态 ----------
  const logs = [];
  const sel = new Set();
  let root = null;
  let statusTimer = null;
  let commitTimer = null;
  let batchOpen = false;
  let dlgAnchor = null;
  let data = load();

  function log(msg) {
    logs.push(new Date().toLocaleTimeString() + ' ' + msg);
    while (logs.length > 60) logs.shift();
    const el = root && root.querySelector('#bm-log');
    if (el) el.textContent = logs.join('\n');
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
    catch (e) { log('保存失败：' + e.message); status('保存失败：' + e.message, true); return false; }
  }
  function status(text, bad) {
    const dm = document.querySelector('#bm-modal .bm-dialog-msg');
    if (dm) { dm.textContent = text; dm.classList.toggle('bad', !!bad); }
    const el = root && root.querySelector('#bm-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; el.classList.remove('bad'); }, 4000);
  }
  function curItem() { return data.items.find(i => i.id === data.current) || null; }
  function uniqueName(name) {
    let n = name, k = 2;
    while (data.items.some(i => i.name === n)) { n = name + ' (' + k + ')'; k++; }
    return n;
  }

  // ---------- 4. 样式注入（独立于主题，换主题不受影响） ----------
  let moveCount = 0;
  let headObserver = null;
  function applyStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    const css = data.items.filter(i => i.enabled).map(i => i.css).join('\n\n');
    if (el.textContent !== css) el.textContent = css;
    if (document.head && document.head.lastElementChild !== el) document.head.appendChild(el);
  }
  // 保持我们的 <style> 在 <head> 最后，这样同优先级时我们的规则生效（超过主题自带的自定义 CSS）
  function watchHead() {
    if (headObserver || !document.head || typeof MutationObserver === 'undefined') return;
    headObserver = new MutationObserver(() => {
      const el = document.getElementById(STYLE_ID);
      if (el && document.head.lastElementChild !== el) {
        if (++moveCount > 200) { headObserver.disconnect(); return; }
        document.head.appendChild(el);
      }
    });
    headObserver.observe(document.head, { childList: true });
  }

  // ---------- 5. 内嵌对话框（不是弹窗） ----------
  function showDialog(title, html, done, label, danger) {
    root.querySelectorAll('#bm-modal').forEach(n => n.remove());
    const m = document.createElement('div');
    m.id = 'bm-modal';
    m.className = 'bm-modal-bg';
    m.innerHTML =
      `<section class="bm-modal"><header>${esc(title)}<button type="button" class="bm-x">×</button></header>` +
      `<div class="bm-modal-content">${html}</div><div class="bm-dialog-msg"></div>` +
      `<footer><button type="button" class="bm-btn bm-light bm-cancel">取消</button>` +
      `<button type="button" class="bm-btn ${danger ? 'danger' : 'bm-primary'} bm-ok">${esc(label || '确定')}</button></footer></section>`;
    const bar = dlgAnchor && dlgAnchor.closest ? dlgAnchor.closest('.bm-tools, .bm-batch-tools') : null;
    dlgAnchor = null;
    if (bar) bar.insertAdjacentElement('afterend', m);
    else { const ed = root.querySelector('#bm-editor-box'); if (ed) ed.insertAdjacentElement('beforebegin', m); else root.appendChild(m); }
    const close = () => m.remove();
    m.querySelector('.bm-x').onclick = close;
    m.querySelector('.bm-cancel').onclick = close;
    const ok = m.querySelector('.bm-ok');
    ok.onclick = () => {
      let r;
      try { r = done(m); } catch (e) { status('出错：' + e.message, true); return; }
      if (r && typeof r.then === 'function') {
        ok.disabled = true;
        r.then(v => { if (v !== false) close(); else ok.disabled = false; })
          .catch(e => { ok.disabled = false; status('出错：' + e.message, true); });
      } else if (r !== false) close();
    };
    try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
  }

  // ---------- 6. 渲染 ----------
  function refreshSelect() {
    const s = root && root.querySelector('#bm-select');
    if (!s) return;
    if (!data.items.length) {
      s.innerHTML = '<option value="">（还没有美化，点“新建”）</option>';
      s.disabled = true;
      return;
    }
    s.disabled = false;
    s.innerHTML = data.items.map(i =>
      `<option value="${esc(i.id)}"${i.id === data.current ? ' selected' : ''}>${i.enabled ? '✓ ' : ''}${esc(i.name)}</option>`
    ).join('');
    s.value = data.current;
  }
  function syncEditor() {
    const ed = root && root.querySelector('#bm-editor');
    const cb = root && root.querySelector('#bm-enabled');
    if (!ed || !cb) return;
    const it = curItem();
    ed.value = it ? it.css : '';
    ed.disabled = !it;
    cb.disabled = !it;
    cb.checked = !!(it && it.enabled);
  }

  function render() {
    if (!root) return;
    root.innerHTML =
      `<div class="bm-wrap">` +
      `<select id="bm-select" class="bm-input"></select>` +
      `<div class="bm-tools" id="bm-tools">` +
      `<button type="button" class="bm-btn bm-primary" data-a="new">＋ 新建</button>` +
      `<button type="button" class="bm-btn" data-a="import">导入</button>` +
      `<button type="button" class="bm-btn" data-a="export">导出</button>` +
      `<button type="button" class="bm-btn" data-a="batch">批量管理</button></div>` +
      `<div id="bm-status"></div>` +
      `<div id="bm-batch"></div>` +
      `<div id="bm-editor-box">` +
      `<label class="bm-enable"><input type="checkbox" id="bm-enabled"> 启用这条美化（独立注入，换主题不会变）</label>` +
      `<textarea id="bm-editor" class="bm-input bm-editor" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="在这里输入 CSS，修改会自动保存并立即生效"></textarea></div>` +
      `<details class="bm-details"><summary>运行日志（出问题时把这里的内容发给我）</summary><pre id="bm-log">${esc(logs.join('\n'))}</pre></details></div>`;

    root.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => action(b.dataset.a, b); });

    root.querySelector('#bm-select').onchange = e => {
      flush();
      data.current = e.target.value;
      save();
      syncEditor();
    };
    root.querySelector('#bm-enabled').onchange = e => {
      const it = curItem();
      if (!it) return;
      it.enabled = e.target.checked;
      save(); applyStyle(); refreshSelect();
      status(it.enabled ? '已启用：' + it.name : '已停用：' + it.name);
      log((it.enabled ? '启用 ' : '停用 ') + it.name);
    };
    const ed = root.querySelector('#bm-editor');
    ed.oninput = () => {
      const it = curItem();
      if (!it) return;
      it.css = ed.value;
      clearTimeout(commitTimer);
      commitTimer = setTimeout(commit, 400);
    };
    ed.onblur = flush;

    refreshSelect();
    syncEditor();
    renderBatch();
  }

  function commit() {
    commitTimer = null;
    if (save()) { applyStyle(); status('已自动保存'); }
  }
  function flush() {
    if (commitTimer) { clearTimeout(commitTimer); commit(); }
  }

  // ---------- 7. 批量管理 ----------
  function renderBatch() {
    const box = root && root.querySelector('#bm-batch');
    if (!box) return;
    if (!batchOpen) { box.innerHTML = ''; return; }
    for (const id of Array.from(sel)) if (!data.items.some(i => i.id === id)) sel.delete(id);
    box.innerHTML =
      `<section class="bm-batch"><header><span>批量管理</span><button type="button" class="bm-x" data-b="close">×</button></header>` +
      `<div class="bm-batch-tools">` +
      `<button type="button" class="bm-btn bm-light" data-b="all">全选</button>` +
      `<button type="button" class="bm-btn bm-light" data-b="none">取消选择</button>` +
      `<button type="button" class="bm-btn danger" data-b="del">删除所选</button>` +
      `<button type="button" class="bm-btn bm-light" data-b="dl">下载所选</button>` +
      `<button type="button" class="bm-btn bm-light" data-b="dlall">合并下载</button></div>` +
      `<div class="bm-count" id="bm-count"></div>` +
      `<div class="bm-list">` +
      (data.items.length
        ? data.items.map(i =>
          `<div class="bm-row"><input type="checkbox" class="bm-chk" data-id="${esc(i.id)}"${sel.has(i.id) ? ' checked' : ''}>` +
          `<input type="text" class="bm-input bm-name" data-id="${esc(i.id)}" value="${esc(i.name)}"></div>`).join('')
        : '<div class="bm-empty">还没有美化</div>') +
      `</div></section>`;

    box.querySelectorAll('[data-b]').forEach(b => { b.onclick = () => batchAction(b.dataset.b, b); });
    box.querySelectorAll('.bm-chk').forEach(c => {
      c.onchange = () => { if (c.checked) sel.add(c.dataset.id); else sel.delete(c.dataset.id); updateBatchState(); };
    });
    box.querySelectorAll('.bm-name').forEach(inp => {
      inp.onchange = () => {
        const it = data.items.find(x => x.id === inp.dataset.id);
        if (!it) return;
        const v = inp.value.trim();
        if (!v) { inp.value = it.name; status('名称不能为空', true); return; }
        if (data.items.some(x => x !== it && x.name === v)) { inp.value = it.name; status('已有同名美化', true); return; }
        it.name = v;
        save(); refreshSelect();
        status('已改名：' + v);
        log('改名 → ' + v);
      };
    });
    updateBatchState();
  }

  function updateBatchState() {
    if (!root) return;
    const n = sel.size;
    const c = root.querySelector('#bm-count');
    if (c) c.textContent = `已选 ${n} / 共 ${data.items.length} 条（直接点名称即可改名）`;
    ['del', 'dl', 'dlall'].forEach(k => {
      const b = root.querySelector(`[data-b="${k}"]`);
      if (b) b.disabled = n === 0;
    });
  }

  function selectedItems() { return data.items.filter(i => sel.has(i.id)); }

  function batchAction(a, btn) {
    dlgAnchor = btn || null;
    if (a === 'close') { batchOpen = false; renderBatch(); return; }
    if (a === 'all') {
      data.items.forEach(i => sel.add(i.id));
      root.querySelectorAll('.bm-chk').forEach(c => { c.checked = true; });
      updateBatchState();
      return;
    }
    if (a === 'none') {
      sel.clear();
      root.querySelectorAll('.bm-chk').forEach(c => { c.checked = false; });
      updateBatchState();
      return;
    }
    const items = selectedItems();
    if (!items.length) { status('先勾选要操作的美化', true); return; }
    if (a === 'del') {
      showDialog('确认删除', `<div>确定删除所选的 <b>${items.length}</b> 条美化吗？删除后无法恢复，建议先“下载所选”备份。</div>`, () => {
        const ids = new Set(items.map(i => i.id));
        data.items = data.items.filter(i => !ids.has(i.id));
        if (!data.items.some(i => i.id === data.current)) data.current = data.items[0] ? data.items[0].id : null;
        sel.clear();
        save(); applyStyle(); render();
        status('已删除 ' + items.length + ' 条');
        log('删除 ' + items.length + ' 条');
      }, '删除', true);
      return;
    }
    if (a === 'dl') {
      items.forEach((it, i) => setTimeout(() => download(safeFileName(it.name) + '.txt', it.css), i * 700));
      status('开始下载 ' + items.length + ' 个文件（浏览器若拦截多文件下载，请改用“合并下载”）');
      log('下载 ' + items.length + ' 个 txt');
      return;
    }
    if (a === 'dlall') {
      download('美化合集_' + todayStr() + '.txt', buildCombined(items));
      status('已合并下载 ' + items.length + ' 条（导入时会自动拆开）');
      log('合并下载 ' + items.length + ' 条');
    }
  }

  // ---------- 8. 主要动作 ----------
  function importEntries(entries) {
    let n = 0, first = null;
    entries.forEach(e => {
      const name = uniqueName(String(e.name || '导入的美化').trim() || '导入的美化');
      const it = { id: uid(), name, css: String(e.css || ''), enabled: false };
      data.items.push(it);
      if (!first) first = it;
      n++;
    });
    if (first) data.current = first.id;
    return n;
  }

  async function handleFiles(files) {
    flush();
    let total = 0;
    const bad = [];
    for (const f of Array.from(files)) {
      try {
        const text = await readFileText(f);
        const entries = parseImport(text, f.name);
        if (!entries.length) { bad.push(f.name + '（内容为空）'); continue; }
        total += importEntries(entries);
      } catch (e) {
        bad.push(f.name + '（' + e.message + '）');
      }
    }
    if (total) { save(); render(); }
    const msg = total
      ? `已导入 ${total} 条（默认未启用，选中后勾选“启用”即可）` + (bad.length ? '；失败：' + bad.join('、') : '')
      : '没有导入任何内容' + (bad.length ? '：' + bad.join('、') : '');
    status(msg, !total);
    log(msg);
  }

  function action(a, btn) {
    dlgAnchor = btn || null;
    if (a === 'new') {
      showDialog('新建美化', '<input id="bm-f-name" class="bm-input" placeholder="美化名称">', m => {
        const name = m.querySelector('#bm-f-name').value.trim();
        if (!name) { status('名称不能为空', true); return false; }
        if (data.items.some(i => i.name === name)) { status('已有同名美化，换一个名字', true); return false; }
        const it = { id: uid(), name, css: '', enabled: true };
        data.items.push(it);
        data.current = it.id;
        save(); render();
        status('已新建：' + name);
        log('新建 ' + name);
      }, '创建');
      return;
    }
    if (a === 'import') {
      const f = document.getElementById('bm-file');
      if (f) f.click(); else status('找不到文件选择器', true);
      return;
    }
    if (a === 'export') {
      flush();
      const it = curItem();
      if (!it) { status('没有可导出的美化', true); return; }
      download(safeFileName(it.name) + '.txt', it.css);
      status('已导出：' + it.name + '.txt');
      log('导出 ' + it.name);
      return;
    }
    if (a === 'batch') {
      flush();
      batchOpen = !batchOpen;
      renderBatch();
      if (batchOpen) { const b = root.querySelector('#bm-batch'); try { b.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    }
  }

  // ---------- 9. 挂载 ----------
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = HOST_ID;
    panel.innerHTML =
      `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>美化管理器</b>` +
      `<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>` +
      `<div class="inline-drawer-content"><div id="bm-manager-root"></div>` +
      `<input type="file" id="bm-file" accept=".txt,text/plain" multiple hidden></div></div>`;
    root = panel.querySelector('#bm-manager-root');
    render();
    const fi = panel.querySelector('#bm-file');
    fi.onchange = () => {
      const files = Array.from(fi.files || []);
      fi.value = '';
      if (files.length) handleFiles(files);
    };
    return panel;
  }

  // 主挂载点：主题设置里「自定义 CSS」那一块的正下方
  function findAnchor(tries) {
    const css = document.getElementById('CustomCSS-block');
    if (css) return { el: css, mode: 'after' };
    const ta = document.getElementById('customCSS');
    if (ta) return { el: ta.closest('#CustomCSS-block') || ta.parentElement || ta, mode: 'after' };
    if (tries < 10) return null;   // 前几次只等主挂载点，之后才用备用位置
    const bk = document.getElementById('user-settings-block-content') || document.getElementById('user-settings-block');
    if (bk) return { el: bk, mode: 'append' };
    const ext = document.getElementById('extensions_settings2');
    if (ext) return { el: ext, mode: 'append' };
    return null;
  }

  let mountTries = 0;
  function mount() {
    if (document.getElementById(HOST_ID)) return true;
    const t = findAnchor(mountTries);
    if (!t) return false;
    const panel = createPanel();
    if (t.mode === 'after') t.el.insertAdjacentElement('afterend', panel);
    else t.el.appendChild(panel);
    log('面板已挂载到：' + (t.el.id || t.el.className) + '（' + t.mode + '）');
    return true;
  }

  function init() {
    applyStyle();      // 不等面板，先把美化注入页面
    watchHead();
    if (mount()) return;
    const timer = setInterval(() => {
      mountTries++;
      if (mount() || mountTries > 120) clearInterval(timer);
    }, 1000);
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  window.beautifyManager = {
    getItems: () => data.items.map(i => Object.assign({}, i)),
    parseImport,
    buildCombined,
    importEntries,
    safeFileName,
    applyStyle
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
