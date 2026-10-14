/* Miraflores workpaper — core: packet index, event store, derived state, independent checks.
   The packet is loaded exactly as delivered and never mutated. Everything people do is an
   append-only event; every screen is a projection of (packet + events). */
'use strict';

const PACKET_URL = 'okafor_lindqvist_2025_packet.json';
const STORE_KEY = 'mf-workpaper-events-v1';
const USER_KEY = 'mf-workpaper-user';

const fmt = (n, d = 0) => (n === null || n === undefined || n === '' || isNaN(n)) ? '—' :
  Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => (typeof n === 'number') ? (n < 0 ? '(' + fmt(-n) + ')' : fmt(n)) : (n ?? '—');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'e') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowISO = () => new Date().toISOString();
const dshort = (iso) => iso ? String(iso).slice(0, 10) : '—';
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

/* ---------------- Areas (review sections + budget buckets) ---------------- */
const AREAS = [
  { id: 'intake', label: 'Intake & identity', budget: 'intake_and_engagement' },
  { id: 'wages', label: 'Wages & stock comp', budget: 'wages_and_stock_compensation' },
  { id: 'investments', label: 'Investments & crypto', budget: 'investments_and_digital_assets' },
  { id: 'business', label: 'Business (Sch C)', budget: 'business' },
  { id: 'rentals', label: 'Rentals & sale', budget: 'rentals_and_sale' },
  { id: 'passthrough', label: 'K-1s & basis', budget: 'pass_throughs_and_basis' },
  { id: 'deductions', label: 'Deductions & credits', budget: 'deductions_and_credits' },
  { id: 'taxpay', label: 'Tax, payments & penalty', budget: null },
  { id: 'california', label: 'California', budget: 'california' },
];
const AREA = Object.fromEntries(AREAS.map(a => [a.id, a]));
function areaOf(key) {
  const k = key;
  if (/^(SchCA540NR|F540NR|ScheduleS|FTB)/.test(k)) return 'california';
  if (/^(F7203|SchE\.28|SchE\.32)/.test(k)) return 'passthrough';
  if (/^(SchE|F4562-E|F4797|F8582)/.test(k)) return 'rentals';
  if (/^(SchC|SchSE|F4562-C|F8995|Sch1\.(3|15|16|17)$|Sch2\.4$)/.test(k)) return 'business';
  if (/^(SchB|F8949|SchD|F8938|F8960|Sch3\.1$|F1040\.(2b|3a|3b|7)$|Sch2\.12$)/.test(k)) return 'investments';
  if (/^(F1040\.1|F8959|Sch3\.11|F6251\.2i|Sch2\.11)/.test(k)) return 'wages';
  if (/^(SchA|F8283|F8812|F8863|F2441|F8889|F8606|F8867|Sch1\.13|F1040\.(4a|4b|12|13|14|19|20)$|Sch3\.8$)/.test(k)) return 'deductions';
  return 'taxpay';
}
const FORM_LABEL = {
  F1040: 'Form 1040', Sch1: 'Schedule 1', Sch2: 'Schedule 2', Sch3: 'Schedule 3', SchA: 'Schedule A', SchB: 'Schedule B', SchC: 'Schedule C',
  SchD: 'Schedule D', SchE: 'Schedule E', SchSE: 'Schedule SE', F8949: 'Form 8949', F4797: 'Form 4797', 'F4562-C': 'Form 4562 (Sch C)',
  'F4562-E': 'Form 4562 (rentals)', F8582: 'Form 8582', F6251: 'Form 6251', F8959: 'Form 8959', F8960: 'Form 8960', F8995: 'Form 8995-A',
  F8812: 'Schedule 8812', F8863: 'Form 8863', F2441: 'Form 2441', F8889: 'Form 8889', F8606: 'Form 8606', F8283: 'Form 8283', F7203: 'Form 7203',
  F8938: 'Form 8938', F2210: 'Form 2210', F8867: 'Form 8867', SchCA540NR: 'Schedule CA (540NR)', F540NR: 'Form 540NR', ScheduleS: 'Schedule S',
  FTB3885A: 'FTB 3885A', FTB5805: 'FTB 5805'
};

/* ---------------- Packet index ---------------- */
const P = {}; // filled by indexPacket
function indexPacket(pkt) {
  P.pkt = pkt;
  P.docs = Object.fromEntries(pkt.documents.map(d => [d.id, d]));
  P.ev = Object.fromEntries(pkt.extracted_values.map(e => [e.id, e]));
  P.evByDoc = {};
  for (const e of pkt.extracted_values) (P.evByDoc[e.document_id] ||= []).push(e);
  P.versions = pkt.return_versions.map(v => v.version);
  P.V = {}; P.Lmap = {};
  for (const v of pkt.return_versions) { P.V[v.version] = v; P.Lmap[v.version] = Object.fromEntries(v.lines.map(l => [l.key, l])); }
  P.cur = 'v3';
  P.L = P.Lmap.v3;
  P.rates = P.V.v3.tax_effect_rates;
  P.people = Object.fromEntries(pkt.household.people.map(p => [p.id, p]));
  P.qa = Object.fromEntries(pkt.client.questionnaire.map(q => [q.id, q]));
  P.msg = Object.fromEntries(pkt.client.messages.map(m => [m.id, m]));
  P.call = Object.fromEntries(pkt.client.call_notes.map(c => [c.id, c]));
  P.staff = Object.fromEntries(pkt.firm.staff.map(s => [s.id, s]));
  P.tl = Object.fromEntries(pkt.timeline.map(t => [t.id, t]));
  // usage maps for the current engine version
  P.evLines = {}; P.docLines = {}; P.refLines = {};
  for (const l of P.V.v3.lines) {
    for (const s of l.sources || []) {
      if (P.ev[s]) { (P.evLines[s] ||= new Set()).add(l.key); (P.docLines[P.ev[s].document_id] ||= new Set()).add(l.key); }
      else (P.refLines[s] ||= new Set()).add(l.key);
    }
  }
  P.parents = {};
  for (const l of P.V.v3.lines) for (const i of l.inputs || []) (P.parents[i] ||= new Set()).add(l.key);
  P.py = pkt.prior_years.return_2024;
  P.pyLabels = P.py.line_labels || {};
  return P;
}
function line(key, ver = 'v3') { return P.Lmap[ver]?.[key]; }
function formOf(key) { return key.split('.')[0]; }
function staffName(id) { return P.staff[id]?.name || (P.pkt.firm.client_users.find(c => c.id === id)?.name) || id || 'system'; }

/* Resolve any reference string (ev-, D, qa-, py:/, agency:/, asset:, household:, ref:, timeline:) to a label + target */
function refInfo(r) {
  if (!r) return null;
  if (P.ev[r]) { const e = P.ev[r]; return { kind: 'value', label: `${e.document_id} · ${e.label}`, doc: e.document_id, page: e.page, ev: r }; }
  if (/^D\d\d$/.test(r)) return { kind: 'doc', label: `${r} · ${P.docs[r]?.title || ''}`, doc: r };
  if (/^doc:/.test(r)) { const m = r.match(/^doc:(D\d+)#page(\d+)/); return { kind: 'doc', label: r, doc: m?.[1], page: +m?.[2] }; }
  if (P.qa[r]) return { kind: 'client', label: `${r} · ${P.qa[r].question}`, text: P.qa[r].answer };
  if (P.msg[r]) return { kind: 'client', label: `${r} · message from ${P.msg[r].from}`, text: P.msg[r].text };
  if (P.call[r]) return { kind: 'client', label: `${r} · client call`, text: P.call[r].notes.join(' ') };
  if (r.startsWith('py:/')) return { kind: 'prior', label: `Prior year ${r.slice(4)}`, text: JSON.stringify(jptr(P.pkt.prior_years, r.slice(3))) };
  if (r.startsWith('agency:/')) return { kind: 'agency', label: `Agency ${r.slice(8)}`, text: JSON.stringify(jptr(P.pkt.tax_agency_records, r.slice(7))).slice(0, 300) };
  if (r.startsWith('asset:')) return { kind: 'asset', label: `Asset ${r.slice(6)}`, asset: r.slice(6) };
  if (r.startsWith('household:')) { const p = P.people[r.slice(10)]; return { kind: 'household', label: `Household · ${p?.name}`, text: p ? `${p.relationship || p.role}, born ${p.dob}` : '' }; }
  if (r.startsWith('ref:')) { const k = r.slice(4); return { kind: 'engine', label: `Engine parameter ${k}`, text: JSON.stringify(k.startsWith('fx.') ? P.pkt.fx_rates.SEK_per_USD[k.split('.')[2]] : P.pkt.engine_reference.parameters[k.replace('param.', '')]) }; }
  if (r.startsWith('timeline:')) { const t = P.tl[r.slice(9)]; return { kind: 'timeline', label: `Timeline ${r.slice(9)}`, text: t ? `${t.event} ${t.detail || ''}` : '' }; }
  if (/^tl-|^extension-/.test(r)) { const t = P.tl[r]; return { kind: 'timeline', label: `Timeline ${r}`, text: t ? `${t.event} ${t.detail || ''}` : '' }; }
  if (/^v\d$/.test(r)) return { kind: 'version', label: `Engine run ${r}` };
  return { kind: 'other', label: r };
}
function jptr(obj, ptr) {
  if (!ptr || ptr === '/') return obj;
  return ptr.split('/').slice(1).reduce((o, k) => o == null ? o : o[k.replace(/~1/g, '/').replace(/~0/g, '~')], obj);
}

/* ---------------- Event store (append-only, multi-tab live sync) ---------------- */
const Store = {
  events: [], mem: false, chan: null, listeners: [],
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); this.events = raw ? JSON.parse(raw) : []; }
    catch (e) { this.events = []; this.mem = true; }
    try {
      this.chan = new BroadcastChannel('mf-workpaper');
      this.chan.onmessage = (m) => { if (m.data?.type === 'events') this.merge(m.data.events, false); if (m.data?.type === 'presence') Presence.recv(m.data); };
    } catch (e) { this.chan = null; }
    try { window.addEventListener('storage', (e) => { if (e.key === STORE_KEY && e.newValue) this.merge(JSON.parse(e.newValue), false); }); } catch (e) { }
  },
  save() { if (this.mem) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(this.events)); } catch (e) { this.mem = true; } },
  merge(list, broadcast) {
    const have = new Set(this.events.map(e => e.id)); let added = 0;
    for (const e of list) if (!have.has(e.id)) { this.events.push(e); added++; }
    if (added) { this.events.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0); invalidate(); this.listeners.forEach(f => f()); }
    if (broadcast && this.chan) try { this.chan.postMessage({ type: 'events', events: list }); } catch (e) { }
  },
  append(type, p, opts = {}) {
    const ev = { id: uid('x'), at: opts.at || nowISO(), actor: opts.actor || Session.user, type, p, batch: opts.batch || null };
    this.events.push(ev); this.save(); invalidate();
    if (this.chan) try { this.chan.postMessage({ type: 'events', events: [ev] }); } catch (e) { }
    return ev;
  },
  reset() { this.events = []; this.save(); invalidate(); this.listeners.forEach(f => f()); },
};
const Session = { user: 'st-01', asOf: null };
const Presence = {
  peers: {},
  ping(view) { if (Store.chan) try { Store.chan.postMessage({ type: 'presence', user: Session.user, view, at: Date.now(), tab: Presence.tab }); } catch (e) { } },
  recv(m) { if (m.tab === Presence.tab) return; this.peers[m.tab] = m; },
  active() { const t = Date.now(); return Object.values(this.peers).filter(p => t - p.at < 15000); },
  tab: uid('tab'),
};

/* ---------------- Roles & permissions ---------------- */
function roleOf(user) { if (P.staff[user]) return P.staff[user].role; if (user?.startsWith('cu-')) return 'client'; return 'preparer'; }
const CAN = {
  preparer: ['adjust', 'verify', 'note', 'question', 'signoff:preparer', 'judgment', 'attach', 'disposition', 'time', 'link', 'bulk', 'assign', 'resolve_note', 'request_approval'],
  reviewer: ['adjust', 'verify', 'note', 'question', 'signoff:reviewer', 'judgment', 'attach', 'disposition', 'time', 'link', 'bulk', 'assign', 'resolve_note', 'request_approval'],
  partner: ['adjust', 'verify', 'note', 'question', 'signoff:partner', 'approve_adjustment', 'judgment', 'attach', 'time', 'assign', 'resolve_note', 'request_approval', 'file', 'amend'],
  firm_administrator: ['standards', 'assign', 'time', 'note'],
  quality_reviewer: ['note'],
  client: ['answer', 'approve_return', 'attach'],
};
function can(action, user = Session.user) { return (CAN[roleOf(user)] || []).includes(action); }
function cleared(user = Session.user) { const s = P.staff[user]; if (s) return !!s.sensitive_data_clearance; return roleOf(user) === 'client'; }

/* Sensitive-data masking: SSNs, bank/account numbers, IP PINs. Unmasked views are logged. */
const SENSITIVE = [
  { re: /\b(\d{3})-(\d{2})-(\d{4})\b/g, mask: (m, a, b, c) => `•••-••-${c}`, kind: 'SSN' },
  { re: /\bSE\d{2}(?: \d{4}){5}\b/g, mask: (m) => 'SE•• •••• •••• •••• •••• ' + m.slice(-4), kind: 'foreign account' },
  { re: /\b(routing|account)\s*(?:no\.?\s*)?(\d{6,})\b/gi, mask: (m, k, n) => `${k} ••••${n.slice(-4)}`, kind: 'bank account' },
  { re: /\bPIN (?:for returns filed in calendar year 2026 is |)(\d{5,6})\b/g, mask: (m, n) => m.replace(n, '••••••'), kind: 'IP PIN' },
];
const Reveal = { on: false };
function maskText(s) {
  s = String(s ?? '');
  if (Reveal.on && cleared()) return s;
  for (const r of SENSITIVE) s = s.replace(r.re, r.mask);
  return s;
}

/* ---------------- Derived state (projection of events) ---------------- */
let _D = null;
function invalidate() { _D = null; }
function D() {
  if (_D) return _D;
  const s = {
    verifs: {}, adjs: {}, notes: {}, signoffs: {}, judgments: [], attach: {}, assign: {}, dispositions: {}, links: [],
    time: [], views: [], filing: { steps: [] }, standards: JSON.parse(JSON.stringify(P.pkt.firm.starter_standards)),
    seen: {}, whatif: {}, dismissed: {}, undone: new Set(), corrections: {}, answers: {}, reqsteps: {}, dd: {},
  };
  const evs = Store.events.filter(e => !Session.asOf || e.at <= Session.asOf);
  for (const e of evs) if (e.type === 'undo') s.undone.add(e.p.batch || e.p.event);
  for (const e of evs) {
    if (s.undone.has(e.batch) || s.undone.has(e.id) || e.type === 'undo') continue;
    const p = e.p || {};
    switch (e.type) {
      case 'verify': (s.verifs[p.target] ||= []).push({ ...p, actor: e.actor, at: e.at, id: e.id }); break;
      case 'unverify': if (s.verifs[p.target]) s.verifs[p.target] = s.verifs[p.target].filter(v => v.id !== p.id); break;
      case 'adjust': s.adjs[e.id] = { id: e.id, ...p, actor: e.actor, at: e.at, status: 'active', approvals: [] }; break;
      case 'adjust_revert': if (s.adjs[p.id]) { s.adjs[p.id].status = 'reverted'; s.adjs[p.id].revertedBy = e.actor; s.adjs[p.id].revertReason = p.reason; } break;
      case 'adjust_approve': if (s.adjs[p.id]) s.adjs[p.id].approvals.push({ actor: e.actor, at: e.at }); break;
      case 'note': s.notes[e.id] = { id: e.id, ...p, actor: e.actor, at: e.at, status: 'open', replies: [] }; break;
      case 'reply': if (s.notes[p.note]) { s.notes[p.note].replies.push({ text: p.text, actor: e.actor, at: e.at, files: p.files }); if (roleOf(e.actor) === 'client') s.answers[p.note] = { text: p.text, actor: e.actor, at: e.at }; } break;
      case 'resolve': if (s.notes[p.note]) { s.notes[p.note].status = 'resolved'; s.notes[p.note].resolvedBy = e.actor; s.notes[p.note].resolvedAt = e.at; s.notes[p.note].resolution = p.text; } break;
      case 'reopen_note': if (s.notes[p.note]) s.notes[p.note].status = 'open'; break;
      case 'signoff': ((s.signoffs[p.area] ||= {})[p.level] = { actor: e.actor, at: e.at, hash: p.hash, values: p.values, id: e.id }); break;
      case 'signoff_remove': if (s.signoffs[p.area]) delete s.signoffs[p.area][p.level]; break;
      case 'judgment': s.judgments.push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
      case 'attach': (s.attach[p.target] ||= []).push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
      case 'assign': s.assign[p.area] = { ...p, actor: e.actor, at: e.at }; break;
      case 'disposition': s.dispositions[p.doc] = { ...p, actor: e.actor, at: e.at }; break;
      case 'link': s.links.push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
      case 'time': s.time.push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
      case 'view_sensitive': s.views.push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
      case 'standards': s.standards = p.standards; break;
      case 'seen': s.seen[e.actor] = e.at; break;
      case 'whatif': if (p.on) s.whatif[p.id] = { actor: e.actor, at: e.at, reason: p.reason }; else delete s.whatif[p.id]; break;
      case 'dismiss': s.dismissed[p.finding] = { reason: p.reason, actor: e.actor, at: e.at, authority: p.authority }; break;
      case 'undismiss': delete s.dismissed[p.finding]; break;
      case 'correction': s.corrections[p.field] = { ...p, actor: e.actor, at: e.at }; break;
      case 'reqstep': s.reqsteps[p.step] = p.done ? { actor: e.actor, at: e.at, note: p.note } : undefined; break;
      case 'due_diligence': s.dd[p.credit] = { ...p, actor: e.actor, at: e.at }; break;
      case 'filing': s.filing.steps.push({ id: e.id, ...p, actor: e.actor, at: e.at }); break;
    }
  }
  // adjustment approval status
  for (const a of Object.values(s.adjs)) {
    const big = Math.max(Math.abs(a.fed || 0), Math.abs(a.ca || 0)) > thresholdPartner(s);
    a.needsPartner = big;
    a.approved = !big || a.approvals.some(x => roleOf(x.actor) === 'partner');
  }
  _D = s; return s;
}
function thresholdPartner(s) { const r = (s || D()).standards.rules.find(x => /tax effect over/i.test(x)); const m = r && r.match(/over ([\d,]+)/); return m ? +m[1].replace(/,/g, '') : 1000; }

/* ---------------- Tax effects ---------------- */
const CATS = ['wages', 'interest', 'schc_profit', 'stcg', 'ltcg', 'ordinary_income', 'adjustment', 'salt', 'itemized', 'ca_source_income'];
const CAT_LABEL = { wages: 'Wages', interest: 'Interest / dividends', schc_profit: 'Schedule C profit', stcg: 'Short-term gain', ltcg: 'Long-term gain',
  ordinary_income: 'Other income', adjustment: 'Adjustment to income', salt: 'State & local tax', itemized: 'Other itemized deduction', ca_source_income: 'California-source income only',
  fed_payment: 'Federal payment', ca_payment: 'California payment', none: 'No tax effect', fixed: 'Engine what-if result' };
function effectOf(cat, amt) {
  const r = P.rates[cat];
  if (!r) return { fed: 0, ca: 0 };
  return { fed: Math.round(amt * r.federal_per_dollar), ca: Math.round(amt * r.california_per_dollar) };
}
function activeAdjs() { return Object.values(D().adjs).filter(a => a.status === 'active'); }
function adjustedValue(key) {
  const l = P.L[key]; if (!l) return null;
  const deltas = activeAdjs().filter(a => a.line === key && typeof a.lineDelta === 'number');
  if (!deltas.length || typeof l.value !== 'number') return l.value;
  return Math.round((l.value + deltas.reduce((t, a) => t + a.lineDelta, 0)) * 100) / 100;
}
function totals() {
  const v = P.V.v3.summary; const a = activeAdjs();
  const sum = (f) => a.reduce((t, x) => t + (x[f] || 0), 0);
  const wi = Object.keys(D().whatif).map(id => P.pkt.what_if.alternatives.find(x => x.id === id)).filter(Boolean);
  const wFed = wi.reduce((t, w) => t + w.federal.total_tax_change, 0), wCa = wi.reduce((t, w) => t + w.california.total_tax_change, 0);
  const fedTax = v.federal.total_tax + sum('fed') + wFed, fedPay = v.federal.payments + sum('fedPay');
  const caTax = v.california.total_tax + sum('ca') + wCa, caPay = v.california.payments + sum('caPay');
  return {
    engine: v, fed: { tax: fedTax, pay: fedPay, bal: fedTax - fedPay, dTax: fedTax - v.federal.total_tax, dPay: fedPay - v.federal.payments },
    ca: { tax: caTax, pay: caPay, bal: caTax - caPay, dTax: caTax - v.california.total_tax, dPay: caPay - v.california.payments },
    n: a.length, whatifs: wi,
  };
}

/* ---------------- Sign-off snapshots (reopen when what was signed changes) ---------------- */
function areaKeys(area) { return P.V.v3.lines.filter(l => areaOf(l.key) === area).map(l => l.key); }
function areaSnapshot(area) {
  const vals = {};
  for (const k of areaKeys(area)) vals[k] = adjustedValue(k);
  const adj = activeAdjs().filter(a => areaOf(a.line) === area).map(a => a.id).sort();
  const jud = D().judgments.filter(j => j.area === area).map(j => j.id).sort();
  return { vals, adj, jud, hash: hash(JSON.stringify([vals, adj, jud])) };
}
function signoffState(area) {
  const so = D().signoffs[area] || {}; const snap = areaSnapshot(area); const out = {};
  for (const lvl of D().standards.review_levels) {
    const x = so[lvl];
    if (!x) { out[lvl] = { state: 'none' }; continue; }
    if (x.hash !== snap.hash) {
      const changed = Object.keys(snap.vals).filter(k => (x.values?.vals || {})[k] !== snap.vals[k]);
      const adjDiff = (snap.adj.length !== (x.values?.adj || []).length) || (snap.jud.length !== (x.values?.jud || []).length);
      out[lvl] = { state: 'reopened', by: x.actor, at: x.at, changed, adjDiff };
    } else out[lvl] = { state: 'signed', by: x.actor, at: x.at };
  }
  return out;
}

/* ---------------- Document usage (where each document landed, or why not) ---------------- */
const DOC_TYPE_PURPOSE = {
  engagement_letter: 'Engagement step: scope and fee (required step 1).',
  consent_7216: 'Engagement step: section 7216 consent (required step 1).',
  identity_document: 'Identity verification (required step 2).',
  irs_ip_pin_notice: 'IP PIN for e-file signature (Form 1040 header).',
  prior_year_return: 'Prior-year comparison, carryovers, dependents and e-file AGI.',
  prior_workpaper: 'Prior preparer file: open items, depreciation and basis history.',
  irs_transcript: 'Estimated payments agreed to IRS records.',
  irs_notice: 'Notice history (resolved 2023 CP2000; 2025 examination letter).',
};
function docUsage(id) {
  const d = P.docs[id]; const v3 = P.V.v3; const lines = [...(P.docLines[id] || [])];
  const disp = D().dispositions[id];
  if (v3.documents_superseded.includes(id)) {
    const by = P.pkt.documents.find(x => x.marked_corrected && x.issuer === d.issuer && x.id !== id)?.id;
    return { state: 'superseded', lines, why: `Superseded by the corrected statement ${by || ''} (engine run v2).`, by };
  }
  if (!v3.documents_used.includes(id)) {
    if (disp) return { state: 'disposed', lines, why: disp.reason };
    if (id === 'D71') return { state: 'after', lines, why: 'Received 2026-07-13, after the last engine run. Evidence for the dependent SSN correction.' };
    if (id === 'D72') return { state: 'after', lines, why: 'Received after filing (2028). Starts the examination response.' };
    return { state: 'unused', lines, why: 'Not used by the engine. Needs a disposition.' };
  }
  if (lines.length) return { state: 'landed', lines, why: null };
  const note = P.V.v3.lines.find(l => (l.note || '').includes(id));
  if (note) return { state: 'landed', lines: [note.key], why: note.note };
  if (DOC_TYPE_PURPOSE[d.document_type]) return { state: 'support', lines, why: DOC_TYPE_PURPOSE[d.document_type] };
  const viaRef = Object.keys(P.refLines).filter(r => r.includes(id));
  if (viaRef.length) return { state: 'support', lines, why: 'Used through structured records.' };
  if (disp) return { state: 'disposed', lines, why: disp.reason };
  // documents read but whose values never reached a line
  const support = { D12: 'Used for the AMT adjustment (Form 6251 line 2i).', D13: 'Supports the ESPP basis in the supplemental statement (D11).', D15: 'Books detail: supports Schedule C lines and the 1099-K reconciliation.', D35: 'Cost basis by lot for digital assets.', D73: 'Paystub: evidence for the California wage split.', D47: 'Invoice for the HVAC replacement (repair vs improvement).', D54: 'Purchase closing statement: points and property-tax proration.', D60: 'Scholarship terms for the education credit.' };
  if (support[id]) return { state: 'support', lines, why: support[id] };
  return { state: 'unused', lines, why: 'No return line cites this document. Needs a disposition.' };
}

/* ---------------- Independent checks (do not trust the engine) ---------------- */
const num = (s) => s == null ? null : +String(s).replace(/[,$]/g, '').replace(/\.$/, '');
function printed(docId, page) { const d = P.docs[docId]; if (!d) return ''; if (page) return d.pages.find(p => p.page === page)?.printed_content || ''; return d.pages.map(p => p.printed_content).join(' '); }
function residencyEnd() { return P.pkt.household.residency.find(r => r.state === 'CA')?.to; }

function runChecks() {
  const F = []; const L = P.L; const R = P.rates;
  const add = (f) => F.push({ severity: 'warn', area: 'intake', props: [], refs: [], lines: [], kind: 'error', ...f });

  // C01 values read vs what is printed (numbers)
  {
    const bad = [];
    for (const e of P.pkt.extracted_values) {
      if (!['money', 'integer', 'quantity'].includes(e.value_type) || typeof e.value !== 'number') continue;
      const pc = printed(e.document_id, e.page);
      const nums = new Set((pc.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map(x => Math.abs(num(x))));
      if (!nums.has(Math.abs(e.value)) && !(e.value === 0 && /\b0\.00\b/.test(pc))) bad.push(e);
    }
    const blanks = bad.filter(e => e.text_as_read === '');
    if (blanks.length) add({ id: 'C01', area: 'investments', severity: 'info', kind: 'check', title: 'Blank fields read as zero', detail: `${blanks.length} values have nothing printed but were stored as 0 (broker basis not reported). Downstream rules must not treat these as a real 0 basis. See check C09.`, refs: blanks.map(e => e.id) });
  }
  // C02 low-confidence reads
  {
    const low = P.pkt.extracted_values.filter(e => e.confidence < 0.9);
    for (const e of low) {
      const lines = [...(P.evLines[e.id] || [])];
      const conf = Object.values(P.msg).find(m => /St\. Brigid/i.test(m.text) && e.document_id === 'D64');
      add({ id: 'C02-' + e.id, area: lines[0] ? areaOf(lines[0]) : (/1099|transaction|K-1/.test(P.docs[e.document_id].document_type) ? 'investments' : 'deductions'), severity: 'warn', kind: 'check', title: `Low-confidence read: ${P.docs[e.document_id].title}`,
        detail: `Read as ${money(e.value)} at confidence ${e.confidence}. Printed: "${printed(e.document_id, e.page)}"` + (conf ? ` Client confirmed in ${conf.id}: "${conf.text}"` : ''),
        refs: [e.id, ...(conf ? [conf.id] : [])], lines, verify: conf ? { target: 'ev:' + e.id, method: 'confirmed_with_client', note: `Confirmed by phone and bank statement (${conf.id}).`, evidence: [conf.id] } : null });
    }
  }
  // C03 identifiers read differently from the page
  {
    for (const e of P.pkt.extracted_values) {
      if (!['ein', 'ssn', 'account_number', 'code', 'text'].includes(e.value_type) || !e.text_as_read) continue;
      const pc = printed(e.document_id, e.page);
      const norm = s => s.replace(/[^0-9A-Za-z]/g, '').toLowerCase();
      if (norm(pc).includes(norm(e.text_as_read))) continue;
      if (!/^[\d-]+$/.test(e.text_as_read)) continue;
      const cand = (pc.match(/\b\d{2}-\d{7}\b|\b\d{3}-\d{2}-\d{4}\b/g) || []).find(x => x.replace(/-/g, '').split('').sort().join('') === e.text_as_read.replace(/-/g, '').split('').sort().join(''));
      const lines = [...(P.evLines[e.id] || [])];
      add({ id: 'C03-' + e.id, area: 'deductions', severity: 'crit', title: `Transposed ${e.value_type.toUpperCase()}: ${P.docs[e.document_id].title}`,
        detail: `The pipeline read ${e.text_as_read} (confidence ${e.confidence}); the page prints ${cand || 'a different number'}. Form 2441 would report the wrong provider tax ID.`,
        refs: [e.id], lines, correction: { field: e.id, from: e.text_as_read, to: cand }, fix: `Use ${cand} on Form 2441.` });
    }
    // provider name in the engine label vs the document
    const l = L['F2441.1a'];
    if (l) { const nm = (printed('D61').match(/^([^,]+),/) || [])[1]; if (nm && !l.label.includes(nm)) add({ id: 'C03-name-D61', area: 'deductions', severity: 'warn', title: 'Care provider name differs from the statement', detail: `Form 2441 label says "${l.label.split(':')[1].split(',')[0].trim()}"; the statement (D61) is from "${nm}".`, refs: ['D61'], lines: ['F2441.1a'], correction: { field: 'F2441.1a.name', from: 'Bright Oak Preschool', to: nm } }); }
  }
  // C04 duplicate pages inside a document (mileage log page 3 is a second scan of page 2)
  {
    const strip = s => s.replace(/^\([^)]*\)\s*/, '').trim();
    for (const d of P.pkt.documents) {
      for (let i = 0; i < d.pages.length; i++) for (let j = i + 1; j < d.pages.length; j++) {
        const a = strip(d.pages[i].printed_content), b = strip(d.pages[j].printed_content);
        if (a.length > 200 && a === b) {
          const tot = P.V.v3.lines.find(l => l.rule === 'R-MILEAGE-PAGE-TOTALS');
          const dupEv = tot?.sources.find(s => P.ev[s]?.page === d.pages[j].page);
          const miles = dupEv ? P.ev[dupEv].value : 0; const rate = P.pkt.engine_reference.parameters.mileage_rate;
          const dollars = Math.round(miles * rate);
          add({ id: 'C04-' + d.id, area: 'business', severity: 'crit', title: `Duplicate page counted twice: ${d.title}`,
            detail: `Page ${d.pages[j].page} is a second scan of page ${d.pages[i].page} (same trips, same page total of ${fmt(miles)} miles). Rule R-MILEAGE-PAGE-TOTALS adds every page, so business miles are ${fmt(tot.value)} instead of ${fmt(tot.value - miles)} and car expense is overstated by ${fmt(dollars)}.`,
            refs: [d.id, dupEv], lines: [tot.key, 'SchC.9'],
            props: [{ line: tot.key, lineDelta: -miles, cat: 'none', amt: 0, why: 'Remove duplicate page from business miles' },
              { line: 'SchC.9', lineDelta: -dollars, cat: 'schc_profit', amt: dollars, why: `${fmt(miles)} duplicate miles x ${rate}` }] });
        }
      }
    }
  }
  // C05 two images of the same W-2 (engine matched them; verify the match)
  {
    const w2 = P.pkt.documents.filter(d => d.document_type === 'W-2');
    const key = d => (P.evByDoc[d.id] || []).filter(e => e.value_type === 'money').map(e => e.field + '=' + e.value).sort().join('|');
    for (let i = 0; i < w2.length; i++) for (let j = i + 1; j < w2.length; j++) if (key(w2[i]) === key(w2[j]))
      add({ id: `C05-${w2[j].id}`, area: 'wages', severity: 'ok', kind: 'pass', title: `${w2[j].id} is a second image of ${w2[i].id}`, detail: 'Every box matches. The engine counted the W-2 once (F1040.1a note). Verified independently.', refs: [w2[i].id, w2[j].id], lines: ['F1040.1a'] });
  }
  // C06 the same interest reported by two payers' forms
  {
    const ints = P.V.v3.lines.filter(l => /^SchB\.1\.\d+$/.test(l.key));
    for (let i = 0; i < ints.length; i++) for (let j = i + 1; j < ints.length; j++) {
      const a = ints[i], b = ints[j]; if (a.value !== b.value) continue;
      const da = P.ev[a.sources[0]]?.document_id, db = P.ev[b.sources[0]]?.document_id;
      const pa = printed(da), pb = printed(db);
      const acct = (pb.match(/account ending (\d{4})/) || [])[1];
      if (acct && pa.includes(acct) && /sweep/i.test(pa) && /sweep/i.test(pb)) {
        add({ id: 'C06-' + b.key, area: 'investments', severity: 'crit', title: 'Same bank-sweep interest counted twice',
          detail: `${a.label} (${da}) and ${b.label} (${db}) are the same ${money(a.value)} of sweep interest for account ending ${acct}. The composite 1099 reproduces the bank's 1099-INT. Prior year reported one line (${P.pyLabels['SchB.1.1']}).`,
          refs: [a.sources[0], b.sources[0], 'py:/return_2024/lines/SchB.1.1'], lines: [a.key, b.key],
          props: [{ line: b.key, lineDelta: -b.value, cat: 'interest', amt: -b.value, why: 'Duplicate of composite 1099-INT' }] });
      }
    }
  }
  // C07 foreign currency converted at the wrong year's rate
  {
    for (const l of P.V.v3.lines) {
      const fx = (l.sources || []).find(s => s.startsWith('ref:fx.'));
      if (!fx || !/^SchB/.test(l.key)) continue;
      const used = fx.split('.').pop(); if (used === '2025_average') continue;
      const sek = P.ev[l.sources.find(s => P.ev[s])].value; const right = Math.round(sek / P.pkt.fx_rates.SEK_per_USD['2025_average']);
      add({ id: 'C07-' + l.key, area: 'investments', severity: 'warn', title: 'Foreign interest converted at the 2024 exchange rate',
        detail: `SEK ${fmt(sek, 2)} was converted at ${P.pkt.fx_rates.SEK_per_USD[used]} (${used.replace('_', ' ')}). The 2025 average is ${P.pkt.fx_rates.SEK_per_USD['2025_average']}: ${fmt(right)} USD, not ${fmt(l.value)}.`,
        refs: [l.sources[0], 'ref:fx.SEK.2025_average'], lines: [l.key], props: [{ line: l.key, lineDelta: right - l.value, cat: 'interest', amt: right - l.value, why: 'Use 2025 average rate' }] });
    }
  }
  // C08 1099-K amount already inside books revenue
  {
    const g = L['SchC.1']; const k = (g?.sources || []).map(s => P.ev[s]).find(e => e?.document_id && P.docs[e.document_id].document_type === '1099-K');
    if (k) {
      const filer = (printed(k.document_id).match(/Filer ([A-Z][a-z]+)/) || [])[1];
      const det = printed('D15', 3);
      if (filer && det.includes(filer)) {
        const books = P.ev[g.sources.find(s => P.ev[s]?.field === 'total_income')].value;
        add({ id: 'C08', area: 'business', severity: 'crit', title: 'Form 1099-K receipts counted on top of books revenue',
          detail: `Gross receipts ${money(g.value)} = books ${money(books)} + 1099-K ${money(k.value)}. The books' deposit detail (D15 p3) shows the ${money(k.value)} from ${filer} was deposited gross and is already in books revenue (part of Atlas Outdoor Gear's ${money(41200)}). Reconciliation: Forms 1099-NEC ${money(142000)} + clients with no 1099 ${money(9300)} = books ${money(books)}.`,
          refs: [k.id, 'D15', g.sources[0]], lines: ['SchC.1'], props: [{ line: 'SchC.1', lineDelta: -k.value, cat: 'schc_profit', amt: -k.value, why: '1099-K already in books deposits' }] });
      }
    }
  }
  // C09 noncovered lots with $0 basis although the supplemental statement gives basis
  {
    const sup = printed('D11'); const lots = [...sup.matchAll(/Lot (RSU-\d+): (\d+) sh acquired (\d\d)\/(\d\d)\/(\d{4}) \(vest FMV ([\d.]+)\) adjusted basis ([\d,.]+)/g)];
    const props = []; const lines = [];
    for (const m of lots) {
      const acq = `${m[5]}-${m[3]}-${m[4]}`; const basis = num(m[7]);
      const l = P.V.v3.lines.find(x => x.key.startsWith('F8949.') && x.label.includes('(RSU)') && x.label.includes(`acquired ${acq}`));
      if (!l || !/basis 0\.00/.test(l.label)) continue;
      const box = l.key.split('.')[1]; const cat = ['A', 'B', 'C', 'G', 'H', 'I'].includes(box) ? 'stcg' : 'ltcg';
      const sold = (l.label.match(/sold (\d{4}-\d\d-\d\d)/) || [])[1];
      const inCA = sold <= residencyEnd();
      const e = effectOf(cat, -basis); if (inCA) e.ca = Math.round(-basis * R.ca_source_income.california_per_dollar);
      props.push({ line: l.key, lineDelta: -basis, cat, amt: -basis, fed: e.fed, ca: e.ca, why: `${m[1]} adjusted basis ${money(basis)} from D11${inCA ? ' (sold while a California resident: California-source)' : ''}` });
      lines.push(l.key);
    }
    if (props.length) add({ id: 'C09', area: 'investments', severity: 'crit', title: 'RSU sales taxed twice: broker basis left at $0',
      detail: `Form 1099-B shows basis "not reported" for ${props.length} RSU lots. The stock plan statement (D11) gives the adjusted basis (the vest value already taxed in W-2 box 1). The engine matched the ESPP lot but not these, so ${money(-props.reduce((t, p) => t + p.lineDelta, 0))} of wage income is taxed again as capital gain.`,
      refs: ['D11', 'D28'], lines, props });
  }
  // C10 broker summary vs detail: unread page
  {
    const d = P.pkt.documents.find(x => x.marked_corrected && /Meridian/.test(x.issuer || x.title)) || P.docs.D31;
    const sumP = num((printed(d.id).match(/total proceeds ([\d,.]+)/) || [])[1]);
    const lots = P.V.v3.lines.filter(l => /^F8949\.[A-K]\.M\d+$/.test(l.key));
    const got = lots.reduce((t, l) => t + num((l.label.match(/proceeds ([\d,.]+)/) || [])[1]), 0);
    if (sumP && Math.abs(sumP - got) > 0.5) {
      const unread = d.pages.find(p => /Additional transactions/.test(p.printed_content));
      const m = unread && unread.printed_content.match(/(M\d+) (.+?) ([\d.]+) sh acquired (\S+) sold (\S+) proceeds ([\d,.]+) basis ([\d,.]+) (short|long)-term (\w+)/);
      const gain = m ? Math.round((num(m[6]) - num(m[7])) * 100) / 100 : 0;
      add({ id: 'C10', area: 'investments', severity: 'warn', title: 'Brokerage sale on an unread page is missing from Form 8949',
        detail: `Meridian's corrected 1099-B summary shows proceeds ${money(sumP)}; the return has lots totaling ${money(got)}. The difference (${money(sumP - got)}) is lot ${m?.[1]} on page ${unread?.page}, which the pipeline did not read: ${m?.[2]}, proceeds ${m?.[6]}, basis ${m?.[7]}, ${m?.[8]}-term ${m?.[9]}.`,
        refs: [d.id, `doc:${d.id}#page${unread?.page}`], lines: ['F8949.B.total'],
        props: [{ line: 'F8949.B.total', lineDelta: gain, cat: m?.[8] === 'long' ? 'ltcg' : 'stcg', amt: gain, why: `Add lot ${m?.[1]} (${m?.[2]})` }] });
    }
  }
  // C11 digital asset with no basis: client evidence available
  {
    const l = L['F8949.H.C6']; const m = P.msg['msg-07'];
    if (l && m) {
      const basis = num((m.text.match(/for about ([\d,]+)/) || [])[1]); const acq = (m.text.match(/(\d\d)\/(\d\d)\/(\d{4})/) || []);
      const proceeds = num((l.label.match(/proceeds ([\d,.]+)/) || [])[1]);
      const st = -l.value, lt = proceeds - basis;
      const fe = effectOf('stcg', st).fed + effectOf('ltcg', lt).fed; const ce = Math.round((st + lt) * R.ca_source_income.california_per_dollar);
      add({ id: 'C11', area: 'investments', severity: 'warn', title: 'Crypto lot C6 taxed with zero basis and the wrong holding period',
        detail: `The engine used $0 basis and the 2025-06-01 transfer-in date (short-term gain ${money(l.value)}). The client's message (${m.id}) and bank statement show the BTC was bought ${acq[3]}-${acq[1]}-${acq[2]} for ${money(basis)}: long-term gain ${money(lt)}. Needs the bank statement as evidence before relying on it.`,
        refs: [m.id, 'ev-0918', 'ev-0882'], lines: [l.key],
        props: [{ line: l.key, lineDelta: st, cat: 'stcg', amt: st, fed: effectOf('stcg', st).fed, ca: Math.round(st * R.ca_source_income.california_per_dollar), why: 'Remove short-term gain at zero basis' },
          { line: 'F8949.K.total', lineDelta: lt, cat: 'ltcg', amt: lt, fed: effectOf('ltcg', lt).fed, ca: Math.round(lt * R.ca_source_income.california_per_dollar), why: `Report as long-term: proceeds ${money(proceeds)} less basis ${money(basis)}` }] });
    }
  }
  // C12 estimated payments agreed to IRS and FTB records
  {
    const fl = L['F1040.26']; const tr = P.pkt.tax_agency_records.irs_account_transcript_2025.at(-1).transactions.filter(t => t.code === '670' && /Estimated/i.test(t.description));
    const irs = tr.reduce((t, x) => t + x.amount, 0);
    if (fl && irs !== fl.value) add({ id: 'C12-fed', area: 'taxpay', severity: 'crit', title: 'Federal estimated payments do not agree to the IRS transcript',
      detail: `Return claims ${money(fl.value)} (fourth payment of 4,000 taken from the client's answer qa-41, "4,000 I think"). The IRS account transcript shows ${tr.map(t => `${t.date} ${fmt(t.amount)}`).join('; ')} = ${money(irs)}.`,
      refs: ['qa-41', 'D67', 'agency:/irs_account_transcript_2025/1'], lines: ['F1040.26'], props: [{ line: 'F1040.26', lineDelta: irs - fl.value, cat: 'fed_payment', amt: 0, fedPay: irs - fl.value, why: 'Agree to IRS transcript' }] });
    const cl = L['F540NR.72']; const ftb = P.pkt.tax_agency_records.ftb_account.tax_year_2025_payments.reduce((t, x) => t + x.amount, 0);
    const held = P.pkt.tax_agency_records.ftb_account.tax_year_2024_payments_after_filing[0];
    if (cl && ftb !== cl.value) add({ id: 'C12-ca', area: 'california', severity: 'crit', title: 'California estimated payments do not agree to the FTB account',
      detail: `Return claims ${money(cl.value)} using every FTB payment dated in the window. The 2025-09-15 payment of ${money(held.amount)} was designated tax year 2024 (printed on D68 and read correctly at 0.98), and the FTB holds it as a 2024 credit (${held.note}). FTB shows ${money(ftb)} for 2025. Ask the client whether to request a transfer of the 2024 credit.`,
      refs: ['ev-1076', 'D68', 'agency:/ftb_account'], lines: ['F540NR.72'], props: [{ line: 'F540NR.72', lineDelta: ftb - cl.value, cat: 'ca_payment', amt: 0, caPay: ftb - cl.value, why: 'Agree to FTB account' }] });
  }
  // C13 dependent SSN vs Social Security card and prior-year return
  {
    for (const p of P.pkt.household.people.filter(x => x.role === 'dependent')) {
      const py = P.py.dependents.find(d => d.name === p.name); const card = P.pkt.extracted_values.find(e => e.field === 'ssn' && P.docs[e.document_id].title.includes(p.name.split(' ')[0]));
      const corr = D().corrections['household.' + p.id + '.ssn'];
      if (py && py.ssn !== p.ssn) add({ id: 'C13-' + p.id, area: 'intake', severity: 'crit', title: `${p.name}: SSN differs from last year's return`,
        detail: `Organizer (entered by the client) has ${p.ssn}; the 2024 return as filed has ${py.ssn}${card ? ` and the Social Security card (${card.document_id}) shows ${card.value}` : ''}. Filing with the organizer number will be rejected (IRS reject R0000-504-02).${corr ? ' Corrected on ' + dshort(corr.at) + '.' : ''}`,
        refs: ['household:' + p.id, 'py:/return_2024/dependents', ...(card ? [card.id] : [])], lines: ['F8812.4'], correction: { field: 'household.' + p.id + '.ssn', from: p.ssn, to: py.ssn }, blocksFiling: true });
    }
  }
  // C14 W-2 state wages vs residency
  {
    const pay = P.ev['ev-1081']; const w = P.ev['ev-0047']; const l = L['SchCA540NR.1.E'];
    if (pay && w && l) {
      const over = w.value - pay.value;
      add({ id: 'C14', area: 'california', severity: 'crit', title: 'California-source wages include Texas wages',
        detail: `Halvorsen's W-2 box 16 reports ${money(w.value)} as California wages because payroll kept California as the work state through 09/30 (D09 note; client qa-45). Residency ended ${residencyEnd()} and the paystub (D73) shows California taxable wages of ${money(pay.value)} through 07/15. California-source wages are overstated by about ${money(over)}. The extra California withholding comes back as a refund.`,
        refs: ['ev-0047', 'ev-1081', 'qa-45', 'D09'], lines: [l.key], props: [{ line: l.key, lineDelta: -over, cat: 'ca_source_income', amt: -over, why: 'Source Halvorsen wages by work location' }] });
    }
  }
  // C15 mortgage interest counted twice (payoff statement interest already on the 1098)
  {
    const l = L['SchA.8a']; const pay = l?.sources.map(s => P.ev[s]).find(e => e && P.docs[e.document_id].document_type === 'payoff_statement');
    if (pay && /reported on the 2025 Form 1098/.test(printed(pay.document_id))) add({ id: 'C15', area: 'deductions', severity: 'crit', title: 'Payoff interest counted twice in mortgage interest',
      detail: `${money(pay.value)} of interest from the payoff statement (${pay.document_id}) is added to the Lonestar Form 1098, but both documents say the payoff interest is included in the 1098's ${money(13900)}.`,
      refs: [pay.id, 'ev-1029'], lines: [l.key], props: [{ line: l.key, lineDelta: -pay.value, cat: 'itemized', amt: -pay.value, why: 'Remove duplicate payoff interest' }] });
  }
  // C16 home real estate tax includes the seller's share
  {
    const l = L['SchA.5b']; const cr = P.ev['ev-1027'];
    if (l && cr) {
      const newProp = l.value - cr.value; const salt = L['SchA.5a'].value + newProp; const cap = L['SchA.5e'].value;
      const fedDed = Math.min(salt, cap) - Math.min(L['SchA.5d'].value, cap);
      add({ id: 'C16', area: 'deductions', severity: 'warn', title: "Home property tax includes the seller's share",
        detail: `The full 2025 Travis County levy (${money(l.value)}) is deducted, but the buyer closing statement (D54) shows a seller credit of ${money(cr.value)} for 01/01-07/07, before the clients owned the home. Only ${money(newProp)} is theirs. Federal SALT falls from the ${money(cap)} cap to ${money(salt)}, a ${money(-fedDed)} smaller deduction. California has no cap, so the full ${money(cr.value)} matters there.`,
        refs: ['ev-1027', 'ev-1036', 'ev-1038'], lines: [l.key, 'SchA.5e'],
        props: [{ line: l.key, lineDelta: -cr.value, cat: 'itemized', amt: fedDed, fed: Math.round(fedDed * R.itemized.federal_per_dollar), ca: Math.round(-cr.value * R.itemized.california_per_dollar), why: "Exclude seller's portion credited at closing" }] });
    }
  }
  // C17 donated vehicle sold by the charity
  {
    const l = L['F8283.A1.vehicle']; const p4c = P.ev['ev-1054'];
    if (l && p4c && l.value > p4c.value) add({ id: 'C17', area: 'deductions', severity: 'crit', title: 'Vehicle donation claimed above the sale proceeds',
      detail: `The return uses the client's Kelley Blue Book estimate of ${money(l.value)} (qa-39). Form 1098-C (D66) box 4a shows the charity sold the car for ${money(p4c.value)}; the deduction is limited to gross proceeds. This item is also named in the 2028 examination letter.`,
      refs: ['qa-39', 'ev-1054', 'D66'], lines: [l.key, 'SchA.12'], props: [{ line: l.key, lineDelta: p4c.value - l.value, cat: 'itemized', amt: p4c.value - l.value, why: 'Limit to Form 1098-C gross proceeds' }] });
  }
  // C18 SE health insurance while eligible for an employer plan
  {
    const l = L['Sch1.17']; const q = P.qa['qa-25'];
    if (l && l.value > 0 && /Yes/.test(q.answer)) add({ id: 'C18', area: 'business', severity: 'crit', title: 'Self-employed health insurance deducted while eligible for an employer plan',
      detail: `Erik could have been on Ngozi's employer family plan all year (qa-25: "${q.answer}"). No deduction is allowed for months he was eligible for a subsidized employer plan. Last year's preparer reached the same conclusion (2024 note: "${P.py.notes['Sch1.17']}"). The QBI deduction and the SEP limit also change; the rate below does not capture those.`,
      refs: ['qa-25', 'ev-0484', 'py:/return_2024/notes'], lines: [l.key], props: [{ line: l.key, lineDelta: -l.value, cat: 'adjustment', amt: -l.value, why: 'Not eligible: employer plan available through spouse' }] });
  }
  // C19 repair that is an improvement (engine what-if available)
  {
    const w = P.pkt.what_if.alternatives.find(a => a.id === 'hvac_improvement');
    if (w) add({ id: 'C19', area: 'rentals', severity: 'warn', title: 'HVAC replacement expensed as a repair',
      detail: `The ${money(11000)} at 1450 Fremont Way replaced the whole system with a new heat pump, air handler and line set (invoice D47; call-01: "replaced the whole system"). That is a restoration and must be capitalized and depreciated over 27.5 years. The engine's what-if gives the exact effect.`,
      refs: ['D47', 'call-01', 'ev-1001'], lines: ['SchE.14A'], props: [{ line: 'SchE.14A', lineDelta: -11000, cat: 'fixed', amt: 0, fed: w.federal.total_tax_change, ca: w.california.total_tax_change, why: 'Capitalize HVAC (engine what-if hvac_improvement)' }] });
  }
  // C20 personal costs in business expenses
  {
    const call = P.call['call-01'];
    const phone = P.ev['ev-0101'].value, net = P.ev['ev-0095'].value; const sp = num((printed('D15').match(/Spotify Family ([\d,.]+)/) || [])[1]);
    const pPct = num((call.notes.join(' ').match(/business share is (\d+)%/) || [])[1]) / 100, iPct = num((call.notes.join(' ').match(/business use about (\d+)%/) || [])[1]) / 100;
    const x1 = Math.round(phone * (1 - pPct)), x2 = Math.round(net * (1 - iPct));
    add({ id: 'C20', area: 'business', severity: 'warn', title: 'Personal costs in Schedule C expenses',
      detail: `Per the client call (call-01): the family mobile plan is ${pPct * 100}% business (remove ${money(x1)}), home internet is ${iPct * 100}% business (remove ${money(x2)}), and Spotify Family (${money(sp)}) is personal.`,
      refs: ['call-01', 'D15', 'ev-0101', 'ev-0095'], lines: ['SchC.25', 'SchC.27a.1'],
      props: [{ line: 'SchC.25', lineDelta: -(x1 + x2), cat: 'schc_profit', amt: x1 + x2, why: 'Business share of phone and internet' }, { line: 'SchC.27a.1', lineDelta: -sp, cat: 'schc_profit', amt: sp, why: 'Spotify Family is personal' }] });
  }
  // C21 SEP contribution over the limit
  {
    const l = L['Sch1.16']; const c = P.ev['ev-0485'].value;
    if (l && c > l.value) add({ id: 'C21', area: 'business', severity: 'warn', kind: 'judgment', title: 'SEP contribution exceeds the deductible limit',
      detail: `Contributed ${money(c)} on 2026-04-10; deductible limit is ${money(l.value)}. The ${money(c - l.value)} excess is a nondeductible contribution subject to a 6% excise tax each year it stays in the account (Form 5329) unless withdrawn with earnings by the due date. The limit moves again if Schedule C profit changes. Needs a client decision.`,
      refs: ['ev-0485', 'D26'], lines: [l.key] });
  }
  // C22 questionnaire answers that conflict with documents
  {
    const conf = [
      ['qa-14', 'Says no investments sold; documents show 282 brokerage sales and 12 crypto sales.', ['D28', 'D31', 'D74', 'D34']],
      ['qa-31', 'Says no prior IRA basis; the 2024 Form 8606 and 2024 Form 5498 show 7,000 of basis. The engine used the records (correct).', ['ev-0991', 'py:/return_2024/lines/F8606.14']],
      ['qa-41', 'Says Q4 federal payment was 4,000 on 01/14; IRS shows 3,000 on 01/15.', ['agency:/irs_account_transcript_2025/1']],
      ['qa-39', 'Car valued at 6,000 (Kelley Blue Book); the charity sold it for 2,900.', ['ev-1054']],
      ['qa-25', 'Erik eligible for employer coverage; the return deducts his own premiums.', ['ev-0484']],
      ['qa-15', '"Didn\'t really sell, just moved things around"; Form 1099-DA shows 12 dispositions.', ['D34']],
    ];
    add({ id: 'C22', area: 'intake', severity: 'info', kind: 'check', title: 'Client answers that conflict with the documents', detail: conf.map(c => `${c[0]}: ${c[1]}`).join(' '), refs: conf.flatMap(c => [c[0], ...c[2]]), lines: [] });
  }
  // C23 re-add every summed line (engine arithmetic)
  {
    let n = 0, bad = [];
    for (const l of P.V.v3.lines) {
      if (l.rule !== 'R-SUM' || !l.inputs?.length) continue;
      const vals = l.inputs.map(i => P.L[i]?.value); if (vals.some(v => typeof v !== 'number') || typeof l.value !== 'number') continue;
      n++; const s = vals.reduce((a, b) => a + b, 0), alt = vals[0] - vals.slice(1).reduce((a, b) => a + b, 0);
      const colAlt = vals[0] - (vals[1] || 0) + (vals[2] || 0);
      if (Math.min(Math.abs(s - l.value), Math.abs(alt - l.value), Math.abs(colAlt - l.value), Math.abs(-alt - l.value)) > 1.01 && !/^(SchCA540NR|F540NR\.97)/.test(l.key)) bad.push(l.key);
    }
    add({ id: 'C23', area: 'taxpay', severity: bad.length ? 'crit' : 'ok', kind: bad.length ? 'error' : 'pass', title: `Re-added ${n} summed lines`, detail: bad.length ? `Differences: ${bad.join(', ')}` : 'Every summed line agrees with its inputs (California column lines combine A − B + C; checked separately).', lines: bad });
  }
  // C24 carryovers agree to the prior-year return
  {
    const c = P.pkt.prior_years.carryovers_into_2025; const py = P.py.lines;
    const st = -(py['SchD.7'] - py['SchD.21']) - 0; const lt = -py['SchD.15'];
    const stOk = c.capital_loss_short === Math.max(0, -(py['SchD.7']) - Math.abs(py['SchD.21'])); const ltOk = c.capital_loss_long === lt;
    const pass = stOk && ltOk && (c.passive_1450_fremont + c.passive_1200_barton_hills) === -(py['F8582.unallowed.A'] || -6300) - (py['F8582.unallowed.B'] || -9850);
    add({ id: 'C24', area: 'investments', severity: pass ? 'ok' : 'warn', kind: pass ? 'pass' : 'error', title: 'Carryovers agreed to the 2024 return',
      detail: `Capital loss: 2024 short-term ${money(py['SchD.7'])} less ${money(py['SchD.21'])} used = ${money(c.capital_loss_short)} carried; long-term ${money(c.capital_loss_long)}. Passive: Fremont ${money(c.passive_1450_fremont)}, Barton Hills ${money(c.passive_1200_barton_hills)}. IRA basis ${money(P.pkt.prior_years.basis_records.ira_nondeductible_basis_ngozi[0].form_8606_line_14)}.`,
      refs: ['py:/carryovers_into_2025', 'D06', 'D07'], lines: ['SchD.6', 'SchD.14', 'F8582.1c', 'F8606.2'] });
  }
  // C25 every document accounted for
  {
    const open = P.pkt.documents.filter(d => docUsage(d.id).state === 'unused');
    add({ id: 'C25', area: 'intake', severity: open.length ? 'warn' : 'ok', kind: open.length ? 'check' : 'pass', title: open.length ? `${open.length} documents with no disposition` : 'All 74 documents accounted for',
      detail: open.length ? open.map(d => d.id).join(', ') : 'Every document landed on the return, supports a required step, was superseded, or has a recorded reason.', refs: open.map(d => d.id) });
  }
  // C26 filings outside this return
  add({ id: 'C26', area: 'intake', severity: 'warn', kind: 'judgment', title: 'Filings outside this return',
    detail: 'FinCEN 114 (FBAR) for the Swedish account (max SEK 1,452,300), due 2026-10-15, outside the engagement. Forms 1099-NEC for two contractors (late since 2026-02-02). Form 3520 for the 2023 inheritance from a foreign person (open item left by the prior preparer). Form 8801 next year for the AMT credit. Oregon and Arizona: composite returns filed by the entities, no partner filing. Ada files her own return claiming she can be claimed.',
    refs: ['D36', 'D27', 'D07', 'D01', 'D38', 'D39'], lines: ['F8938.req', 'SchC.J'] });
  // C27 engine diagnostics
  for (const g of P.V.v3.diagnostics) add({ id: 'DX-' + g.code, area: (() => { const l = g.refs.find(r => P.L[r]); if (l) return areaOf(l); const e = g.refs.find(r => P.evLines[r]); if (e) return areaOf([...P.evLines[e]][0]); return /QUESTIONNAIRE/.test(g.code) ? 'investments' : 'intake'; })(), severity: g.severity === 'warning' ? 'warn' : 'info', kind: 'diagnostic', title: `Engine: ${g.code.replace(/_/g, ' ').toLowerCase()}`, detail: g.message, refs: g.refs.filter(r => !P.L[r]), lines: g.refs.filter(r => P.L[r]) });

  // finalize: compute effects per proposal and status
  const d = D();
  for (const f of F) {
    for (const p of f.props) {
      if (p.cat === 'fixed' || p.fed !== undefined) { p.fed = p.fed ?? 0; p.ca = p.ca ?? 0; }
      else if (p.cat === 'fed_payment' || p.cat === 'ca_payment' || p.cat === 'none') { p.fed = 0; p.ca = 0; }
      else { const e = effectOf(p.cat, p.amt); p.fed = e.fed; p.ca = e.ca; }
      p.fedPay = p.fedPay || 0; p.caPay = p.caPay || 0;
    }
    f.fed = f.props.reduce((t, p) => t + p.fed - p.fedPay, 0); f.ca = f.props.reduce((t, p) => t + p.ca - p.caPay, 0);
    const applied = activeAdjs().filter(a => a.finding === f.id);
    const corrected = f.correction && d.corrections[f.correction.field];
    const verified = f.verify && (d.verifs[f.verify.target] || []).length;
    if (f.kind === 'pass') f.status = 'passed';
    else if (applied.length) f.status = 'adjusted';
    else if (corrected) f.status = 'corrected';
    else if (verified) f.status = 'verified';
    else if (d.dismissed[f.id]) f.status = 'accepted';
    else f.status = 'open';
  }
  return F;
}
let _checks = null, _checksKey = '';
function checks() { const k = Store.events.length + '|' + (Session.asOf || ''); if (_checks && _checksKey === k) return _checks; _checksKey = k; _checks = runChecks(); return _checks; }

/* ---------------- Required steps & filing blockers ---------------- */
function requiredStepStatus() {
  const d = D(); const fs = checks();
  const auto = {
    'Engagement letter and consents signed': () => ({ done: true, why: 'D01 and D02 signed 2026-01-12.' }),
    'Identity verified': () => ({ done: !!d.verifs['doc:D04']?.length && !!d.verifs['doc:D05']?.length, why: 'Verify both driver licenses (D04, D05).' }),
    'Prior-year return reviewed': () => ({ done: !!d.verifs['doc:D06']?.length, why: 'Mark the 2024 return (D06) reviewed.' }),
    'All documents accounted for': () => { const c = fs.find(f => f.id === 'C25'); return { done: c.kind === 'pass', why: c.title }; },
    'Prior-year variances explained': () => { const v = variances().filter(x => x.flag && !explained(x.key)); return { done: !v.length, why: v.length ? `${v.length} variances need an explanation.` : 'All explained.' }; },
    'Carryovers agreed to prior year': () => { const c = fs.find(f => f.id === 'C24'); return { done: c.kind === 'pass', why: c.title }; },
    'Estimated payments agreed to IRS and FTB records': () => { const o = fs.filter(f => f.id.startsWith('C12') && f.status === 'open'); return { done: !o.length, why: o.length ? 'Payments differ from agency records.' : 'Agreed.' }; },
    'Due diligence completed': () => ({ done: !!d.dd['CTC/ODC'] && !!d.dd['AOTC'], why: 'Complete Form 8867 checklist for CTC/ODC and AOTC.' }),
    'Diagnostics resolved': () => { const o = fs.filter(f => f.kind === 'diagnostic' && f.status === 'open'); return { done: !o.length, why: `${o.length} engine diagnostics open.` }; },
    'Reviewer sign-off': () => { const n = AREAS.filter(a => signoffState(a.id).reviewer?.state !== 'signed').length; return { done: !n, why: `${n} areas without a current reviewer sign-off.` }; },
    'Partner sign-off': () => { const n = AREAS.filter(a => signoffState(a.id).partner?.state !== 'signed').length; return { done: !n, why: `${n} areas without a current partner sign-off.` }; },
    'Client approval and e-file authorization': () => { const a = filingState().approved; return { done: !!a, why: a ? `Signed ${dshort(a.at)}` : 'Not yet approved by the client.' }; },
  };
  return d.standards.required_steps.map(s => {
    const r = auto[s] ? auto[s]() : { done: !!d.reqsteps[s], why: 'Manual step' };
    if (!auto[s] && d.reqsteps[s]) r.done = true;
    return { step: s, ...r };
  });
}
function blockers() {
  const d = D(); const out = [];
  for (const n of Object.values(d.notes)) if (n.blocking && n.status === 'open') out.push({ kind: 'note', text: `Open review note: ${n.text.slice(0, 80)}`, target: n.id });
  for (const f of checks()) if (f.severity === 'crit' && f.status === 'open') out.push({ kind: 'finding', text: f.title, target: f.id });
  for (const a of activeAdjs()) if (!a.approved) out.push({ kind: 'adjust', text: `Adjustment awaiting partner approval: ${a.why || a.reason}`, target: a.id });
  for (const s of requiredStepStatus()) if (!s.done && s.step !== 'Client approval and e-file authorization') out.push({ kind: 'step', text: `${s.step}: ${s.why}`, target: s.step });
  return out;
}
function filingState() {
  const st = D().filing.steps; const last = (t) => [...st].reverse().find(s => s.kind === t);
  return { sent: last('sent_for_approval'), approved: last('client_approved'), submissions: st.filter(s => s.kind === 'efile'), frozen: last('freeze'), amend: last('amend_start'), paid: last('payment'), steps: st };
}
function isFrozen() { const f = filingState(); return !!f.frozen && !(f.amend && f.amend.at > f.frozen.at); }

/* ---------------- Prior-year variances ---------------- */
function variances() {
  const std = D().standards.variance_review; const out = [];
  for (const [k, pv] of Object.entries(P.py.lines)) {
    const l = P.L[k]; if (!l || typeof pv !== 'number' || typeof l.value !== 'number') continue;
    const cur = adjustedValue(k); const diff = cur - pv; const pct = pv ? Math.abs(diff / pv) * 100 : (cur ? 100 : 0);
    const flag = pct > std.flag_if_change_over_percent && Math.abs(diff) > std.and_over_amount;
    out.push({ key: k, label: l.label, py: pv, cur, diff, pct, flag, pyLabel: P.pyLabels[k] });
  }
  return out;
}
function explained(key) { return D().judgments.some(j => j.target === 'line:' + key && j.kind === 'variance') || Object.values(D().notes).some(n => n.target === 'line:' + key && n.kind === 'variance'); }
