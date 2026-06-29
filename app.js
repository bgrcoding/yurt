// ── SUPABASE INIT ──
const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

// ── STATE ──
let currentUser = null;
let isAdmin = false;
let currentRoomId = null;
let currentTab = 'sakinler';
let pendingCamdataOgrenci = null; // { name, class_name }

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  setTodayDefaults();
  // Lokal önizlemede seçim ekranı ayrı portta; adrese göre logo hedefini ayarla.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const nb = document.getElementById('navBrand');
    if (nb) nb.href = 'http://localhost:5180/';
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    isAdmin = true;
  }
  // Camdata gibi: panel her zaman açılır; giriş yoksa misafir (salt-okunur)
  showApp();
});

function setTodayDefaults() {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toTimeString().slice(0,5);
  ['yoklamaTarih','cezaTarih','uyariTarih'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  const saatEl = document.getElementById('yoklamaSaat');
  if (saatEl) saatEl.value = now;
}

// ── AUTH ──
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';
  btn.textContent = 'Giriş yapılıyor...';
  btn.disabled = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.textContent = 'Giriş Yap';
  btn.disabled = false;

  if (error) {
    errEl.textContent = 'Hatalı e-posta veya şifre.';
    errEl.style.display = 'block';
    return;
  }
  currentUser = data.user;
  isAdmin = true;
  closeModal('modalLogin');
  toast('Giriş yapıldı ✓');
  showApp();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  isAdmin = false;
  location.reload();
}

function openLoginModal() {
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authPassword').value = '';
  openModal('modalLogin');
  setTimeout(() => document.getElementById('authEmail').focus(), 100);
}

function showApp() {
  document.getElementById('app').style.display = 'block';
  document.getElementById('mainNav').style.display = 'flex';

  // Giriş/Çıkış butonlarını role göre göster
  document.getElementById('navLoginBtn').style.display = isAdmin ? 'none' : '';
  document.getElementById('navLogoutBtn').style.display = isAdmin ? '' : 'none';

  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    document.getElementById('navYonetim').style.display = '';
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  showPage('dashboard');
}

// ── NAVIGATION ──
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page' + cap(name)).classList.add('active');
  const navBtn = document.getElementById('nav' + cap(name));
  if (navBtn) navBtn.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'program') loadProgram();
  if (name === 'odalar') loadRooms();
  if (name === 'yoklama') loadYoklamaOdalar();
  if (name === 'arama') document.getElementById('aramaResults').innerHTML = '';
  if (name === 'yonetim') {}
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── DASHBOARD ──
let dashboardData = [];
let dashboardSort = { col: '_pts', asc: false };

async function loadDashboard() {
  document.getElementById('dashboardBody').innerHTML = '<tr><td colspan="7"><div class="spinner"></div></td></tr>';
  document.getElementById('dashboardStats').innerHTML = '';

  const [roomsRes, studentsRes, penRes, rollRes, warnRes] = await Promise.all([
    sb.from('rooms').select('id, name, floor').order('id'),
    sb.from('room_students').select('room_id'),
    sb.from('penalties').select('room_id, points'),
    sb.from('rollcalls').select('room_id, type, status'),
    sb.from('warnings').select('room_id, message, date, severity').order('date', { ascending: false }),
  ]);

  const rooms = roomsRes.data || [];
  const students = studentsRes.data || [];
  const penalties = penRes.data || [];
  const rollcalls = rollRes.data || [];
  const warnings = warnRes.data || [];

  rooms.forEach(r => {
    r._students   = students.filter(s => s.room_id === r.id).length;
    r._pts        = penalties.filter(p => p.room_id === r.id).reduce((a, b) => a + (b.points || 0), 0);
    r._absGece    = rollcalls.filter(x => x.room_id === r.id && x.type === 'gece' && x.status === 'yok').length;
    r._absDers    = rollcalls.filter(x => x.room_id === r.id && x.type !== 'gece' && x.status === 'yok').length;
    const warns   = warnings.filter(w => w.room_id === r.id);
    r._warnCount  = warns.length;
    r._lastWarn   = warns[0]?.message || '—';
    r._lastWarnDate = warns[0]?.date || null;
    r._lastWarnSev  = warns[0]?.severity || null;
  });

  dashboardData = rooms;

  // Özet istatistikler
  const totalStudents = rooms.reduce((a, r) => a + r._students, 0);
  const totalPts = rooms.reduce((a, r) => a + r._pts, 0);
  const worstRoom = [...rooms].sort((a, b) => b._pts - a._pts)[0];
  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Toplam Oda</div><div class="stat-value">${rooms.length}</div></div>
    <div class="stat-card"><div class="stat-label">Toplam Öğrenci</div><div class="stat-value">${totalStudents}</div></div>
    <div class="stat-card"><div class="stat-label">Toplam Ceza Puanı</div><div class="stat-value ${totalPts >= 100 ? 'danger' : ''}">${totalPts}</div></div>
    <div class="stat-card"><div class="stat-label">En Sorunlu Oda</div><div class="stat-value" style="font-size:20px">${worstRoom ? `Oda ${worstRoom.id} (${worstRoom._pts} puan)` : '—'}</div></div>
  `;
  document.getElementById('dashboardSubtitle').textContent = `${rooms.length} oda · ${totalStudents} öğrenci`;

  renderDashboardTable();
}

function renderDashboardTable() {
  const { col, asc } = dashboardSort;
  const sorted = [...dashboardData].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  // Sort indicator
  document.querySelectorAll('th.sortable span').forEach(s => s.textContent = '');
  const indicator = document.getElementById('sort_' + col);
  if (indicator) indicator.textContent = asc ? '↑' : '↓';

  const tbody = document.getElementById('dashboardBody');
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Oda yok</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(r => {
    const rowClass = r._pts >= 50 ? 'row-danger' : r._pts >= 20 ? 'row-warning' : '';
    const lastWarnCell = r._lastWarn !== '—'
      ? `<span class="badge sev-${r._lastWarnSev}" style="display:inline">${r._lastWarnSev}</span> <span style="font-size:13px;color:var(--muted)">${fmtDate(r._lastWarnDate)}</span> — ${r._lastWarn.length > 30 ? r._lastWarn.slice(0,30) + '…' : r._lastWarn}`
      : '—';
    return `<tr class="dashboard-row ${rowClass}" onclick="openOdaDetay('${r.id}');showPage('odalar')">
      <td><strong>${r.id}</strong>${r.name ? `<span style="color:var(--muted);font-size:12px;margin-left:6px">${r.name}</span>` : ''}</td>
      <td>${r._students}</td>
      <td><strong style="color:${r._pts >= 50 ? 'var(--danger)' : r._pts >= 20 ? 'var(--warning)' : 'inherit'}">${r._pts}</strong></td>
      <td>${r._absGece || '—'}</td>
      <td>${r._absDers || '—'}</td>
      <td>${r._warnCount || '—'}</td>
      <td style="max-width:240px;white-space:normal;font-size:13px">${lastWarnCell}</td>
    </tr>`;
  }).join('');
}

function sortDashboard(col) {
  if (dashboardSort.col === col) {
    dashboardSort.asc = !dashboardSort.asc;
  } else {
    dashboardSort.col = col;
    dashboardSort.asc = col === 'id';
  }
  renderDashboardTable();
}

// ── PROGRAM (Haftalık çizelge — Excel mantığı) ──
let programData = null;     // { title, days, rows: [{ time, cells: [...] }] }
let programEditing = false;

function getDefaultProgram() {
  const days = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
  const R = (time, ...cells) => ({ time, cells });
  // 7 günlük tek değer
  const all = (time, v) => R(time, v, v, v, v, v, v, v);
  // Pzt-Cuma dolu, Cmt/Pazar boş
  const wd = (time, v, friday) => R(time, v, v, v, v, friday ?? v, '', '');
  const rows = [
    all('04:45', 'KALKIŞ'),
    all('05:00', 'SABAH NAMAZI'),
    all('05:20-07:20', 'ÇALIŞMA'),
    R('07:30-08:00', 'KAHVALTI', 'KAHVALTI', 'KAHVALTI', 'KAHVALTI', 'KAHVALTI', '', ''),
    R('09:00-10:15', '1.BLOK DERS', '1.BLOK DERS', '1.BLOK DERS', '1.BLOK DERS', '1.BLOK DERS 9.00-10.10', '', ''),
    R('10:15-10:25', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS 10.10-10.20', 'KAHVALTI 10.00-10.50', 'KAHVALTI 10.00-10.50'),
    R('10:25-11:40', '2.BLOK DERS', '2.BLOK DERS', '2.BLOK DERS', '2.BLOK DERS', '2.BLOK DERS 10.20-11.30', 'DENEME SINAVI BAŞLANGIÇ: 11.00', ''),
    R('11:40-11:50', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS', 'TENEFFÜS 11.30-11.40', '', ''),
    R('11:50-13:05', '3.BLOK DERS', '3.BLOK DERS', '3.BLOK DERS', '3.BLOK DERS', '3.BLOK DERS 11.40-12.50', '', ''),
    R('13:40-14:10', 'ÖĞLE YEMEĞİ', 'ÖĞLE YEMEĞİ', 'ÖĞLE YEMEĞİ', 'ÖĞLE YEMEĞİ', 'ÖĞLE YEMEĞİ / CUMA NAMAZI', '', 'TATİL (ÖĞLE YEMEĞİ CUMARTESİ)'),
    R('14:10-15:30', 'SERBEST ZAMAN', 'SERBEST ZAMAN', 'SERBEST ZAMAN', 'SERBEST ZAMAN', 'SERBEST ZAMAN', 'TATİL', ''),
    R('16:00-17:00', '1.ETÜT', '1.ETÜT', '1.ETÜT', '1.ETÜT', '1.ETÜT', '', ''),
    R('16:50-17:10', 'İKİNDİ NAMAZI', 'İKİNDİ NAMAZI', 'İKİNDİ NAMAZI', 'İKİNDİ NAMAZI', 'İKİNDİ NAMAZI', '', ''),
    R('17:10-18:10', '2.ETÜT', '2.ETÜT', '2.ETÜT', '2.ETÜT', '2.ETÜT', '', ''),
    all('18:10-18:40', 'AKŞAM YEMEĞİ'),
    R('18:50-19:50', '3.ETÜT', '3.ETÜT', '3.ETÜT', '3.ETÜT', '3.ETÜT', 'SERBEST ZAMAN', 'SERBEST ZAMAN'),
    R('20:00-20:40', 'KİTAP OKUMA', 'KİTAP OKUMA', 'KİTAP OKUMA', 'KİTAP OKUMA', 'KİTAP OKUMA', '', ''),
    all('20:50-21:10', 'AKŞAM NAMAZI'),
    all('21:10-22:30', 'SERBEST ZAMAN'),
    all('22:30-23:00', 'YATSI NAMAZI'),
    all('23:30', 'YATIŞ'),
  ];
  return { title: 'BOLU TYT KAMPI 2026 — HAFTALIK PROGRAM', days, rows };
}

async function loadProgram() {
  // Düzenleme modunda sayfaya dönülürse mevcut düzeni koru
  if (programEditing) return;
  const { data, error } = await sb.from('program').select('data').eq('id', 'main').single();
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = satır yok; diğer hatalar (örn. tablo yok) için varsayılanı göster
    console.warn('Program okunamadı:', error.message);
  }
  programData = (data && data.data) ? data.data : getDefaultProgram();
  // Eksik alanları tamamla
  if (!programData.days) programData.days = getDefaultProgram().days;
  if (!programData.rows) programData.rows = getDefaultProgram().rows;
  renderProgram();
}

function renderProgram() {
  document.getElementById('programTitle').textContent = programData.title || '';
  const head = document.getElementById('programHead');
  const body = document.getElementById('programBody');
  const days = programData.days;

  head.innerHTML = `<tr>
    <th>SAAT</th>
    ${days.map(d => `<th>${escapeHtml(d)}</th>`).join('')}
    ${programEditing ? '<th class="del-col"></th>' : ''}
  </tr>`;

  body.innerHTML = programData.rows.map((row, ri) => {
    const ed = programEditing ? 'contenteditable="true"' : '';
    const timeCell = `<td ${ed} data-r="${ri}" data-c="time">${escapeHtml(row.time)}</td>`;
    const cells = days.map((_, ci) =>
      `<td ${ed} data-r="${ri}" data-c="${ci}">${escapeHtml(row.cells[ci] ?? '')}</td>`
    ).join('');
    const del = programEditing
      ? `<td class="del-col"><span class="program-row-del" onclick="deleteProgramRow(${ri})" title="Satırı sil">✕</span></td>`
      : '';
    return `<tr>${timeCell}${cells}${del}</tr>`;
  }).join('');

  document.getElementById('programTable').classList.toggle('editing', programEditing);
}

function toggleProgramEdit() {
  programEditing = true;
  document.getElementById('programEditBtn').style.display = 'none';
  document.getElementById('programSaveBtn').style.display = '';
  document.getElementById('programCancelBtn').style.display = '';
  document.getElementById('programEditTools').style.display = '';
  document.getElementById('programTitle').setAttribute('contenteditable', 'true');
  renderProgram();
}

function exitProgramEditUI() {
  programEditing = false;
  document.getElementById('programEditBtn').style.display = '';
  document.getElementById('programSaveBtn').style.display = 'none';
  document.getElementById('programCancelBtn').style.display = 'none';
  document.getElementById('programEditTools').style.display = 'none';
  document.getElementById('programTitle').setAttribute('contenteditable', 'false');
}

function cancelProgramEdit() {
  exitProgramEditUI();
  loadProgram();
}

// DOM'daki düzenlenmiş hücreleri programData'ya geri yaz
function collectProgramFromDOM() {
  programData.title = document.getElementById('programTitle').textContent.trim();
  document.querySelectorAll('#programBody td[data-r]').forEach(td => {
    const r = parseInt(td.dataset.r);
    const c = td.dataset.c;
    const val = td.textContent.trim();
    if (c === 'time') programData.rows[r].time = val;
    else programData.rows[r].cells[parseInt(c)] = val;
  });
}

function addProgramRow() {
  collectProgramFromDOM();
  programData.rows.push({ time: '', cells: programData.days.map(() => '') });
  renderProgram();
}

function deleteProgramRow(ri) {
  collectProgramFromDOM();
  programData.rows.splice(ri, 1);
  renderProgram();
}

async function saveProgram() {
  collectProgramFromDOM();
  const { error } = await sb.from('program').upsert({ id: 'main', data: programData, updated_at: new Date().toISOString() });
  if (error) { toast('Hata: ' + error.message); return; }
  exitProgramEditUI();
  toast('Program kaydedildi ✓');
  renderProgram();
}

// ── ROOMS ──
async function loadRooms() {
  closeOdaDetay();
  const grid = document.getElementById('roomGrid');
  grid.innerHTML = '<div class="spinner"></div>';

  const [roomsRes, penRes, warnRes] = await Promise.all([
    sb.from('rooms').select('*').order('id'),
    sb.from('penalties').select('room_id, points'),
    sb.from('warnings').select('room_id, severity, date').order('date', { ascending: false }),
  ]);

  const rooms = roomsRes.data || [];
  const penalties = penRes.data || [];
  const warnings = warnRes.data || [];

  const penByRoom = {};
  penalties.forEach(p => { penByRoom[p.room_id] = (penByRoom[p.room_id] || 0) + (p.points || 0); });

  const lastWarn = {};
  warnings.forEach(w => { if (!lastWarn[w.room_id]) lastWarn[w.room_id] = w; });

  document.getElementById('odalarSubtitle').textContent = `${rooms.length} oda`;

  if (!rooms.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏠</div><p>${isAdmin ? 'Henüz oda yok. "+ Oda Ekle" ile başlayın.' : 'Kayıtlı oda bulunamadı.'}</p></div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    const pts = penByRoom[room.id] || 0;
    const warn = lastWarn[room.id];
    const ptsClass = pts >= 50 ? 'badge-danger' : pts >= 20 ? 'badge-warning' : 'badge-neutral';
    const sevClass = warn ? `sev-${warn.severity}` : '';
    return `
      <div class="room-card" onclick="openOdaDetay('${room.id}')">
        <div class="room-number">${room.id}</div>
        <div class="room-meta">${room.name || (room.floor ? `${room.floor}. kat` : 'Oda')}</div>
        <div class="room-badges">
          <span class="badge ${ptsClass}">⚡ ${pts} puan</span>
          ${warn ? `<span class="badge ${sevClass}">${warn.severity}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── ODA DETAY ──
async function openOdaDetay(roomId) {
  currentRoomId = roomId;
  document.getElementById('roomGrid').style.display = 'none';
  document.getElementById('odaDetay').style.display = 'block';
  document.getElementById('detayOdaNo').textContent = `Oda ${roomId}`;
  switchTab('sakinler');
  await refreshDetayAll();
}

function closeOdaDetay() {
  currentRoomId = null;
  document.getElementById('roomGrid').style.display = 'grid';
  document.getElementById('odaDetay').style.display = 'none';
}

async function refreshDetayAll() {
  await Promise.all([loadSakinler(), loadYoklamalar(), loadCezalar(), loadUyarilar()]);
  await loadDetayStats();
}

async function loadDetayStats() {
  const [penRes, warnRes, rollRes] = await Promise.all([
    sb.from('penalties').select('points').eq('room_id', currentRoomId),
    sb.from('warnings').select('id').eq('room_id', currentRoomId),
    sb.from('rollcalls').select('status').eq('room_id', currentRoomId).eq('status','yok'),
  ]);
  const pts = (penRes.data || []).reduce((s,r) => s + (r.points||0), 0);
  const ptsColor = pts >= 50 ? 'danger' : pts >= 20 ? 'warning' : 'success';
  document.getElementById('detayStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Toplam Ceza</div><div class="stat-value ${ptsColor}">${pts}</div></div>
    <div class="stat-card"><div class="stat-label">Uyarı Sayısı</div><div class="stat-value">${(warnRes.data||[]).length}</div></div>
    <div class="stat-card"><div class="stat-label">Devamsız Kayıt</div><div class="stat-value">${(rollRes.data||[]).length}</div></div>
  `;
}

// ── TAB ──
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.detail-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#odaDetay .view').forEach(v => v.classList.remove('active'));

  const tabs = { sakinler: 0, yoklamalar: 1, cezalar: 2, uyarilar: 3 };
  document.querySelectorAll('.detail-tabs .tab-btn')[tabs[tab]].classList.add('active');
  document.getElementById('tab' + cap(tab)).classList.add('active');
}

// ── SAKİNLER ──
async function loadSakinler() {
  const { data } = await sb.from('room_students').select('*').eq('room_id', currentRoomId).order('student_name');
  const tbody = document.getElementById('sakinlerBody');
  const sakinler = data || [];
  document.getElementById('detayOdaSakin').textContent = `${sakinler.length} öğrenci`;
  if (!sakinler.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:24px">Oda boş</td></tr>`;
    return;
  }
  tbody.innerHTML = sakinler.map(s => `
    <tr>
      <td><strong>${s.student_name}</strong></td>
      <td>${s.class_name || '—'}</td>
      <td class="admin-only"><button class="btn btn-ghost btn-sm" onclick="removeSakin('${s.id}')">Çıkar</button></td>
    </tr>`).join('');
  if (!isAdmin) document.querySelectorAll('#sakinlerBody .admin-only').forEach(el => el.style.display = 'none');
}

async function removeSakin(id) {
  if (!confirm('Bu öğrenciyi odadan çıkarmak istediğinize emin misiniz?')) return;
  await sb.from('room_students').delete().eq('id', id);
  toast('Öğrenci çıkarıldı');
  loadSakinler();
}

// ── YOKLAMALAR ──
async function loadYoklamalar() {
  const { data } = await sb.from('rollcalls').select('*').eq('room_id', currentRoomId).order('date', { ascending: false }).order('time', { ascending: false });
  const tbody = document.getElementById('yoklamalarBody');
  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Yoklama kaydı yok</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => {
    const statusBadge = r.status === 'var'
      ? '<span class="badge badge-success">Var</span>'
      : r.status === 'yok'
      ? '<span class="badge badge-danger">Yok</span>'
      : '<span class="badge badge-warning">İzinli</span>';
    const turBadge = turLabel(r.type);
    return `<tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.time||'—'}</td>
      <td>${turBadge}</td>
      <td>${r.student_name}</td>
      <td>${statusBadge}</td>
      <td><span class="note-chip">${r.note||'—'}</span></td>
    </tr>`;
  }).join('');
}

// ── CEZALAR ──
async function loadCezalar() {
  const { data } = await sb.from('penalties').select('*').eq('room_id', currentRoomId).order('date', { ascending: false });
  const tbody = document.getElementById('cezalarBody');
  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">Ceza kaydı yok</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.reason}</td>
      <td><strong style="color:var(--danger)">${r.points}</strong></td>
      <td>${r.created_by||'—'}</td>
      <td class="admin-only"><button class="btn btn-ghost btn-sm" onclick="deleteCeza('${r.id}')">Sil</button></td>
    </tr>`).join('');
  if (!isAdmin) document.querySelectorAll('#cezalarBody .admin-only').forEach(el => el.style.display = 'none');
}

async function deleteCeza(id) {
  if (!confirm('Bu cezayı silmek istediğinize emin misiniz?')) return;
  await sb.from('penalties').delete().eq('id', id);
  toast('Ceza silindi');
  loadCezalar();
  loadDetayStats();
}

// ── UYARILAR ──
async function loadUyarilar() {
  const { data } = await sb.from('warnings').select('*').eq('room_id', currentRoomId).order('date', { ascending: false });
  const tbody = document.getElementById('uyarilarBody');
  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">Uyarı kaydı yok</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.message}</td>
      <td><span class="badge sev-${r.severity}">${r.severity}</span></td>
      <td>${r.created_by||'—'}</td>
      <td class="admin-only"><button class="btn btn-ghost btn-sm" onclick="deleteUyari('${r.id}')">Sil</button></td>
    </tr>`).join('');
  if (!isAdmin) document.querySelectorAll('#uyarilarBody .admin-only').forEach(el => el.style.display = 'none');
}

async function deleteUyari(id) {
  if (!confirm('Bu uyarıyı silmek istediğinize emin misiniz?')) return;
  await sb.from('warnings').delete().eq('id', id);
  toast('Uyarı silindi');
  loadUyarilar();
}

// ── YOKLAMA ALMA ──
async function loadYoklamaOdalar() {
  const { data } = await sb.from('rooms').select('id').order('id');
  const rooms = data || [];
  const opts = rooms.map(r => `<option value="${r.id}">Oda ${r.id}</option>`).join('');
  document.getElementById('yoklamaOda').innerHTML = opts;
  document.getElementById('gecmisOda').innerHTML = '<option value="">Tüm odalar</option>' + opts;
  document.getElementById('yoklamaListesi').style.display = 'none';
}

// ── YOKLAMA SEKMELERİ ──
function switchYoklamaTab(tab) {
  const al = tab === 'al';
  document.getElementById('yokTabAlBtn').classList.toggle('active', al);
  document.getElementById('yokTabGecmisBtn').classList.toggle('active', !al);
  document.getElementById('yokViewAl').classList.toggle('active', al);
  document.getElementById('yokViewGecmis').classList.toggle('active', !al);
  if (!al) {
    // Geçmiş sekmesine ilk geçişte bugünü seç ve yükle
    const t = document.getElementById('gecmisTarih');
    if (!t.value) t.value = new Date().toISOString().split('T')[0];
    loadGecmisYoklama();
  }
}

async function loadGecmisYoklama() {
  const tarih = document.getElementById('gecmisTarih').value;
  const oda = document.getElementById('gecmisOda').value;
  const wrap = document.getElementById('gecmisSonuc');
  if (!tarih) { wrap.innerHTML = '<p style="color:var(--muted)">Lütfen tarih seçin.</p>'; return; }

  wrap.innerHTML = '<div class="spinner"></div>';
  let q = sb.from('rollcalls').select('*').eq('date', tarih);
  if (oda) q = q.eq('room_id', oda);
  const { data, error } = await q.order('room_id').order('time').order('student_name');
  if (error) { wrap.innerHTML = `<p style="color:var(--danger)">Hata: ${error.message}</p>`; return; }

  const rows = data || [];
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><p>${fmtDate(tarih)} için yoklama kaydı yok.</p></div>`;
    return;
  }

  // Oda + tür + saat'e göre grupla
  const groups = {};
  rows.forEach(r => {
    const key = `${r.room_id}|${r.type}|${r.time || ''}`;
    (groups[key] = groups[key] || []).push(r);
  });

  wrap.innerHTML = Object.entries(groups).map(([key, list]) => {
    const [room_id, type, time] = key.split('|');
    const turBadge = turLabel(type);
    const yokSayisi = list.filter(r => r.status === 'yok').length;
    const izinSayisi = list.filter(r => r.status === 'izin').length;
    const ids = list.map(r => r.id);
    const delBtn = isAdmin
      ? `<button class="btn btn-danger btn-sm" onclick='deleteGecmisYoklama(${JSON.stringify(ids)})'>Bu yoklamayı sil</button>`
      : '';
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <strong style="font-size:16px">Oda ${room_id}</strong>
            <span class="badge badge-accent" style="margin-left:8px">${turBadge}</span>
            ${time ? `<span style="color:var(--muted);font-size:13px;margin-left:6px">${time}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${yokSayisi ? `<span class="badge badge-danger">${yokSayisi} yok</span>` : ''}
            ${izinSayisi ? `<span class="badge badge-warning">${izinSayisi} izinli</span>` : ''}
            ${delBtn}
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Öğrenci</th><th>Durum</th><th>Not</th></tr></thead>
            <tbody>
              ${list.map(r => {
                const sb2 = r.status === 'var'
                  ? '<span class="badge badge-success">Var</span>'
                  : r.status === 'yok'
                  ? '<span class="badge badge-danger">Yok</span>'
                  : '<span class="badge badge-warning">İzinli</span>';
                return `<tr><td>${r.student_name}</td><td>${sb2}</td><td><span class="note-chip">${r.note || '—'}</span></td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

async function deleteGecmisYoklama(ids) {
  if (!confirm('Bu yoklama kaydını silmek istediğinize emin misiniz?')) return;
  const { error } = await sb.from('rollcalls').delete().in('id', ids);
  if (error) { toast('Hata: ' + error.message); return; }
  toast('Yoklama silindi');
  loadGecmisYoklama();
}

async function loadYoklamaOgrenciler() {
  const roomId = document.getElementById('yoklamaOda').value;
  if (!roomId) return;
  const { data } = await sb.from('room_students').select('student_name').eq('room_id', roomId).order('student_name');
  const students = data || [];
  if (!students.length) { toast('Bu odada kayıtlı öğrenci yok'); return; }

  const tbody = document.getElementById('yoklamaOgrencilerBody');
  tbody.innerHTML = students.map((s, i) => `
    <tr class="rollcall-row">
      <td>${s.student_name}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="status-btn" data-st="var" onclick="setStatus(${i},'var')">Var</button>
          <button class="status-btn" data-st="yok" onclick="setStatus(${i},'yok')">Yok</button>
          <button class="status-btn" data-st="izin" onclick="setStatus(${i},'izin')">İzinli</button>
        </div>
      </td>
      <td><input class="input" style="width:160px;padding:6px 10px;font-size:13px" placeholder="Not..." data-note="${i}" /></td>
    </tr>`).join('');

  // Herkesi "var" olarak işaretle
  students.forEach((_, i) => setStatus(i, 'var'));

  document.getElementById('yoklamaListesi').style.display = 'block';
}

function setStatus(idx, status) {
  const row = document.querySelectorAll('#yoklamaOgrencilerBody tr')[idx];
  row.querySelectorAll('.status-btn').forEach(b => b.classList.remove('var','yok','izin'));
  row.querySelector(`.status-btn[data-st="${status}"]`).classList.add(status);
  row.dataset.status = status;
}

function onYoklamaTurChange() {
  const isEkstra = document.getElementById('yoklamaTur').value === '__ekstra__';
  document.getElementById('yoklamaEkstraWrap').style.display = isEkstra ? '' : 'none';
}

async function saveYoklama() {
  const roomId = document.getElementById('yoklamaOda').value;
  let tur = document.getElementById('yoklamaTur').value;
  if (tur === '__ekstra__') {
    tur = document.getElementById('yoklamaEkstraAd').value.trim();
    if (!tur) { toast('Ekstra yoklama adı gerekli'); return; }
  }
  const tarih = document.getElementById('yoklamaTarih').value;
  const saat = document.getElementById('yoklamaSaat').value;
  const by = currentUser?.email || 'misafir';

  const rows = document.querySelectorAll('#yoklamaOgrencilerBody tr');
  const records = [];
  rows.forEach((row, i) => {
    const name = row.querySelector('td:first-child').textContent.trim();
    const status = row.dataset.status || 'var';
    const note = row.querySelector(`[data-note="${i}"]`)?.value || '';
    records.push({ room_id: roomId, type: tur, date: tarih, time: saat, student_name: name, status, note, created_by: by });
  });

  const { error } = await sb.from('rollcalls').insert(records);
  if (error) { toast('Hata: ' + error.message); return; }
  toast('Yoklama kaydedildi ✓');
  document.getElementById('yoklamaListesi').style.display = 'none';
}

// ── ARAMA ──
async function aramaYap() {
  const q = document.getElementById('aramaInput').value.trim();
  const wrap = document.getElementById('aramaResults');
  if (q.length < 2) { wrap.innerHTML = ''; return; }

  const { data: students } = await sb.from('room_students').select('student_name, room_id, class_name').ilike('student_name', `%${q}%`).limit(20);
  if (!students?.length) { wrap.innerHTML = '<p style="color:var(--muted)">Sonuç bulunamadı.</p>'; return; }

  const roomIds = [...new Set(students.map(s => s.room_id))];
  const [rollRes, penRes] = await Promise.all([
    sb.from('rollcalls').select('student_name, status').in('room_id', roomIds),
    sb.from('penalties').select('room_id, points'),
  ]);
  const rollcalls = rollRes.data || [];
  const penalties = penRes.data || [];

  wrap.innerHTML = students.map(s => {
    const yok = rollcalls.filter(r => r.student_name === s.student_name && r.status === 'yok').length;
    const pts = penalties.filter(p => p.room_id === s.room_id).reduce((a,b) => a + (b.points||0), 0);
    return `
      <div class="card" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <strong>${s.student_name}</strong>
          <span style="color:var(--muted);font-size:13px;margin-left:8px">${s.class_name||''}</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span class="badge badge-accent">Oda ${s.room_id}</span>
          <span class="badge ${yok > 5 ? 'badge-danger' : yok > 2 ? 'badge-warning' : 'badge-neutral'}">Devamsız: ${yok}</span>
          <span class="badge ${pts >= 50 ? 'badge-danger' : 'badge-neutral'}">⚡ ${pts} puan</span>
          <button class="btn btn-ghost btn-sm" onclick="openOdaDetay('${s.room_id}');showPage('odalar')">Odaya Git</button>
        </div>
      </div>`;
  }).join('');
}

// ── MODAL HELPERS ──
function openOdaModal() {
  ['odaNoInput','odaKatInput','odaAciklamaInput'].forEach(id => document.getElementById(id).value = '');
  openModal('modalOda');
}

function openCezaModal() {
  document.getElementById('cezaTarih').value = new Date().toISOString().split('T')[0];
  document.getElementById('cezaSebep').value = '';
  document.getElementById('cezaPuan').value = '';
  openModal('modalCeza');
}

function openUyariModal() {
  document.getElementById('uyariTarih').value = new Date().toISOString().split('T')[0];
  document.getElementById('uyariMesaj').value = '';
  document.getElementById('uyariSeviye').value = 'bilgi';
  openModal('modalUyari');
}

let ataOgrenciList = [];   // bu odaya atanabilir tüm camdata öğrencileri
let ataRenderedList = [];  // o an listede gösterilenler (filtreli)

async function openOgrenciAtaModal() {
  document.getElementById('ataSearch').value = '';
  const sel = document.getElementById('ataSelect');
  sel.innerHTML = '<option disabled>Yükleniyor...</option>';
  openModal('modalOgrenciAta');

  const [camdata, mevcutRes] = await Promise.all([
    getCamdataStudents(),
    sb.from('room_students').select('student_name').eq('room_id', currentRoomId),
  ]);
  // Bu odada zaten olanları çıkar
  const mevcut = new Set((mevcutRes.data || []).map(s => s.student_name));
  ataOgrenciList = camdata.filter(s => !mevcut.has(s.name));
  renderAtaOgrenciler(ataOgrenciList);
}

function renderAtaOgrenciler(list) {
  ataRenderedList = list;
  const sel = document.getElementById('ataSelect');
  if (!list.length) {
    sel.innerHTML = '<option disabled>Eşleşen öğrenci yok</option>';
    return;
  }
  sel.innerHTML = list.map((s, i) =>
    `<option value="${i}">${s.name}${s.class_name ? ` — ${s.class_name}` : ''}</option>`
  ).join('');
  sel.selectedIndex = 0;
}

function filterAtaOgrenciler() {
  const q = document.getElementById('ataSearch').value.trim().toLocaleLowerCase('tr');
  const filtered = q ? ataOgrenciList.filter(s => s.name.toLocaleLowerCase('tr').includes(q)) : ataOgrenciList;
  renderAtaOgrenciler(filtered);
}

function openOdaDeleteModal() { openModal('modalOdaSil'); }

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
});

// ── SAVE HANDLERS ──
async function saveOda() {
  const id = document.getElementById('odaNoInput').value.trim();
  if (!id) { toast('Oda numarası gerekli'); return; }
  const floor = document.getElementById('odaKatInput').value;
  const name = document.getElementById('odaAciklamaInput').value.trim();
  const { error } = await sb.from('rooms').insert({ id, floor: floor ? parseInt(floor) : null, name: name || null });
  if (error) { toast('Hata: ' + (error.code === '23505' ? 'Bu oda numarası zaten var' : error.message)); return; }
  closeModal('modalOda');
  toast(`Oda ${id} eklendi ✓`);
  loadRooms();
}

async function saveCeza() {
  const tarih = document.getElementById('cezaTarih').value;
  const sebep = document.getElementById('cezaSebep').value.trim();
  const puan = parseInt(document.getElementById('cezaPuan').value);
  if (!sebep || !puan) { toast('Sebep ve puan gerekli'); return; }
  const { error } = await sb.from('penalties').insert({ room_id: currentRoomId, date: tarih, reason: sebep, points: puan, created_by: currentUser?.email || '' });
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalCeza');
  toast('Ceza eklendi ✓');
  loadCezalar();
  loadDetayStats();
}

async function saveUyari() {
  const tarih = document.getElementById('uyariTarih').value;
  const mesaj = document.getElementById('uyariMesaj').value.trim();
  const seviye = document.getElementById('uyariSeviye').value;
  if (!mesaj) { toast('Mesaj gerekli'); return; }
  const { error } = await sb.from('warnings').insert({ room_id: currentRoomId, date: tarih, message: mesaj, severity: seviye, created_by: currentUser?.email || '' });
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalUyari');
  toast('Uyarı gönderildi ✓');
  loadUyarilar();
}

async function saveOgrenciAta() {
  const sel = document.getElementById('ataSelect');
  const idx = parseInt(sel.value);
  const ogrenci = ataRenderedList[idx];
  if (!ogrenci) { toast('Lütfen bir öğrenci seçin'); return; }
  const { error } = await sb.from('room_students').insert({ room_id: currentRoomId, student_name: ogrenci.name, class_name: ogrenci.class_name || null });
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalOgrenciAta');
  toast(`${ogrenci.name} odaya eklendi ✓`);
  loadSakinler();
}

async function deleteOda() {
  await Promise.all([
    sb.from('rollcalls').delete().eq('room_id', currentRoomId),
    sb.from('penalties').delete().eq('room_id', currentRoomId),
    sb.from('warnings').delete().eq('room_id', currentRoomId),
    sb.from('room_students').delete().eq('room_id', currentRoomId),
  ]);
  await sb.from('rooms').delete().eq('id', currentRoomId);
  closeModal('modalOdaSil');
  toast('Oda silindi');
  closeOdaDetay();
  loadRooms();
}

// ── CAMDATA ENTEGRASYON ──
let camdataStudentsCache = null;

// Camdata app_state JSON'undan tüm öğrencileri { name, class_name } olarak çeker (cache'li)
async function getCamdataStudents(force = false) {
  if (camdataStudentsCache && !force) return camdataStudentsCache;
  const { data, error } = await sb.from('app_state').select('data').eq('id', 'main').single();
  if (error || !data?.data) { toast('Camdata verisi alınamadı'); return []; }
  const state = data.data;
  const roster = state.roster || [];
  const students = roster
    .map(o => ({ name: o.name || o.ad, class_name: o.studentClass || o.class_name || '' }))
    .filter(s => s.name);
  students.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  camdataStudentsCache = students;
  return students;
}

async function loadCamdataOgrenciler() {
  const students = await getCamdataStudents(true);
  if (!students.length) { toast('Camdata\'da öğrenci bulunamadı'); return; }

  const { data: rooms } = await sb.from('rooms').select('id').order('id');
  const odaOpts = (rooms||[]).map(r => `<option value="${r.id}">Oda ${r.id}</option>`).join('');

  const wrap = document.getElementById('camdataOgrencilerWrap');
  wrap.style.display = 'block';
  document.getElementById('camdataOgrencilerBody').innerHTML = students.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.class_name||'—'}</td>
      <td><select class="input" style="padding:5px 8px;font-size:13px;width:110px">
        <option value="">—</option>${odaOpts}
      </select></td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCamdataAtaModal('${encodeURIComponent(JSON.stringify(s))}',this)">Aktar</button></td>
    </tr>`).join('');
}

function openCamdataAtaModal(encoded, btn) {
  pendingCamdataOgrenci = JSON.parse(decodeURIComponent(encoded));
  const row = btn.closest('tr');
  const sel = row.querySelector('select');
  if (sel.value) {
    pendingCamdataOgrenci._oda = sel.value;
  }
  document.getElementById('camdataAtaTitle').textContent = `"${pendingCamdataOgrenci.name}" Aktar`;
  const { data: rooms } = sb.from('rooms').select('id'); // non-blocking; we reload below
  loadRoomsIntoSelect('camdataAtaOda', pendingCamdataOgrenci._oda || '');
  openModal('modalCamdataAta');
}

async function loadRoomsIntoSelect(selId, selected) {
  const { data } = await sb.from('rooms').select('id').order('id');
  const sel = document.getElementById(selId);
  sel.innerHTML = (data||[]).map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>Oda ${r.id}</option>`).join('');
}

async function saveCamdataAta() {
  const oda = document.getElementById('camdataAtaOda').value;
  if (!oda || !pendingCamdataOgrenci) return;
  const { error } = await sb.from('room_students').upsert(
    { room_id: oda, student_name: pendingCamdataOgrenci.name, class_name: pendingCamdataOgrenci.class_name },
    { onConflict: 'student_name,room_id' }
  );
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalCamdataAta');
  toast(`${pendingCamdataOgrenci.name} → Oda ${oda} aktarıldı ✓`);
  pendingCamdataOgrenci = null;
}

// ── HELPERS ──
function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Yoklama türü → rozet etiketi
const TUR_LABELS = {
  gece: '🌙 Gece',
  etut1: '1. Etüt',
  etut2: '2. Etüt',
  etut3: '3. Etüt',
  kitap: '📖 Kitap Okuma',
  ders: '📚 Ders', // eski kayıtlar için
};
function turLabel(type) {
  return TUR_LABELS[type] || type || '—';
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
