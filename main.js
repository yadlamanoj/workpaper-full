/* Controller: rendering, actions, forms, search, startup */
'use strict';

function render(keepScroll = true) {
  const main = document.getElementById('main'); const st = keepScroll && main ? main.scrollTop : 0; const prevView = render._v;
  const qFocus = document.activeElement?.id === 'q';
  document.getElementById('app').innerHTML = shell();
  const m2 = document.getElementById('main'); if (m2 && keepScroll && prevView === R.view) m2.scrollTop = st;
  render._v = R.view;
  if (qFocus) { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); searchResults(); }
  if (R.scrollTo) { const el = document.getElementById(R.scrollTo); if (el) el.scrollIntoView({ block: 'center' }); R.scrollTo = null; }
  Presence.ping(R.view);
}
function go(view, extra = {}) { Object.assign(R, { view }, extra); R.sel = new Set(); render(false); }
function gotoLine(k) { if (!P.L[k]) return; R.line = k; R.area = areaOf(k); R.form = formOf(k); go('return'); }
function batchId() { return uid('b'); }

const ACT = {
  nav: (el) => { if (el.dataset.tab) R.tab.sched = el.dataset.tab; go(el.dataset.v); R.drawer = null; render(); },
  goline: (el) => { R.drawer = null; gotoLine(el.dataset.k); },
  goform: (el) => { R.area = el.dataset.a; R.form = el.dataset.f; const first = P.V.v3.lines.find(l => areaOf(l.key) === R.area && formOf(l.key) === R.form && !(R.form === 'F8949' && l.rule === 'R-8949-LOT')); R.line = first?.key || R.line; go('return'); },
  goarea: (el) => { const first = P.V.v3.lines.find(l => areaOf(l.key) === el.dataset.a); if (first) gotoLine(first.key); },
  godoc: (el) => { R.drawer = null; R.doc = el.dataset.d; R.page = +el.dataset.p || 1; R.ev = el.dataset.e || null; if (R.ev) R.scrollTo = 'm-' + R.ev; R.view = 'docs'; R.sel = new Set(); render(false); },
  markclick: (el) => { R.drawer = { kind: 'peek', r: el.dataset.e }; render(); },
  peek: (el) => { R.drawer = { kind: 'peek', r: el.dataset.r }; render(); },
  drawer: (el) => { R.drawer = { kind: el.dataset.x }; render(); },
  'drawer-close': () => { R.drawer = null; render(); },
  seen: () => { Store.append('seen', {}); R.drawer = null; render(); toast('Marked as seen'); },
  'verify-ev': (el) => { Store.append('verify', { target: 'ev:' + el.dataset.e, method: 'agreed_to_source_document' }); toast('Agreed to source'); render(); },
  'verify-doc': (el) => { Store.append('verify', { target: 'doc:' + el.dataset.d, method: 'agreed_to_source_document', note: 'Document reviewed' }); toast(el.dataset.d + ' marked reviewed'); render(); },
  'verify-id': () => { const b = batchId(); ['D04', 'D05'].forEach(d => Store.append('verify', { target: 'doc:' + d, method: 'agreed_to_source_document', note: 'Identity verified against driver license' }, { batch: b })); toast('Identity verified', b); render(); },
  docfilter: (el) => { R.filter.docs = el.dataset.s; render(); },
  findfilter: (el) => { R.filter.find = el.dataset.s; render(); },
  notefilter: (el) => { R.filter.notes = el.dataset.s; render(); },
  sel: (el) => { const k = el.dataset.e; R.sel.has(k) ? R.sel.delete(k) : R.sel.add(k); render(); },
  'sel-all': (el) => { const doc = P.docs[el.dataset.d]; const evs = (P.evByDoc[doc.id] || []); const list = evs.length > 60 ? evs.filter(e => e.page === R.page) : evs; list.forEach(e => R.sel.add(e.id)); render(); },
  'sel-lots': () => { const g = salesGroups()[R.filter.salesOpen] || []; const fl = new Set(checks().filter(f => f.status === 'open').flatMap(f => f.lines)); g.filter(l => !R.filter.salesIssues || fl.has(l.key)).forEach(l => R.sel.add(l.key)); render(); },
  'bulk-verify': () => { const b = batchId(); const n = R.sel.size; for (const e of R.sel) Store.append('verify', { target: 'ev:' + e, method: 'agreed_to_source_document', note: 'Bulk' }, { batch: b }); R.sel = new Set(); toast(`${n} values agreed to source`, b); render(); },
  'bulk-verify-lines': () => { const b = batchId(); const n = R.sel.size; for (const k of R.sel) Store.append('verify', { target: 'line:' + k, method: 'agreed_to_third_party_record', note: 'Agreed to Form 1099-B detail' }, { batch: b }); R.sel = new Set(); toast(`${n} sales agreed to 1099-B`, b); render(); },
  'apply-find': (el) => { const f = checks().find(x => x.id === el.dataset.id); const b = batchId(); applyFinding(f, b); toast(`Applied ${f.id}: fed ${signed(f.fed)}, CA ${signed(f.ca)}`, b); render(); },
  'apply-all': () => { const b = batchId(); const fs = checks().filter(f => f.status === 'open' && f.props.length); fs.forEach(f => applyFinding(f, b)); toast(`Applied ${fs.length} findings`, b); render(); },
  'apply-corr': (el) => { const f = checks().find(x => x.id === el.dataset.id); Store.append('correction', { ...f.correction, finding: f.id }); toast('Correction recorded; the original value is kept'); render(); },
  'apply-verify': (el) => { const f = checks().find(x => x.id === el.dataset.id); Store.append('verify', f.verify); toast('Verification recorded'); render(); },
  undismiss: (el) => { Store.append('undismiss', { finding: el.dataset.id }); render(); },
  'note-find': (el) => { R.noteFind = el.dataset.id; render(); },
  'approve-adj': (el) => { Store.append('adjust_approve', { id: el.dataset.id }); toast('Adjustment approved'); render(); },
  'revert-adj': (el) => { const b = batchId(); Store.append('adjust_revert', { id: el.dataset.id, reason: 'Reverted' }, { batch: b }); toast('Adjustment reverted (kept in the ledger)', b); render(); },
  resolve: (el) => { Store.append('resolve', { note: el.dataset.n, text: 'Resolved' }); render(); },
  opennote: (el) => { const n = D().notes[el.dataset.id]; R.drawer = null; if (!n) return; R.scrollTo = 'note-' + n.id;
    if (n.target.startsWith('line:')) return gotoLine(n.target.slice(5)); if (n.target.startsWith('doc:')) { R.doc = n.target.slice(4); R.page = 1; return go('docs'); }
    if (n.target.startsWith('finding:')) { R.noteFind = n.target.slice(8); R.filter.find = 'all'; R.scrollTo = 'f-' + R.noteFind; return go('checks'); }
    if (roleOf(Session.user) === 'client') return go('portal'); R.tab.rev = 'notes'; R.filter.notes = 'all'; go('review'); },
  gofind: (el) => { R.drawer = null; R.filter.find = 'all'; R.scrollTo = 'f-' + el.dataset.id; go('checks'); },
  tab: (el) => { R.tab[el.dataset.g] = el.dataset.k; R.sel = new Set(); render(false); },
  salesopen: (el) => { R.filter.salesOpen = R.filter.salesOpen === el.dataset.k ? null : el.dataset.k; R.sel = new Set(); render(); },
  salesissues: () => { R.filter.salesIssues = !R.filter.salesIssues; render(); },
  whatif: (el) => { Store.append('whatif', { id: el.dataset.id, on: el.dataset.on === '1' }); render(); },
  signoff: (el) => { const a = el.dataset.a, l = el.dataset.l; const prep = D().signoffs[a]?.preparer?.actor;
    if (l !== 'preparer' && prep === Session.user) return toast('You prepared this area; someone else must sign at this level.');
    if (l === 'partner' && !D().signoffs[a]?.reviewer) return toast('The reviewer signs before the partner.');
    const snap = areaSnapshot(a); Store.append('signoff', { area: a, level: l, hash: snap.hash, values: snap }); toast(`Signed off ${AREA[a].label} as ${l}`); render(); },
  unsign: (el) => { Store.append('signoff_remove', { area: el.dataset.a, level: el.dataset.l }); render(); },
  'send-approval': () => { Store.append('filing', { kind: 'sent_for_approval', totals: totals() }); toast('Sent to the client for approval'); render(); },
  efile: () => {
    const fixed = !!D().corrections['household.theo.ssn']; const ef = P.pkt.tax_agency_records.efile;
    if (!fixed) { const r = ef.find(x => x.status === 'rejected'); Store.append('filing', { kind: 'efile', jurisdiction: 'federal', status: 'rejected', submission: r.submission_id, error: r.errors.map(e => `${e.code}: ${e.message}`).join(' ') });
      Store.append('filing', { kind: 'efile', jurisdiction: 'california', status: 'not transmitted', submission: ef[1].submission_id, error: ef[1].errors[0].message }); toast('IRS rejected the return: dependent SSN mismatch'); }
    else { const a = ef.filter(x => x.status === 'accepted'); a.forEach(x => Store.append('filing', { kind: 'efile', jurisdiction: x.jurisdiction, status: 'accepted', submission: x.submission_id })); toast('Federal and California accepted'); }
    render(); },
  freeze: () => { const vals = Object.fromEntries(P.V.v3.lines.map(l => [l.key, adjustedValue(l.key)])); Store.append('filing', { kind: 'freeze', totals: totals(), hash: hash(JSON.stringify(vals)), values: vals }); toast('Filed return frozen. Later changes go into an amendment.'); render(); },
  amend: () => { Store.append('filing', { kind: 'amend_start' }); toast('Amendment started. The filed version is kept.'); render(); },
  asof: (el) => { Session.asOf = el.dataset.t; invalidate(); render(); toast('Viewing the file as of ' + dshort(Session.asOf)); },
  'asof-clear': () => { Session.asOf = null; invalidate(); render(); },
  reveal: () => { Reveal.on = !Reveal.on; if (Reveal.on) Store.append('view_sensitive', { what: `Unmasked ${R.view}${R.view === 'docs' ? ' ' + R.doc : ''}` }); render(); },
  export: () => { const box = document.getElementById('exportbox'); const txt = JSON.stringify({ packet: P.pkt.packet, events: Store.events }, null, 1); box.value = txt; box.hidden = false; box.select(); try { navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard'), () => toast('Select the text below and copy it')); } catch (e) { toast('Select the text below and copy it'); } },
  'reset-ask': () => { R.resetAsk = true; render(); }, 'reset-cancel': () => { R.resetAsk = false; render(); },
  reset: () => { Store.reset(); R.resetAsk = false; toast('All recorded work cleared'); render(); },
  undo: (el) => { Store.append('undo', { batch: el.dataset.b }); document.getElementById('toast').hidden = true; toast('Undone'); render(); },
};
function applyFinding(f, batch) {
  for (const p of f.props) Store.append('adjust', { line: p.line, lineDelta: p.lineDelta, cat: p.cat, amt: p.amt, fed: p.fed, ca: p.ca, fedPay: p.fedPay, caPay: p.caPay, why: p.why, finding: f.id, authority: f.authority || '' }, { batch });
}

const FORMS = {
  verify: (f, fd) => Store.append('verify', { target: f.dataset.t, method: fd.get('method'), note: fd.get('note') }),
  adjust: (f, fd) => {
    const k = f.dataset.k, delta = +fd.get('delta'), cat = fd.get('cat'); const amt = fd.get('amt') === '' ? delta : +fd.get('amt');
    let e = { fed: 0, ca: 0 }, fedPay = 0, caPay = 0;
    if (cat === 'fed_payment') fedPay = delta; else if (cat === 'ca_payment') caPay = delta; else if (cat !== 'none') e = effectOf(cat, amt);
    Store.append('adjust', { line: k, lineDelta: delta, cat, amt, fed: e.fed, ca: e.ca, fedPay, caPay, why: fd.get('why'), authority: fd.get('authority') });
    toast(`Adjustment recorded: fed ${signed(e.fed - fedPay)}, CA ${signed(e.ca - caPay)}`);
  },
  variance: (f, fd) => Store.append('judgment', { kind: 'variance', target: 'line:' + f.dataset.k, area: areaOf(f.dataset.k), text: fd.get('text'), authority: 'Prior-year comparison' }),
  note: (f, fd) => Store.append('note', { target: f.dataset.t, area: f.dataset.a, kind: fd.get('kind'), to: fd.get('kind') === 'question' && !fd.get('to') ? 'client' : fd.get('to'), blocking: !!fd.get('blocking'), text: fd.get('text') }),
  reply: (f, fd) => { Store.append('reply', { note: f.dataset.n, text: fd.get('text') }); if (roleOf(Session.user) === 'client') toast('Answer sent. It is now part of the evidence.'); },
  link: (f, fd) => { let b = fd.get('b').trim(); if (P.L[b]) b = 'line:' + b; Store.append('link', { a: f.dataset.a, b, why: fd.get('why') }); },
  dismiss: (f, fd) => Store.append('dismiss', { finding: f.dataset.id, reason: fd.get('reason'), authority: fd.get('authority') }),
  disposition: (f, fd) => Store.append('disposition', { doc: f.dataset.d, reason: fd.get('reason') }),
  judgment: (f, fd) => Store.append('judgment', { kind: fd.get('kind'), area: fd.get('area'), text: fd.get('text'), authority: fd.get('authority') }),
  assign: (f, fd) => Store.append('assign', { area: f.dataset.a, who: fd.get('who'), due: fd.get('due') }),
  dd: (f, fd) => Store.append('due_diligence', { credit: f.dataset.c, note: fd.get('note') }),
  time: (f, fd) => Store.append('time', { area: fd.get('area'), hours: +fd.get('hours'), note: fd.get('note') }),
  standards: (f, fd) => { const s = JSON.parse(JSON.stringify(D().standards)); s.variance_review.flag_if_change_over_percent = +fd.get('pct'); s.variance_review.and_over_amount = +fd.get('amt');
    const lines = (n) => fd.get(n).split('\n').map(x => x.trim()).filter(Boolean); s.verification_types = lines('vt'); s.rules = lines('rules'); s.required_steps = lines('steps'); Store.append('standards', { standards: s }); toast('Standards saved'); },
  approve: (f, fd) => { Store.append('filing', { kind: 'client_approved', pin: hash(fd.get('pin')), totals: totals() }); toast('Approved and signed. Thank you.'); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { /* allow toggle */ }
  if (el.disabled) return;
  fn(el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const fn = FORMS[f.dataset.form]; if (!fn) return;
  if (isFrozen() && ['adjust', 'verify'].includes(f.dataset.form)) return toast('The filed return is frozen. Start an amendment to change it.');
  fn(f, new FormData(f)); render();
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'user') { Session.user = el.value; Reveal.on = false; try { localStorage.setItem(USER_KEY, el.value); } catch (x) { } R.view = roleOf(el.value) === 'client' ? 'portal' : (R.view === 'portal' ? 'overview' : R.view); R.drawer = null; render(false); toast('Signed in as ' + staffName(el.value)); return; }
  if (el.dataset.act === 'cmp') { R.filter[el.dataset.w] = el.value; render(); return; }
  if (el.dataset.act === 'wi') { R.filter.wi = { cat: document.getElementById('wi-cat').value, amt: document.getElementById('wi-amt').value }; render(); return; }
  if (el.dataset.act === 'attach' && el.files?.[0]) {
    const file = el.files[0]; const t = el.dataset.t; const rec = { target: t, name: file.name, size: file.size, mime: file.type };
    if (file.size <= 400 * 1024) {
      if (/^text|json|csv/.test(file.type) || /\.(txt|md|csv|json|eml)$/i.test(file.name)) rec.text = await file.text();
      else rec.data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    } else rec.note = 'Stored as a reference only (file over 400 KB in this prototype).';
    Store.append('attach', rec);
    if (t.startsWith('note:')) Store.append('reply', { note: t.slice(5), text: 'Attached ' + file.name });
    toast('Attached ' + file.name); render(); return;
  }
  if (el.dataset.act === 'import' && el.files?.[0]) { try { const j = JSON.parse(await el.files[0].text()); Store.merge(j.events || [], true); Store.save(); toast(`Imported ${(j.events || []).length} events`); } catch (x) { toast('That file is not an exported workpaper.'); } render(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { R.q = e.target.value; searchResults(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && R.drawer) { R.drawer = null; render(); } if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); document.getElementById('q')?.focus(); } });

function searchResults() {
  const box = document.getElementById('qres'); if (!box) return; const q = R.q.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; return; }
  const out = [];
  for (const l of P.V.v3.lines) if (l.key.toLowerCase().includes(q) || l.label.toLowerCase().includes(q)) out.push(`<button class="ref" style="display:block;width:100%;text-align:left;margin:2px 0" data-act="goline" data-k="${l.key}">${esc(l.key)} · ${esc(l.label.slice(0, 60))}</button>`);
  for (const d of P.pkt.documents) if ((d.id + ' ' + d.title + ' ' + d.pages.map(p => p.printed_content).join(' ')).toLowerCase().includes(q)) out.push(`<button class="ref" style="display:block;width:100%;text-align:left;margin:2px 0" data-act="godoc" data-d="${d.id}" data-p="1">${d.id} · ${esc(d.title.slice(0, 60))}</button>`);
  for (const n of Object.values(D().notes)) if (n.text.toLowerCase().includes(q)) out.push(`<button class="ref" style="display:block;width:100%;text-align:left;margin:2px 0" data-act="opennote" data-id="${n.id}">Note · ${esc(n.text.slice(0, 60))}</button>`);
  for (const f of checks()) if ((f.title + f.detail).toLowerCase().includes(q)) out.push(`<button class="ref" style="display:block;width:100%;text-align:left;margin:2px 0" data-act="gofind" data-id="${f.id}">Finding ${f.id} · ${esc(f.title.slice(0, 50))}</button>`);
  box.innerHTML = out.length ? `<div class="panel" style="position:absolute;z-index:30;left:0;right:0;top:110%;max-height:360px;overflow:auto;padding:6px;box-shadow:var(--shadow)">${out.slice(0, 40).join('')}${out.length > 40 ? `<div class="small faint">${out.length - 40} more</div>` : ''}</div>` : `<div class="panel small faint" style="position:absolute;z-index:30;left:0;right:0;top:110%;padding:8px">No matches</div>`;
}

async function start() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Loading the Okafor-Lindqvist packet…</div>';
  let pkt = null;
  try { const r = await fetch(PACKET_URL); if (!r.ok) throw new Error(r.status); pkt = await r.json(); }
  catch (e) {
    app.innerHTML = `<div class="loading"><p>The packet could not be loaded from <code>${PACKET_URL}</code>.</p><label class="btn primary">Choose the packet file<input type="file" accept="application/json" id="pktfile" hidden></label></div>`;
    document.getElementById('pktfile').addEventListener('change', async (ev) => { try { boot(JSON.parse(await ev.target.files[0].text())); } catch (x) { app.innerHTML = '<div class="loading">That file is not a valid packet.</div>'; } });
    return;
  }
  boot(pkt);
}
function boot(pkt) {
  indexPacket(pkt); Store.load();
  try { const u = localStorage.getItem(USER_KEY); if (u && (P.staff[u] || u.startsWith('cu-'))) Session.user = u; } catch (e) { }
  const h = (location.hash || '').replace('#', ''); if (['overview', 'return', 'docs', 'checks', 'schedules', 'changes', 'review', 'filing', 'timeline', 'firm', 'portal'].includes(h)) R.view = h;
  if (roleOf(Session.user) === 'client') R.view = 'portal';
  Store.listeners.push(() => { if (!document.activeElement || !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) render(); });
  render(false);
  setInterval(() => Presence.ping(R.view), 5000);
}
start();
