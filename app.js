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
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    isAdmin = true;
    showApp();
  } else {
    showAuth();
  }
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
  showApp();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  isAdmin = false;
  location.reload();
}

function showGuestView() {
  isAdmin = false;
  showApp();
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('mainNav').style.display = 'none';
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('mainNav').style.display = 'flex';

  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    document.getElementById('navYonetim').style.display = '';
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  showPage('odalar');
}

// ── NAVIGATION ──
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page' + cap(name)).classList.add('active');
  const navBtn = document.getElementById('nav' + cap(name));
  if (navBtn) navBtn.classList.add('active');

  if (name === 'odalar') loadRooms();
  if (name === 'yoklama') loadYoklamaOdalar();
  if (name === 'arama') document.getElementById('aramaResults').innerHTML = '';
  if (name === 'yonetim') {}
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

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
    const turBadge = r.type === 'gece' ? '🌙 Gece' : '📚 Ders';
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
  const sel = document.getElementById('yoklamaOda');
  sel.innerHTML = (data||[]).map(r => `<option value="${r.id}">Oda ${r.id}</option>`).join('');
  document.getElementById('yoklamaListesi').style.display = 'none';
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
          <button class="status-btn var" onclick="setStatus(${i},'var')">Var</button>
          <button class="status-btn yok" onclick="setStatus(${i},'yok')">Yok</button>
          <button class="status-btn izin" onclick="setStatus(${i},'izin')">İzinli</button>
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
  row.querySelector(`.status-btn.${status === 'izin' ? 'izin' : status}`).classList.add(status === 'izin' ? 'izin' : status);
  row.dataset.status = status;
}

async function saveYoklama() {
  const roomId = document.getElementById('yoklamaOda').value;
  const tur = document.getElementById('yoklamaTur').value;
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

function openOgrenciAtaModal() {
  document.getElementById('ataAd').value = '';
  document.getElementById('ataSinif').value = '';
  openModal('modalOgrenciAta');
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
  const ad = document.getElementById('ataAd').value.trim();
  const sinif = document.getElementById('ataSinif').value.trim();
  if (!ad) { toast('Öğrenci adı gerekli'); return; }
  const { error } = await sb.from('room_students').insert({ room_id: currentRoomId, student_name: ad, class_name: sinif || null });
  if (error) { toast('Hata: ' + error.message); return; }
  closeModal('modalOgrenciAta');
  toast(`${ad} odaya eklendi ✓`);
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
async function loadCamdataOgrenciler() {
  const { data, error } = await sb.from('app_state').select('state').eq('id', 'main').single();
  if (error || !data) { toast('Camdata verisi alınamadı'); return; }

  let classes = [];
  try {
    const state = JSON.parse(data.state);
    classes = state.classes || state.siniflar || [];
  } catch {
    toast('Camdata verisi okunamadı');
    return;
  }

  const students = classes.flatMap(c => {
    const sinifAd = c.name || c.ad || '';
    const ogrenciler = c.students || c.ogrenciler || [];
    return ogrenciler.map(o => ({ name: typeof o === 'string' ? o : (o.name || o.ad), class_name: sinifAd }));
  }).filter(s => s.name);

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

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
