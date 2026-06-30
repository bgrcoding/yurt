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
  ['yoklamaTarih'].forEach(id => {
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
  if (name === 'odalar') loadRooms();
  if (name === 'yoklama') loadYoklamaOdalar();
  if (name === 'arama') document.getElementById('aramaResults').innerHTML = '';
  if (name === 'yonetim') {}
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── DASHBOARD ──
let dashboardData = [];
let dashboardSort = { col: '_absGece', asc: false };

async function loadDashboard() {
  // Yükleniyor: skeleton kartlar + tablo satırları (çıplak spinner yerine).
  document.getElementById('dashboardStats').innerHTML = Array.from({ length: 6 }, () =>
    `<div class="stat-card skeleton-card"><span class="skeleton sk-ic"></span><span class="stat-body"><span class="skeleton sk-line sm"></span><span class="skeleton sk-line lg"></span></span></div>`).join('');
  document.getElementById('dashboardBody').innerHTML = Array.from({ length: 6 }, () =>
    `<tr class="skeleton-row">${'<td><span class="skeleton sk-line"></span></td>'.repeat(5)}</tr>`).join('');

  const [roomsRes, studentsRes, rollRes] = await Promise.all([
    sb.from('rooms').select('id, name, floor').order('id'),
    sb.from('room_students').select('room_id, student_name'),
    sb.from('rollcalls').select('room_id, type, status, student_name'),
  ]);

  const rooms = roomsRes.data || [];
  const students = studentsRes.data || [];
  const rollcalls = rollRes.data || [];

  // Etüt/kitap yoklaması oda yerine sınıf bazlı kaydedilir (room_id boş);
  // oda devamsızlığını öğrenci→oda eşlemesiyle hesapla.
  const stuRoom = {};
  students.forEach(s => { stuRoom[s.student_name] = s.room_id; });

  rooms.forEach(r => {
    r._students   = students.filter(s => s.room_id === r.id).length;
    r._absGece    = rollcalls.filter(x => x.room_id === r.id && x.type === 'gece' && x.status === 'yok').length;
    // Namaz (oda bazlı) artık etütten ayrı sayılır.
    r._absNamaz   = rollcalls.filter(x => x.room_id === r.id && isNamaz(x.type) && x.status === 'yok').length;
    // Etüt = yalnızca sınıf bazlı etüt/kitap türleri (namaz/ekstra hariç).
    r._absDers    = rollcalls.filter(x => ETUT_TURLER.has(x.type) && x.status === 'yok'
                      && (x.room_id === r.id || (!x.room_id && stuRoom[x.student_name] === r.id))).length;
  });

  dashboardData = rooms;

  // Özet istatistikler
  const totalStudents = rooms.reduce((a, r) => a + r._students, 0);
  const totalGece  = rooms.reduce((a, r) => a + (r._absGece  || 0), 0);
  const totalNamaz = rooms.reduce((a, r) => a + (r._absNamaz || 0), 0);
  const totalEtut  = rooms.reduce((a, r) => a + (r._absDers  || 0), 0);
  const totalDevamsiz = totalGece + totalNamaz + totalEtut;
  const doluOda = rooms.filter(r => r._students > 0).length;
  const ortOda  = rooms.length ? Math.round(totalStudents / rooms.length) : 0;
  const odaSayisi = key => rooms.filter(r => (r[key] || 0) > 0).length;
  document.getElementById('dashboardStats').innerHTML =
      statCard(DASH_ICONS.oda,    'Toplam Oda',     rooms.length, `${doluOda} dolu`,                 '') +
      statCard(DASH_ICONS.ogr,    'Toplam Öğrenci', totalStudents, `ort. ${ortOda}/oda`,            '') +
      statCard(DASH_ICONS.gece,   'Gece Devamsız',  totalGece,    `${odaSayisi('_absGece')} odada`,  'danger') +
      statCard(DASH_ICONS.namaz,  'Namaz Devamsız', totalNamaz,   `${odaSayisi('_absNamaz')} odada`, 'accent') +
      statCard(DASH_ICONS.etut,   'Etüt Devamsız',  totalEtut,    `${odaSayisi('_absDers')} odada`,  'warning') +
      statCard(DASH_ICONS.toplam, 'Toplam Devamsız', totalDevamsiz, 'gece + namaz + etüt',           'danger');
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
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="empty-icon">🏠</div><p>Henüz oda yok.</p></div></td></tr>';
    return;
  }

  // Devamsızlık hücresi: 0 ise muted "—", >0 ise ilgili renkte sayı.
  const cell = (n, sev) => (n > 0
    ? `<td class="num ${sev}">${n}</td>`
    : `<td class="num zero">—</td>`);

  tbody.innerHTML = sorted.map(r => {
    const toplamDevamsiz = (r._absGece || 0) + (r._absNamaz || 0) + (r._absDers || 0);
    const rowClass = toplamDevamsiz >= 5 ? 'row-danger' : toplamDevamsiz >= 3 ? 'row-warning' : '';
    return `<tr class="dashboard-row ${rowClass}" onclick="goToRoom('${r.id}')">
      <td class="oda-cell"><strong>${r.id}</strong>${r.name ? `<span style="color:var(--muted);font-size:12px;margin-left:6px">${r.name}</span>` : ''}</td>
      <td class="num">${r._students}</td>
      ${cell(r._absGece || 0, 'danger')}
      ${cell(r._absNamaz || 0, 'accent')}
      ${cell(r._absDers || 0, 'warning')}
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

  const [roomsRes, stuRes] = await Promise.all([
    sb.from('rooms').select('*').order('id'),
    sb.from('room_students').select('room_id'),
  ]);

  const rooms = roomsRes.data || [];
  const students = stuRes.data || [];

  const countByRoom = {};
  students.forEach(s => { countByRoom[s.room_id] = (countByRoom[s.room_id] || 0) + 1; });

  document.getElementById('odalarSubtitle').textContent = `${rooms.length} oda`;

  if (!rooms.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏠</div><p>${isAdmin ? 'Henüz oda yok. "+ Oda Ekle" ile başlayın.' : 'Kayıtlı oda bulunamadı.'}</p></div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => `
      <div class="room-card" onclick="openOdaDetay('${room.id}')">
        <div class="room-number">${room.id}</div>
        <div class="room-meta">${room.name || (room.floor ? `${room.floor}. kat` : 'Oda')}</div>
        <div class="room-badges">
          <span class="badge badge-neutral">${countByRoom[room.id] || 0} öğrenci</span>
        </div>
      </div>`).join('');
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

// Başka sayfadan (dashboard, arama) doğrudan oda detayına git.
// Önce Odalar sayfasını aç (liste arkada yüklensin ki "geri" çalışsın),
// sonra detayı üstüne aç — sıra önemli, yoksa loadRooms detayı kapatır.
async function goToRoom(id) {
  showPage('odalar');
  await openOdaDetay(id);
}

async function refreshDetayAll() {
  await Promise.all([loadSakinler(), loadYoklamalar()]);
  await loadDetayStats();
}

async function loadDetayStats() {
  const stuRes = await sb.from('room_students').select('student_name').eq('room_id', currentRoomId);
  const names = (stuRes.data || []).map(s => s.student_name);
  const [geceRes, namazRes, etutSinifRes] = await Promise.all([
    sb.from('rollcalls').select('id').eq('room_id', currentRoomId).eq('type', 'gece').eq('status', 'yok'),
    sb.from('rollcalls').select('id').eq('room_id', currentRoomId).in('type', NAMAZ_TURLER).eq('status', 'yok'),
    names.length
      ? sb.from('rollcalls').select('id').is('room_id', null).in('type', [...ETUT_TURLER]).eq('status', 'yok').in('student_name', names)
      : Promise.resolve({ data: [] }),
  ]);
  const gece  = (geceRes.data || []).length;
  const namaz = (namazRes.data || []).length;
  const etut  = (etutSinifRes.data || []).length;
  document.getElementById('detayStats').innerHTML =
      statCard(DASH_ICONS.gece,  'Gece Devamsız',  gece,  '', 'danger') +
      statCard(DASH_ICONS.namaz, 'Namaz Devamsız', namaz, '', 'accent') +
      statCard(DASH_ICONS.etut,  'Etüt Devamsız',  etut,  '', 'warning');
}

// ── TAB ──
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.detail-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#odaDetay .view').forEach(v => v.classList.remove('active'));

  const tabs = { sakinler: 0, yoklamalar: 1 };
  document.querySelectorAll('.detail-tabs .tab-btn')[tabs[tab]].classList.add('active');
  document.getElementById('tab' + cap(tab)).classList.add('active');
}

// ── SAKİNLER ──
let sakinlerCache = [];
async function loadSakinler() {
  const { data } = await sb.from('room_students').select('*').eq('room_id', currentRoomId).order('student_name');
  const tbody = document.getElementById('sakinlerBody');
  const sakinler = data || [];
  sakinlerCache = sakinler;
  document.getElementById('detayOdaSakin').textContent = `${sakinler.length} öğrenci`;
  if (!sakinler.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">Oda boş</td></tr>`;
    return;
  }
  tbody.innerHTML = sakinler.map(s => {
    const sinifSelect = `<select class="input" style="padding:6px 10px;font-size:13px" onchange="setSakinEtutSinif('${s.id}', this.value)">
        <option value=""${!s.etut_sinif ? ' selected' : ''}>—</option>
        ${ETUT_SINIFLAR.map(es => `<option value="${es}"${s.etut_sinif === es ? ' selected' : ''}>${es}</option>`).join('')}
      </select>`;
    return `
    <tr>
      <td><strong>${s.student_name}</strong></td>
      <td>${s.class_name || '—'}</td>
      <td>${isAdmin ? sinifSelect : (s.etut_sinif || '—')}</td>
      <td class="admin-only" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openSakinDuzenle('${s.id}')">Düzenle</button>
        <button class="btn btn-ghost btn-sm" onclick="removeSakin('${s.id}')">Çıkar</button>
      </td>
    </tr>`;
  }).join('');
  if (!isAdmin) document.querySelectorAll('#sakinlerBody .admin-only').forEach(el => el.style.display = 'none');
}

async function removeSakin(id) {
  if (!confirm('Bu öğrenciyi odadan çıkarmak istediğinize emin misiniz?')) return;
  await sb.from('room_students').delete().eq('id', id);
  toast('Öğrenci çıkarıldı');
  loadSakinler();
}

// Öğrenciyi bir etüt sınıfına ata (etüt/kitap yoklaması bu gruba göre alınır)
async function setSakinEtutSinif(id, val) {
  const { error } = await sb.from('room_students').update({ etut_sinif: val || null }).eq('id', id);
  if (error) { toast('Hata: ' + error.message); return; }
  toast('Etüt sınıfı güncellendi ✓');
}

// Öğrenci ad + sınıf düzenleme
let duzenlenenSakinId = null;
function openSakinDuzenle(id) {
  const s = sakinlerCache.find(x => String(x.id) === String(id));
  if (!s) return;
  duzenlenenSakinId = id;
  document.getElementById('duzenleAd').value = s.student_name || '';
  document.getElementById('duzenleSinif').value = s.class_name || '';
  openModal('modalSakinDuzenle');
}

async function saveSakinDuzenle() {
  if (!duzenlenenSakinId) return;
  const ad = document.getElementById('duzenleAd').value.trim();
  const sinif = document.getElementById('duzenleSinif').value.trim();
  if (!ad) { toast('Ad gerekli'); return; }
  const { error } = await sb.from('room_students')
    .update({ student_name: ad, class_name: sinif || null })
    .eq('id', duzenlenenSakinId);
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalSakinDuzenle');
  toast('Öğrenci güncellendi ✓');
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

// ── YOKLAMA ALMA ──
async function loadYoklamaOdalar() {
  const { data } = await sb.from('rooms').select('id').order('id');
  const rooms = data || [];
  // Geçmiş filtresi: hem odalar hem etüt sınıfları (değer ön ekiyle ayrışır)
  document.getElementById('gecmisOda').innerHTML =
    '<option value="">Tümü</option>'
    + rooms.map(r => `<option value="oda:${r.id}">Oda ${r.id}</option>`).join('')
    + ETUT_SINIFLAR.map(s => `<option value="sinif:${s}">${s}</option>`).join('');
  document.getElementById('yoklamaListesi').style.display = 'none';
  onYoklamaTurChange();
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

let gecmisRows = [];

async function loadGecmisYoklama() {
  const tarih = document.getElementById('gecmisTarih').value;
  const wrap = document.getElementById('gecmisSonuc');
  if (!tarih) { wrap.innerHTML = '<p style="color:var(--muted)">Lütfen tarih seçin.</p>'; return; }

  wrap.innerHTML = '<div class="spinner"></div>';
  const { data, error } = await sb.from('rollcalls').select('*').eq('date', tarih).order('time').order('student_name');
  if (error) { wrap.innerHTML = `<p style="color:var(--danger)">Hata: ${error.message}</p>`; return; }
  gecmisRows = data || [];

  // Tür filtresini o günkü türlerle doldur
  const turler = [...new Set(gecmisRows.map(r => r.type))];
  const turSel = document.getElementById('gecmisTur');
  const cur = turSel.value;
  turSel.innerHTML = '<option value="">Tüm türler</option>' + turler.map(t => `<option value="${t}">${turLabel(t)}</option>`).join('');
  turSel.value = turler.includes(cur) ? cur : '';

  renderGecmis();
}

function renderGecmis() {
  const tarih = document.getElementById('gecmisTarih').value;
  const turFilt = document.getElementById('gecmisTur').value;
  const unitFilt = document.getElementById('gecmisOda').value;
  const sadeceDev = document.getElementById('gecmisSadeceDevamsiz').checked;
  const wrap = document.getElementById('gecmisSonuc');

  if (!gecmisRows.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><p>${tarih ? fmtDate(tarih) + ' için ' : ''}yoklama kaydı yok.</p></div>`;
    return;
  }

  const unitOf = r => r.room_id ? `oda:${r.room_id}` : `sinif:${r.etut_sinif || '?'}`;
  const groups = {};
  gecmisRows.forEach(r => {
    if (turFilt && r.type !== turFilt) return;
    if (unitFilt && unitOf(r) !== unitFilt) return;
    const key = `${r.type}|${unitOf(r)}|${r.time || ''}`;
    (groups[key] = groups[key] || []).push(r);
  });

  let entries = Object.entries(groups);
  if (sadeceDev) entries = entries.filter(([, list]) => list.some(r => r.status !== 'var'));
  entries.sort((a, b) => a[0].localeCompare(b[0], 'tr'));

  if (!entries.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><p>Bu filtreye uygun kayıt yok.</p></div>`;
    return;
  }

  const bulkBar = isAdmin
    ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-danger btn-sm" onclick="deleteGecmisGun()">${(turFilt || unitFilt) ? 'Bu filtredeki yoklamaları sil' : 'Bu güne ait tüm yoklamaları sil'}</button></div>`
    : '';

  let html = bulkBar;
  let sonTur = null;
  entries.forEach(([key, list]) => {
    const [type, unit, time] = key.split('|');
    if (type !== sonTur) { html += `<h3 style="margin:20px 0 10px;font-size:16px">${turLabel(type)}</h3>`; sonTur = type; }
    const unitLabel = unit.startsWith('oda:') ? `Oda ${unit.slice(4)}` : unit.slice(6);
    const yokSayisi = list.filter(r => r.status === 'yok').length;
    const izinSayisi = list.filter(r => r.status === 'izin').length;
    const ids = list.map(r => r.id);
    const delBtn = isAdmin
      ? `<button class="btn btn-danger btn-sm" onclick='deleteGecmisYoklama(${JSON.stringify(ids)})'>Sil</button>`
      : '';
    html += `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <strong style="font-size:16px">${unitLabel}</strong>
            ${time ? `<span style="color:var(--muted);font-size:13px;margin-left:6px">${time}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${yokSayisi ? `<span class="badge badge-danger">${yokSayisi} yok</span>` : ''}
            ${izinSayisi ? `<span class="badge badge-warning">${izinSayisi} izinli</span>` : ''}
            ${(!yokSayisi && !izinSayisi) ? `<span class="badge badge-success">Tam</span>` : ''}
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
  });
  wrap.innerHTML = html;
}

async function deleteGecmisYoklama(ids) {
  if (!confirm('Bu yoklama kaydını silmek istediğinize emin misiniz?')) return;
  const { error } = await sb.from('rollcalls').delete().in('id', ids);
  if (error) { toast('Hata: ' + error.message); return; }
  toast('Yoklama silindi');
  loadGecmisYoklama();
}

// Seçili güne (ve varsa oda/sınıf filtresine) ait TÜM yoklamaları sil
async function deleteGecmisGun() {
  const tarih = document.getElementById('gecmisTarih').value;
  const filt = document.getElementById('gecmisOda').value;
  const turFilt = document.getElementById('gecmisTur').value;
  if (!tarih) return;
  const parcalar = [];
  if (turFilt) parcalar.push(turLabel(turFilt));
  if (filt) parcalar.push(filt.startsWith('oda:') ? 'Oda ' + filt.slice(4) : filt.slice(6));
  const etiket = parcalar.length ? '(' + parcalar.join(' · ') + ') ' : '';
  if (!confirm(`${fmtDate(tarih)} ${etiket}için tüm yoklama kayıtları silinecek. Emin misiniz?`)) return;
  let q = sb.from('rollcalls').delete().eq('date', tarih);
  if (turFilt) q = q.eq('type', turFilt);
  if (filt.startsWith('oda:')) q = q.eq('room_id', filt.slice(4));
  else if (filt.startsWith('sinif:')) q = q.eq('etut_sinif', filt.slice(6));
  const { error } = await q;
  if (error) { toast('Hata: ' + error.message); return; }
  toast('Yoklamalar silindi');
  loadGecmisYoklama();
}

function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Tüm grupları (gece/namaz → odalar, etüt/kitap → etüt sınıfları) TEK ekranda getir.
let yoklamaTumuGroups = [];
let yoklamaTumuTur = '';

async function loadYoklamaTumu() {
  let tur = document.getElementById('yoklamaTur').value;
  const mode = yoklamaMode(tur);
  if (tur === '__ekstra__') {
    tur = document.getElementById('yoklamaEkstraAd').value.trim();
    if (!tur) { toast('Ekstra yoklama adı gerekli'); return; }
  }
  const tarih = document.getElementById('yoklamaTarih').value;
  if (!tarih) { toast('Tarih seçin'); return; }
  yoklamaTumuTur = tur;

  // Grupları kur
  let groups = [];
  if (mode === 'oda') {
    const [roomsRes, rsRes] = await Promise.all([
      sb.from('rooms').select('id').order('id'),
      sb.from('room_students').select('room_id, student_name').order('student_name'),
    ]);
    const rs = rsRes.data || [];
    groups = (roomsRes.data || []).map(r => ({
      key: 'oda:' + r.id, room_id: r.id, etut_sinif: null, label: 'Oda ' + r.id,
      students: rs.filter(s => s.room_id === r.id).map(s => s.student_name),
    }));
  } else {
    const rsRes = await sb.from('room_students').select('etut_sinif, student_name').not('etut_sinif', 'is', null).order('student_name');
    const rs = rsRes.data || [];
    groups = ETUT_SINIFLAR.map(s => ({
      key: 'sinif:' + s, room_id: null, etut_sinif: s, label: s,
      students: rs.filter(x => x.etut_sinif === s).map(x => x.student_name),
    }));
  }
  yoklamaTumuGroups = groups;

  // Mevcut kayıtlar (varsa ön-doldur → tekrar kaydetmek güncelleme olur)
  const { data: existing } = await sb.from('rollcalls')
    .select('student_name, status, note, room_id, etut_sinif')
    .eq('date', tarih).eq('type', tur);
  const exMap = {};
  (existing || []).forEach(r => {
    const gk = r.room_id ? 'oda:' + r.room_id : 'sinif:' + r.etut_sinif;
    exMap[gk + '|' + r.student_name] = { status: r.status, note: r.note || '' };
  });

  const seg = (cur, st, label) =>
    `<button class="yok-seg-btn${cur === st ? ' active' : ''}" data-st="${st}" onclick="markStatus(this,'${st}')" type="button">${label}</button>`;

  document.getElementById('yoklamaGruplar').innerHTML = groups.map(g => {
    if (!g.students.length) return '';
    return `
      <div class="card yok-group" data-group-key="${g.key}">
        <div class="yok-group-head">
          <span class="yok-group-title">${g.label}</span>
          <span class="yok-group-tally" data-tally>${g.students.length} öğrenci</span>
        </div>
        <div class="yok-list">
          ${g.students.map(name => {
            const pre = exMap[g.key + '|' + name] || { status: 'var', note: '' };
            const hasNote = !!pre.note;
            return `<div class="yok-row st-${pre.status}" data-name="${escapeAttr(name)}" data-status="${pre.status}">
              <span class="yok-name">${name}</span>
              <span class="yok-seg" role="group" aria-label="Durum">${seg(pre.status, 'var', 'Var')}${seg(pre.status, 'yok', 'Yok')}${seg(pre.status, 'izin', 'İzinli')}</span>
              <button class="yok-note-toggle${hasNote ? ' has-note' : ''}" title="Not" onclick="toggleYokNote(this)" type="button" aria-label="Not ekle">✎</button>
              <input class="input yok-note" data-note placeholder="Not..." value="${escapeAttr(pre.note)}"${hasNote ? '' : ' hidden'} />
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('') || '<div class="empty"><div class="empty-icon">📋</div><p>Bu türde gösterilecek öğrenci yok. (Etüt için öğrencilere etüt sınıfı atanmalı.)</p></div>';

  updateYoklamaOzet();
  document.getElementById('yoklamaListesi').style.display = 'block';
}

function markStatus(btn, status) {
  const row = btn.closest('.yok-row');
  row.querySelectorAll('.yok-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.st === status));
  row.dataset.status = status;
  row.classList.remove('st-var', 'st-yok', 'st-izin');
  row.classList.add('st-' + status);
  updateYoklamaOzet();
}

// Not alanını aç/kapa (varsayılan gizli, kalabalık yapmasın diye).
function toggleYokNote(btn) {
  const input = btn.closest('.yok-row').querySelector('.yok-note');
  if (!input) return;
  input.hidden = !input.hidden;
  if (!input.hidden) input.focus();
}

// Sticky özet barı + grup başlıklarındaki canlı "yok/izinli" sayacı.
function updateYoklamaOzet() {
  const groups = document.querySelectorAll('#yoklamaGruplar [data-group-key]');
  let topYok = 0, topIzin = 0, topOgr = 0;
  groups.forEach(gEl => {
    const rows = gEl.querySelectorAll('.yok-row');
    let gy = 0, gi = 0;
    rows.forEach(r => { if (r.dataset.status === 'yok') gy++; else if (r.dataset.status === 'izin') gi++; });
    topYok += gy; topIzin += gi; topOgr += rows.length;
    const tally = gEl.querySelector('[data-tally]');
    if (tally) tally.textContent = `${rows.length} öğrenci` + (gy || gi ? ` · ${gy} yok${gi ? ` · ${gi} izinli` : ''}` : '');
  });
  const ozet = document.getElementById('yoklamaOzet');
  if (ozet) ozet.innerHTML = `${groups.length} grup · ${topOgr} öğrenci` +
    (topYok || topIzin
      ? ` · <span class="ozet-yok">${topYok} yok</span>${topIzin ? ` · <span class="ozet-izin">${topIzin} izinli</span>` : ''}`
      : ' · tümü var');
}

function onYoklamaTurChange() {
  const isEkstra = document.getElementById('yoklamaTur').value === '__ekstra__';
  document.getElementById('yoklamaEkstraWrap').style.display = isEkstra ? '' : 'none';
  document.getElementById('yoklamaListesi').style.display = 'none';
}

async function saveYoklamaTumu() {
  const tur = yoklamaTumuTur;
  if (!tur) return;
  const tarih = document.getElementById('yoklamaTarih').value;
  const saat = document.getElementById('yoklamaSaat').value;
  const by = currentUser?.email || 'misafir';

  const records = [];
  document.querySelectorAll('#yoklamaGruplar [data-group-key]').forEach(groupEl => {
    const g = yoklamaTumuGroups.find(x => x.key === groupEl.dataset.groupKey);
    if (!g) return;
    groupEl.querySelectorAll('.yok-row').forEach(tr => {
      records.push({
        room_id: g.room_id, etut_sinif: g.etut_sinif, type: tur, date: tarih, time: saat,
        student_name: tr.dataset.name, status: tr.dataset.status || 'var',
        note: tr.querySelector('[data-note]')?.value || '', created_by: by,
      });
    });
  });
  if (!records.length) { toast('Kaydedilecek öğrenci yok'); return; }

  // Aynı tarih+tür için önceki kayıtları sil → tekrar kaydetmek KOPYA değil GÜNCELLEME olur
  const del = await sb.from('rollcalls').delete().eq('date', tarih).eq('type', tur);
  if (del.error) { toast('Hata: ' + del.error.message); return; }
  const ins = await sb.from('rollcalls').insert(records);
  if (ins.error) { toast('Hata: ' + ins.error.message); return; }
  toast(`Yoklama kaydedildi ✓ (${records.length} öğrenci)`);
}

// ── ARAMA ──
async function aramaYap() {
  const q = document.getElementById('aramaInput').value.trim();
  const wrap = document.getElementById('aramaResults');
  if (q.length < 2) { wrap.innerHTML = ''; return; }

  const { data: students } = await sb.from('room_students').select('student_name, room_id, class_name').ilike('student_name', `%${q}%`).limit(20);
  if (!students?.length) { wrap.innerHTML = '<p style="color:var(--muted)">Sonuç bulunamadı.</p>'; return; }

  const roomIds = [...new Set(students.map(s => s.room_id))];
  const { data: rollData } = await sb.from('rollcalls').select('student_name, status').in('room_id', roomIds);
  const rollcalls = rollData || [];

  wrap.innerHTML = students.map(s => {
    const yok = rollcalls.filter(r => r.student_name === s.student_name && r.status === 'yok').length;
    return `
      <div class="card" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <strong>${s.student_name}</strong>
          <span style="color:var(--muted);font-size:13px;margin-left:8px">${s.class_name||''}</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span class="badge badge-accent">Oda ${s.room_id}</span>
          <span class="badge ${yok > 5 ? 'badge-danger' : yok > 2 ? 'badge-warning' : 'badge-neutral'}">Devamsız: ${yok}</span>
          <button class="btn btn-ghost btn-sm" onclick="goToRoom('${s.room_id}')">Odaya Git</button>
        </div>
      </div>`;
  }).join('');
}

// ── MODAL HELPERS ──
function openOdaModal() {
  ['odaNoInput','odaKatInput','odaAciklamaInput'].forEach(id => document.getElementById(id).value = '');
  openModal('modalOda');
}

let ataOgrenciList = [];   // bu odaya atanabilir tüm camdata öğrencileri
let ataRenderedList = [];  // o an listede gösterilenler (filtreli)
let selectedAtaIdx = -1;   // listede seçili öğrencinin index'i

async function openOgrenciAtaModal() {
  document.getElementById('ataSearch').value = '';
  document.getElementById('ataEtutSinif').value = '';
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
  const box = document.getElementById('ataSelect');
  if (!list.length) {
    box.innerHTML = '<div class="picker-empty">Eşleşen öğrenci yok</div>';
    selectedAtaIdx = -1;
    return;
  }
  box.innerHTML = list.map((s, i) =>
    `<button type="button" class="picker-item${i === 0 ? ' selected' : ''}" data-idx="${i}" onclick="selectAtaOgrenci(${i})">
      <span>${escapeHtml(s.name)}</span>${s.class_name ? `<span class="picker-sub">${escapeHtml(s.class_name)}</span>` : ''}
    </button>`
  ).join('');
  selectedAtaIdx = 0;
}

function selectAtaOgrenci(i) {
  selectedAtaIdx = i;
  document.querySelectorAll('#ataSelect .picker-item').forEach(el => {
    el.classList.toggle('selected', Number(el.dataset.idx) === i);
  });
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

async function saveOgrenciAta() {
  const ogrenci = ataRenderedList[selectedAtaIdx];
  if (!ogrenci) { toast('Lütfen bir öğrenci seçin'); return; }
  const etutSinif = document.getElementById('ataEtutSinif').value || null;
  const { error } = await sb.from('room_students').insert({ room_id: currentRoomId, student_name: ogrenci.name, class_name: ogrenci.class_name || null, etut_sinif: etutSinif });
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

function openOdaRenameModal() {
  document.getElementById('odaYeniNo').value = currentRoomId;
  openModal('modalOdaRename');
}

// Oda numarasını değiştir: yeni odayı oluştur, tüm kayıtları taşı, eskiyi sil.
async function saveOdaRename() {
  const eskiId = currentRoomId;
  const yeni = document.getElementById('odaYeniNo').value.trim();
  if (!yeni) { toast('Yeni numara gerekli'); return; }
  if (yeni === eskiId) { closeModal('modalOdaRename'); return; }

  const { data: cakisma } = await sb.from('rooms').select('id').eq('id', yeni).maybeSingle();
  if (cakisma) { toast('Bu numarada zaten bir oda var'); return; }

  const { data: eski, error: e0 } = await sb.from('rooms').select('*').eq('id', eskiId).single();
  if (e0) { toast('Hata: ' + e0.message); return; }

  // 1) Yeni oda satırı (kat, numaranın ilk hanesinden yeniden hesaplanır)
  const floor = /^\d/.test(yeni) ? parseInt(yeni[0]) : eski.floor;
  const r1 = await sb.from('rooms').insert({ id: yeni, floor, name: eski.name || null });
  if (r1.error) { toast('Hata: ' + r1.error.message); return; }

  // 2) Bağlı kayıtları yeni numaraya taşı
  for (const t of ['room_students', 'rollcalls', 'penalties', 'warnings']) {
    const u = await sb.from(t).update({ room_id: yeni }).eq('room_id', eskiId);
    if (u.error) { toast(`Hata (${t}): ` + u.error.message); return; }
  }

  // 3) Eski oda satırını sil
  await sb.from('rooms').delete().eq('id', eskiId);

  closeModal('modalOdaRename');
  toast(`Oda ${eskiId} → ${yeni} ✓`);
  currentRoomId = yeni;
  document.getElementById('detayOdaNo').textContent = `Oda ${yeni}`;
  await refreshDetayAll();
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
  namaz_sabah: '🕌 Sabah Namazı',
  namaz_aksam: '🕌 Akşam Namazı',
  namaz_yatsi: '🕌 Yatsı Namazı',
  etut1: '1. Etüt',
  etut2: '2. Etüt',
  etut3: '3. Etüt',
  kitap: '📖 Kitap Okuma',
  ders: '📚 Ders', // eski kayıtlar için
};

// Etüt/kitap yoklaması SINIF bazlı alınır (odadan bağımsız); gece ise ODA bazlı.
const ETUT_SINIFLAR = ['Sınıf 1', 'Sınıf 2'];
const SINIF_TURLER = new Set(['etut1', 'etut2', 'etut3', 'kitap']);
// Devamsızlık sayımı için: namaz türleri ve (eski 'ders' dahil) etüt türleri.
const NAMAZ_TURLER = ['namaz_sabah', 'namaz_aksam', 'namaz_yatsi'];
const ETUT_TURLER = new Set(['etut1', 'etut2', 'etut3', 'kitap', 'ders']);
function isNamaz(t) { return typeof t === 'string' && t.startsWith('namaz'); }
function yoklamaMode(tur) { return SINIF_TURLER.has(tur) ? 'sinif' : 'oda'; }
function turLabel(type) {
  return TUR_LABELS[type] || type || '—';
}

// ── DASHBOARD ÖZET KARTLARI ──
const DASH_ICONS = {
  oda:   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V6l7-3 7 3v15M9 21v-5h6v5"/></svg>',
  ogr:   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>',
  gece:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  namaz: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16M5 21v-7c0-4 3-6 7-6s7 2 7 6v7M12 8V4m0 0c-.9.7-.9 1.8 0 2.5.9-.7.9-1.8 0-2.5z"/></svg>',
  etut:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v13M3 5.5h5A3 3 0 0 1 12 7a3 3 0 0 1 4-1.5h5V18h-5a3 3 0 0 0-4 1.5A3 3 0 0 0 8 18H3z"/></svg>',
  toplam:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H6l6 8-6 8h12"/></svg>',
};
function statCard(svg, label, value, ctx, sev) {
  const hot = sev && Number(value) > 0;
  return `<div class="stat-card${hot ? ' tint-' + sev : ''}">
      <span class="stat-ic">${svg}</span>
      <span class="stat-body">
        <span class="stat-label">${label}</span>
        <span class="stat-value${hot ? ' ' + sev : ''}">${value}</span>
        ${ctx ? `<span class="stat-ctx">${ctx}</span>` : ''}
      </span>
    </div>`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
