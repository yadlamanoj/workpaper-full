/* UI part 1: shell, shared widgets, overview, return explorer, documents, findings */
'use strict';
const R = { view: 'overview', line: 'F1040.24', form: null, area: null, doc: 'D08', page: 1, ev: null, tab: {}, filter: {}, sel: new Set(), drawer: null, q: '' };
let toastT = null;

/* ---------- small widgets ---------- */
function chip(text, cls = '') { return `<span class="chip ${cls}">${esc(text)}</span>`; }
function sevChip(s) { return chip({ crit: 'Must fix', warn: 'Review', info: 'Info', ok: 'Pass' }[s] || s, { crit: 'crit', warn: 'warn', info: 'info', ok: 'ok' }[s] || ''); }
function statusChip(s) { return chip({ open: 'Open', adjusted: 'Adjusted', corrected: 'Corrected', verified: 'Verified', accepted: 'Accepted with reason', passed: 'Passed' }[s] || s, { open: 'warn', adjusted: 'ok', corrected: 'ok', verified: 'ok', accepted: 'info', passed: 'ok' }[s] || ''); }
function lref(key) { const l = P.L[key]; return `<button class="ref" data-act="goline" data-k="${esc(key)}" title="${esc(l?.label || '')}">${esc(key)}</button>`; }
function rref(r) {
  const i = refInfo(r); if (!i) return '';
  if (P.L[r]) return lref(r);
  if (i.kind === 'value') return `<button class="ref" data-act="godoc" data-d="${i.doc}" data-p="${i.page}" data-e="${r}" title="${esc(i.label)}">${esc(r)}</button>`;
  if (i.kind === 'doc') return `<button class="ref" data-act="godoc" data-d="${i.doc}" data-p="${i.page || 1}" title="${esc(i.label)}">${esc(i.doc)}${i.page ? ' p' + i.page : ''}</button>`;
  return `<button class="ref" data-act="peek" data-r="${esc(r)}" title="${esc(i.label)}">${esc(r.length > 28 ? r.slice(0, 26) + '…' : r)}</button>`;
}
function effectChips(fed, ca) { return `${fed ? chip('Fed ' + signed(fed), fed > 0 ? 'crit' : 'ok') : ''} ${ca ? chip('CA ' + signed(ca), ca > 0 ? 'crit' : 'ok') : ''}`; }
function who(id) { return esc(staffName(id)); }
function ago(iso) { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return dshort(iso); }
function toast(msg, batch) {
  let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${batch ? `<button data-act="undo" data-b="${batch}">Undo</button>` : ''}`; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, batch ? 9000 : 3500);
}
function denied(action) { return !can(action) ? 'disabled title="Your role cannot do this"' : ''; }
function frozenAttr() { return isFrozen() ? 'disabled title="Return is filed and frozen. Start an amendment to change it."' : ''; }

/* ---------- shell ---------- */
function shell() {
  const u = Session.user; const role = roleOf(u);
  const fs = checks(); const openF = fs.filter(f => f.status === 'open' && f.kind !== 'pass' && f.severity !== 'info').length;
  const openN = Object.values(D().notes).filter(n => n.status === 'open').length;
  const nav = role === 'client' ? [['portal', 'Your return'], ['docs', 'Documents']] : [
    ['overview', 'Overview'], ['return', 'Return'], ['docs', 'Documents', P.pkt.documents.length], ['checks', 'Findings', openF || ''],
    ['schedules', 'Schedules'], ['changes', 'Changes', activeAdjs().length || ''], ['review', 'Review', openN || ''], ['filing', 'Filing'], ['timeline', 'Season replay'], ['firm', 'Firm'], ['portal', 'Client view']];
  const users = [...P.pkt.firm.staff.map(s => [s.id, `${s.name} · ${s.role.replace('_', ' ')}`]), ...P.pkt.firm.client_users.map(c => [c.id, `${c.name} · client`])];
  const notes = notifications();
  const t = totals(); const fsx = filingState();
  const phase = fsx.frozen && !isFrozen() ? chip('Amending', 'warn') : fsx.frozen ? chip('Filed · frozen', 'ok') : fsx.approved ? chip('Client approved', 'acc') : fsx.sent ? chip('With client', 'info') : chip('In preparation', '');
  return `
  <header class="topbar">
    <div class="brand"><b>Okafor-Lindqvist · 2025</b><span>Form 1040 + CA 540NR · MFJ · client CL-20417</span></div>
    ${phase}
    ${Session.asOf ? chip('Replaying as of ' + dshort(Session.asOf), 'warn') + ' <button class="btn sm" data-act="asof-clear">Back to now</button>' : ''}
    <div class="spacer"></div>
    <div class="search"><input id="q" class="inp" placeholder="Search lines, documents, values, notes" value="${esc(R.q)}" autocomplete="off"><div id="qres"></div></div>
    <div class="who">
      <button class="btn ghost bell" data-act="drawer" data-x="notes" aria-label="Notifications">🔔${notes.unread ? `<span class="count">${notes.unread}</span>` : ''}</button>
      <label class="small faint" for="user">Signed in as</label>
      <select id="user" data-act="user">${users.map(([id, n]) => `<option value="${id}" ${id === u ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    </div>
  </header>
  <div class="body">
    <nav class="rail" aria-label="Sections">
      ${nav.map(([v, l, b]) => `<a href="#${v}" data-act="nav" data-v="${v}" class="${R.view === v ? 'on' : ''}"><span>${l}</span>${b ? `<span class="badge faint">${b}</span>` : ''}</a>`).join('')}
      ${role !== 'client' ? `<div class="grp eyebrow">Estimated after adjustments</div>
      <div class="small railsum" style="padding:0 10px;display:flex;flex-direction:column;gap:4px">
        <div class="row between"><span>${t.fed.bal >= 0 ? 'Federal due' : 'Federal refund'}</span><b class="num">${money(Math.abs(t.fed.bal))}</b></div>
        <div class="row between"><span>${t.ca.bal <= 0 ? 'CA refund' : 'CA due'}</span><b class="num">${money(Math.abs(t.ca.bal))}</b></div>
        <div class="faint">${t.n} adjustments</div></div>` : ''}
    </nav>
    <main id="main" tabindex="-1">${view()}</main>
  </div>${R.drawer ? drawer() : ''}`;
}
function view() {
  try {
    if (roleOf(Session.user) === 'client' && !['portal', 'docs'].includes(R.view)) R.view = 'portal';
    return ({ overview: vOverview, return: vReturn, docs: vDocs, checks: vChecks, schedules: vSchedules, changes: vChanges, review: vReview, filing: vFiling, timeline: vTimeline, firm: vFirm, portal: vPortal }[R.view] || vOverview)();
  } catch (e) { console.error(e); return `<div class="panel pb stripe crit"><b>Something went wrong drawing this view.</b><div class="small">${esc(e.message)}</div></div>`; }
}

/* ---------- notifications ---------- */
function notifications() {
  const u = Session.user, role = roleOf(u), d = D(); const seen = d.seen[u] || '';
  const items = [];
  for (const n of Object.values(d.notes)) {
    const toMe = n.to === u || n.to === role || (role === 'client' && n.to === 'client');
    if (toMe && n.status === 'open') items.push({ at: n.at, text: `${staffName(n.actor)}: ${n.text}`, act: 'note', id: n.id });
    if (n.actor === u) for (const r of n.replies) if (r.actor !== u) items.push({ at: r.at, text: `${staffName(r.actor)} replied: ${r.text}`, act: 'note', id: n.id });
  }
  for (const [a, x] of Object.entries(d.assign)) if (x.who === u) items.push({ at: x.at, text: `Assigned ${AREA[a]?.label || a}, due ${x.due || '—'}`, act: 'area', id: a });
  for (const a of AREAS) { const s = signoffState(a.id); for (const [lvl, x] of Object.entries(s)) if (x.state === 'reopened' && x.by === u) items.push({ at: nowISO(), text: `Your ${lvl} sign-off on ${a.label} reopened: work changed after you signed.`, act: 'area', id: a.id }); }
  if (role === 'partner') for (const a of activeAdjs()) if (!a.approved) items.push({ at: a.at, text: `Approve adjustment on ${a.line} (${signed(a.fed || 0)} fed)`, act: 'adj', id: a.id });
  items.sort((a, b) => a.at < b.at ? 1 : -1);
  return { items, unread: items.filter(i => i.at > seen).length };
}

/* ---------- drawer (notifications, reference peek) ---------- */
function drawer() {
  const x = R.drawer;
  let title = '', body = '';
  if (x.kind === 'notes') {
    const n = notifications(); title = 'Notifications';
    body = (n.items.length ? n.items.map(i => `<div class="note"><div class="meta">${ago(i.at)}</div><div>${esc(i.text)}</div>${i.act === 'note' ? `<button class="btn sm" data-act="opennote" data-id="${i.id}">Open</button>` : i.act === 'area' ? `<button class="btn sm" data-act="nav" data-v="review">Open review</button>` : `<button class="btn sm" data-act="nav" data-v="changes">Open changes</button>`}</div>`).join('') : '<div class="empty">Nothing new.</div>')
      + `<button class="btn" data-act="seen">Mark all as seen</button>`;
  } else if (x.kind === 'peek') {
    const i = refInfo(x.r); title = i.label;
    body = `<div class="eyebrow">${esc(i.kind)}</div><div class="snippet">${esc(maskText(i.text || ''))}</div>`;
    if (i.kind === 'asset') { const a = P.V.v3.assets.find(a => a.asset_id === i.asset) || P.pkt.prior_years.asset_records.find(a => a.asset_id === i.asset); body += `<pre class="small" style="white-space:pre-wrap">${esc(JSON.stringify(a, null, 1))}</pre>`; }
    if (i.kind === 'client' && P.qa[x.r]) body += `<div class="small faint">Answered by ${esc(P.qa[x.r].answered_by)} on ${dshort(P.qa[x.r].answered_at)}</div>`;
    const lines = [...(P.refLines[x.r] || P.evLines[x.r] || [])];
    if (P.ev[x.r]) { const e = P.ev[x.r]; body += `<div class="src"><div class="small"><b>${esc(e.label)}</b> · ${typeof e.value === 'number' ? money(e.value) : esc(maskText(String(e.value)))} · confidence ${e.confidence}</div><div class="snippet">${snippetFor(e)}</div></div>`; }
    if (lines.length) body += `<div class="eyebrow">Used on</div><div class="row">${lines.map(lref).join(' ')}</div>`;
  }
  return `<aside class="drawer" role="dialog" aria-label="${esc(title)}"><div class="dh"><h2>${esc(title)}</h2><button class="btn ghost" data-act="drawer-close" aria-label="Close">✕</button></div><div class="db">${body}</div></aside>`;
}

/* ---------- Overview ---------- */
function vOverview() {
  const t = totals(); const e = t.engine; const fs = checks(); const bl = blockers(); const d = D();
  const open = fs.filter(f => f.status === 'open' && f.kind !== 'pass');
  const keyLines = ['F1040.1z', 'F1040.2b', 'F1040.3b', 'F1040.7', 'F1040.8', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.24', 'F1040.33', 'F1040.37'];
  const lastSeen = d.seen[Session.user] || '';
  const since = Store.events.filter(x => x.at > lastSeen && x.actor !== Session.user && x.type !== 'seen' && x.type !== 'view_sensitive');
  const peers = Presence.active();
  return `<div class="page">
  <div class="pagehead"><div><div class="eyebrow">Overview</div><h1>Where the return stands</h1></div>
    <div class="row">${peers.map(p => chip(`${staffName(p.user)} is on ${p.view}`, 'acc')).join(' ')}</div></div>
  <section class="panel"><div class="kpis">
    ${kpi('Federal total tax', t.fed.tax, t.fed.dTax, 'engine v3 ' + money(e.federal.total_tax))}
    ${kpi(t.fed.bal >= 0 ? 'Federal balance due' : 'Federal refund', Math.abs(t.fed.bal), t.fed.bal - e.federal.balance_due, 'after payments ' + money(t.fed.pay))}
    ${kpi('California total tax', t.ca.tax, t.ca.dTax, 'engine v3 ' + money(e.california.total_tax))}
    ${kpi('California refund', -t.ca.bal, t.ca.bal - e.california.balance_due, 'payments ' + money(t.ca.pay), true)}
    <div class="kpi"><div class="eyebrow">Open findings</div><div class="v">${open.filter(f => f.severity !== 'info').length}</div><div class="d faint">${fs.filter(f => f.severity === 'crit' && f.status === 'open').length} must fix</div></div>
    <div class="kpi"><div class="eyebrow">Blocking filing</div><div class="v">${bl.length}</div><div class="d faint">notes, findings, steps</div></div>
  </div><div class="pb small faint">Adjusted figures are the engine's v3 result plus each adjustment times the engine's marginal rate for its category. The engine recomputes the exact figures on the next run.</div></section>
  <div class="grid g2">
    <section class="panel"><div class="ph"><h2>Return summary vs 2024</h2><button class="btn sm" data-act="nav" data-v="schedules" data-tab="variance">All variances</button></div>
      <div class="pb flush tw"><table class="t"><thead><tr><th>Line</th><th class="n">2024</th><th class="n">2025</th><th class="n">Change</th><th></th></tr></thead><tbody>
      ${keyLines.map(k => { const l = P.L[k]; const pv = P.py.lines[k] ?? P.py.lines[k.replace('1z', '1a')]; const v = adjustedValue(k); const df = typeof pv === 'number' ? v - pv : null; const vr = variances().find(x => x.key === k);
        return `<tr class="click" data-act="goline" data-k="${k}"><td>${esc(l.label)} <span class="faint small">${k}</span></td><td class="n">${money(pv)}</td><td class="n">${money(v)}</td><td class="n">${df === null ? '—' : signed(df)}</td><td>${vr?.flag ? (explained(k) ? chip('Explained', 'ok') : chip('Explain', 'warn')) : ''}</td></tr>`; }).join('')}
      </tbody></table></div></section>
    <section class="panel"><div class="ph"><h2>Before this can be filed</h2>${chip(bl.length + ' items', bl.length ? 'warn' : 'ok')}</div>
      <div class="pb col">${bl.slice(0, 12).map(b => `<div class="stripe ${b.kind === 'finding' ? 'crit' : 'warn'} row between"><span>${esc(b.text)}</span>${b.kind === 'finding' ? `<button class="btn sm" data-act="gofind" data-id="${b.target}">Open</button>` : b.kind === 'note' ? `<button class="btn sm" data-act="opennote" data-id="${b.target}">Open</button>` : b.kind === 'adjust' ? `<button class="btn sm" data-act="nav" data-v="changes">Open</button>` : `<button class="btn sm" data-act="nav" data-v="filing">Open</button>`}</div>`).join('') || '<div class="empty">Nothing is blocking the return.</div>'}
      ${bl.length > 12 ? `<div class="faint small">and ${bl.length - 12} more on the Filing page.</div>` : ''}</div></section>
  </div>
  <section class="panel"><div class="ph"><h2>Areas</h2><span class="small faint">Sign-offs reopen automatically when anything they covered changes.</span></div>
    <div class="pb flush tw"><table class="t"><thead><tr><th>Area</th><th class="n">Lines</th><th class="n">Open findings</th><th class="n">Open notes</th><th>Preparer</th><th>Reviewer</th><th>Partner</th><th>Assigned</th><th class="n">Hours / budget</th></tr></thead><tbody>
    ${AREAS.map(a => { const so = signoffState(a.id); const f = fs.filter(x => x.area === a.id && x.status === 'open' && x.kind !== 'pass').length; const n = Object.values(d.notes).filter(x => x.status === 'open' && x.area === a.id).length; const as = d.assign[a.id];
      const hrs = d.time.filter(t => t.area === a.id).reduce((s, t) => s + (+t.hours || 0), 0); const bud = a.budget ? P.pkt.firm.budget_hours[a.budget] : null;
      return `<tr class="click" data-act="goarea" data-a="${a.id}"><td><b>${esc(a.label)}</b></td><td class="n">${areaKeys(a.id).length}</td><td class="n">${f || ''}</td><td class="n">${n || ''}</td>${['preparer', 'reviewer', 'partner'].map(l => `<td>${soChip(so[l])}</td>`).join('')}<td class="small">${as ? who(as.who) + (as.due ? ' · ' + as.due : '') : '<span class="faint">—</span>'}</td><td class="n">${fmt(hrs, 1)} / ${bud ?? '—'}</td></tr>`; }).join('')}
    </tbody></table></div></section>
  <section class="panel"><div class="ph"><h2>Since you last looked</h2><div class="row"><span class="small faint">${lastSeen ? 'Last marked ' + ago(lastSeen) : 'First visit'}</span><button class="btn sm" data-act="seen">Mark as seen</button></div></div>
    <div class="pb col">${since.slice(-15).reverse().map(evLine).join('') || '<div class="empty">No changes by others since you last looked.</div>'}</div></section>
  </div>`;
}
function kpi(label, v, delta, sub, inv) { const shown = inv ? -delta : delta; return `<div class="kpi"><div class="eyebrow">${label}</div><div class="v">${money(v)}</div><div class="d">${delta ? `<span style="color:var(${delta > 0 ? '--crit' : '--ok'})">${signed(shown)}</span> ${delta > 0 ? 'worse' : 'better'} vs engine` : '<span class="faint">no change</span>'} <span class="faint">· ${sub}</span></div></div>`; }
function soChip(x) { if (!x || x.state === 'none') return '<span class="faint">—</span>'; if (x.state === 'reopened') return chip('Reopened', 'crit'); return `<span class="tick" title="${who(x.by)} ${dshort(x.at)}">✓</span> <span class="small">${esc(staffName(x.by).split(' ')[0])}</span>`; }
function evLine(x) {
  const p = x.p || {};
  const T = {
    verify: () => `verified ${p.target} (${(p.method || '').replace(/_/g, ' ')})`, adjust: () => `adjusted ${p.line} by ${signed(p.lineDelta || 0)}: ${p.why || p.reason || ''}`, adjust_revert: () => `reverted an adjustment`, adjust_approve: () => 'approved an adjustment',
    note: () => `${p.kind === 'question' ? 'asked' : 'wrote'}: ${p.text}`, reply: () => `replied: ${p.text}`, resolve: () => 'resolved a note', signoff: () => `signed off ${AREA[p.area]?.label} as ${p.level}`,
    judgment: () => `recorded ${p.kind}: ${p.text}`, attach: () => `attached ${p.name} to ${p.target}`, assign: () => `assigned ${AREA[p.area]?.label} to ${staffName(p.who)}`, disposition: () => `recorded why ${p.doc} is not used`,
    dismiss: () => `accepted ${p.finding}: ${p.reason}`, correction: () => `corrected ${p.field} to ${p.to}`, filing: () => `filing step: ${p.kind.replace(/_/g, ' ')}`, whatif: () => `${p.on ? 'adopted' : 'dropped'} what-if ${p.id}`,
    standards: () => 'changed firm standards', time: () => `logged ${p.hours} h on ${AREA[p.area]?.label}`, link: () => `linked ${p.a} ↔ ${p.b}`, due_diligence: () => `completed due diligence for ${p.credit}`, reqstep: () => `${p.done ? 'completed' : 'reopened'} step ${p.step}`, undo: () => 'undid a change'
  }; const txt = T[x.type] ? T[x.type]() : x.type;
  return `<div class="small"><b>${who(x.actor)}</b> ${esc(maskText(txt))} <span class="faint">· ${ago(x.at)}</span></div>`;
}

/* ---------- Return explorer ---------- */
function vReturn() {
  const lines = P.V.v3.lines;
  const groups = {};
  for (const l of lines) { const a = areaOf(l.key); const f = formOf(l.key); ((groups[a] ||= {})[f] ||= []).push(l); }
  if (!R.form) { R.area = areaOf(R.line); R.form = formOf(R.line); }
  const list = (groups[R.area]?.[R.form] || []).filter(l => !(R.form === 'F8949' && l.rule === 'R-8949-LOT'));
  const d = D(); const fs = checks();
  const tree = AREAS.map(a => `<div class="area eyebrow" style="padding:4px 10px">${esc(a.label)}</div>` + Object.entries(groups[a.id] || {}).map(([f, ls]) =>
    `<a href="#return" data-act="goform" data-a="${a.id}" data-f="${f}" class="${R.area === a.id && R.form === f ? 'on' : ''}"><span>${esc(FORM_LABEL[f] || f)}</span><span class="faint small">${ls.length}</span></a>`).join('')).join('');
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Return · ${esc(AREA[R.area]?.label)}</div><h1>${esc(FORM_LABEL[R.form] || R.form)}</h1></div>
    <div class="row small faint">Engine run v3 · ${dshort(P.V.v3.computed_at)} · <span class="tick">✓</span> verified · Δ adjusted · ! finding · ✎ notes</div></div>
  <div class="explorer">
    <nav class="panel tree" aria-label="Forms">${tree}</nav>
    <section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Line</th><th>Description</th><th class="n">Engine</th><th class="n">Adjusted</th><th></th></tr></thead><tbody>
      ${list.map(l => { const av = adjustedValue(l.key); const ver = (d.verifs['line:' + l.key] || []).length; const f = fs.filter(x => x.lines.includes(l.key) && x.status === 'open' && x.kind !== 'pass').length; const n = Object.values(d.notes).filter(x => x.target === 'line:' + l.key && x.status === 'open').length;
        return `<tr class="click ${l.key === R.line ? 'sel' : ''} ${av !== l.value ? 'adj' : ''}" data-act="goline" data-k="${l.key}"><td class="small" style="white-space:nowrap">${esc(l.line)}</td><td>${esc(l.label)}</td><td class="n">${typeof l.value === 'number' ? money(l.value) : esc(maskText(l.value))}</td><td class="n v">${av !== l.value ? money(av) : ''}</td><td class="small" style="white-space:nowrap">${ver ? '<span class="tick">✓</span>' : ''}${av !== l.value ? ' Δ' : ''}${f ? ` <b style="color:var(--crit)">!</b>` : ''}${n ? ' ✎' : ''}</td></tr>`; }).join('')}
      ${R.form === 'F8949' ? `<tr><td colspan="5"><button class="btn sm" data-act="nav" data-v="schedules" data-tab="sales">Open all ${lines.filter(l => l.rule === 'R-8949-LOT').length} sales, grouped by account</button></td></tr>` : ''}
    </tbody></table></div></section>
    <aside class="panel proof" aria-label="Proof for selected line">${proof(R.line)}</aside>
  </div></div>`;
}

function buildTree(key, depth, seen = new Set()) {
  const l = P.L[key]; if (!l || depth > 3 || seen.has(key)) return '';
  seen.add(key);
  return `<ul class="buildtree">${(l.inputs || []).map(i => { const c = P.L[i]; if (!c) return `<li>${esc(i)}</li>`; const av = adjustedValue(i);
    return `<li><div class="node"><span>${lref(i)} <span class="small">${esc(c.label)}</span></span><span class="num">${typeof c.value === 'number' ? money(av) : esc(c.value)}${av !== c.value ? ' Δ' : ''}</span></div>${depth < 2 ? buildTree(i, depth + 1, seen) : ''}</li>`; }).join('')}</ul>`;
}
function snippetFor(e) {
  const pc = maskText(printed(e.document_id, e.page)); const t = maskText(e.text_as_read || '');
  const i = t ? pc.indexOf(t) : -1;
  if (i < 0) return esc(pc.slice(0, 160)) + (pc.length > 160 ? '…' : '');
  const a = Math.max(0, i - 70), b = Math.min(pc.length, i + t.length + 70);
  return (a ? '…' : '') + esc(pc.slice(a, i)) + `<mark>${esc(t)}</mark>` + esc(pc.slice(i + t.length, b)) + (b < pc.length ? '…' : '');
}
function proof(key) {
  const l = P.L[key]; if (!l) return '<div class="empty">Select a line.</div>';
  const d = D(); const av = adjustedValue(key); const fs = checks().filter(f => f.lines.includes(key));
  const vers = P.versions.map(v => [v, P.Lmap[v][key]?.value]);
  const adjs = Object.values(d.adjs).filter(a => a.line === key);
  const notes = Object.values(d.notes).filter(n => n.target === 'line:' + key);
  const ver = d.verifs['line:' + key] || [];
  const parents = [...(P.parents[key] || [])];
  const pv = P.py.lines[key]; const vr = variances().find(x => x.key === key);
  const atts = d.attach['line:' + key] || []; const links = d.links.filter(x => x.a === 'line:' + key || x.b === 'line:' + key);
  const rule = P.pkt.engine_reference.rules[l.rule];
  const events = Store.events.filter(e => JSON.stringify(e.p || {}).includes(`"${key}"`) || JSON.stringify(e.p || {}).includes('line:' + key));
  return `<div class="ph"><div class="col" style="gap:2px"><span class="eyebrow">${esc(FORM_LABEL[l.form] || l.form)} · line ${esc(l.line)} · ${l.jurisdiction}</span><h2>${esc(l.label)}</h2></div></div>
  <div class="pb col" style="gap:14px">
    <div class="row between"><div><div class="eyebrow">Engine v3</div><div class="num" style="font-size:18px">${typeof l.value === 'number' ? money(l.value) : esc(maskText(l.value))}</div></div>
      ${av !== l.value ? `<div><div class="eyebrow">Adjusted</div><div class="num" style="font-size:18px;color:var(--warn)">${money(av)}</div></div>` : ''}
      <div class="row">${ver.length ? chip('Verified', 'ok') : chip('Not verified')}${fs.filter(f => f.status === 'open' && f.kind !== 'pass').map(f => `<button class="ref" data-act="gofind" data-id="${f.id}">${esc(f.id)}</button>`).join(' ')}</div></div>
    ${fs.length ? `<div class="col">${fs.map(f => `<div class="stripe ${f.severity === 'ok' ? 'ok' : f.severity === 'crit' ? 'crit' : 'warn'} small"><b>${esc(f.title)}</b> ${statusChip(f.status)} <button class="btn sm ghost" data-act="gofind" data-id="${f.id}">Details</button></div>`).join('')}</div>` : ''}
    <div class="col"><h3>How it was built</h3><div class="small"><span class="ref">${esc(l.rule)}</span> ${esc(rule || '')}</div>${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}${(l.inputs || []).length ? buildTree(key, 0) : ''}</div>
    <div class="col"><h3>Where it came from</h3>${(l.sources || []).length ? l.sources.map(s => { const e = P.ev[s];
      if (e) { const vv = d.verifs['ev:' + s] || []; return `<div class="src"><div class="row between"><span class="small"><b>${esc(P.docs[e.document_id].title)}</b></span>${vv.length ? '<span class="tick" title="verified">✓</span>' : ''}</div>
        <div class="row between small"><span>${esc(e.label)} · page ${e.page}</span><span class="num">${typeof e.value === 'number' ? money(e.value) : esc(maskText(String(e.value)))}</span></div>
        <div class="snippet">${snippetFor(e)}</div>
        <div class="row small"><span class="faint">confidence ${e.confidence}</span>${e.confidence < 0.9 ? chip('low confidence', 'warn') : ''}<button class="btn sm" data-act="godoc" data-d="${e.document_id}" data-p="${e.page}" data-e="${s}">Open source</button>${can('verify') ? `<button class="btn sm" data-act="verify-ev" data-e="${s}" ${frozenAttr()}>Agreed to source</button>` : ''}</div></div>`; }
      const i = refInfo(s); return `<div class="src"><div class="small"><b>${esc(i.label)}</b></div>${i.text ? `<div class="snippet">${esc(maskText(i.text).slice(0, 260))}</div>` : ''}<div>${rref(s)}</div></div>`; }).join('') : '<div class="small faint">Computed from other lines; no document source.</div>'}</div>
    ${parents.length ? `<div class="col"><h3>Feeds into</h3><div class="row">${parents.map(lref).join(' ')}</div></div>` : ''}
    <div class="col"><h3>Verification</h3>${ver.map(v => `<div class="small"><span class="tick">✓</span> ${esc(v.method.replace(/_/g, ' '))} · ${who(v.actor)} · ${dshort(v.at)}${v.note ? ' · ' + esc(v.note) : ''}</div>`).join('') || '<div class="small faint">Nobody has verified this line yet.</div>'}
      ${can('verify') ? `<form class="row" data-form="verify" data-t="line:${key}"><select class="inp" name="method" aria-label="Verification method">${d.standards.verification_types.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('')}</select><input class="inp" name="note" placeholder="Note (optional)" style="flex:1"><button class="btn" ${frozenAttr()}>Record</button></form>` : ''}</div>
    <div class="col"><h3>Adjustments</h3>${adjs.map(adjCard).join('') || '<div class="small faint">No adjustments. The engine value stands.</div>'}
      ${can('adjust') && typeof l.value === 'number' ? `<details><summary class="small">Adjust this line</summary><form class="col" data-form="adjust" data-k="${key}" style="margin-top:6px">
        <div class="row"><label class="fld">Change (+/−)<input class="inp" name="delta" type="number" step="any" required></label><label class="fld">Tax effect category<select class="inp" name="cat">${[...CATS, 'fed_payment', 'ca_payment', 'none'].map(c => `<option value="${c}" ${c === defaultCat(key) ? 'selected' : ''}>${CAT_LABEL[c]}</option>`).join('')}</select></label></div>
        <label class="fld">Amount for the tax effect (in the category's terms; blank = same as change)<input class="inp" name="amt" type="number" step="any"></label>
        <label class="fld">Why<textarea class="inp" name="why" required placeholder="What is wrong and what the source says"></textarea></label>
        <label class="fld">Authority relied on<input class="inp" name="authority" placeholder="e.g. Reg. 1.263(a)-3; Pub 535"></label>
        <button class="btn primary" ${frozenAttr()}>Record adjustment</button><div class="small faint">The engine value is kept. Effects over ${fmt(thresholdPartner())} need partner approval.</div></form></details>` : ''}</div>
    <div class="col"><h3>Prior year and history</h3>
      <div class="small">2024: <b class="num">${money(pv)}</b>${vr ? ` · change ${signed(vr.diff)} (${fmt(vr.pct, 0)}%) ${vr.flag ? (explained(key) ? chip('Explained', 'ok') : chip('Needs explanation', 'warn')) : ''}` : ''}</div>
      ${vr?.flag && !explained(key) ? `<form class="row" data-form="variance" data-k="${key}"><input class="inp" name="text" required placeholder="Why it changed" style="flex:1"><button class="btn sm">Explain</button></form>` : ''}
      <div class="small">${vers.map(([v, x]) => `${v}: <span class="num">${typeof x === 'number' ? money(x) : esc(x ?? '—')}</span>`).join(' · ')}</div>
      ${events.length ? `<details><summary class="small">${events.length} recorded actions</summary>${events.map(evLine).join('')}</details>` : ''}</div>
    ${notesBlock('line:' + key, areaOf(key), notes)}
    <div class="col"><h3>Evidence and links</h3>${atts.map(attRow).join('')}${links.map(x => `<div class="small">↔ ${rref((x.a === 'line:' + key ? x.b : x.a).replace(/^line:/, ''))} ${esc(x.why || '')}</div>`).join('')}
      <div class="row">${can('attach') ? `<label class="btn sm">Attach file or note<input type="file" data-act="attach" data-t="line:${key}" hidden></label>` : ''}
      ${can('link') ? `<form class="row" data-form="link" data-a="line:${key}"><input class="inp" name="b" placeholder="Link to (line, D01, ev-…, 2024 line)" style="width:190px"><input class="inp" name="why" placeholder="Why" style="width:120px"><button class="btn sm">Link</button></form>` : ''}</div></div>
  </div>`;
}
function defaultCat(key) {
  const a = areaOf(key);
  if (/^SchA|F8283/.test(key)) return 'itemized'; if (/^Sch1\.(15|16|17|13)/.test(key)) return 'adjustment';
  if (/^SchC|SchSE/.test(key)) return 'schc_profit'; if (/^SchB/.test(key)) return 'interest'; if (/^F8949\.[ABCHGI]/.test(key)) return 'stcg'; if (/^F8949|SchD/.test(key)) return 'ltcg';
  if (/^F1040\.(25|26)|Sch3\.1[01]/.test(key)) return 'fed_payment'; if (/^F540NR\.7[1-3]/.test(key)) return 'ca_payment'; if (a === 'california') return 'ca_source_income';
  if (/^F1040\.1/.test(key)) return 'wages'; return 'ordinary_income';
}
function adjCard(a) {
  return `<div class="note ${a.status === 'reverted' ? '' : ''}"><div class="row between"><b class="num">${a.status === 'reverted' ? '<span class="strike">' : ''}${signed(a.lineDelta || 0)}${a.status === 'reverted' ? '</span>' : ''} on ${esc(a.line)}</b><span>${effectChips(a.fed - (a.fedPay || 0), a.ca - (a.caPay || 0))}</span></div>
  <div class="small">${esc(a.why || a.reason || '')}${a.authority ? ` · <i>${esc(a.authority)}</i>` : ''}</div>
  <div class="meta">${who(a.actor)} · ${dshort(a.at)}${a.finding ? ' · from ' + esc(a.finding) : ''} · ${a.status === 'reverted' ? 'reverted by ' + who(a.revertedBy) : a.approved ? (a.needsPartner ? 'partner approved' : 'active') : 'awaiting partner approval'}</div>
  <div class="row">${a.status === 'active' && !a.approved && can('approve_adjustment') && a.actor !== Session.user ? `<button class="btn sm primary" data-act="approve-adj" data-id="${a.id}">Approve</button>` : ''}${a.status === 'active' && can('adjust') ? `<button class="btn sm danger" data-act="revert-adj" data-id="${a.id}" ${frozenAttr()}>Revert</button>` : ''}</div></div>`;
}
function attRow(x) { return `<div class="small">📎 <b>${esc(x.name)}</b> <span class="faint">${x.size ? fmt(x.size / 1024, 0) + ' KB · ' : ''}${who(x.actor)} · ${dshort(x.at)}</span>${x.data && x.mime?.startsWith('image/') ? `<div><img src="${x.data}" alt="${esc(x.name)}" style="max-height:120px;border:1px solid var(--line)"></div>` : ''}${x.text ? `<div class="snippet">${esc(x.text.slice(0, 300))}</div>` : ''}</div>`; }
function notesBlock(target, area, notes) {
  const d = D(); notes = notes || Object.values(d.notes).filter(n => n.target === target);
  const staffOpts = P.pkt.firm.staff.map(s => `<option value="${s.id}">${esc(s.name)} (${s.role.replace('_', ' ')})</option>`).join('');
  return `<div class="col"><h3>Notes and questions</h3>${notes.map(noteCard).join('') || '<div class="small faint">No notes.</div>'}
  ${can('note') ? `<form class="col" data-form="note" data-t="${esc(target)}" data-a="${area}"><div class="row"><select class="inp" name="kind" aria-label="Note type"><option value="review">Review note</option>${can('question') ? '<option value="question">Question</option>' : ''}<option value="comment">Comment</option></select>
    <select class="inp" name="to" aria-label="To">${can('question') ? '<option value="client">Client (Ngozi and Erik)</option>' : ''}${staffOpts}<option value="" selected>Anyone on the team</option></select>
    <label class="small row"><input type="checkbox" name="blocking"> Blocks filing</label></div>
    <textarea class="inp" name="text" required placeholder="Write a note or question"></textarea><button class="btn">Add</button></form>` : ''}</div>`;
}
function noteCard(n) {
  const ans = D().answers[n.id];
  return `<div class="note ${n.blocking && n.status === 'open' ? 'blocking' : ''}" id="note-${n.id}"><div class="row between"><span class="small"><b>${esc({ review: 'Review note', question: 'Question', comment: 'Comment', variance: 'Variance' }[n.kind] || n.kind)}</b> ${n.to ? '→ ' + esc(n.to === 'client' ? 'client' : staffName(n.to)) : ''}</span>${n.status === 'open' ? (n.blocking ? chip('Blocks filing', 'crit') : chip('Open', 'warn')) : chip('Resolved', 'ok')}</div>
  <div>${esc(maskText(n.text))}</div><div class="meta">${who(n.actor)} · ${ago(n.at)} · on ${esc(n.target)}</div>
  ${n.replies.map(r => `<div class="reply small"><b>${who(r.actor)}</b>: ${esc(r.text)} <span class="faint">${ago(r.at)}</span></div>`).join('')}
  ${ans ? `<div class="small">${chip('Client answer is now evidence', 'acc')}</div>` : ''}
  ${n.status === 'resolved' ? `<div class="small faint">Resolved by ${who(n.resolvedBy)}: ${esc(n.resolution || '')}</div>` : ''}
  ${n.status === 'open' ? `<form class="row" data-form="reply" data-n="${n.id}"><input class="inp" name="text" placeholder="Reply" style="flex:1" required><button class="btn sm">Reply</button>${can('resolve_note') && !(n.actor === Session.user && n.kind === 'review') ? `<button type="button" class="btn sm" data-act="resolve" data-n="${n.id}">Resolve</button>` : ''}</form>` : ''}</div>`;
}

/* ---------- Documents ---------- */
function vDocs() {
  const d = D(); const asOf = Session.asOf; const st = R.filter.docs || 'all';
  const docs = P.pkt.documents.filter(x => !asOf || x.received_at <= asOf);
  const role = roleOf(Session.user);
  const usage = Object.fromEntries(docs.map(x => [x.id, docUsage(x.id)]));
  const shown = docs.filter(x => st === 'all' || usage[x.id].state === st);
  const counts = {}; for (const x of docs) counts[usage[x.id].state] = (counts[usage[x.id].state] || 0) + 1;
  if (!P.docs[R.doc] || (asOf && P.docs[R.doc].received_at > asOf)) R.doc = shown[0]?.id;
  const doc = P.docs[R.doc];
  const stLabel = { landed: 'On the return', support: 'Supports a step', superseded: 'Superseded', after: 'After last run', disposed: 'Not used (reason recorded)', unused: 'Needs a disposition' };
  const stCls = { landed: 'ok', support: 'info', superseded: '', after: 'info', disposed: '', unused: 'warn' };
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Documents</div><h1>Document index</h1></div>
    <div class="row">${['all', ...Object.keys(stLabel)].filter(k => k === 'all' || counts[k]).map(k => `<button class="btn sm ${st === k ? 'primary' : ''}" data-act="docfilter" data-s="${k}">${k === 'all' ? 'All ' + docs.length : stLabel[k] + ' ' + counts[k]}</button>`).join('')}</div></div>
  <div class="grid" style="grid-template-columns:minmax(0,380px) minmax(0,1fr)">
    <section class="panel" style="max-height:calc(100vh - 150px);overflow:auto"><div class="pb flush"><table class="t"><thead><tr><th>Doc</th><th>Title</th><th>Status</th></tr></thead><tbody>
    ${shown.map(x => `<tr class="click ${x.id === R.doc ? 'sel' : ''}" data-act="godoc" data-d="${x.id}" data-p="1"><td class="num">${x.id}</td><td><div class="small">${esc(x.title)}</div><div class="faint small">received ${dshort(x.received_at)} · ${esc(x.belongs_to)}</div></td><td>${chip(stLabel[usage[x.id].state], stCls[usage[x.id].state])}${x.marked_corrected ? chip('Corrected', 'info') : ''}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="col" style="gap:12px;min-width:0">${doc ? docViewer(doc, usage[doc.id]) : '<div class="empty">No documents yet at this point in the season.</div>'}</section>
  </div></div>`;
}
/* DocumentSource: today renders a simulated page from printed_content. A real page image/PDF
   renderer only has to implement renderPage(doc, page, highlights) with the same highlight list
   (value id, text, synthetic position) and everything else (tracing, verification) keeps working. */
const DocumentSource = {
  renderPage(doc, page, highlights, focusEv) {
    const raw = page.printed_content; let pieces = []; let cursor = 0; const used = [];
    const hs = highlights.map(e => ({ e, i: e.text_as_read ? raw.indexOf(e.text_as_read, 0) : -1 })).filter(h => h.i >= 0);
    // place each value at its first free occurrence
    const taken = [];
    for (const h of highlights) {
      if (!h.text_as_read || h.text_as_read === 'X') continue;
      const t = h.text_as_read; const okAt = (i) => i >= 0 && !/[0-9A-Za-z]/.test(raw[i - 1] || ' ') && !/[0-9A-Za-z]/.test(raw[i + t.length] || ' ') && !taken.some(([a, b]) => i < b && i + t.length > a);
      let i = raw.indexOf(t); while (i >= 0 && !okAt(i)) i = raw.indexOf(t, i + 1);
      if (i >= 0) { taken.push([i, i + h.text_as_read.length, h]); }
    }
    taken.sort((a, b) => a[0] - b[0]);
    for (const [a, b, h] of taken) { if (a < cursor) continue; pieces.push(esc(maskText(raw.slice(cursor, a)))); const bad = checks().some(f => f.refs.includes(h.id) && f.severity === 'crit');
      pieces.push(`<mark id="m-${h.id}" class="${h.id === focusEv ? 'focus' : ''} ${bad ? 'bad' : ''}" title="${esc(h.id + ' · ' + h.label + ' · confidence ' + h.confidence)}" data-act="markclick" data-e="${h.id}">${esc(maskText(raw.slice(a, b)))}</mark>`); cursor = b; used.push(h.id); }
    pieces.push(esc(maskText(raw.slice(cursor))));
    return { html: pieces.join(''), placed: used };
  }
};
function docViewer(doc, use) {
  const d = D(); const pg = doc.pages.find(p => p.page === R.page) || doc.pages[0]; R.page = pg.page;
  const evs = (P.evByDoc[doc.id] || []).filter(e => e.page === pg.page);
  const rendered = DocumentSource.renderPage(doc, pg, evs, R.ev);
  const unplaced = evs.filter(e => !rendered.placed.includes(e.id));
  const allEvs = P.evByDoc[doc.id] || [];
  const pageList = doc.pages.length > 12 ? doc.pages.filter(p => (P.evByDoc[doc.id] || []).some(e => e.page === p.page) || p.page === pg.page || /Additional|Supplemental/.test(p.printed_content)) : doc.pages;
  const sel = R.sel; const showFields = allEvs.length > 60 ? evs : allEvs;
  return `<section class="panel"><div class="ph"><div class="col" style="gap:2px"><span class="eyebrow">${doc.id} · ${esc(doc.document_type)} · ${esc(doc.issuer || '')}</span><h2>${esc(doc.title)}</h2></div>
    <div class="row">${chip(doc.extraction.status, doc.extraction.status === 'extracted' ? 'ok' : 'warn')}${(d.verifs['doc:' + doc.id] || []).length ? chip('Reviewed', 'ok') : ''}${can('verify') ? `<button class="btn sm" data-act="verify-doc" data-d="${doc.id}">Mark reviewed</button>` : ''}</div></div>
    <div class="pb col"><div class="small muted">Received ${dshort(doc.received_at)} from ${esc(doc.uploaded_by)} · file ${esc(doc.file_name)} · ${doc.page_count} pages${doc.extraction.reason ? ' · ' + esc(doc.extraction.reason) : ''}</div>
      <div class="stripe ${use.state === 'unused' ? 'warn' : use.state === 'landed' ? 'ok' : 'info'} small"><b>${use.lines.length ? 'Landed on ' + use.lines.length + ' lines' : 'Not on any return line'}.</b> ${esc(use.why || '')}
        ${use.lines.length ? `<div class="row" style="margin-top:4px">${use.lines.slice(0, 30).map(lref).join(' ')}${use.lines.length > 30 ? ` <span class="faint">+${use.lines.length - 30} more</span>` : ''}</div>` : ''}
        ${use.state === 'unused' && can('disposition') ? `<form class="row" data-form="disposition" data-d="${doc.id}" style="margin-top:6px"><input class="inp" name="reason" required placeholder="Why this document is not used" style="flex:1"><button class="btn sm">Record</button></form>` : ''}</div>
    </div></section>
  <section class="col" style="gap:8px"><div class="tabs" role="tablist">${pageList.map(p => `<button class="${p.page === pg.page ? 'on' : ''}" data-act="godoc" data-d="${doc.id}" data-p="${p.page}">Page ${p.page}</button>`).join('')}${pageList.length < doc.pages.length ? `<span class="small faint" style="padding:8px">${doc.pages.length - pageList.length} pages with no amounts hidden</span>` : ''}</div>
    <div class="row between"><span class="small faint">Simulated page from the document record. Highlights are the values the pipeline read; red marks are tied to a finding.</span>${cleared() && roleOf(Session.user) !== 'client' ? `<button class="btn sm" data-act="reveal">${Reveal.on ? 'Mask sensitive data' : 'Show sensitive data (logged)'}</button>` : chip('Sensitive data masked', 'info')}</div>
    <article class="paper">${doc.marked_corrected ? '<span class="stamp">CORRECTED</span>' : ''}<div class="ph1"><b>${esc(doc.issuer || doc.title)}</b><span class="small">${esc(doc.document_type)} · page ${pg.page} of ${doc.page_count}</span></div><p>${rendered.html}</p></article>
    ${unplaced.length ? `<div class="small faint">${unplaced.length} values on this page have no printed text to highlight (blank fields): ${unplaced.map(e => rref(e.id)).join(' ')}</div>` : ''}
  </section>
  <section class="panel"><div class="ph"><h3>Values read ${allEvs.length > 60 ? 'on this page' : 'from this document'} (${showFields.length})</h3>
    <div class="row">${can('bulk') ? `<button class="btn sm" data-act="bulk-verify" ${sel.size ? '' : 'disabled'}>Agree ${sel.size || ''} selected to source</button><button class="btn sm ghost" data-act="sel-all" data-d="${doc.id}">Select all</button>` : ''}</div></div>
    <div class="pb flush tw"><table class="t"><thead><tr><th></th><th>Value id</th><th>Field</th><th class="n">Value</th><th class="n">Conf.</th><th>Used on</th><th></th></tr></thead><tbody>
    ${showFields.map(e => { const v = (d.verifs['ev:' + e.id] || []).length; const ls = [...(P.evLines[e.id] || [])];
      return `<tr class="${e.id === R.ev ? 'sel' : ''}"><td>${can('bulk') ? `<input type="checkbox" data-act="sel" data-e="${e.id}" ${sel.has(e.id) ? 'checked' : ''} aria-label="Select ${e.id}">` : ''}</td><td><button class="ref" data-act="godoc" data-d="${doc.id}" data-p="${e.page}" data-e="${e.id}">${e.id}</button></td><td class="small">${esc(e.label)}</td><td class="n">${typeof e.value === 'number' ? money(e.value) : esc(maskText(String(e.value ?? '')))}</td><td class="n ${e.confidence < 0.9 ? '' : 'faint'}" style="${e.confidence < 0.9 ? 'color:var(--crit)' : ''}">${e.confidence}</td><td>${ls.slice(0, 3).map(lref).join(' ')}${ls.length > 3 ? ' +' + (ls.length - 3) : ''}</td><td>${v ? '<span class="tick">✓</span>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div></section>
  <section class="panel"><div class="pb col">${notesBlock('doc:' + doc.id, 'intake')}<div class="col"><h3>Evidence attached</h3>${(d.attach['doc:' + doc.id] || []).map(attRow).join('') || '<div class="small faint">None.</div>'}${can('attach') ? `<label class="btn sm" style="align-self:flex-start">Attach file<input type="file" data-act="attach" data-t="doc:${doc.id}" hidden></label>` : ''}</div></div></section>`;
}

/* ---------- Findings ---------- */
function vChecks() {
  const fs = checks(); const flt = R.filter.find || 'open';
  const shown = fs.filter(f => flt === 'all' || (flt === 'open' ? f.status === 'open' && f.kind !== 'pass' : flt === 'done' ? f.status !== 'open' : f.kind === flt));
  const order = { crit: 0, warn: 1, info: 2, ok: 3 };
  shown.sort((a, b) => order[a.severity] - order[b.severity]);
  const openProps = fs.filter(f => f.status === 'open' && f.props.length);
  const tf = openProps.reduce((t, f) => t + f.fed, 0), tc = openProps.reduce((t, f) => t + f.ca, 0);
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Findings</div><h1>Independent checks</h1><div class="small muted">These checks re-derive figures from the documents, client answers and agency records instead of trusting the engine.</div></div>
    <div class="row">${['open', 'done', 'all', 'pass', 'diagnostic'].map(k => `<button class="btn sm ${flt === k ? 'primary' : ''}" data-act="findfilter" data-s="${k}">${{ open: 'Open', done: 'Resolved', all: 'All', pass: 'Passed', diagnostic: 'Engine diagnostics' }[k]}</button>`).join('')}</div></div>
  ${openProps.length ? `<section class="panel"><div class="pb row between"><div><b>${openProps.length} open findings carry a proposed adjustment.</b> <span class="small muted">Applying all would change the federal amount owed by ${signed(tf)} and the California amount owed by ${signed(tc)} (estimated; payments count 1:1).</span></div>
    ${can('adjust') ? `<button class="btn primary" data-act="apply-all" ${frozenAttr()}>Apply all proposed adjustments</button>` : ''}</div></section>` : ''}
  <div class="col" style="gap:12px">${shown.map(findCard).join('') || '<div class="empty">Nothing here.</div>'}</div></div>`;
}
function findCard(f) {
  const d = D(); const acc = d.dismissed[f.id];
  return `<section class="panel" id="f-${f.id}"><div class="ph"><div class="row">${sevChip(f.severity)}<h3>${esc(f.title)}</h3></div><div class="row">${chip(AREA[f.area]?.label || f.area)}${statusChip(f.status)}${f.props.length ? effectChips(f.fed, f.ca) : ''}<span class="faint small num">${esc(f.id)}</span></div></div>
  <div class="pb col"><div>${esc(f.detail)}</div>
    ${f.refs.length ? `<div class="row"><span class="small faint">Evidence</span>${f.refs.filter(Boolean).slice(0, 14).map(rref).join(' ')}</div>` : ''}
    ${f.lines.length ? `<div class="row"><span class="small faint">Lines</span>${f.lines.filter(k => P.L[k]).map(lref).join(' ')}</div>` : ''}
    ${f.props.length ? `<div class="tw"><table class="t"><thead><tr><th>Proposed change</th><th>Line</th><th class="n">Change</th><th class="n">Fed tax</th><th class="n">CA tax</th></tr></thead><tbody>${f.props.map(p => `<tr><td class="small">${esc(p.why)}</td><td>${lref(p.line)}</td><td class="n">${signed(p.lineDelta)}</td><td class="n">${p.fedPay ? 'payment ' + signed(p.fedPay) : signed(p.fed)}</td><td class="n">${p.caPay ? 'payment ' + signed(p.caPay) : signed(p.ca)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${f.correction ? `<div class="small">Correction: <span class="strike">${esc(maskText(f.correction.from))}</span> → <b>${esc(maskText(f.correction.to || ''))}</b> ${d.corrections[f.correction.field] ? chip('Applied', 'ok') : ''}</div>` : ''}
    ${acc ? `<div class="small stripe info">Accepted by ${who(acc.actor)}: ${esc(acc.reason)}${acc.authority ? ' · ' + esc(acc.authority) : ''}</div>` : ''}
    ${f.status === 'open' && f.kind !== 'pass' ? `<div class="row">
      ${f.props.length && can('adjust') ? `<button class="btn primary" data-act="apply-find" data-id="${f.id}" ${frozenAttr()}>Apply proposed adjustment</button>` : ''}
      ${f.correction && can('adjust') ? `<button class="btn primary" data-act="apply-corr" data-id="${f.id}">Apply correction</button>` : ''}
      ${f.verify && can('verify') ? `<button class="btn primary" data-act="apply-verify" data-id="${f.id}">Record as ${esc(f.verify.method.replace(/_/g, ' '))}</button>` : ''}
      ${can('judgment') ? `<form class="row" data-form="dismiss" data-id="${f.id}"><input class="inp" name="reason" required placeholder="Accept as is: reason" style="width:220px"><input class="inp" name="authority" placeholder="Authority" style="width:130px"><button class="btn">Accept</button></form>` : ''}
      <button class="btn ghost" data-act="note-find" data-id="${f.id}">Add note</button></div>` : f.status === 'accepted' && can('judgment') ? `<button class="btn sm ghost" data-act="undismiss" data-id="${f.id}">Reopen</button>` : ''}
    ${R.noteFind === f.id ? notesBlock('finding:' + f.id, f.area) : Object.values(d.notes).filter(n => n.target === 'finding:' + f.id).map(noteCard).join('')}
  </div></section>`;
}
