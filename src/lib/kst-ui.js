// Framework-free renderer for the KST Delivery Tracker UI.
// This is the verified phase-1 renderer, parameterized so its data comes from
// the database (via opts.getData / opts.uploadFile) instead of a global.
//
//   mountKstApp(rootEl, {
//     initialData,                  // Dataset (from server component)
//     uploadFile(file) -> Promise<Dataset>,   // POST /api/import
//     exportHref(params) -> string, // GET  /api/export?...
//   }) -> { destroy() }

export function mountKstApp(root, opts) {
  opts = opts || {};

  var SM = {
    ov: { label: "เกินกำหนด", color: "#E5364B", bg: "#FFF0F2", dot: "#F43F5E" },
    du: { label: "ถึงกำหนด", color: "#DA6B16", bg: "#FFF3E6", dot: "#FB923C" },
    ne: { label: "ใกล้กำหนด", color: "#B5860B", bg: "#FBF4DE", dot: "#EAB308" },
    ok: { label: "ยังมีเวลา", color: "#0E9E6E", bg: "#E7F9F1", dot: "#10B981" },
    dn: { label: "รับแล้ว", color: "#3A6FF0", bg: "#EBF1FE", dot: "#3B82F6" },
    ca: { label: "ยกเลิก", color: "#7E8497", bg: "#F1F2F6", dot: "#A0A6B6" },
  };
  function meta(s) { return SM[s] || SM.ca; }
  function hexA(h, a) { h = (h || "#5B5BF5").replace("#", ""); if (h.length === 3) h = h.split("").map(function (x) { return x + x; }).join(""); var n = parseInt(h, 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function money(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) { n = Number(n || 0); var a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ล้าน"; if (a >= 1e3) return Math.round(n / 1e3).toLocaleString("en-US") + "K"; return n.toLocaleString("en-US"); }
  function fdate(s) { if (!s) return "—"; var d = new Date(s); if (isNaN(d)) return String(s); return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }); }
  function vshort(v) { if (!v) return ""; return v.replace(/^(บริษัท|ห้างหุ้นส่วนจำกัด|บมจ\.|หจก\.)\s*/, "").replace(/\s*จำกัด.*$/, "").trim() || v; }
  function dayTxt(r) { if (r.status === "dn" || r.status === "ca" || r.days === null || r.days === undefined) return "—"; return (r.days < 0 ? "" : "+") + r.days; }
  function badgeLabel(r) { var d = r.days; if (r.status === "ov") return "เกิน " + Math.abs(d) + " วัน"; if (r.status === "du") return d === 0 ? "วันนี้" : "อีก " + d + " วัน"; if ((r.status === "ne" || r.status === "ok") && d != null) return "อีก " + d + " วัน"; return meta(r.status).label; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var ACCENT = "#5B5BF5", SHOW_RECEIVED = true, COMPACT_ROWS = false, PP = 40;
  var state = { screen: "dashboard", search: "", status: "all", dept: "", from: "", to: "", sortKey: "dueDate", sortDir: 1, page: 1, modal: null, supplier: null, toast: "" };
  var toastTimer = null;
  var D = opts.initialData || null;

  function setState(p) { for (var k in p) state[k] = p[k]; render(); }
  function go(s) { setState({ screen: s, supplier: null }); }
  function srt(k) { if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = 1; } render(); }
  function showToast(m) { state.toast = m; render(); clearTimeout(toastTimer); toastTimer = setTimeout(function () { state.toast = ""; render(); }, 3200); }

  function row(r) {
    var M = meta(r.status);
    return {
      raw: r, id: r.id, poNo: r.poNo, lineItem: r.lineItem, vendorName: r.vendorName, vendorCode: r.vendorCode,
      itemName: r.itemName, itemCode: r.itemCode, department: r.department || "—",
      dueFmt: fdate(r.dueDate), recvFmt: fdate(r.receiveDate), amountFmt: money(r.amount),
      qtyText: (r.qty || 0) + " " + (r.unit || ""), vshort: vshort(r.vendorName), dayTxt: dayTxt(r), dayColor: M.color,
      badge: badgeLabel(r), bColor: M.color, bBg: M.bg, bDot: M.dot, received: r.status === "dn", days: r.days,
    };
  }

  function getFilteredRows() {
    var rows = ((D && D.pos) || []).slice();
    if (!SHOW_RECEIVED) rows = rows.filter(function (r) { return r.status !== "dn"; });
    if (state.status !== "all") rows = rows.filter(function (r) { return r.status === state.status; });
    if (state.dept) rows = rows.filter(function (r) { return r.department === state.dept; });
    if (state.from) rows = rows.filter(function (r) { return r.dueDate && r.dueDate >= state.from; });
    if (state.to) rows = rows.filter(function (r) { return r.dueDate && r.dueDate <= state.to; });
    var q = state.search.trim().toLowerCase();
    if (q) rows = rows.filter(function (r) { return ((r.vendorName || "") + (r.poNo || "") + (r.itemName || "") + (r.itemCode || "") + (r.prNo || "")).toLowerCase().indexOf(q) >= 0; });
    var sk = state.sortKey, sd = state.sortDir;
    rows.sort(function (a, b) { var va = a[sk], vb = b[sk]; if (va == null) return 1; if (vb == null) return -1; if (typeof va === "string") return va.localeCompare(vb, "th") * sd; return (va - vb) * sd; });
    return rows;
  }

  function exportNow() {
    if (!opts.exportHref) { showToast("ส่งออกยังไม่พร้อมใช้งาน"); return; }
    var p = { format: "csv", status: state.status, dept: state.dept, from: state.from, to: state.to, q: state.search.trim() };
    window.location.href = opts.exportHref(p);
  }

  // hidden file input for import
  var fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = ".csv,.json,.txt,.xlsx,.xls"; fileInput.style.display = "none";
  document.body.appendChild(fileInput);
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0]; if (!f) return;
    if (!opts.uploadFile) { showToast("นำเข้ายังไม่พร้อมใช้งาน"); fileInput.value = ""; return; }
    showToast("กำลังนำเข้า " + f.name + " …");
    opts.uploadFile(f).then(function (res) {
      D = res.data || res; window.KST_DATA = D;
      setState({ screen: "pos", status: "all", search: "", dept: "", from: "", to: "", page: 1, supplier: null, modal: null });
      showToast("นำเข้าสำเร็จ " + (res.imported || (D.pos || []).length).toLocaleString() + " รายการ — บันทึกลงฐานข้อมูลและคำนวณใหม่แล้ว");
    }).catch(function (e) { showToast("นำเข้าไม่สำเร็จ: " + (e && e.message ? e.message : "ไฟล์ไม่ถูกต้อง")); });
    fileInput.value = "";
  });
  function openImport() { fileInput.click(); }

  function derive() {
    var d = D;
    var accent = ACCENT, accentSoft = hexA(accent, 0.1), accentGlow = hexA(accent, 0.32);
    var screen = state.screen;
    var kc = (d && d.kpi) || { all: 0, ov: 0, du: 0, ne: 0, ok: 0, dn: 0, ca: 0 };
    var td = new Date((d && d.today) || "2026-06-24");
    var todayFmt = td.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    var openCount = (kc.ov || 0) + (kc.du || 0) + (kc.ne || 0) + (kc.ok || 0);
    var kdef = [
      { key: "all", label: "PO ทั้งหมด", value: (kc.all || 0).toLocaleString(), color: "#171A2B", dot: accent, bg: "#FFFFFF", bd: "#ECEDF4", sub: ((d && d.totalSuppliers) || 0) + " suppliers · ค้างส่ง " + compact(openCount) + " รายการ" },
      { key: "ov", label: "เกินกำหนด", value: (kc.ov || 0).toLocaleString(), color: "#E5364B", dot: "#F43F5E", bg: "#FFF4F5", bd: "#FBDEE2", sub: "มูลค่า " + compact((d && d.overdueVal) || 0) + " ฿" },
      { key: "du", label: "ถึงกำหนด", value: (kc.du || 0).toLocaleString(), color: "#DA6B16", dot: "#FB923C", bg: "#FFF7EF", bd: "#FBE6CF", sub: "ภายใน 0–3 วัน" },
      { key: "ne", label: "ใกล้กำหนด", value: (kc.ne || 0).toLocaleString(), color: "#B5860B", dot: "#EAB308", bg: "#FCF8E8", bd: "#F1E6BC", sub: "อีก 4–7 วัน" },
      { key: "ok", label: "ยังมีเวลา", value: (kc.ok || 0).toLocaleString(), color: "#0E9E6E", dot: "#10B981", bg: "#EDFAF3", bd: "#CCEFDD", sub: "มากกว่า 7 วัน" },
      { key: "dn", label: "รับแล้ว / ปิด", value: (kc.dn || 0).toLocaleString(), color: "#3A6FF0", dot: "#3B82F6", bg: "#EFF3FE", bd: "#D6E1FB", sub: "รับของครบ / ปิด PO" },
    ];
    var segDefs = ["ov", "du", "ne", "ok"];
    var openTotal = segDefs.reduce(function (a, s) { return a + (kc[s] || 0); }, 0);
    var ot = openTotal || 1, accP = 0;
    var donutSegs = segDefs.map(function (s) { var v = kc[s] || 0; var pct = (v / ot) * 100; var seg = { key: s, label: meta(s).label, count: v, pctTxt: Math.round(pct) + "%", color: meta(s).dot, start: accP, end: accP + pct }; accP += pct; return seg; });
    var donutGrad = "conic-gradient(" + donutSegs.map(function (s) { return s.color + " " + s.start + "% " + s.end + "%"; }).join(",") + ")";
    var months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var tmo = ((d && d.today) || "2026-06").slice(0, 7);
    var mrows = ((d && d.monthly) || []).filter(function (x) { return x.mo >= tmo; }).slice(0, 7);
    var maxC = Math.max.apply(null, [1].concat(mrows.map(function (x) { return x.count; })));
    var bars = mrows.map(function (x, i) { var mi = parseInt(x.mo.slice(5, 7), 10) - 1; return { label: months[mi], yr: x.mo.slice(2, 4), count: x.count, amount: compact(x.amount), hPct: Math.max(5, Math.round((x.count / maxC) * 100)) + "%", fill: i === 0 ? accent : hexA(accent, 0.42) }; });
    var tsAll = ((d && d.suppliers) || []).filter(function (s) { return s.open > 0; }).slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 6);
    var maxA = Math.max.apply(null, [1].concat(tsAll.map(function (s) { return s.amount; })));
    var topSup = tsAll.map(function (s) { return { name: vshort(s.name), open: s.open, ov: s.ov, amount: compact(s.amount), w: Math.max(5, Math.round((s.amount / maxA) * 100)) + "%", fill: s.ov > 0 ? "#F43F5E" : accent }; });
    var overdueList = ((d && d.pos) || []).filter(function (r) { return r.status === "ov"; }).slice().sort(function (a, b) { return a.days - b.days; }).slice(0, 6).map(row);
    var rows = getFilteredRows();
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PP));
    var page = Math.min(state.page, pages);
    var start = (page - 1) * PP;
    var pageRows = rows.slice(start, start + PP).map(row);
    var countText = total ? "แสดง " + (start + 1) + "–" + Math.min(start + PP, total) + " จาก " + total.toLocaleString() + " รายการ" : "ไม่พบรายการตามตัวกรอง";
    var pageInfo = "หน้า " + page + "/" + pages;
    var toks = [];
    if (pages <= 7) { for (var i = 1; i <= pages; i++) toks.push(i); }
    else { toks = [1]; if (page > 3) toks.push("…"); for (var j = Math.max(2, page - 1); j <= Math.min(pages - 1, page + 1); j++) toks.push(j); if (page < pages - 2) toks.push("…"); toks.push(pages); }
    var pagItems = toks.map(function (t) { return t === "…" ? { label: "…", bg: "transparent", fg: "#A0A6B6", bd: "transparent", val: null } : { label: "" + t, bg: t === page ? accent : "#fff", fg: t === page ? "#fff" : "#5A6175", bd: t === page ? accent : "#E2E4EF", val: t }; });
    var allPos = (d && d.pos) || [];
    var scnt = { all: allPos.length, ov: 0, du: 0, ne: 0, ok: 0, dn: 0, ca: 0 };
    allPos.forEach(function (r) { if (scnt[r.status] !== undefined) scnt[r.status]++; });
    var chipDefs = [["all", "ทั้งหมด"], ["ov", "เกินกำหนด"], ["du", "ถึงกำหนด"], ["ne", "ใกล้กำหนด"], ["ok", "ยังมีเวลา"], ["dn", "รับแล้ว"]];
    var chips = chipDefs.map(function (cd) { var key = cd[0], label = cd[1]; var active = state.status === key; var M = key === "all" ? { color: accent, bg: accentSoft, dot: accent } : meta(key); var cnt = scnt[key] || 0; return { key: key, label: label, count: cnt.toLocaleString(), dot: M.dot, fg: active ? "#fff" : M.color, bg: active ? M.color : M.bg, bd: active ? M.color : "transparent" }; });
    var deptOpts = ((d && d.depts) || []).map(function (x) { return { value: x.dept, label: x.dept }; });
    var supplierRows = ((d && d.suppliers) || []).slice(0, 50).map(function (s) { return { name: vshort(s.name), full: s.name, code: s.code, lines: s.lines, amount: money(s.amount), open: s.open, ov: s.ov, onTime: s.onTime, onTimeW: s.onTime + "%", onTimeFill: s.onTime >= 85 ? "#10B981" : s.onTime >= 60 ? "#EAB308" : "#F43F5E", openColor: s.open > 0 ? "#DA6B16" : "#A0A6B6", ovColor: s.ov > 0 ? "#E5364B" : "#A0A6B6" }; });
    var selName = state.supplier;
    var selObj = selName ? ((d && d.suppliers) || []).find(function (s) { return s.name === selName; }) : null;
    var supDetailPos = selName ? ((d && d.pos) || []).filter(function (r) { return r.vendorName === selName; }).slice().sort(function (a, b) { return (a.days == null ? 9999 : a.days) - (b.days == null ? 9999 : b.days); }).map(row) : [];
    var moRaw = state.modal != null ? ((d && d.pos) || []).find(function (r) { return r.id === state.modal; }) : null;
    var mM = moRaw ? meta(moRaw.status) : SM.ca;
    var dayDesc = moRaw ? (moRaw.days == null ? "—" : moRaw.days < 0 ? "เกินกำหนดมาแล้ว " + Math.abs(moRaw.days) + " วัน" : moRaw.days === 0 ? "วันนี้เป็นวันครบกำหนด" : "เหลืออีก " + moRaw.days + " วัน") : "";
    return { accent: accent, accentSoft: accentSoft, accentGlow: accentGlow, rowPad: COMPACT_ROWS ? "7px" : "11px", screen: screen, kc: kc, todayFmt: todayFmt, openCount: openCount, kpis: kdef, donutGrad: donutGrad, donutSegs: donutSegs, openTotal: openTotal, bars: bars, topSup: topSup, overdueList: overdueList, chips: chips, deptOpts: deptOpts, pageRows: pageRows, countText: countText, pageInfo: pageInfo, pagItems: pagItems, pages: pages, page: page, supplierRows: supplierRows, supplierCount: ((d && d.suppliers) || []).length, selName: selName, selObj: selObj, supDetailPos: supDetailPos, mo: moRaw, mM: mM, dayDesc: dayDesc };
  }

  // ---- view fragments (identical markup to phase-1) ----
  function navItem(key, label, countHtml, v) { var active = state.screen === key; var fg = active ? v.accent : "#6B7186", bg = active ? v.accentSoft : "transparent"; return '<div class="nav-item" data-act="nav" data-arg="' + key + '" style="display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;cursor:pointer;font-size:13.5px;font-weight:600;margin-bottom:4px;color:' + fg + ";background:" + bg + '">' + label + (countHtml || "") + "</div>"; }

  function dashboard(v) {
    var kc = v.kc, h = "";
    h += '<div style="padding:26px 32px 40px">';
    h += '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px"><div><div style="font-size:24px;font-weight:700;font-family:Sora,\'Noto Sans Thai\',sans-serif;letter-spacing:-.5px">ภาพรวมการจัดส่ง</div><div style="font-size:13px;color:#6B7186;margin-top:3px">ติดตามสถานะการส่งของจาก Supplier ตามใบสั่งซื้อ (PO)</div></div><div style="display:flex;gap:10px"><button class="hov-btn" data-act="import" style="display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #E2E4EF;color:#3A4055;font-size:13px;font-weight:600;padding:9px 15px;border-radius:10px;cursor:pointer">⤓ นำเข้า Excel</button><button data-act="export" style="display:flex;align-items:center;gap:7px;background:' + v.accent + ";border:1px solid " + v.accent + ";color:#fff;font-size:13px;font-weight:600;padding:9px 15px;border-radius:10px;cursor:pointer;box-shadow:0 4px 12px " + v.accentGlow + '">⤒ ส่งออกรายงาน</button></div></div>';
    if ((kc.ov || 0) > 0) h += '<div class="hov-banner" data-act="overdue" style="display:flex;align-items:center;gap:16px;background:linear-gradient(100deg,#FFF1F2,#FFF6F1);border:1px solid #FBD9DC;border-radius:16px;padding:16px 20px;margin-bottom:20px;cursor:pointer"><div style="width:46px;height:46px;min-width:46px;border-radius:13px;background:#FFE0E3;display:flex;align-items:center;justify-content:center;animation:kstpulse 2.4s ease-in-out infinite"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E5364B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><div style="flex:1"><div style="font-size:15px;font-weight:700;color:#B91C36">ของส่งเกินกำหนด ' + (kc.ov || 0).toLocaleString() + ' รายการ ต้องติดตามด่วน</div><div style="font-size:12.5px;color:#A65560;margin-top:2px">มูลค่ารวม ' + compact((D && D.overdueVal) || 0) + ' บาท ที่ยังไม่ได้รับของแม้เลยกำหนดส่งแล้ว — คลิกเพื่อดูทั้งหมด</div></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E5364B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:18px">';
    v.kpis.forEach(function (k) { h += '<div class="hov-card" data-act="kpi" data-arg="' + k.key + '" style="background:' + k.bg + ";border:1px solid " + k.bd + ';border-radius:16px;padding:16px 16px 15px;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.04)"><div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span style="width:9px;height:9px;border-radius:50%;background:' + k.dot + '"></span><span style="font-size:11px;font-weight:700;color:#5A6175;letter-spacing:.2px">' + k.label + '</span></div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:30px;line-height:1;color:' + k.color + ';letter-spacing:-1px">' + k.value + '</div><div style="font-size:11px;color:#8A90A2;margin-top:7px;line-height:1.35">' + k.sub + "</div></div>"; });
    h += "</div>";
    h += '<div style="display:grid;grid-template-columns:1.05fr 1.35fr;gap:18px;margin-bottom:18px">';
    h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:18px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><div style="font-size:15px;font-weight:700;margin-bottom:2px">สถานะของที่ยังค้างส่ง</div><div style="font-size:12px;color:#8A90A2;margin-bottom:18px">แบ่งตามความเร่งด่วนของกำหนดส่ง</div><div style="display:flex;align-items:center;gap:26px"><div style="position:relative;width:148px;height:148px;min-width:148px;border-radius:50%;background:' + v.donutGrad + '"><div style="position:absolute;inset:20px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-family:Sora,sans-serif;font-weight:700;font-size:30px;line-height:1;letter-spacing:-1px">' + v.openTotal.toLocaleString() + '</div><div style="font-size:11px;color:#8A90A2;margin-top:3px">รายการค้างส่ง</div></div></div><div style="flex:1;display:flex;flex-direction:column;gap:11px">';
    v.donutSegs.forEach(function (s) { h += '<div style="display:flex;align-items:center;gap:9px"><span style="width:11px;height:11px;border-radius:3px;background:' + s.color + '"></span><span style="font-size:13px;color:#3A4055;flex:1">' + s.label + '</span><span style="font-family:\'DM Mono\',monospace;font-size:13px;font-weight:500;color:#171A2B">' + s.count + '</span><span style="font-size:11px;color:#A0A6B6;width:38px;text-align:right">' + s.pctTxt + "</span></div>"; });
    h += "</div></div></div>";
    h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:18px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><div style="font-size:15px;font-weight:700;margin-bottom:2px">กำหนดส่งที่กำลังจะถึง</div><div style="font-size:12px;color:#8A90A2;margin-bottom:20px">จำนวนรายการค้างส่ง แยกตามเดือนที่ครบกำหนด</div><div style="display:flex;align-items:flex-end;gap:14px;height:150px;padding:0 4px">';
    v.bars.forEach(function (b) { h += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end"><div style="font-family:\'DM Mono\',monospace;font-size:12px;font-weight:500;color:#3A4055">' + b.count + '</div><div title="' + b.amount + ' ฿" style="width:100%;max-width:42px;border-radius:8px 8px 4px 4px;background:' + b.fill + ";height:" + b.hPct + '"></div><div style="font-size:11px;color:#8A90A2;font-weight:600">' + b.label + '</div><div style="font-size:9.5px;color:#B5BAC9;margin-top:-6px;font-family:\'DM Mono\',monospace">\'' + b.yr + "</div></div>"; });
    h += "</div></div></div>";
    h += '<div style="display:grid;grid-template-columns:1.35fr 1.05fr;gap:18px">';
    h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:18px;padding:8px 8px 12px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px"><div><div style="font-size:15px;font-weight:700">ต้องติดตามด่วน</div><div style="font-size:12px;color:#8A90A2;margin-top:1px">รายการที่เกินกำหนดส่งมากที่สุด</div></div><button class="hov-link" data-act="overdue" style="font-size:12.5px;font-weight:600;color:' + v.accent + ';background:transparent;border:none;cursor:pointer">ดูทั้งหมด ›</button></div>';
    v.overdueList.forEach(function (r) { h += '<div class="hov-row" data-act="openpo" data-arg="' + r.id + '" style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-radius:11px;cursor:pointer"><div style="width:42px;text-align:center"><div style="font-family:Sora,sans-serif;font-weight:700;font-size:17px;color:#E5364B;line-height:1">' + r.dayTxt + '</div><div style="font-size:9px;color:#C99;font-weight:600">วัน</div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.itemName) + '</div><div style="font-size:11.5px;color:#8A90A2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.vshort) + ' · <span style="font-family:\'DM Mono\',monospace">' + esc(r.poNo) + '</span></div></div><div style="text-align:right"><div style="font-family:\'DM Mono\',monospace;font-size:12.5px;font-weight:500">' + r.amountFmt + '</div><div style="font-size:11px;color:#A0A6B6">ครบ ' + r.dueFmt + "</div></div></div>"; });
    h += "</div>";
    h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:18px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><div style="font-size:15px;font-weight:700;margin-bottom:2px">Supplier ที่มีของค้างมากสุด</div><div style="font-size:12px;color:#8A90A2;margin-bottom:18px">เรียงตามมูลค่ารวมของรายการที่ค้างส่ง</div><div style="display:flex;flex-direction:column;gap:15px">';
    v.topSup.forEach(function (s) { h += '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">' + esc(s.name) + '</span><span style="font-family:\'DM Mono\',monospace;font-size:12px;color:#3A4055">' + s.amount + '</span></div><div style="height:9px;border-radius:6px;background:#F1F2F8;overflow:hidden"><div style="height:100%;border-radius:6px;width:' + s.w + ";background:" + s.fill + '"></div></div><div style="font-size:10.5px;color:#A0A6B6;margin-top:4px">ค้าง ' + s.open + " รายการ · เกินกำหนด " + s.ov + "</div></div>"; });
    h += "</div></div></div></div>";
    return h;
  }

  function poList(v) {
    var h = '<div style="display:flex;flex-direction:column;height:100%"><div style="padding:24px 32px 0;background:#F3F4FA">';
    h += '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px"><div><div style="font-size:22px;font-weight:700;font-family:Sora,\'Noto Sans Thai\',sans-serif;letter-spacing:-.4px">รายการใบสั่งซื้อ</div><div style="font-size:13px;color:#6B7186;margin-top:2px">' + v.countText + '</div></div><div style="display:flex;gap:10px"><button class="hov-btn" data-act="import" style="display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #E2E4EF;color:#3A4055;font-size:13px;font-weight:600;padding:9px 15px;border-radius:10px;cursor:pointer">⤓ นำเข้า</button><button data-act="export" style="display:flex;align-items:center;gap:7px;background:' + v.accent + ";border:1px solid " + v.accent + ";color:#fff;font-size:13px;font-weight:600;padding:9px 15px;border-radius:10px;cursor:pointer;box-shadow:0 4px 12px " + v.accentGlow + '">⤒ ส่งออก</button></div></div>';
    h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap"><div style="position:relative;flex:1;min-width:240px;max-width:360px"><svg style="position:absolute;left:13px;top:50%;transform:translateY(-50%)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0B4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="kst-search" data-act="search" value="' + esc(state.search) + '" placeholder="ค้นหา Supplier / รายการ / PO No." style="width:100%;border:1px solid #E2E4EF;border-radius:10px;padding:10px 12px 10px 38px;font-size:13px;color:#171A2B;outline:none;background:#fff"></div>';
    h += '<select data-act="dept" style="border:1px solid #E2E4EF;border-radius:10px;padding:10px 12px;font-size:13px;color:#3A4055;outline:none;background:#fff;cursor:pointer;min-width:160px"><option value="">ทุกแผนก/ฝ่าย</option>';
    v.deptOpts.forEach(function (o) { h += '<option value="' + esc(o.value) + '"' + (state.dept === o.value ? " selected" : "") + ">" + esc(o.label) + "</option>"; });
    h += "</select>";
    h += '<input type="date" data-act="from" value="' + esc(state.from) + '" style="border:1px solid #E2E4EF;border-radius:10px;padding:9px 11px;font-family:\'DM Mono\',monospace;font-size:12px;color:#3A4055;outline:none;background:#fff;cursor:pointer"><span style="color:#B5BAC9">–</span><input type="date" data-act="to" value="' + esc(state.to) + '" style="border:1px solid #E2E4EF;border-radius:10px;padding:9px 11px;font-family:\'DM Mono\',monospace;font-size:12px;color:#3A4055;outline:none;background:#fff;cursor:pointer"><button data-act="reset" style="font-size:12.5px;font-weight:600;color:#8A90A2;background:transparent;border:none;cursor:pointer;padding:8px 4px">ล้างตัวกรอง</button></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    v.chips.forEach(function (c) { h += '<div data-act="chip" data-arg="' + c.key + '" style="display:flex;align-items:center;gap:7px;padding:7px 13px;border-radius:10px;cursor:pointer;font-size:12.5px;font-weight:600;border:1px solid ' + c.bd + ";background:" + c.bg + ";color:" + c.fg + ';transition:all .12s"><span style="width:8px;height:8px;border-radius:50%;background:' + c.dot + '"></span>' + c.label + ' <span style="font-family:\'DM Mono\',monospace;font-weight:500;opacity:.85">' + c.count + "</span></div>"; });
    h += "</div></div>";
    function th(label, act, ex) { ex = ex || {}; return "<th" + (act ? ' data-act="' + act + '"' : "") + ' style="text-align:' + (ex.align || "left") + ";padding:13px " + (ex.px || "12") + "px;font-weight:600;color:#6B7186;font-size:11.5px;white-space:nowrap;border-bottom:1px solid #ECEDF4;position:sticky;top:0;background:#FAFBFD;" + (act ? "cursor:pointer" : "") + '">' + label + (act ? " ↕" : "") + "</th>"; }
    h += '<div style="flex:1;overflow:auto;margin:14px 32px 0;background:#fff;border:1px solid #ECEDF4;border-radius:16px 16px 0 0;box-shadow:0 1px 2px rgba(16,24,40,.04)"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#FAFBFD">' + th("PO No.", "sortPo", { px: "16" }) + th("กำหนดส่ง", "sortDue") + th("วัน", "sortDays", { align: "center", px: "8" }) + th("สถานะ", null) + th("Supplier", "sortSup") + th("รายการสินค้า", null) + th("มูลค่า (฿)", "sortAmt", { align: "right" }) + th("รับ", null, { align: "center" }) + th("แผนก", null, { px: "16" }) + "</tr></thead><tbody>";
    var rp = v.rowPad;
    v.pageRows.forEach(function (r) {
      h += '<tr class="hov-row" data-act="openpo" data-arg="' + r.id + '" style="border-bottom:1px solid #F2F3F8;cursor:pointer"><td style="padding:' + rp + ' 16px"><span style="font-family:\'DM Mono\',monospace;font-size:12px;font-weight:500">' + esc(r.poNo) + '</span><div style="font-size:10px;color:#A0A6B6">Line ' + esc(r.lineItem) + '</div></td><td style="padding:' + rp + ' 12px;font-family:\'DM Mono\',monospace;font-size:12px;white-space:nowrap">' + r.dueFmt + '</td><td style="padding:' + rp + " 8px;text-align:center;font-family:Sora,sans-serif;font-weight:700;font-size:13px;color:" + r.dayColor + '">' + r.dayTxt + '</td><td style="padding:' + rp + ' 12px"><span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;background:' + r.bBg + ";color:" + r.bColor + '"><span style="width:6px;height:6px;border-radius:50%;background:' + r.bDot + '"></span>' + r.badge + '</span></td><td style="padding:' + rp + ' 12px"><div style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.vendorName) + '">' + esc(r.vshort) + '</div><div style="font-size:10px;color:#A0A6B6;font-family:\'DM Mono\',monospace">' + esc(r.vendorCode) + '</div></td><td style="padding:' + rp + ' 12px"><div style="max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.itemName) + '">' + esc(r.itemName) + '</div><div style="font-size:10px;color:#A0A6B6;font-family:\'DM Mono\',monospace">' + esc(r.itemCode) + '</div></td><td style="padding:' + rp + ' 12px;text-align:right;font-family:\'DM Mono\',monospace;font-size:12px;font-weight:500">' + r.amountFmt + '<div style="font-size:10px;color:#A0A6B6;font-weight:400">' + esc(r.qtyText) + '</div></td><td style="padding:' + rp + ' 12px;text-align:center">' + (r.received ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#EBF1FE;color:#3A6FF0">✓</span>' : '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#F4F5F9;color:#C2C7D6">–</span>') + '</td><td style="padding:' + rp + ' 16px;font-size:11.5px;color:#5A6175;white-space:nowrap">' + esc(r.department) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<div style="display:flex;align-items:center;gap:6px;padding:13px 32px;background:#fff;border-top:1px solid #ECEDF4;margin:0 32px;border-radius:0 0 16px 16px;box-shadow:0 1px 2px rgba(16,24,40,.04)"><button data-act="prev" style="width:32px;height:32px;border-radius:9px;border:1px solid #E2E4EF;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#5A6175">‹</button>';
    v.pagItems.forEach(function (p) { h += "<button " + (p.val != null ? 'data-act="page" data-arg="' + p.val + '"' : "") + ' style="min-width:32px;height:32px;padding:0 8px;border-radius:9px;border:1px solid ' + p.bd + ";background:" + p.bg + ";color:" + p.fg + ';cursor:pointer;font-family:\'DM Mono\',monospace;font-size:12px;font-weight:500">' + p.label + "</button>"; });
    h += '<button data-act="next" style="width:32px;height:32px;border-radius:9px;border:1px solid #E2E4EF;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#5A6175">›</button><span style="font-family:\'DM Mono\',monospace;font-size:11.5px;color:#A0A6B6;margin-left:10px">' + v.pageInfo + '</span></div><div style="height:18px"></div></div>';
    return h;
  }

  function suppliers(v) {
    var h = '<div style="padding:24px 32px 40px">';
    if (!v.selName) {
      h += '<div style="margin-bottom:18px"><div style="font-size:22px;font-weight:700;font-family:Sora,\'Noto Sans Thai\',sans-serif;letter-spacing:-.4px">Supplier</div><div style="font-size:13px;color:#6B7186;margin-top:2px">ทั้งหมด ' + v.supplierCount + ' ราย (แสดง 50 อันดับแรก) · เรียงตามมูลค่าการสั่งซื้อรวม — คลิกเพื่อดูรายการทั้งหมด</div></div>';
      h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#FAFBFD"><th style="text-align:left;padding:13px 20px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">Supplier</th><th style="text-align:right;padding:13px 14px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">มูลค่ารวม (฿)</th><th style="text-align:center;padding:13px 14px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">รายการ</th><th style="text-align:center;padding:13px 14px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">ค้างส่ง</th><th style="text-align:center;padding:13px 14px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">เกินกำหนด</th><th style="text-align:left;padding:13px 20px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4;width:170px">อัตรารับของครบ</th></tr></thead><tbody>';
      v.supplierRows.forEach(function (s) { h += '<tr class="hov-row" data-act="supsel" data-arg="' + esc(s.full) + '" style="border-bottom:1px solid #F2F3F8;cursor:pointer"><td style="padding:12px 20px"><div style="font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(s.full) + '">' + esc(s.name) + '</div><div style="font-size:10.5px;color:#A0A6B6;font-family:\'DM Mono\',monospace">' + esc(s.code) + '</div></td><td style="padding:12px 14px;text-align:right;font-family:\'DM Mono\',monospace;font-size:12.5px;font-weight:500">' + s.amount + '</td><td style="padding:12px 14px;text-align:center;font-family:\'DM Mono\',monospace;color:#5A6175">' + s.lines + '</td><td style="padding:12px 14px;text-align:center"><span style="font-family:\'DM Mono\',monospace;font-weight:500;color:' + s.openColor + '">' + s.open + '</span></td><td style="padding:12px 14px;text-align:center"><span style="font-family:\'DM Mono\',monospace;font-weight:500;color:' + s.ovColor + '">' + s.ov + '</span></td><td style="padding:12px 20px"><div style="display:flex;align-items:center;gap:9px"><div style="flex:1;height:7px;border-radius:5px;background:#F1F2F8;overflow:hidden"><div style="height:100%;border-radius:5px;width:' + s.onTimeW + ";background:" + s.onTimeFill + '"></div></div><span style="font-family:\'DM Mono\',monospace;font-size:11.5px;color:#5A6175;width:34px;text-align:right">' + s.onTime + "%</span></div></td></tr>"; });
      h += "</tbody></table></div>";
    } else {
      var s = v.selObj || {};
      var initial = vshort(v.selName || "?")[0] || "?";
      h += '<button data-act="backsup" style="display:flex;align-items:center;gap:6px;background:transparent;border:none;cursor:pointer;color:#6B7186;font-size:13px;font-weight:600;margin-bottom:16px">‹ กลับไปรายชื่อ Supplier</button>';
      h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.03)"><div style="display:flex;align-items:flex-start;gap:16px"><div style="width:52px;height:52px;border-radius:14px;background:' + v.accentSoft + ";color:" + v.accent + ';display:flex;align-items:center;justify-content:center;font-family:Sora,sans-serif;font-weight:700;font-size:20px">' + esc(initial) + '</div><div style="flex:1"><div style="font-size:19px;font-weight:700;letter-spacing:-.3px">' + esc(v.selName) + '</div><div style="font-size:12.5px;color:#8A90A2;font-family:\'DM Mono\',monospace;margin-top:2px">' + esc(s.code || "") + " · " + esc((s.depts || []).slice(0, 3).join(", ")) + '</div></div></div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:22px"><div style="background:#F8F9FD;border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:#8A90A2;font-weight:600;margin-bottom:6px">มูลค่ารวม</div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:19px;letter-spacing:-.5px">' + compact(s.amount || 0) + ' ฿</div></div><div style="background:#F8F9FD;border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:#8A90A2;font-weight:600;margin-bottom:6px">รายการทั้งหมด</div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:19px">' + (s.lines || 0) + '</div></div><div style="background:#FFF7EF;border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:#B5860B;font-weight:600;margin-bottom:6px">ค้างส่ง</div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:19px;color:#DA6B16">' + (s.open || 0) + '</div></div><div style="background:#FFF1F2;border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:#B91C36;font-weight:600;margin-bottom:6px">เกินกำหนด</div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:19px;color:#E5364B">' + (s.ov || 0) + '</div></div><div style="background:#EDFAF3;border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:#0E9E6E;font-weight:600;margin-bottom:6px">รับของครบ</div><div style="font-family:Sora,sans-serif;font-weight:700;font-size:19px;color:#0E9E6E">' + (s.onTime || 0) + "%</div></div></div></div>";
      h += '<div style="background:#fff;border:1px solid #ECEDF4;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04)"><div style="padding:15px 20px;font-size:14px;font-weight:700;border-bottom:1px solid #ECEDF4">รายการ PO ของ Supplier นี้</div><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#FAFBFD"><th style="text-align:left;padding:11px 20px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">PO No.</th><th style="text-align:left;padding:11px 12px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">กำหนดส่ง</th><th style="text-align:left;padding:11px 12px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">สถานะ</th><th style="text-align:left;padding:11px 12px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">รายการสินค้า</th><th style="text-align:right;padding:11px 20px;font-weight:600;color:#6B7186;font-size:11.5px;border-bottom:1px solid #ECEDF4">มูลค่า (฿)</th></tr></thead><tbody>';
      v.supDetailPos.forEach(function (r) { h += '<tr class="hov-row" data-act="openpo" data-arg="' + r.id + '" style="border-bottom:1px solid #F2F3F8;cursor:pointer"><td style="padding:10px 20px;font-family:\'DM Mono\',monospace;font-size:12px">' + esc(r.poNo) + '</td><td style="padding:10px 12px;font-family:\'DM Mono\',monospace;font-size:12px">' + r.dueFmt + '</td><td style="padding:10px 12px"><span style="display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;background:' + r.bBg + ";color:" + r.bColor + '"><span style="width:6px;height:6px;border-radius:50%;background:' + r.bDot + '"></span>' + r.badge + '</span></td><td style="padding:10px 12px"><div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.itemName) + '</div></td><td style="padding:10px 20px;text-align:right;font-family:\'DM Mono\',monospace;font-size:12px">' + r.amountFmt + "</td></tr>"; });
      h += "</tbody></table></div>";
    }
    h += "</div>";
    return h;
  }

  function modalView(v) {
    var mo = v.mo; if (!mo) return "";
    var mM = v.mM, f = fdate;
    var h = '<div data-act="closeModal" style="position:fixed;inset:0;background:rgba(20,26,46,.45);backdrop-filter:blur(3px);z-index:250;display:flex;align-items:center;justify-content:center;padding:30px"><div data-act="stop" style="background:#fff;border-radius:20px;width:760px;max-width:96vw;max-height:90vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.3)">';
    h += '<div style="padding:22px 26px 18px;border-bottom:1px solid #ECEDF4;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;position:sticky;top:0;background:#fff;z-index:2"><div><div style="display:flex;align-items:center;gap:10px"><span style="font-family:\'DM Mono\',monospace;font-size:13px;font-weight:500;color:' + v.accent + ";background:" + v.accentSoft + ';padding:3px 10px;border-radius:8px">PO ' + esc(mo.poNo) + '</span><span style="display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:20px;font-size:11.5px;font-weight:600;background:' + mM.bg + ";color:" + mM.color + '"><span style="width:6px;height:6px;border-radius:50%;background:' + mM.dot + '"></span>' + badgeLabel(mo) + '</span></div><div style="font-size:17px;font-weight:700;margin-top:9px;letter-spacing:-.3px">' + esc(mo.itemName) + '</div><div style="font-size:12.5px;color:#8A90A2;margin-top:2px">' + esc(mo.vendorName) + '</div></div><button data-act="closeModal" style="width:32px;height:32px;min-width:32px;border:none;background:#F2F3F8;border-radius:9px;cursor:pointer;font-size:16px;color:#6B7186;display:flex;align-items:center;justify-content:center">✕</button></div>';
    function fld(l, val) { return '<div><div style="font-size:10.5px;font-weight:700;color:#A0A6B6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">' + l + '</div><div style="font-size:13.5px">' + val + "</div></div>"; }
    function fldM(l, val) { return '<div><div style="font-size:10.5px;font-weight:700;color:#A0A6B6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">' + l + '</div><div style="font-family:\'DM Mono\',monospace;font-size:13.5px">' + val + "</div></div>"; }
    h += '<div style="padding:22px 26px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 20px">' + fldM("Line Item", esc(mo.lineItem || "—")) + fldM("วันที่ออก PO", f(mo.poDate)) + fld("สถานะ PO", '<span style="font-weight:600">' + esc(mo.poStatus) + "</span>") + "</div>";
    h += '<hr style="border:none;border-top:1px solid #F0F1F6;margin:18px 0"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 20px"><div style="grid-column:1/3"><div style="font-size:10.5px;font-weight:700;color:#A0A6B6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Supplier</div><div style="font-size:14px;font-weight:600">' + esc(mo.vendorName) + "</div></div>" + fldM("รหัสผู้ขาย", esc(mo.vendorCode)) + fldM("รหัสสินค้า", esc(mo.itemCode)) + fld("แผนก/ฝ่าย", esc(mo.department || "—")) + fld("ผู้ประสงค์ใช้", esc(mo.requester || "—")) + "</div>";
    h += '<div style="background:#F8F9FD;border-radius:14px;padding:18px 20px;margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">' + fldM("จำนวน", esc((mo.qty || 0) + " " + (mo.unit || ""))) + fldM("ราคา/หน่วย", money(mo.unitPrice)) + '<div><div style="font-size:10.5px;font-weight:700;color:#A0A6B6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">มูลค่า PO</div><div style="font-family:Sora,sans-serif;font-size:18px;font-weight:700;color:' + v.accent + ';letter-spacing:-.5px">' + money(mo.amount) + " ฿</div></div>" + fldM("ค้างรับ", esc((mo.pendingQty || 0) + " " + (mo.unit || ""))) + "</div>";
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px"><div style="border:1px solid #ECEDF4;border-radius:14px;padding:16px 18px"><div style="font-size:12px;font-weight:700;color:#3A4055;margin-bottom:13px;display:flex;align-items:center;gap:7px"><span style="width:7px;height:7px;border-radius:50%;background:' + mM.dot + '"></span>กำหนดส่ง</div><div style="font-family:Sora,sans-serif;font-size:20px;font-weight:700;letter-spacing:-.5px">' + f(mo.dueDate) + '</div><div style="font-size:12.5px;color:' + mM.color + ';font-weight:600;margin-top:4px">' + v.dayDesc + '</div></div><div style="border:1px solid #ECEDF4;border-radius:14px;padding:16px 18px"><div style="font-size:12px;font-weight:700;color:#3A4055;margin-bottom:13px">การรับของ (GRPO)</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 14px"><div><div style="font-size:10px;color:#A0A6B6">สถานะ</div><div style="font-size:12.5px;font-weight:600">' + esc(mo.grpoStatus || "—") + '</div></div><div><div style="font-size:10px;color:#A0A6B6">วันที่รับ</div><div style="font-family:\'DM Mono\',monospace;font-size:12.5px">' + f(mo.receiveDate) + '</div></div><div><div style="font-size:10px;color:#A0A6B6">เลขที่ GRPO</div><div style="font-family:\'DM Mono\',monospace;font-size:12.5px">' + esc(mo.grpoNo || "—") + '</div></div><div><div style="font-size:10px;color:#A0A6B6">ปริมาณรับ</div><div style="font-family:\'DM Mono\',monospace;font-size:12.5px">' + esc((mo.receiveQty || 0) + " " + (mo.unit || "")) + '</div></div></div></div></div><div style="font-size:11px;color:#A0A6B6;margin-top:16px;text-align:right">ผู้สร้าง PO: ' + esc(mo.createdBy || "—") + "</div></div></div></div>";
    return h;
  }

  function render() {
    if (!D) { root.innerHTML = '<div style="padding:40px;color:#8A90A2">กำลังโหลดข้อมูล…</div>'; return; }
    var v = derive();
    root.style.setProperty("--accent", v.accent);
    root.style.setProperty("--accentGlow", v.accentGlow);
    var openCountBadge = '<span style="margin-left:auto;font-family:\'DM Mono\',monospace;font-size:11px;background:' + (state.screen === "pos" ? hexA(v.accent, 0.18) : "#F1F2F8") + ";color:" + (state.screen === "pos" ? v.accent : "#8A90A2") + ';padding:1px 8px;border-radius:20px">' + v.openCount.toLocaleString() + "</span>";
    var aside = '<aside style="width:248px;min-width:248px;background:#FFFFFF;border-right:1px solid #ECEDF4;display:flex;flex-direction:column;padding:20px 16px"><div style="display:flex;align-items:center;gap:11px;padding:4px 8px 22px"><div style="width:38px;height:38px;border-radius:11px;background:' + v.accent + ";display:flex;align-items:center;justify-content:center;font-family:Sora,sans-serif;font-weight:700;font-size:15px;color:#fff;box-shadow:0 6px 16px " + v.accentGlow + '">KST</div><div><div style="font-size:14px;font-weight:700;letter-spacing:-.2px">Delivery Tracker</div><div style="font-size:11px;color:#9AA0B4">ฝ่ายจัดซื้อ · ห้องเย็นโชติวัฒน์</div></div></div><div style="font-size:10px;font-weight:700;color:#B0B5C6;letter-spacing:.7px;text-transform:uppercase;padding:0 10px 8px">เมนู</div>' +
      navItem("dashboard", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg> ภาพรวม', "", v) +
      navItem("pos", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.5" y2="6"/><line x1="3" y1="12" x2="3.5" y2="12"/><line x1="3" y1="18" x2="3.5" y2="18"/></svg> รายการ PO', openCountBadge, v) +
      navItem("suppliers", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13v10H3z"/><path d="M16 10h3.5L22 13v4h-6"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg> Supplier', "", v) +
      '<div style="margin-top:auto;padding:14px;border-radius:13px;background:#F6F7FC;border:1px solid #EDEEF6"><div style="font-size:10px;color:#9AA0B4;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">ข้อมูล ณ วันที่</div><div style="font-size:13px;font-weight:600;color:#3A4055">' + v.todayFmt + '</div><div style="font-size:11px;color:#9AA0B4;margin-top:2px;font-family:\'DM Mono\',monospace">snapshot</div></div></aside>';
    var main = '<main style="flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column">' + (state.screen === "dashboard" ? dashboard(v) : "") + (state.screen === "pos" ? poList(v) : "") + (state.screen === "suppliers" ? suppliers(v) : "") + "</main>";
    var toast = state.toast ? '<div style="position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#171A2B;color:#fff;padding:13px 20px;border-radius:12px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.25);z-index:300;display:flex;align-items:center;gap:10px;max-width:80vw"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9CFFC9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>' + esc(state.toast) + "</div>" : "";
    var html = '<div style="display:flex;height:100vh;width:100%;overflow:hidden">' + aside + main + "</div>" + toast + modalView(v);
    var act = document.activeElement, focusSearch = act && act.id === "kst-search", caret = focusSearch ? act.selectionStart : 0;
    root.innerHTML = html;
    if (focusSearch) { var si = root.querySelector("#kst-search"); if (si) { si.focus(); try { si.setSelectionRange(caret, caret); } catch (e) {} } }
  }

  function onClick(e) {
    var el = e.target.closest("[data-act]"); if (!el || !root.contains(el)) return;
    var a = el.getAttribute("data-act"), arg = el.getAttribute("data-arg");
    switch (a) {
      case "nav": go(arg); break;
      case "kpi": setState({ screen: "pos", status: arg, page: 1, supplier: null }); break;
      case "overdue": setState({ screen: "pos", status: "ov", page: 1, supplier: null }); break;
      case "chip": setState({ status: arg, page: 1 }); break;
      case "openpo": setState({ modal: parseInt(arg, 10) }); break;
      case "closeModal": setState({ modal: null }); break;
      case "stop": e.stopPropagation(); break;
      case "supsel": setState({ supplier: arg }); break;
      case "backsup": setState({ supplier: null }); break;
      case "reset": setState({ search: "", status: "all", dept: "", from: "", to: "", page: 1 }); break;
      case "prev": setState({ page: Math.max(1, state.page - 1) }); break;
      case "next": { var v = derive(); setState({ page: Math.min(v.pages, state.page + 1) }); break; }
      case "page": setState({ page: parseInt(arg, 10) }); break;
      case "sortPo": srt("poNo"); break;
      case "sortDue": srt("dueDate"); break;
      case "sortDays": srt("days"); break;
      case "sortSup": srt("vendorName"); break;
      case "sortAmt": srt("amount"); break;
      case "import": openImport(); break;
      case "export": exportNow(); break;
    }
  }
  function onInput(e) { var el = e.target.closest("[data-act]"); if (el && el.getAttribute("data-act") === "search") { state.search = el.value; state.page = 1; render(); } }
  function onChange(e) { var el = e.target.closest("[data-act]"); if (!el) return; var a = el.getAttribute("data-act"); if (a === "dept") setState({ dept: el.value, page: 1 }); else if (a === "from") setState({ from: el.value, page: 1 }); else if (a === "to") setState({ to: el.value, page: 1 }); }
  function onKey(e) { if (e.key === "Escape" && state.modal != null) setState({ modal: null }); }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  document.addEventListener("keydown", onKey);
  render();

  return {
    destroy: function () {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      document.removeEventListener("keydown", onKey);
      if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      clearTimeout(toastTimer);
    },
  };
}
