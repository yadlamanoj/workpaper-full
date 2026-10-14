/* UI part 2: schedules, changes, review, filing, timeline, firm, client portal */
'use strict';

function tabs(group, list, cur) { return `<div class="tabs" role="tablist">${list.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="tab" data-g="${group}" data-k="${k}">${l}</button>`).join('')}</div>`; }
function lineRows(keys, opts = {}) {
  return keys.filter(k => P.L[k]).map(k => { const l = P.L[k]; const av = adjustedValue(k);
    return `<tr class="click ${av !== l.value ? 'adj' : ''}" data-act="goline" data-k="${k}"><td class="small faint">${k}</td><td>${esc(l.label)}</td><td class="n">${typeof l.value === 'number' ? money(l.value) : esc(maskText(l.value))}</td><td class="n v">${av !== l.value ? money(av) : ''}</td>${opts.py ? `<td class="n">${money(P.py.lines[k])}</td>` : ''}</tr>`; }).join('');
}
function lineTable(keys, opts = {}) { return `<div class="tw"><table class="t"><thead><tr><th>Line</th><th>Description</th><th class="n">Engine</th><th class="n">Adjusted</th>${opts.py ? '<th class="n">2024</th>' : ''}</tr></thead><tbody>${lineRows(keys, opts)}</tbody></table></div>`; }
const keysLike = (re) => P.V.v3.lines.filter(l => re.test(l.key)).map(l => l.key);

/* ---------- Schedules ---------- */
function vSchedules() {
  const t = R.tab.sched || 'variance';
  const list = [['variance', 'Summary vs 2024'], ['taxcomp', 'Tax computation'], ['sales', 'Sales detail'], ['assets', 'Depreciation'], ['books', 'Books to tax'], ['rentals', 'Rentals & passive'],
    ['k1', 'K-1s & basis'], ['retire', 'Retirement & foreign'], ['deds', 'Deductions & credits'], ['payments', 'Payments'], ['state', 'State split'], ['carry', 'Carryovers'], ['prior', 'Prior preparer vs us'], ['areas', 'Area summaries']];
  const body = { variance: sVariance, taxcomp: sTaxComp, sales: sSales, assets: sAssets, books: sBooks, rentals: sRentals, k1: sK1, retire: sRetire, deds: sDeds, payments: sPayments, state: sState, carry: sCarry, prior: sPrior, areas: sAreas }[t]();
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Schedules</div><h1>${esc(list.find(x => x[0] === t)[1])}</h1></div></div>${tabs('sched', list, t)}${body}</div>`;
}
function sVariance() {
  const v = variances(); const std = D().standards.variance_review;
  return `<section class="panel"><div class="ph"><span class="small muted">Flag rule (firm standard): change over ${std.flag_if_change_over_percent}% and over ${fmt(std.and_over_amount)}. Every flagged line needs an explanation before filing.</span>${chip(v.filter(x => x.flag && !explained(x.key)).length + ' unexplained', 'warn')}</div>
  <div class="pb flush tw"><table class="t"><thead><tr><th>Line</th><th>2024 label</th><th class="n">2024</th><th class="n">2025</th><th class="n">Change</th><th class="n">%</th><th>Status</th></tr></thead><tbody>
  ${v.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map(x => `<tr class="click" data-act="goline" data-k="${x.key}"><td class="small">${x.key}</td><td>${esc(x.pyLabel || x.label)}</td><td class="n">${money(x.py)}</td><td class="n">${money(x.cur)}</td><td class="n">${signed(x.diff)}</td><td class="n">${fmt(x.pct, 0)}</td><td>${x.flag ? (explained(x.key) ? chip('Explained', 'ok') : chip('Explain', 'warn')) : ''}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}
function sTaxComp() {
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Federal</h2></div><div class="pb flush">${lineTable(['F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.17', 'F1040.18', 'F1040.19', 'F1040.20', 'F1040.22', 'Sch2.4', 'Sch2.11', 'Sch2.12', 'F1040.23', 'F1040.24', 'F1040.25d', 'F1040.26', 'F1040.31', 'F1040.33', 'F1040.37', 'F1040.38'], { py: true })}</div></section>
  <section class="panel"><div class="ph"><h2>California (540NR)</h2></div><div class="pb flush">${lineTable(['F540NR.13', 'F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'F540NR.40', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64', 'F540NR.71', 'F540NR.72', 'F540NR.78', 'F540NR.97'])}</div></section>
  <section class="panel"><div class="ph"><h2>Alternative minimum tax</h2></div><div class="pb flush">${lineTable(keysLike(/^F6251/))}</div></section>
  <section class="panel"><div class="ph"><h2>Penalty (Form 2210)</h2></div><div class="pb flush">${lineTable(keysLike(/^F2210|FTB5805/))}</div></section></div>`;
}
function salesGroups() {
  const lots = P.V.v3.lines.filter(l => l.rule === 'R-8949-LOT');
  const acct = (l) => { const id = l.key.split('.').pop(); return id[0] === 'X' ? 'Brightpath Advisors (direct indexing) · D74' : id[0] === 'M' ? 'Meridian Brokerage (corrected) · D31' : id[0] === 'N' ? 'Northlake Securities · D28' : id[0] === 'C' ? 'Coinhaven (digital assets) · D34/D35' : 'S corporation (Form 7203)'; };
  const g = {}; for (const l of lots) (g[acct(l)] ||= []).push(l);
  return g;
}
function sSales() {
  const g = salesGroups(); const fs = checks(); const flagged = new Set(fs.filter(f => f.status === 'open').flatMap(f => f.lines));
  const pf = (l, k) => num((l.label.match(new RegExp(k + ' ([\\d,.]+)')) || [])[1]) || 0;
  const summ = { 'Brightpath Advisors (direct indexing) · D74': () => { const m = printed('D74', 1); return num((m.match(/short-term covered proceeds ([\d,.]+)/) || [])[1]) + num((m.match(/long-term covered proceeds ([\d,.]+)/) || [])[1]); },
    'Meridian Brokerage (corrected) · D31': () => num((printed('D31').match(/total proceeds ([\d,.]+)/) || [])[1]),
    'Northlake Securities · D28': () => { const m = printed('D28', 2); return [...m.matchAll(/proceeds ([\d,.]+)/g)].reduce((t, x) => t + num(x[1]), 0); },
    'Coinhaven (digital assets) · D34/D35': () => num((printed('D34').match(/Total gross proceeds ([\d,.]+)/) || [])[1]) };
  const open = R.filter.salesOpen; const issuesOnly = R.filter.salesIssues;
  return `<section class="panel"><div class="pb small muted">${Object.values(g).flat().length} sales. Each account reconciles to its broker summary first, so a reviewer only opens the lots that carry a finding. Lots with a finding are marked red.</div></section>
  <section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Account</th><th class="n">Lots</th><th class="n">Proceeds (return)</th><th class="n">Broker summary</th><th class="n">Difference</th><th class="n">Gain (loss)</th><th class="n">With findings</th><th></th></tr></thead><tbody>
  ${Object.entries(g).map(([k, ls]) => { const pr = ls.reduce((t, l) => t + pf(l, 'proceeds'), 0); const s = summ[k] ? summ[k]() : null; const diff = s == null ? null : Math.round((s - pr) * 100) / 100; const gain = ls.reduce((t, l) => t + adjustedValue(l.key), 0); const fl = ls.filter(l => flagged.has(l.key)).length;
    return `<tr class="click" data-act="salesopen" data-k="${esc(k)}"><td><b>${esc(k)}</b></td><td class="n">${ls.length}</td><td class="n">${fmt(pr, 2)}</td><td class="n">${s == null ? '—' : fmt(s, 2)}</td><td class="n">${diff == null ? '—' : diff ? `<span style="color:var(--crit)">${fmt(diff, 2)}</span>${k.includes('Meridian') ? `<div class="small">${checks().find(f => f.id === 'C10')?.status === 'open' ? 'unread page 32 (C10)' : 'lot M18 added by C10'}</div>` : ''}` : '<span class="tick">✓ 0.00</span>'}</td><td class="n">${fmt(gain, 2)}</td><td class="n">${fl ? chip(fl, 'crit') : ''}</td><td>${open === k ? '▾' : '▸'}</td></tr>`; }).join('')}
  </tbody></table></div></section>
  ${open && g[open] ? `<section class="panel"><div class="ph"><h3>${esc(open)}</h3><div class="row"><label class="small row"><input type="checkbox" data-act="salesissues" ${issuesOnly ? 'checked' : ''}> Only lots with findings</label>${can('bulk') ? `<button class="btn sm" data-act="bulk-verify-lines" ${R.sel.size ? '' : 'disabled'}>Agree ${R.sel.size || ''} selected to 1099-B</button><button class="btn sm ghost" data-act="sel-lots">Select all shown</button>` : ''}</div></div>
    <div class="pb flush tw" style="max-height:520px;overflow:auto"><table class="t"><thead><tr><th></th><th>Lot</th><th>Security</th><th>Acquired</th><th>Sold</th><th class="n">Proceeds</th><th class="n">Basis</th><th class="n">Gain</th><th>Box</th><th></th></tr></thead><tbody>
    ${g[open].filter(l => !issuesOnly || flagged.has(l.key)).map(l => { const m = l.label.match(/^(.*) \(acquired ([^,]+), sold ([^;]+); proceeds ([\d,]+\.\d+), basis ([\d,]+\.\d+)/) || []; const v = (D().verifs['line:' + l.key] || []).length;
      return `<tr class="${flagged.has(l.key) ? 'adj' : ''}"><td>${can('bulk') ? `<input type="checkbox" data-act="sel" data-e="${l.key}" ${R.sel.has(l.key) ? 'checked' : ''} aria-label="Select ${l.key}">` : ''}</td><td>${lref(l.key)}</td><td class="small">${esc(m[1] || l.label)}</td><td class="small">${esc(m[2] || '')}</td><td class="small">${esc(m[3] || '')}</td><td class="n">${esc(m[4] || '')}</td><td class="n">${esc(m[5] || '')}</td><td class="n" style="${flagged.has(l.key) ? 'color:var(--crit)' : ''}">${fmt(adjustedValue(l.key), 2)}</td><td>${l.key.split('.')[1]}</td><td>${v ? '<span class="tick">✓</span>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div></section>` : ''}
  <section class="panel"><div class="ph"><h3>Form 8949 box totals and Schedule D</h3></div><div class="pb flush">${lineTable(keysLike(/^F8949\.[A-K]\.total$|^SchD/))}</div></section>`;
}
function sAssets() {
  const as = P.V.v3.assets;
  return `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Asset</th><th>Activity</th><th>In service</th><th>Method / life</th><th class="n">Cost</th><th class="n">Fed prior</th><th class="n">Fed 2025</th><th class="n">CA 2025</th><th class="n">AMT diff</th><th class="n">Fed accum.</th><th>Disposal</th></tr></thead><tbody>
  ${as.map(a => `<tr class="click" data-act="peek" data-r="asset:${a.asset_id}"><td><b>${a.asset_id}</b><div class="small">${esc(a.description)}</div></td><td class="small">${esc(a.activity)}</td><td class="small">${a.placed_in_service}</td><td class="small">${esc(a.method)} · ${a.life_years}y</td><td class="n">${fmt(a.cost)}${a.land_value_not_depreciated ? `<div class="faint small">land ${fmt(a.land_value_not_depreciated)}</div>` : ''}</td><td class="n">${fmt(a.federal.prior_accumulated, 2)}</td><td class="n">${fmt(a.federal.depreciation_2025, 2)}</td><td class="n">${fmt(a.california.depreciation_2025, 2)}</td><td class="n">${fmt(a.amt.difference_from_regular, 2)}</td><td class="n">${fmt(a.federal.accumulated_end, 2)}</td><td class="small">${a.disposition ? `${a.disposition.date}<div class="faint">unrecaptured §1250 ${fmt(a.disposition.unrecaptured_1250_depreciation, 2)}; ordinary recapture ${fmt(a.disposition.section_1250_ordinary_recapture)}</div>` : ''}</td></tr>`).join('')}
  <tr class="sub"><td colspan="6">Totals</td><td class="n">${fmt(as.reduce((t, a) => t + a.federal.depreciation_2025, 0), 2)}</td><td class="n">${fmt(as.reduce((t, a) => t + a.california.depreciation_2025, 0), 2)}</td><td></td><td class="n">${fmt(as.reduce((t, a) => t + a.federal.accumulated_end, 0), 2)}</td><td></td></tr></tbody></table></div></section>
  <section class="panel"><div class="pb small">${checks().find(f => f.id === 'C19')?.status === 'adjusted' ? chip('HVAC capitalized by adjustment: add a 27.5-year asset (11,000, in service 2025-08-12) on the next engine run.', 'warn') : 'Pending: the HVAC replacement at 1450 Fremont Way (finding C19) would add a new 27.5-year asset.'}</div></section>
  <section class="panel"><div class="ph"><h3>Sale of 1200 Barton Hills Dr (Form 4797)</h3></div><div class="pb flush">${lineTable(keysLike(/^F4797/))}</div></section>`;
}
function sBooks() {
  const ev = (f) => (P.evByDoc.D14 || []).find(e => e.field === f)?.value ?? 0;
  const rows = [
    ['Gross receipts', ev('total_income'), 'SchC.1', 'Engine adds 1099-K 12,400 not matched to a deposit (finding C08: it is in books)'],
    ['Car and truck - fuel', ev('Car and truck - fuel'), 'SchC.9', 'Books fuel replaced by standard mileage (miles x 0.70)'],
    ['Depreciation (books, straight-line)', ev('Depreciation'), 'SchC.13', 'Replaced by 100% special depreciation on 38,000 of equipment'],
    ['Insurance - health (Erik)', ev('Insurance - health (Erik)'), 'Sch1.17', 'Moved to Schedule 1 (finding C18: not deductible)'],
    ['Meals', ev('Meals'), 'SchC.24b', '50% limit'],
    ['Telephone + Internet', ev('Telephone') + ev('Internet'), 'SchC.25', 'Business share per call-01 (finding C20)'],
    ['Software and subscriptions', ev('Software and subscriptions'), 'SchC.27a.1', 'Includes Spotify Family 216 (personal)'],
    ['Contract labor', ev('Contract labor'), 'SchC.11', 'Agrees to contractor report D27; Forms 1099-NEC not filed'],
    ['Home office', 0, 'SchC.30', 'Not in books; simplified method 240 sq ft average'],
  ];
  const books = ev('total_income') - (P.evByDoc.D14.find(e => e.field === 'total_expenses')?.value || 61466);
  return `<section class="panel"><div class="ph"><h2>Lindqvist Studio: books net income to Schedule C</h2><span class="small faint">Books (D14, cash basis): net income ${money(ev('net_income') || books)}</span></div>
  <div class="pb flush tw"><table class="t"><thead><tr><th>Books line</th><th class="n">Books</th><th>Return line</th><th class="n">Return (adjusted)</th><th class="n">Difference</th><th>Why</th></tr></thead><tbody>
  ${rows.map(([n, b, k, why]) => { const r = adjustedValue(k) ?? 0; return `<tr class="click" data-act="goline" data-k="${k}"><td>${esc(n)}</td><td class="n">${money(b)}</td><td class="small">${k}</td><td class="n">${money(r)}</td><td class="n">${signed(r - b)}</td><td class="small">${esc(why)}</td></tr>`; }).join('')}
  <tr class="sub"><td>Net profit, Schedule C line 31</td><td class="n">${money(ev('net_income') || books)}</td><td class="small">SchC.31</td><td class="n">${money(P.L['SchC.31'].value)}</td><td class="n">${signed(P.L['SchC.31'].value - (ev('net_income') || books))}</td><td class="small">Engine value; adjustments flow through the tax effect.</td></tr>
  </tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Gross receipts reconciled to third-party forms</h3></div><div class="pb flush tw"><table class="t"><tbody>
  ${['D16', 'D17', 'D18', 'D19', 'D20'].map(id => `<tr><td>${rref(id)} ${esc(P.docs[id].title.replace('2025 Form 1099-NEC - ', ''))}</td><td class="n">${money(P.evByDoc[id].find(e => e.field === 'box1').value)}</td></tr>`).join('')}
  <tr class="sub"><td>Forms 1099-NEC</td><td class="n">${money(142000)}</td></tr>
  <tr><td>Clients who issued no Form 1099 (11 small clients, D15 p3)</td><td class="n">${money(9300)}</td></tr>
  <tr class="sub"><td>Equals books revenue (D14)</td><td class="n">${money(ev('total_income'))}</td></tr>
  <tr><td>Form 1099-K, Paywell (D21): inside Atlas Outdoor Gear's 41,200, deposited gross</td><td class="n faint">(${money(12400)} included above)</td></tr>
  </tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Schedule C as computed</h3></div><div class="pb flush">${lineTable(keysLike(/^SchC|^F4562-C|^SchSE|^Sch1\.1[5-7]|^F8995/), { py: true })}</div></section>`;
}
function sRentals() {
  const A = ['3', '9', '11', '12', '14', '16', '18', '19', '20', '21', '22'];
  const row = (n) => { const a = P.L['SchE.' + n + 'A'], b = P.L['SchE.' + n + 'B']; if (!a && !b) return ''; const lb = (a || b).label.replace(/ - property [AB]/, '');
    return `<tr><td>${esc(lb)}</td><td class="n">${a ? `<button class="ref" data-act="goline" data-k="${a.key}">${money(adjustedValue(a.key))}</button>` : ''}</td><td class="n">${b ? `<button class="ref" data-act="goline" data-k="${b.key}">${money(adjustedValue(b.key))}</button>` : ''}</td></tr>`; };
  return `<section class="panel"><div class="ph"><h2>Schedule E</h2></div><div class="pb flush tw"><table class="t"><thead><tr><th></th><th class="n">A · 1450 Fremont Way (CA, 365 days)</th><th class="n">B · 1200 Barton Hills 4C (TX, sold 10/15)</th></tr></thead><tbody>${A.map(row).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Passive activity losses (Form 8582)</h3><span class="small faint">Prior unallowed: Fremont 6,300, Barton Hills 9,850. The condo's sale in a fully taxable transaction frees its losses.</span></div><div class="pb flush">${lineTable(keysLike(/^F8582|^SchE\.2[2-6]|^SchE\.41/))}</div></section>`;
}
function sK1() {
  const b = P.pkt.prior_years.basis_records.scorp_lindqvist_family_woodworks;
  const y23 = P.evByDoc.D40; const g = (f) => y23.find(e => e.field === f)?.value;
  const rows = [[2022, '—', '—', '—', 21300, 'Client 2022 worksheet (prior preparer file D07)'], [2023, g('box1'), 0, g('box16d'), 21300 + g('box1') - g('box16d'), '2023 K-1 found by client (D40, msg-06)'],
    [2024, b[2].k1_income, 0, b[2].distributions, 21300 + g('box1') - g('box16d') + b[2].k1_income - b[2].distributions, '2024 K-1 (prior return). Basis was sufficient.'],
    [2025, P.L['F7203.4'].value, 0, P.L['F7203.6'].value, P.L['F7203.15'].value, `Distributions exceed basis by ${fmt(P.L['F7203.excess'].value)}: long-term gain (F8949 box F)`]];
  return `<section class="panel"><div class="ph"><h2>Lindqvist Family Woodworks, Inc. · stock basis by year</h2>${chip('Gap closed by the 2023 K-1', 'ok')}</div><div class="pb flush tw"><table class="t"><thead><tr><th>Year</th><th class="n">Income</th><th class="n">Losses</th><th class="n">Distributions</th><th class="n">Ending basis</th><th>Source</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${r[0]}</td><td class="n">${money(r[1])}</td><td class="n">${money(r[2])}</td><td class="n">${money(r[3])}</td><td class="n">${money(r[4])}</td><td class="small">${esc(r[5])}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>K-1 lines mapped to the return</h3></div><div class="pb flush tw"><table class="t"><thead><tr><th>K-1</th><th>Box</th><th class="n">Amount</th><th>Return line</th></tr></thead><tbody>
  ${[...P.evByDoc.D39, ...P.evByDoc.D37].map(e => `<tr><td class="small">${e.document_id === 'D39' ? 'Woodworks (1120-S)' : 'Ridgeline (1065)'}</td><td class="small">${esc(e.label)}</td><td class="n">${typeof e.value === 'number' ? money(e.value) : esc(e.value)}</td><td>${[...(P.evLines[e.id] || [])].map(lref).join(' ') || '<span class="faint small">information only</span>'}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Form 7203 and Schedule E Part II</h3></div><div class="pb flush">${lineTable(keysLike(/^F7203|^SchE\.(28|32)/))}</div><div class="pb small muted">Ridgeline capital account: beginning 60,000, ending 63,660. Outside basis has never been computed (prior records); start tracking it now.</div></section>`;
}
function sRetire() {
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Backdoor Roth (Form 8606, Ngozi)</h2></div><div class="pb flush">${lineTable(keysLike(/^F8606|^F1040\.4/))}</div><div class="pb small muted">Prior basis 7,000 from the 2024 contribution made 02/12/2025 (D42). The client's answer (qa-31: "none that I know of") conflicts; the records govern.</div></section>
  <section class="panel"><div class="ph"><h2>HSA (Form 8889) and SEP</h2></div><div class="pb flush">${lineTable(keysLike(/^F8889|^Sch1\.1[36]/))}</div><div class="pb small muted">Family HDHP covers Ngozi and the children; Erik is on his own plan. SEP contribution 18,000 vs limit (finding C21).</div></section>
  <section class="panel"><div class="ph"><h2>Foreign accounts</h2></div><div class="pb flush">${lineTable(keysLike(/^SchB\.7|^F8938|^SchB\.1\.6/))}</div><div class="pb small muted">FBAR (FinCEN 114) required: maximum ${fmt(P.L['F8938.1.max'].value)} USD. Outside the engagement; client files it. Form 3520 for the 2023 inheritance remains unresolved from the prior preparer.</div></section></div>`;
}
function sDeds() {
  const salt = P.L['SchA.5d'].value, cap = P.L['SchA.5e'].value;
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Schedule A with limits</h2></div><div class="pb flush">${lineTable(keysLike(/^SchA|^F8283|^F1040\.1[2-4]$/))}</div><div class="pb small">SALT before cap ${money(salt)}; cap at this AGI ${money(cap)} (40,000 reduced by 30% of MAGI over 500,000; floor 10,000). Itemized ${money(P.L['SchA.17'].value)} vs standard ${money(P.pkt.engine_reference.parameters.std_deduction_mfj)}.</div></section>
  <section class="panel"><div class="ph"><h2>Credits</h2></div><div class="pb flush">${lineTable(keysLike(/^F8812|^F8863|^F2441|^Sch3\.[18]$/))}</div><div class="pb small">Child tax credit phase-out: 50 per 1,000 of MAGI over 400,000. AOTC fully phased out above 180,000. Dependent care credit is zero after the 5,000 employer benefit.</div></section></div>`;
}
function sPayments() {
  const tr = P.pkt.tax_agency_records.irs_account_transcript_2025.at(-1).transactions; const ftb = P.pkt.tax_agency_records.ftb_account;
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Federal</h2></div><div class="pb flush">${lineTable(['F1040.25a', 'F1040.26', 'Sch3.10', 'Sch3.11', 'F1040.33'])}</div>
    <div class="pb"><h3>IRS account transcript</h3><table class="t"><tbody>${tr.map(x => `<tr><td class="small">${x.date}</td><td class="small">${x.code}</td><td>${esc(x.description)}</td><td class="n">${typeof x.amount === 'number' ? money(x.amount) : '<span class="small faint">' + esc(x.amount) + '</span>'}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h2>California</h2></div><div class="pb flush">${lineTable(['F540NR.71', 'F540NR.72', 'F540NR.73', 'F540NR.78'])}</div>
    <div class="pb"><h3>FTB account (as of ${ftb.as_of})</h3><table class="t"><tbody>${ftb.tax_year_2025_payments.map(x => `<tr><td class="small">${x.date}</td><td>2025 estimate</td><td class="n">${money(x.amount)}</td></tr>`).join('')}${ftb.tax_year_2024_payments_after_filing.map(x => `<tr><td class="small">${x.date}</td><td>${esc(x.note)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div></section></div>`;
}
function sState() {
  const rows = ['1', '2', '3', '4', '7', '12', '17', '22', '26'];
  const col = (r, c) => P.L[`SchCA540NR.${r}.${c}`];
  return `<section class="panel"><div class="ph"><h2>Schedule CA (540NR): federal, California law, California source</h2><span class="small faint">California resident 01/01-07/14 (195 of 365 days); Texas from 07/15.</span></div>
  <div class="pb flush tw"><table class="t"><thead><tr><th>Line</th><th class="n">A Federal</th><th class="n">B Subtractions</th><th class="n">C Additions</th><th class="n">D CA law</th><th class="n">E CA source</th><th>Method</th></tr></thead><tbody>
  ${rows.map(r => { const any = ['A', 'B', 'C', 'D', 'E'].map(c => col(r, c)); const lab = any.find(Boolean)?.label.replace(/ - .*$/, '') || r;
    return `<tr><td>${esc(lab)}</td>${['A', 'B', 'C', 'D', 'E'].map(c => { const l = col(r, c); return `<td class="n">${l ? `<button class="ref" data-act="goline" data-k="${l.key}">${money(adjustedValue(l.key))}</button>` : ''}</td>`; }).join('')}<td class="small">${esc(P.pkt.engine_reference.rules[col(r, 'E')?.rule] || '')}</td></tr>`; }).join('')}
  </tbody></table></div></section>
  <section class="panel"><div class="pb flush">${lineTable(keysLike(/^F540NR\.(13|17|32|34)$|^ScheduleS/))}</div></section>`;
}
function sCarry() {
  const ci = P.pkt.prior_years.carryovers_into_2025, co = P.V.v3.carryovers_out;
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Into 2025 (from 2024)</h2>${chip('Agreed to prior year', 'ok')}</div><div class="pb flush tw"><table class="t"><tbody>${Object.entries(ci).filter(([k, v]) => typeof v === 'number').map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="n">${money(v)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h2>Out to 2026 (engine v3)</h2></div><div class="pb flush tw"><table class="t"><tbody>${Object.entries(co.federal).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="n">${money(v)}</td></tr>`).join('')}${Object.entries(co.california.depreciation_basis_differences).map(([k, v]) => `<tr><td>CA depreciation basis difference ${k}</td><td class="n">${money(v)}</td></tr>`).join('')}</tbody></table></div>
  <div class="pb small muted">Adjustments change these: the HVAC asset adds basis, the SEP excess carries ${money(co.federal.sep_contribution_not_deductible_for_2025)} (or more if Schedule C profit changes), and the AMT credit uses Form 8801 in 2026.</div></section></div>`;
}
function sPrior() {
  const w = P.pkt.prior_years.prior_preparer_workpaper;
  const ours = { 'Obtain 2023 Woodworks K-1 to roll basis forward.': 'Done: D40 received 2026-06-05; basis rolled forward (K-1s & basis).', 'Confirm 2024 Form 5498 for IRA basis.': 'Done: D42 confirms 7,000 contributed 02/12/2025 for 2024.', 'Client to confirm home office square footage.': 'Done: D24 gives 220 sq ft (Sacramento) and 260 (Austin); 2024 used 300.', '2023 Form 3520 (foreign inheritance over 100,000) - discussed? (no note of resolution)': 'Open: raised as an outside filing (C26). Needs a client conversation.' };
  const diffs = [['Health insurance', 'No SEHI deduction (Erik on Ngozi\'s employer plan)', 'Engine deducted 14,400; we follow the prior treatment (C18)'], ['Home office', 'Simplified, 300 sq ft', 'Simplified, 240 sq ft average (measured)'], ['Deduction', 'Standard (29,200)', 'Itemized (home purchase, SALT, charity)'], ['Foreign interest', 'SEK at 2024 average 10.56', 'SEK at 2025 average 9.86 (C07)'], ['Interest from Northlake', 'One line (bank sweep 1,180)', 'Engine shows two lines for the same sweep; we keep one (C06)']];
  return `<div class="grid g2"><section class="panel"><div class="ph"><h2>Open items left by Delta River Tax Services</h2></div><div class="pb col">${w.open_items_left_by_prior_preparer.map(o => `<div class="stripe ${/^Open/.test(ours[o]) ? 'warn' : 'ok'}"><div>${esc(o)}</div><div class="small muted">${esc(ours[o] || '')}</div></div>`).join('')}</div></section>
  <section class="panel"><div class="ph"><h2>What they did vs what we changed</h2></div><div class="pb flush tw"><table class="t"><thead><tr><th>Item</th><th>2024 (prior preparer)</th><th>2025 (us)</th></tr></thead><tbody>${diffs.map(r => `<tr><td>${esc(r[0])}</td><td class="small">${esc(r[1])}</td><td class="small">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Prior preparer notes</h3>${rref('D07')}</div><div class="pb col small">${w.notes.map(n => `<div>• ${esc(n)}</div>`).join('')}</div></section></div>`;
}
function sAreas() {
  const fs = checks();
  return `<div class="grid g2">${AREAS.map(a => { const ks = areaKeys(a.id); const f = fs.filter(x => x.area === a.id && x.kind !== 'pass'); const adj = activeAdjs().filter(x => areaOf(x.line) === a.id);
    return `<section class="panel"><div class="ph"><h2>${esc(a.label)}</h2><button class="btn sm" data-act="goarea" data-a="${a.id}">Open</button></div><div class="pb col small">
    <div>${ks.length} lines · ${f.filter(x => x.status === 'open').length} open findings · ${adj.length} adjustments (fed ${signed(adj.reduce((t, x) => t + (x.fed || 0), 0))}, CA ${signed(adj.reduce((t, x) => t + (x.ca || 0), 0))})</div>
    ${f.slice(0, 5).map(x => `<div class="stripe ${x.severity === 'crit' ? 'crit' : 'warn'}">${esc(x.title)} ${statusChip(x.status)}</div>`).join('')}
    <div class="row">${Object.entries(signoffState(a.id)).map(([l, s]) => `${esc(l)}: ${soChip(s)}`).join(' · ')}</div></div></section>`; }).join('')}</div>`;
}

/* ---------- Changes ---------- */
function vChanges() {
  const t = R.tab.chg || 'ledger';
  const body = { ledger: cLedger, compare: cCompare, since: cSince, whatif: cWhatif }[t]();
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Changes</div><h1>Adjustments, versions and what-ifs</h1></div></div>${tabs('chg', [['ledger', 'Adjustment ledger'], ['compare', 'Compare versions'], ['since', 'Activity'], ['whatif', 'What-ifs']], t)}${body}</div>`;
}
function cLedger() {
  const all = Object.values(D().adjs).sort((a, b) => a.at < b.at ? 1 : -1); const t = totals();
  return `<section class="panel"><div class="kpis">${kpi('Federal tax change', t.fed.dTax, 0, 'from adjustments and adopted what-ifs')}${kpi('Federal payment change', t.fed.dPay, 0, '')}${kpi('California tax change', t.ca.dTax, 0, '')}${kpi('California payment change', t.ca.dPay, 0, '')}</div></section>
  <section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>When</th><th>Who</th><th>Line</th><th class="n">Change</th><th>Why</th><th class="n">Fed</th><th class="n">CA</th><th>Status</th><th></th></tr></thead><tbody>
  ${all.map(a => `<tr><td class="small">${dshort(a.at)}</td><td class="small">${who(a.actor)}</td><td>${lref(a.line)}</td><td class="n">${a.status === 'reverted' ? `<span class="strike">${signed(a.lineDelta)}</span>` : signed(a.lineDelta)}</td><td class="small">${esc(a.why || '')}${a.finding ? ` <span class="faint">(${a.finding})</span>` : ''}</td><td class="n">${a.fedPay ? 'pay ' + signed(a.fedPay) : signed(a.fed || 0)}</td><td class="n">${a.caPay ? 'pay ' + signed(a.caPay) : signed(a.ca || 0)}</td>
    <td>${a.status === 'reverted' ? chip('Reverted') : a.approved ? chip(a.needsPartner ? 'Partner approved' : 'Active', 'ok') : chip('Needs partner', 'warn')}</td>
    <td style="white-space:nowrap">${a.status === 'active' && !a.approved && can('approve_adjustment') && a.actor !== Session.user ? `<button class="btn sm primary" data-act="approve-adj" data-id="${a.id}">Approve</button>` : ''}${a.status === 'active' && can('adjust') ? `<button class="btn sm danger" data-act="revert-adj" data-id="${a.id}" ${frozenAttr()}>Revert</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No adjustments yet. Open Findings to apply proposed ones.</td></tr>'}
  </tbody></table></div><div class="pb small faint">Reverting keeps the record; nothing is deleted. Partner approval is required above ${fmt(thresholdPartner())} of tax effect (firm rule).</div></section>`;
}
function cCompare() {
  const a = R.filter.cmpA || 'v1', b = R.filter.cmpB || 'adjusted';
  const val = (v, k) => v === 'adjusted' ? adjustedValue(k) : P.Lmap[v][k]?.value;
  const keys = [...new Set([...Object.keys(P.Lmap[a === 'adjusted' ? 'v3' : a]), ...Object.keys(P.Lmap[b === 'adjusted' ? 'v3' : b])])];
  const diff = keys.filter(k => JSON.stringify(val(a, k)) !== JSON.stringify(val(b, k)));
  const opt = (sel, id) => `<select class="inp" data-act="cmp" data-w="${id}" aria-label="Version">${['v1', 'v2', 'v3', 'adjusted'].map(v => `<option ${v === sel ? 'selected' : ''} value="${v}">${v === 'adjusted' ? 'v3 + adjustments' : v + ' · ' + dshort(P.V[v].computed_at)}</option>`).join('')}</select>`;
  return `<section class="panel"><div class="ph"><div class="row">${opt(a, 'cmpA')} → ${opt(b, 'cmpB')}</div><span class="small faint">${diff.length} lines differ</span></div>
  <div class="pb small muted">${[a, b].filter(v => v !== 'adjusted').map(v => `${v}: ${esc(P.V[v].trigger)}`).join('<br>')}</div>
  <div class="pb flush tw" style="max-height:600px;overflow:auto"><table class="t"><thead><tr><th>Line</th><th>Description</th><th class="n">${a}</th><th class="n">${b}</th><th class="n">Change</th></tr></thead><tbody>
  ${diff.slice(0, 400).map(k => { const x = val(a, k), y = val(b, k); const l = P.L[k] || P.Lmap[a]?.[k] || P.Lmap[b]?.[k]; return `<tr class="click" data-act="goline" data-k="${k}"><td class="small">${k}</td><td>${esc(l?.label || '')}</td><td class="n">${typeof x === 'number' ? money(x) : esc(x ?? '—')}</td><td class="n">${typeof y === 'number' ? money(y) : esc(y ?? '—')}</td><td class="n">${typeof x === 'number' && typeof y === 'number' ? signed(y - x) : ''}</td></tr>`; }).join('')}
  </tbody></table></div></section>`;
}
function cSince() {
  const ev = [...Store.events].reverse();
  return `<section class="panel"><div class="ph"><h2>All recorded actions</h2><span class="small faint">${Store.events.length} events in the append-only log</span></div><div class="pb col">${ev.slice(0, 200).map(x => `<div class="row between">${evLine(x)}${x.batch && !D().undone.has(x.batch) && x.type !== 'undo' && can('adjust') ? `<button class="btn sm ghost" data-act="undo" data-b="${x.batch}">Undo batch</button>` : ''}</div>`).join('') || '<div class="empty">Nothing recorded yet.</div>'}</div></section>`;
}
function cWhatif() {
  const d = D(); const custom = R.filter.wi || { cat: 'schc_profit', amt: 10000 };
  const e = effectOf(custom.cat, +custom.amt || 0);
  return `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Alternative (engine results)</th><th class="n">Fed tax change</th><th class="n">CA tax change</th><th>Lines</th><th></th></tr></thead><tbody>
  ${P.pkt.what_if.alternatives.map(w => `<tr><td><b>${esc(w.description)}</b><div class="small faint">base ${w.base_version} · choices ${esc(JSON.stringify(w.choices))}</div></td><td class="n">${signed(w.federal.total_tax_change)}</td><td class="n">${signed(w.california.total_tax_change)}</td><td class="small">${w.changed_lines.length} lines</td>
    <td>${w.id === 'hvac_improvement' ? '<span class="small faint">Use finding C19</span>' : d.whatif[w.id] ? `${chip('Adopted', 'ok')} ${can('judgment') ? `<button class="btn sm" data-act="whatif" data-id="${w.id}" data-on="0">Drop</button>` : ''}` : can('judgment') ? `<button class="btn sm" data-act="whatif" data-id="${w.id}" data-on="1">Adopt as election</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></section>
  <section class="panel"><div class="ph"><h3>Quick what-if</h3><span class="small faint">Marginal rates from engine v3; large changes can cross thresholds.</span></div><div class="pb row">
    <label class="fld">Category<select class="inp" id="wi-cat" data-act="wi">${CATS.map(c => `<option value="${c}" ${c === custom.cat ? 'selected' : ''}>${CAT_LABEL[c]}</option>`).join('')}</select></label>
    <label class="fld">Amount<input class="inp" id="wi-amt" type="number" value="${esc(custom.amt)}" data-act="wi"></label>
    <div><div class="eyebrow">Federal</div><b class="num">${signed(e.fed)}</b></div><div><div class="eyebrow">California</div><b class="num">${signed(e.ca)}</b></div></div></section>
  <section class="panel"><div class="ph"><h3>Extension estimate (2026-04-14, from v2)</h3></div><div class="pb small">${esc(JSON.stringify(P.pkt.what_if.extension.federal))}<br>${esc(JSON.stringify(P.pkt.what_if.extension.california))}</div></section>`;
}

/* ---------- Review ---------- */
function vReview() {
  const d = D(); const t = R.tab.rev || 'signoffs';
  const notes = Object.values(d.notes); const flt = R.filter.notes || 'open';
  const shown = notes.filter(n => flt === 'all' || (flt === 'open' ? n.status === 'open' : flt === 'blocking' ? n.blocking && n.status === 'open' : flt === 'questions' ? n.kind === 'question' : n.to === Session.user || n.actor === Session.user));
  const staffOpts = P.pkt.firm.staff.filter(s => ['preparer', 'reviewer', 'partner'].includes(s.role)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  let body = '';
  if (t === 'signoffs') body = `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Area</th>${d.standards.review_levels.map(l => `<th>${esc(l)}</th>`).join('')}<th>Judgments</th></tr></thead><tbody>
    ${AREAS.map(a => { const so = signoffState(a.id); const prep = d.signoffs[a.id]?.preparer?.actor;
      return `<tr><td><b>${esc(a.label)}</b></td>${d.standards.review_levels.map(l => { const x = so[l]; const mine = can('signoff:' + l); const ownWork = l !== 'preparer' && prep === Session.user;
        return `<td>${soChip(x)}${x.state === 'reopened' ? `<div class="small" style="color:var(--crit)">Changed after ${who(x.by)} signed: ${x.changed.slice(0, 3).join(', ')}${x.changed.length > 3 ? '…' : ''}${x.adjDiff ? ' (adjustments or judgments)' : ''}</div>` : ''}
        ${mine && x.state !== 'signed' ? `<div><button class="btn sm ${ownWork ? '' : 'primary'}" data-act="signoff" data-a="${a.id}" data-l="${l}" ${ownWork ? 'disabled title="You prepared this area. Someone else must review it."' : ''}>Sign off</button></div>` : ''}
        ${x.state === 'signed' && x.by === Session.user ? `<div><button class="btn sm ghost" data-act="unsign" data-a="${a.id}" data-l="${l}">Withdraw</button></div>` : ''}</td>`; }).join('')}
        <td class="small">${d.judgments.filter(j => j.area === a.id).length}</td></tr>`; }).join('')}
    </tbody></table></div><div class="pb small faint">Rule: a person may not review or sign off on work they prepared. Each sign-off stores a fingerprint of every value, adjustment and judgment in the area; any later change reopens it.</div></section>
    <section class="panel"><div class="ph"><h3>Judgment calls, elections and penalty decisions</h3></div><div class="pb col">
      ${d.judgments.map(j => `<div class="note"><div class="row between"><b>${esc(j.kind)}</b><span class="small faint">${esc(AREA[j.area]?.label || j.area || '')}</span></div><div>${esc(j.text)}</div><div class="meta">${who(j.actor)} · ${dshort(j.at)}${j.authority ? ' · authority: ' + esc(j.authority) : ''}</div></div>`).join('') || '<div class="small faint">None recorded.</div>'}
      ${can('judgment') ? `<form class="col" data-form="judgment"><div class="row"><select class="inp" name="kind" aria-label="Kind"><option>Judgment call</option><option>Election</option><option>Due diligence</option><option>Penalty decision</option><option>Completeness</option></select><select class="inp" name="area" aria-label="Area">${AREAS.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}</select><input class="inp" name="authority" placeholder="Authority relied on (required by firm rule)" required style="flex:1"></div><textarea class="inp" name="text" required placeholder="What was decided and why"></textarea><button class="btn">Record</button></form>` : ''}</div></section>`;
  if (t === 'notes') body = `<section class="panel"><div class="ph"><div class="row">${['open', 'blocking', 'questions', 'mine', 'all'].map(k => `<button class="btn sm ${flt === k ? 'primary' : ''}" data-act="notefilter" data-s="${k}">${k}</button>`).join('')}</div></div><div class="pb col">${shown.map(noteCard).join('') || '<div class="empty">No notes.</div>'}</div></section>
    <section class="panel"><div class="pb">${notesBlock('general', 'intake', [])}</div></section>`;
  if (t === 'assign') body = `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Area</th><th>Assigned to</th><th>Due</th><th class="n">Hours / budget</th><th></th></tr></thead><tbody>
    ${AREAS.map(a => { const x = d.assign[a.id]; const hrs = d.time.filter(t => t.area === a.id).reduce((s, t) => s + (+t.hours || 0), 0); const bud = a.budget ? P.pkt.firm.budget_hours[a.budget] : null;
      return `<tr><td>${esc(a.label)}</td><td>${x ? who(x.who) : '<span class="faint">Unassigned</span>'}</td><td>${x?.due || ''}</td><td class="n">${fmt(hrs, 1)} / ${bud ?? '—'}</td><td>${can('assign') ? `<form class="row" data-form="assign" data-a="${a.id}"><select class="inp" name="who" aria-label="Who">${staffOpts}</select><input class="inp" type="date" name="due" value="${x?.due || '2026-03-27'}" aria-label="Due date"><button class="btn sm">Assign</button></form>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div><div class="pb small muted">Internal deadlines: ${P.pkt.firm.deadlines.map(x => `${esc(x.what)} ${x.date}`).join(' · ')}</div></section>`;
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Review</div><h1>Sign-offs, notes and assignments</h1></div></div>${tabs('rev', [['signoffs', 'Sign-offs & judgments'], ['notes', 'Review notes & questions'], ['assign', 'Assignments & deadlines']], t)}${body}</div>`;
}

/* ---------- Filing ---------- */
function vFiling() {
  const d = D(); const fsx = filingState(); const bl = blockers(); const steps = requiredStepStatus(); const t = totals();
  const theoFixed = !!d.corrections['household.theo.ssn'];
  const subs = fsx.submissions;
  const ext = P.pkt.what_if.extension;
  const notice = P.pkt.tax_agency_records.notices.find(n => n.tax_year === 2025);
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Filing</div><h1>File, then everything after</h1></div><div class="row">${fsx.frozen ? chip('Filed return frozen ' + dshort(fsx.frozen.at), 'ok') : ''}${isFrozen() ? '' : fsx.amend ? chip('Amendment in progress', 'warn') : ''}</div></div>
  <div class="grid g2">
  <section class="panel"><div class="ph"><h2>Required steps</h2>${chip(steps.filter(s => s.done).length + ' of ' + steps.length, steps.every(s => s.done) ? 'ok' : 'warn')}</div><div class="pb col">
    ${steps.map(s => `<div class="row between stripe ${s.done ? 'ok' : 'warn'}"><span>${s.done ? '<span class="tick">✓</span> ' : ''}${esc(s.step)}<div class="small faint">${esc(s.why || '')}</div></span>${!s.done && /Identity|Prior-year return/.test(s.step) && can('verify') ? `<button class="btn sm" data-act="${/Identity/.test(s.step) ? 'verify-id' : 'verify-doc'}" data-d="D06">Record</button>` : ''}${!s.done && /Due diligence/.test(s.step) ? `<button class="btn sm" data-act="tab" data-g="fil" data-k="dd">Open checklist</button>` : ''}</div>`).join('')}</div></section>
  <section class="panel"><div class="ph"><h2>Blocking filing</h2>${chip(bl.length, bl.length ? 'crit' : 'ok')}</div><div class="pb col">${bl.map(b => `<div class="small stripe ${b.kind === 'finding' ? 'crit' : 'warn'}">${esc(b.text)}</div>`).join('') || '<div class="empty">Nothing is blocking.</div>'}</div></section>
  </div>
  ${R.tab.fil === 'dd' || !d.dd['CTC/ODC'] ? `<section class="panel"><div class="ph"><h2>Due diligence (Form 8867)</h2><span class="small faint">Firm rule: required for CTC, ODC, AOTC, EIC and head of household.</span></div><div class="pb grid g2">
    ${['CTC/ODC', 'AOTC'].map(c => d.dd[c] ? `<div class="stripe ok"><b>${c}</b> completed by ${who(d.dd[c].actor)} on ${dshort(d.dd[c].at)}<div class="small">${esc(d.dd[c].note || '')}</div></div>` : `<form class="col" data-form="dd" data-c="${c}"><b>${c}</b>
      ${(c === 'CTC/ODC' ? ['Relationship and age of each child confirmed (Theo born 2017; Ada born 2006, full-time student)', 'Residency: both lived with the taxpayers 12 months (Ada away at school counts)', 'SSNs agreed to Social Security card or prior return', 'Ada files her own return and indicated she can be claimed'] : ['Form 1098-T obtained (D59)', 'Scholarship applied to tuition (D60)', 'Credit fully phased out by MAGI; documented anyway']).map((q, i) => `<label class="small row"><input type="checkbox" name="q${i}" required> ${esc(q)}</label>`).join('')}
      <input class="inp" name="note" placeholder="Notes"><button class="btn" ${denied('judgment')}>Complete ${c}</button></form>`).join('')}</div></section>` : ''}
  <section class="panel"><div class="ph"><h2>Extension</h2>${chip('Filed 2026-04-14', 'ok')}</div><div class="pb small">Form 4868 with ${money(ext.federal.paid_with_form_4868)} (v2 estimate ${money(ext.federal.estimated_total_tax)} less payments ${money(ext.federal.payments)}, rounded up to the next 500). FTB 3519 with ${money(ext.california.paid_with_ftb_3519)} (California overpaid). Extended due date 2026-10-15. An extension does not extend time to pay: federal balance paid after 04-15 accrues interest at ${fmt(P.pkt.post_filing_rates.irs_underpayment_interest_rate_annual * 100, 0)}% and a 0.5% monthly failure-to-pay penalty.</div></section>
  <section class="panel"><div class="ph"><h2>Client approval and e-file signature</h2></div><div class="pb col">
    <div class="small">Federal ${t.fed.bal >= 0 ? 'balance due' : 'refund'} <b class="num">${money(Math.abs(t.fed.bal))}</b> · California refund <b class="num">${money(-t.ca.bal)}</b> (estimated with adjustments)</div>
    ${fsx.approved ? `<div class="stripe ok">Approved and Forms 8879 / FTB 8879 signed by ${who(fsx.approved.actor)} on ${dshort(fsx.approved.at)} (PIN on file).</div>` : fsx.sent ? `<div class="stripe info">Sent to the client on ${dshort(fsx.sent.at)}. Waiting for approval in the client view.</div>` :
      `<button class="btn primary" data-act="send-approval" ${can('request_approval') ? '' : 'disabled'} ${bl.length ? 'disabled title="Clear the blockers first"' : ''}>Send to client for approval</button>${bl.length ? `<div class="small faint">${bl.length} blockers must be cleared first.</div>` : ''}`}
    <div class="small faint">Paid preparer signing: ${who(P.pkt.firm.firm_identity.paid_preparer_signing_returns)} · EFIN ${esc(P.pkt.firm.firm_identity.efin)} · prior-year AGI for e-signature ${money(P.pkt.household.prior_year_agi_for_esignature)} (agrees to 2024 line 11)</div></div></section>
  <section class="panel"><div class="ph"><h2>E-file</h2></div><div class="pb col">
    ${subs.map(s => `<div class="stripe ${s.status === 'accepted' ? 'ok' : s.status === 'rejected' ? 'crit' : 'info'}"><b>${esc(s.jurisdiction)}</b> ${esc(s.status)} · ${dshort(s.at)} · submission ${esc(s.submission)}${s.error ? `<div class="small">${esc(s.error)}</div>` : ''}</div>`).join('')}
    ${fsx.approved && !subs.some(s => s.jurisdiction === 'federal' && s.status === 'accepted') ? `<button class="btn primary" data-act="efile" ${can('file') ? '' : 'disabled title="Partner files"'}>Transmit federal and California</button>${!theoFixed ? '<div class="small faint">Replay note: the dependent SSN finding (C13) is still open, so this submission will reproduce the IRS reject from the packet.</div>' : ''}` : ''}
    ${subs.some(s => s.jurisdiction === 'federal' && s.status === 'accepted') && !fsx.frozen ? `<button class="btn" data-act="freeze">Freeze the filed return</button>` : ''}
    ${fsx.frozen && isFrozen() && can('amend') ? `<button class="btn" data-act="amend">Start an amendment (keeps the filed version)</button>` : ''}</div></section>
  ${fsx.frozen ? afterFiling(notice) : `<section class="panel"><div class="pb small faint">After filing: payments and refunds, the client's copy, notices and the roll-forward to 2026 appear here.</div></section>`}
  </div>`;
}
function afterFiling(notice) {
  const t = totals(); const days = Math.round((new Date('2026-07-20') - new Date('2026-04-15')) / 86400000);
  const int = Math.round(Math.max(0, t.fed.bal) * P.pkt.post_filing_rates.irs_underpayment_interest_rate_annual * days / 365); const ftp = Math.round(Math.max(0, t.fed.bal) * P.pkt.post_filing_rates.irs_failure_to_pay_penalty_per_month * Math.ceil(days / 30));
  const fz = filingState().frozen;
  const plan = P.pkt.planning_reference_2026; const safe = Math.round(t.fed.tax * 1.1); const q = Math.ceil(safe / 4);
  return `<section class="panel"><div class="ph"><h2>Payments and refunds</h2></div><div class="pb small col">
    <div>${t.fed.bal > 0 ? `Federal balance ${money(t.fed.bal)} paid 2026-07-20 by direct debit (tl-25). Expect IRS interest of about ${money(int)} (${days} days at 7%) and a failure-to-pay penalty of about ${money(ftp)}; the transcript dated 2026-08-03 shows codes 196/276.` : `With the adjustments the federal return shows a refund of ${money(-t.fed.bal)}, so the scripted 2026-07-20 balance payment and the 196/276 interest and penalty assessments do not apply. The 36,000 extension payment covered the tax; expect the refund by direct deposit.`}</div>
    <div>California refund ${money(-t.ca.bal)} issued 2026-08-21 by direct deposit to ${esc(maskText('account ' + P.pkt.household.bank_account_for_refund_or_payment.account))} (${esc(P.pkt.household.bank_account_for_refund_or_payment.bank)}).</div></div></section>
  <section class="panel"><div class="ph"><h2>Client's copy</h2></div><div class="pb">${clientCopy(fz)}</div></section>
  <section class="panel"><div class="ph"><h2>Notice response: ${esc(notice.type)} dated ${notice.dated}</h2>${chip('Response due ' + notice.response_due, 'warn')}</div><div class="pb col">
    ${notice.items_under_examination.map(i => `<div class="stripe warn">${esc(i)}</div>`).join('')}
    <h3>Self-contained record</h3>
    <div class="small"><b>1. Noncash charitable contributions (Form 8283, Schedule A line 12).</b> Stock: 200 sh Northlake Total Market Index Fund to Austin Community Foundation donor-advised fund on 2025-12-05, acknowledgment D65 (value 14,500 at high/low average; held since 2019; basis 9,300). Vehicle: 2012 Subaru Outback, Form 1098-C D66 shows sale for 2,900; ${activeAdjs().some(a => a.finding === 'C17') ? 'the return deducted 2,900 (adjusted from the client\'s 6,000 estimate before filing).' : '<b style="color:var(--crit)">the return deducted 6,000; an amendment limiting it to 2,900 is required.</b>'} Evidence: ${['D65', 'D66', 'ev-1051', 'ev-1054', 'qa-39'].map(rref).join(' ')}</div>
    <div class="small"><b>2. Schedule C gross receipts.</b> Forms 1099-NEC total 142,000 and Form 1099-K 12,400. The 1099-K payments came from Atlas Outdoor Gear through Paywell card processing and are also inside Atlas's 1099-NEC of 41,200 (books deposit detail D15 p3). Books revenue 151,300 = 1099-NEC 142,000 + 9,300 from clients who issued no 1099. ${activeAdjs().some(a => a.finding === 'C08') ? 'Return reported 151,300.' : '<b style="color:var(--crit)">The return reported 163,700 (1099-K counted twice); a claim for the overstatement belongs in the response.</b>'} Evidence: ${['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'].map(rref).join(' ')}</div>
    <div class="small faint">The record above is built from the frozen filed return, its adjustments, verifications and source documents, so it stays complete after staff changes.</div></div></section>
  <section class="panel"><div class="ph"><h2>Roll forward and plan 2026</h2></div><div class="pb col small">
    <div><b>Carry forward with history:</b> AMT credit ${money(P.V.v3.carryovers_out.federal.minimum_tax_credit_from_2025_amt)} (Form 8801), SEP excess ${money(P.V.v3.carryovers_out.federal.sep_contribution_not_deductible_for_2025)}, California depreciation differences, Woodworks basis 0 (track 2026 distributions), Ridgeline capital 63,660, HVAC asset if capitalized, open items: Form 3520 (2023), FBAR, Forms 1099-NEC.</div>
    <div><b>2026 estimates (federal safe harbor 110% of 2025 tax):</b> ${money(safe)} → ${plan.federal_estimate_due_dates.map(dd => `${dd} ${money(q)}`).join(' · ')}. California: only California-source income (Fremont Way rental) after the move; ${esc(plan.california_safe_harbor)}</div>
    <div><b>Known 2026 changes:</b> ${plan.known_2026_changes_for_this_household.map(x => esc(typeof x === 'string' ? x : JSON.stringify(x))).join(' · ')}</div>
    <div><b>Next preparer (tl-28):</b> this file opens with every adjustment, verification, judgment and note intact; the 2026 return compares to the filed (frozen) 2025 values.</div></div></section>`;
}
function clientCopy(fz) {
  const t = totals(); const h = P.pkt.household;
  return `<div class="paper" style="font-family:var(--f-body)"><div class="ph1"><b>2025 tax return summary · ${esc(h.people[0].name)} and ${esc(h.people[1].name)}</b><span class="small">${fz ? 'Filed ' + dshort(fz.at) : 'Draft'}</span></div>
  <table class="t"><tbody><tr><td>Federal total tax</td><td class="n">${money(t.fed.tax)}</td></tr><tr><td>Federal payments</td><td class="n">${money(t.fed.pay)}</td></tr><tr><td><b>Federal ${t.fed.bal >= 0 ? 'balance due' : 'refund'}</b></td><td class="n"><b>${money(Math.abs(t.fed.bal))}</b></td></tr>
  <tr><td>California total tax</td><td class="n">${money(t.ca.tax)}</td></tr><tr><td><b>California refund</b></td><td class="n"><b>${money(-t.ca.bal)}</b></td></tr></tbody></table>
  <p class="small">Dependents: ${h.people.filter(p => p.role === 'dependent').map(p => esc(p.name) + ' (' + esc(maskText(D().corrections['household.' + p.id + '.ssn']?.to || p.ssn)) + ')').join(', ')}. Keep this copy with your records for 7 years.</p></div>`;
}

/* ---------- Season replay ---------- */
function vTimeline() {
  const tl = P.pkt.timeline; const asOf = Session.asOf;
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Season replay</div><h1>Replay the 2026 season</h1><div class="small muted">Pick a moment to see the file as it stood: documents received, engine runs and your team's recorded work up to then.</div></div>
    ${asOf ? `<button class="btn" data-act="asof-clear">Back to now</button>` : ''}</div>
  <section class="panel"><div class="pb flush"><ul class="timeline">${tl.map(x => { const fut = asOf && x.at > asOf; const now = asOf && x.at === asOf;
    return `<li class="${fut ? 'future' : ''} ${now ? 'now' : ''}"><div class="small num" style="padding-left:12px">${dshort(x.at)}</div><div class="row between" style="padding-right:12px"><div><b>${esc(x.event.replace(/_/g, ' '))}</b>${x.actor ? ' · ' + who(x.actor) : ''}<div class="small muted">${esc(x.detail || '')} ${(x.refs || []).map(r => /^v\d$/.test(r) ? chip(r, 'acc') : rref(r)).join(' ')}</div></div><button class="btn sm" data-act="asof" data-t="${x.at}">View as of here</button></div></li>`; }).join('')}</ul></div></section></div>`;
}

/* ---------- Firm ---------- */
function vFirm() {
  const d = D(); const t = R.tab.firm || 'standards'; let body = '';
  if (t === 'standards') { const s = d.standards; const ok = can('standards');
    body = `<section class="panel"><div class="ph"><h2>Firm standards</h2>${ok ? '' : chip('Only the firm administrator can edit', 'info')}</div><form class="pb col" data-form="standards">
      <div class="row"><label class="fld">Flag variance over %<input class="inp" name="pct" type="number" value="${s.variance_review.flag_if_change_over_percent}" ${ok ? '' : 'disabled'}></label><label class="fld">and over amount<input class="inp" name="amt" type="number" value="${s.variance_review.and_over_amount}" ${ok ? '' : 'disabled'}></label></div>
      <label class="fld">Verification types (one per line)<textarea class="inp" name="vt" rows="5" ${ok ? '' : 'disabled'}>${esc(s.verification_types.join('\n'))}</textarea></label>
      <label class="fld">Rules (one per line)<textarea class="inp" name="rules" rows="8" ${ok ? '' : 'disabled'}>${esc(s.rules.join('\n'))}</textarea></label>
      <label class="fld">Required steps (one per line)<textarea class="inp" name="steps" rows="10" ${ok ? '' : 'disabled'}>${esc(s.required_steps.join('\n'))}</textarea></label>
      ${ok ? '<button class="btn primary" style="align-self:flex-start">Save standards</button>' : ''}</form></section>`; }
  if (t === 'staff') body = `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Credential</th><th>Sensitive data</th><th>Active from</th><th>Can</th></tr></thead><tbody>${P.pkt.firm.staff.map(s => `<tr><td>${esc(s.name)}${s.note ? `<div class="small faint">${esc(s.note)}</div>` : ''}</td><td>${esc(s.role.replace('_', ' '))}</td><td>${esc(s.credential || '')}</td><td>${s.sensitive_data_clearance ? chip('Cleared', 'ok') : chip('Masked', 'warn')}</td><td class="small">${s.active_from}</td><td class="small">${(CAN[s.role] || []).join(', ')}</td></tr>`).join('')}</tbody></table></div></section>`;
  if (t === 'views') body = `<section class="panel"><div class="ph"><h2>Sensitive data view log</h2><span class="small faint">Every unmasked view of SSNs, bank and account numbers and IP PINs</span></div><div class="pb flush tw"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${d.views.slice().reverse().map(v => `<tr><td class="small">${esc(v.at.replace('T', ' ').slice(0, 19))}</td><td>${who(v.actor)}</td><td class="small">${esc(v.what)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No unmasked views.</td></tr>'}</tbody></table></div></section>`;
  if (t === 'time') body = `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Area</th><th class="n">Budget h</th><th class="n">Used h</th><th style="width:40%">Use</th></tr></thead><tbody>${AREAS.map(a => { const b = a.budget ? P.pkt.firm.budget_hours[a.budget] : 0; const u = d.time.filter(x => x.area === a.id).reduce((s, x) => s + (+x.hours || 0), 0);
    return `<tr><td>${esc(a.label)}</td><td class="n">${b || '—'}</td><td class="n">${fmt(u, 1)}</td><td>${b ? `<div class="bar ${u > b ? 'over' : ''}"><i style="width:${Math.min(100, u / b * 100)}%"></i></div>` : ''}</td></tr>`; }).join('')}<tr class="sub"><td>Partner review</td><td class="n">${P.pkt.firm.budget_hours.partner_review}</td><td class="n">${fmt(d.time.filter(x => x.area === 'partner').reduce((s, x) => s + (+x.hours || 0), 0), 1)}</td><td></td></tr></tbody></table></div>
    ${can('time') ? `<form class="pb row" data-form="time"><select class="inp" name="area" aria-label="Area">${AREAS.map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}<option value="partner">Partner review</option></select><input class="inp" name="hours" type="number" step="0.1" min="0.1" placeholder="Hours" required style="width:90px"><input class="inp" name="note" placeholder="What" style="flex:1"><button class="btn">Log time</button></form>` : ''}</section>`;
  if (t === 'board') { const fs = checks(); const fx = filingState();
    body = `<section class="panel"><div class="pb flush tw"><table class="t"><thead><tr><th>Client</th><th>Return</th><th>Status</th><th>Preparer</th><th>Reviewer</th><th>Due</th><th class="n">Open findings</th><th class="n">Open notes</th><th class="n">Hours</th></tr></thead><tbody>
    <tr class="click" data-act="nav" data-v="overview"><td><b>${esc(P.pkt.packet.name)}</b><div class="small faint">${P.pkt.packet.client_id}</div></td><td>1040 + 540NR</td><td>${fx.frozen ? chip('Filed', 'ok') : fx.approved ? chip('Approved', 'acc') : chip('In preparation', 'warn')}</td><td>${who(P.pkt.firm.assignment_at_start.preparer)}</td><td>${who(P.pkt.firm.assignment_at_start.reviewer)}</td><td>2026-10-15</td><td class="n">${fs.filter(f => f.status === 'open' && f.kind !== 'pass').length}</td><td class="n">${Object.values(d.notes).filter(n => n.status === 'open').length}</td><td class="n">${fmt(d.time.reduce((s, x) => s + (+x.hours || 0), 0), 1)}</td></tr></tbody></table></div></section>`; }
  if (t === 'data') body = `<section class="panel"><div class="ph"><h2>Saved work</h2></div><div class="pb col">
    <div class="small">Everything people do is saved as an append-only event log (${Store.events.length} events)${Store.mem ? ' <b style="color:var(--crit)">in memory only: this browser blocks storage</b>' : ' in this browser and shared live with other open tabs'}. The packet itself is loaded as delivered and never changed.</div>
    <div class="row"><button class="btn" data-act="export">Export work as JSON</button><label class="btn">Import work<input type="file" accept="application/json" data-act="import" hidden></label><button class="btn danger" data-act="reset-ask">Clear all work</button></div>
    ${R.resetAsk ? `<div class="stripe crit row">This deletes every recorded action in this browser. <button class="btn danger" data-act="reset">Delete everything</button><button class="btn" data-act="reset-cancel">Keep</button></div>` : ''}
    <textarea class="inp" id="exportbox" rows="6" readonly hidden></textarea></div></section>`;
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">Firm</div><h1>Firm settings and oversight</h1></div></div>${tabs('firm', [['standards', 'Standards'], ['staff', 'Staff & roles'], ['views', 'View log'], ['time', 'Time vs budget'], ['board', 'Status board'], ['data', 'Saved work']], t)}${body}</div>`;
}

/* ---------- Client portal ---------- */
function vPortal() {
  const d = D(); const u = Session.user; const isClient = roleOf(u) === 'client'; const fsx = filingState();
  const qs = Object.values(d.notes).filter(n => n.to === 'client');
  const name = isClient ? staffName(u).split(' ')[0] : 'client';
  return `<div class="page"><div class="pagehead"><div><div class="eyebrow">${isClient ? 'Your 2025 return' : 'What the client sees'}</div><h1>${isClient ? 'Hello ' + esc(name) : 'Client view'}</h1></div></div>
  ${!isClient ? '<div class="stripe info small">You are looking at the client portal as staff. Switch to Ngozi or Erik in "Signed in as" to answer questions or approve.</div>' : ''}
  <section class="panel"><div class="ph"><h2>Questions from your tax team</h2>${chip(qs.filter(q => q.status === 'open').length + ' open', 'warn')}</div><div class="pb col">
    ${qs.map(n => `<div class="note"><div><b>${who(n.actor)}</b> asked: ${esc(n.text)}</div>${n.replies.map(r => `<div class="reply small"><b>${who(r.actor)}</b>: ${esc(r.text)}</div>`).join('')}
      ${n.status === 'open' && isClient ? `<form class="col" data-form="reply" data-n="${n.id}"><textarea class="inp" name="text" required placeholder="Your answer"></textarea><div class="row"><button class="btn primary">Send answer</button><label class="btn sm">Attach a file<input type="file" data-act="attach" data-t="note:${n.id}" hidden></label></div></form>` : n.status === 'resolved' ? chip('Answered', 'ok') : ''}</div>`).join('') || '<div class="empty">No questions right now.</div>'}</div></section>
  <section class="panel"><div class="ph"><h2>Review and sign</h2></div><div class="pb col">
    ${fsx.approved ? `<div class="stripe ok">You approved and signed on ${dshort(fsx.approved.at)}.</div>${clientCopy(fsx.frozen)}` : fsx.sent ? `${clientCopy(null)}
      ${isClient ? `<form class="col" data-form="approve"><label class="small row"><input type="checkbox" name="ok" required> I have reviewed the return and it is correct and complete to the best of my knowledge.</label><label class="fld">Your 5-digit signature PIN (Form 8879)<input class="inp" name="pin" inputmode="numeric" pattern="[0-9]{5}" required style="width:120px"></label><button class="btn primary" style="align-self:flex-start">Approve and sign</button></form>` : '<div class="small faint">Waiting for the client.</div>'}` : '<div class="small faint">Your return is still being prepared. You will be asked to review it here.</div>'}</div></section>
  <section class="panel"><div class="ph"><h2>Your documents</h2><span class="small faint">${P.pkt.documents.filter(x => x.uploaded_by === 'client').length} uploaded</span></div><div class="pb col">${isClient ? `<label class="btn" style="align-self:flex-start">Upload a document<input type="file" data-act="attach" data-t="client-upload" hidden></label>` : ''}${(d.attach['client-upload'] || []).map(attRow).join('')}</div></section></div>`;
}
