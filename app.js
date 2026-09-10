// TubeInsight — 화면 로직 (① 분석 · ② 기획/나레이션 · ③ 제작/업로드)
'use strict';

const state = {
  status: null, analysis: null, plan: null, history: { analyses: [], plans: [] },
  producePlan: null, media: {}, render: null, youtube: null, env: null,
  fullAudio: null, llmPreference: 'auto', mode: 'analyze',
  marketing: { currentData: null, source: 'custom' },
  channel: { currentData: null, history: [] },
  planReset: false, produceReset: false,
  clearedLists: {
    analysisHistory: false,
    planHistory: false,
    producePlan: false,
    channelAnalysis: false,
    channelHistory: false,
  },
};
const FEATURES = { producer: true };  // ③ 제작·업로드 탭 활성화
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 공용 유틸 ──────────────────────────────────────────────────────────

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* 빈 응답 */ }
  if (!res.ok || data.error) throw new Error(data.error || `서버 오류 (${res.status})`);
  return data;
}

// 백그라운드 작업 폴링: {status:'queued', job_id} 이면 완료까지 기다리고 결과를 돌려줌
async function runJob(resp, onProgress) {
  if (resp.status === 'success' || resp.status === 'cached' || resp.cached) return resp.data;
  if (resp.status !== 'queued') throw new Error(resp.error || '알 수 없는 응답');
  for (;;) {
    await sleep(900);
    const { job } = await api(`/api/jobs/${resp.job_id}`);
    if (onProgress) onProgress(job);
    if (job.status === 'done') return job.result;
    if (job.status === 'cancelled') throw new Error(job.error || '작업이 취소되었습니다.');
    if (job.status === 'error') throw new Error(job.error || '작업 실패');
  }
}

function setProgress(prefix, job) {
  const box = $(`${prefix}ProgressBox`), fill = $(`${prefix}ProgressFill`), msg = $(`${prefix}ProgressMsg`);
  if (!box) return;
  box.style.display = 'block';
  fill.style.width = `${Math.max(2, job.progress || 0)}%`;
  msg.textContent = job.message || '';
  const steps = [...box.querySelectorAll('.step-item')];
  let currentIdx = steps.findIndex((s) => (s.dataset.steps || '').split(',').includes(job.step));
  if (job.status === 'done') currentIdx = steps.length;
  steps.forEach((s, i) => {
    s.classList.toggle('done', i < currentIdx);
    s.classList.toggle('active', i === currentIdx);
  });
}
function hideProgress(prefix) { const b = $(`${prefix}ProgressBox`); if (b) b.style.display = 'none'; }

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function md(text) {
  const html = window.marked ? window.marked.parse(text || '') : escapeHtml(text || '');
  return window.DOMPurify ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html;
}
function icons() { if (window.lucide) window.lucide.createIcons(); }

function showToast(msg, isError = false) {
  const t = $('toast'); $('toastMsg').textContent = msg;
  t.classList.toggle('error', isError);
  $('toastIcon').setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle'); icons();
  t.classList.add('show'); clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2800);
}
function copyText(text, okMsg = '복사했습니다.') {
  if (!text) { showToast('복사할 내용이 없습니다.', true); return; }
  navigator.clipboard.writeText(text).then(() => showToast(okMsg)).catch(() => showToast('복사 실패 — 브라우저 권한을 확인하세요.', true));
}
function downloadText(filename, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '억';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '만';
  return Number(n).toLocaleString();
}
function fmtDate(s) { return s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : (s || ''); }
function fmtTs(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function setBusy(btn, busy, labelHtml) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) { btn.dataset.orig = btn.innerHTML; btn.innerHTML = `<i data-lucide="loader-2" class="spin w-4 h-4"></i><span>${labelHtml}</span>`; }
  else if (btn.dataset.orig) { btn.innerHTML = btn.dataset.orig; }
  icons();
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
}

function tiConfirm({
  title = '확인',
  subtitle = '',
  icon = 'help-circle',
  lines = [],
  html = '',
  okText = '확인하고 진행',
  cancelText = '취소',
  okClass = 'btn-primary'
} = {}) {
  return new Promise((resolve) => {
    const modal = $('confirmModal');
    if (!modal) {
      resolve(window.confirm(lines.length ? lines.filter(Boolean).join('\n') : (title + (subtitle ? '\n' + subtitle : ''))));
      return;
    }
    $('confirmModalTitle').textContent = title;
    const subEl = $('confirmModalSubtitle');
    if (subEl) {
      subEl.textContent = subtitle;
      subEl.style.display = subtitle ? 'block' : 'none';
    }
    const iconEl = $('confirmModalIcon');
    if (iconEl) iconEl.setAttribute('data-lucide', icon);

    const bodyEl = $('confirmModalBody');
    if (html) {
      bodyEl.innerHTML = html;
    } else {
      bodyEl.innerHTML = lines.map(line => {
        if (!line) return '<div class="h-2"></div>';
        const isBullet = line.startsWith('•') || line.startsWith('-');
        const isHighlight = line.includes('과금') || line.includes('비용') || line.includes('무료') || line.includes('예상');
        return `<div class="${isBullet ? 'pl-2 py-0.5 text-neutral-800' : 'text-neutral-600 font-medium'} ${isHighlight ? 'font-semibold text-neutral-900' : ''}">${escapeHtml(line)}</div>`;
      }).join('');
    }

    const okBtn = $('btnConfirmOk');
    okBtn.className = `btn ${okClass} !py-1.5 px-4 text-xs font-semibold`;
    okBtn.innerHTML = `<span>${escapeHtml(okText)}</span>`;

    const cancelBtn = $('btnConfirmCancel');
    cancelBtn.innerHTML = `<span>${escapeHtml(cancelText)}</span>`;

    let done = false;
    function finish(result) {
      if (done) return;
      done = true;
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      $('btnConfirmClose')?.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onOk(e) { if (e) { e.preventDefault(); e.stopPropagation(); } finish(true); }
    function onCancel(e) { if (e) { e.preventDefault(); e.stopPropagation(); } finish(false); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }
    function onBackdrop(e) {
      if (e.target === modal) { e.preventDefault(); e.stopPropagation(); finish(false); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    $('btnConfirmClose')?.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);

    modal.classList.add('open');
    icons();
    setTimeout(() => okBtn.focus(), 50);
  });
}

// ── 초기화 ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  icons();
  if (!FEATURES.producer) { $('btnModeProduce').style.display = 'none'; $('btnGoProduce').style.display = 'none'; }
  bindHeader(); bindAnalyzer(); bindGenerator(); bindVoiceModal(); bindProducer(); bindMarketing(); bindChannelStudio();
  await refreshStatus(); setInterval(refreshStatus, 15000);
  await Promise.all([loadHistory(), loadVoiceProfiles(), loadChannelHistory()]);
  const first = state.history.analyses.find((a) => a.id === 'ws1Clj0vOAM') || state.history.analyses[0];
  if (first) loadVideoData(first.id, first.id === 'ws1Clj0vOAM');
  const qp = new URLSearchParams(location.search).get('q');
  if (qp) { $('urlInput').value = qp; searchBenchmarks(qp); }
  const hashMode = (location.hash || '').replace('#', '');
  if (['channel', 'generate', 'produce', 'marketing'].includes(hashMode)) setMode(hashMode);
});

// ── 상단: 모드 전환 · 백엔드 상태 · 환경 진단 ──────────────────────────

function setMode(mode) {
  if (mode === 'produce' && !FEATURES.producer) mode = 'generate';
  state.mode = mode;
  const map = { channel: 'channelSection', analyze: 'analyzerSection', generate: 'generatorSection', produce: 'producerSection', marketing: 'marketingSection' };
  Object.entries(map).forEach(([m, id]) => { 
    const el = $(id);
    if (el) el.style.display = m === mode ? 'block' : 'none'; 
  });
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'channel') {
    loadChannelHistory(); checkChannelYtStatus();
  }
  if (mode === 'generate') {
    loadVoiceProfiles(); fillReferenceSelect(); loadStyleGuides();
    if (!state.plan && !state.planReset && state.history.plans.length) {  // 처음 들어오면 가장 최근 기획서를 보여줌
      api(`/api/plan?id=${encodeURIComponent(state.history.plans[0].plan_id)}`).then((r) => renderPlan(r.data)).catch(() => {});
    } else if (!state.plan) {
      if ($('genEmptyState')) $('genEmptyState').style.display = 'block';
      if ($('genResultsSection')) $('genResultsSection').style.display = 'none';
    }
  }
  history.replaceState(null, '', mode === 'analyze' ? location.pathname : `#${mode}`);
  if (mode === 'produce') {
    fillProducePlanSelect();
    const curVal = $('producePlanSelect')?.value;
    if (curVal && curVal !== '__reset__' && (!state.producePlan || state.producePlan.plan_id !== curVal) && !state.produceReset) {
      loadProducePlan(curVal);
    }
  }
  if (mode === 'marketing') { syncMarketingWithCurrentState(); }
  window.scrollTo({ top: 0, behavior: 'smooth' }); icons();
}

function bindHeader() {
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('lmsPill').addEventListener('click', () => selectBackend('lmstudio'));
  $('ollamaPill').addEventListener('click', () => selectBackend('ollama'));
  $('btnEnv').addEventListener('click', openEnvModal);
  $('btnCloseEnv').addEventListener('click', () => $('envModal').classList.remove('open'));
  $('envModal').addEventListener('click', (e) => { if (e.target === $('envModal')) $('envModal').classList.remove('open'); });
}

async function refreshStatus() {
  const pills = { lmstudio: { pill: $('lmsPill'), label: $('lmsLabel'), name: 'LM Studio' }, ollama: { pill: $('ollamaPill'), label: $('ollamaLabel'), name: 'Ollama' } };
  try {
    const st = await api('/api/status');
    state.status = st; state.llmPreference = st.llm.preference || 'auto';
    $('appVersion').textContent = `v${st.version}`;
    for (const key of ['lmstudio', 'ollama']) {
      const p = pills[key], b = st.backends[key] || {}, active = st.llm.active === key, chosen = state.llmPreference === key;
      p.pill.className = 'pill' + (b.online ? ' online' : '') + (active ? ' active' : '') + (b.online && !b.model ? ' nomodel' : '') + (chosen && !b.online ? ' chosen-offline' : '');
      let text = p.name;
      if (active && (st.llm.model || b.model)) text += ' · ' + String(st.llm.model || b.model).split('/').pop().replace(/\.gguf$/i, '').slice(0, 28);
      else if (chosen && !b.online) text += ' · 꺼짐';
      else if (b.online && !b.model) text += ' · 모델 없음';
      p.label.textContent = text;
      p.pill.title = !b.online
        ? (chosen ? `${p.name}을(를) 선택했지만 꺼져 있습니다. 실행하거나 다시 클릭해 자동 모드로 돌아가세요.` : `${p.name} 꺼짐 · 클릭하면 이 백엔드를 사용합니다`)
        : active ? `${p.name} 사용 중 (${state.llmPreference === 'auto' ? '자동 감지' : '수동 선택'} · ${b.model || '모델 없음'})${chosen ? ' — 다시 클릭하면 자동 모드' : ''}`
        : b.model ? `${p.name} 실행 중 (대기) · 클릭하면 이 백엔드를 사용합니다` : `${p.name} 실행 중 — 모델 설치 필요 (ollama pull gemma3)`;
    }
  } catch (e) {
    for (const key of ['lmstudio', 'ollama']) { pills[key].pill.className = 'pill'; pills[key].label.textContent = pills[key].name; pills[key].pill.title = '서버 연결 대기 중'; }
  }
}

async function selectBackend(key) {
  const next = state.llmPreference === key ? 'auto' : key;
  try {
    await api('/api/llm/select', { backend: next });
    showToast(next === 'auto' ? '자동 감지 모드 (LM Studio 우선)' : `${key === 'lmstudio' ? 'LM Studio' : 'Ollama'}를 사용합니다.`);
  } catch (e) { showToast(e.message, true); }
  refreshStatus();
}

function openEnvModal() {
  const st = state.status; const body = $('envModalBody');
  if (!st) { body.innerHTML = '<p>서버 상태를 불러오지 못했습니다.</p>'; }
  else {
    const row = (label, ok, detail, hint) => `
      <div class="flex items-start justify-between gap-3 py-1.5 border-b border-neutral-100">
        <div><div class="font-semibold text-neutral-800">${label}</div>${detail ? `<div class="text-[11px] text-neutral-500">${escapeHtml(detail)}</div>` : ''}${!ok && hint ? `<div class="text-[11px] text-amber-700 mt-0.5">${escapeHtml(hint)}</div>` : ''}</div>
        <span class="badge ${ok ? 'badge-ok' : 'badge-warn'} shrink-0">${ok ? '정상' : '확인 필요'}</span></div>`;
    const lms = st.backends.lmstudio, oll = st.backends.ollama;
    body.innerHTML = [
      row('TubeInsight', true, `v${st.version} · Python ${st.python}`),
      row('yt-dlp (유튜브 수집)', !!st.yt_dlp, st.yt_dlp ? `버전 ${st.yt_dlp}` : '설치되지 않음', 'pip3 install -r requirements.txt'),
      row('LM Studio', lms.online && !!lms.model, lms.online ? '' : '꺼짐 (포트 1234)', 'LM Studio → Developer → Local Server 시작 후 모델 로드') + modelPicker('lmstudio', lms),
      row('Ollama', oll.online && !!oll.model, oll.online ? '' : '꺼짐 (포트 11434)', oll.online ? 'ollama pull gemma3' : 'Ollama 앱 실행') + modelPicker('ollama', oll),
      row('현재 AI 백엔드', st.llm.online, st.llm.online ? `${st.llm.backend} · ${st.llm.model}` : '사용 가능한 로컬 AI 없음', 'LM Studio 또는 Ollama 중 하나를 켜세요'),
      row('나레이션 (Edge-TTS)', true, '무료 · 인터넷 필요'),
      row('보이스 클로닝 (선택)', st.tts.clone_available, st.tts.clone_available ? 'torch + qwen-tts 설치됨' : '미설치 — 내 목소리 등록 시 기본 음성으로 대체', 'pip3 install torch qwen-tts (용량 큼)'),
      row('ffmpeg (영상 합성)', st.render.ffmpeg, st.render.ffmpeg ? '사용 가능' : '없음', 'pip3 install imageio-ffmpeg'),
      row('한글 자막 폰트', !!st.render.font, st.render.font || '없음 — 자막 굽기 비활성', '나눔고딕 등 한글 TTF 설치'),
      row('Gemini API 키 (이미지 생성, 선택)', st.render.gemini_key_set, st.render.gemini_key_set ? '저장됨' : '없음 — 이미지를 직접 넣어 사용', '③ 탭 환경 카드에서 저장'),
      row('Threads API (자동 포스팅, 선택)', !!st.threads?.configured, st.threads?.configured ? (st.threads?.mock ? '테스트(Mock) 모드 활성' : `연결됨 (${st.threads?.user_id_masked || '설정됨'})`) : '미설정 — 포스팅 시 안내', '.env 파일에 THREADS_USER_ID 및 THREADS_ACCESS_TOKEN 입력'),
      row('X(트위터) API v2 (자동 포스팅, 선택)', !!st.twitter?.configured, st.twitter?.configured ? (st.twitter?.mock ? '테스트(Mock) 모드 활성' : `연결됨 (${st.twitter?.auth_mode || 'OAuth'})`) : '미설정 — 포스팅 시 안내', '.env 파일에 TWITTER_API_KEY / TWITTER_ACCESS_TOKEN 등 입력'),
      row('YouTube 업로드 (선택)', st.youtube.libs && st.youtube.client_secret, st.youtube.libs ? (st.youtube.client_secret ? (st.youtube.authorized ? '계정 연결됨' : 'client_secret.json 있음 · 계정 미연결') : 'client_secret.json 없음') : '구글 API 패키지 미설치', st.youtube.libs ? 'data/youtube/client_secret.json 저장 후 ③ 탭에서 연결' : 'pip3 install google-api-python-client google-auth-oauthlib'),
    ].join('');
  }
  body.querySelectorAll('[data-model-backend]').forEach((sel) => sel.addEventListener('change', async () => {
    try { await api('/api/llm/select', { backend: sel.dataset.modelBackend, model: sel.value }); showToast(`사용할 모델을 '${sel.value.split('/').pop()}'(으)로 바꿨습니다.`); await refreshStatus(); openEnvModal(); }
    catch (e) { showToast(e.message, true); }
  }));
  $('envModal').classList.add('open'); icons();
}

// 백엔드에 모델이 여러 개면 어떤 모델을 쓸지 고르는 드롭다운
function modelPicker(key, b) {
  if (!b.online || !b.models || b.models.length === 0) return '';
  const active = state.status?.llm?.active === key ? state.status.llm.model : b.model;
  if (b.models.length === 1) return `<div class="text-[11px] text-neutral-500 -mt-1 mb-1.5 pl-0.5">모델: ${escapeHtml(b.models[0])}</div>`;
  return `<div class="flex items-center gap-2 -mt-1 mb-1.5 pl-0.5"><span class="text-[11px] text-neutral-500 shrink-0">사용할 모델</span>
    <select data-model-backend="${key}" class="input px-2 py-1 text-[11px] flex-1">${b.models.map((m) => `<option value="${escapeHtml(m)}" ${m === active ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select></div>`;
}

// ── 이력 ──────────────────────────────────────────────────────────────

async function loadHistory() {
  try {
    const h = await api('/api/history');
    state.history = { analyses: h.analyses || [], plans: h.plans || [] };
  } catch (e) { /* 무시 */ }
  const aSel = $('analysisHistorySelect');
  if (aSel) {
    if (state.clearedLists?.analysisHistory) {
      aSel.innerHTML = '<option value="">불러오기…</option><option value="__reset__">초기화</option>';
      aSel.value = '';
    } else {
      const curA = aSel.value;
      aSel.innerHTML = '<option value="">불러오기…</option>' + state.history.analyses.map((a) =>
        `<option value="${a.id}">${escapeHtml((a.title || a.id).slice(0, 40))} · ${fmtNum(a.view_count)}회</option>`).join('') +
        '<option value="__reset__">초기화</option>';
      if (curA && curA !== '__reset__') aSel.value = curA;
    }
  }
  fillReferenceSelect();
  fillPlanSelect($('planHistorySelect'), true);
  fillProducePlanSelect();
  fillChannelAnalysisSelect();
}
function fillReferenceSelect() {
  const sel = $('referenceSelect'); const cur = sel.value || (state.analysis && state.analysis.id);
  const list = state.history.analyses.filter((a) => a.ai_ok !== false);
  sel.innerHTML = list.map((a) => `<option value="${a.id}">${escapeHtml((a.title || a.id).slice(0, 34))}</option>`).join('') || '<option value="">분석된 영상 없음 (기본 공식 사용)</option>';
  if (cur && list.some((a) => a.id === cur)) sel.value = cur;
}
function fillPlanSelect(sel, withPlaceholder) {
  if (!sel) return;
  if (state.clearedLists?.planHistory) {
    sel.innerHTML = (withPlaceholder ? '<option value="">불러오기…</option>' : '') + '<option value="__reset__">초기화</option>';
    sel.value = '';
    return;
  }
  const cur = sel.value;
  sel.innerHTML = (withPlaceholder ? '<option value="">불러오기…</option>' : '') + state.history.plans.map((p) =>
    `<option value="${escapeHtml(p.plan_id)}">${escapeHtml((p.topic || p.plan_id).slice(0, 30))} · ${p.num_scenes}씬 ${p.aspect_ratio || ''}${p.has_audio ? ' · 🔊' : ''} · ${fmtTs(p.created_at)}</option>`).join('') +
    '<option value="__reset__">초기화</option>';
  if (cur && cur !== '__reset__') sel.value = cur;
}
function fillProducePlanSelect() {
  const sel = $('producePlanSelect');
  if (!sel) return;
  if (state.clearedLists?.producePlan) {
    sel.innerHTML = '<option value="">기획서 선택…</option><option value="__reset__">초기화</option>';
    sel.value = '';
    return;
  }
  const cur = sel.value;
  const plans = state.history?.plans || [];
  let html = '<option value="">기획서 선택…</option>';
  if (plans.length) {
    html += plans.map((p) =>
      `<option value="${escapeHtml(p.plan_id)}">${escapeHtml((p.topic || p.plan_id).slice(0, 30))} · ${p.num_scenes}씬 ${p.aspect_ratio || ''}${p.has_audio ? ' · 🔊' : ''} · ${fmtTs(p.created_at)}</option>`).join('');
  } else {
    html += '<option value="" disabled>기획서가 없습니다 — ② 탭에서 먼저 만들어주세요</option>';
  }
  html += '<option value="__reset__">초기화</option>';
  sel.innerHTML = html;

  let remembered = null; try { remembered = localStorage.getItem('ti_last_plan'); } catch (e) {}
  if (cur && cur !== '__reset__' && plans.some((p) => p.plan_id === cur)) {
    sel.value = cur;
  } else if (!state.produceReset) {
    if (state.producePlan && plans.some((p) => p.plan_id === state.producePlan.plan_id)) sel.value = state.producePlan.plan_id;
    else if (state.plan && plans.some((p) => p.plan_id === state.plan.plan_id)) sel.value = state.plan.plan_id;
    else if (remembered && plans.some((p) => p.plan_id === remembered)) sel.value = remembered;
    else if (plans.length) sel.value = plans[0].plan_id;
  }
}
function fillChannelAnalysisSelect() {
  const sel = $('channelAnalysisSelect');
  if (!sel) return;
  if (state.clearedLists?.channelAnalysis) {
    sel.innerHTML = '<option value="">01 분석 영상에서 주제 가져오기…</option><option value="__reset__">초기화</option>';
    sel.value = '';
    return;
  }
  const cur = sel.value;
  const list = state.history?.analyses || [];
  let html = '<option value="">01 분석 영상에서 주제 가져오기…</option>';
  list.forEach((a) => {
    html += `<option value="${escapeHtml(a.id)}">${escapeHtml((a.title || a.id).slice(0, 32))} · ${fmtNum(a.view_count)}회</option>`;
  });
  html += '<option value="__reset__">초기화</option>';
  sel.innerHTML = html;
  if (cur && cur !== '__reset__' && list.some((a) => a.id === cur)) sel.value = cur;
}

// ══════════════════════════ ① 영상 분석 ══════════════════════════

function bindAnalyzer() {
  $('btnClear').addEventListener('click', () => { $('urlInput').value = ''; $('urlInput').focus(); });
  $('urlInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') $('btnAnalyze').click(); });
  $('btnAnalyze').addEventListener('click', () => {
    const q = $('urlInput').value.trim();
    if (!q) { showToast('유튜브 링크나 검색 키워드를 입력해주세요.', true); return; }
    const isUrl = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)[A-Za-z0-9_-]{11}/.test(q) || /^[A-Za-z0-9_-]{11}$/.test(q);
    if (isUrl) startAnalysis(q.length === 11 ? `https://youtu.be/${q}` : q, $('forceReanalyze').checked);
    else searchBenchmarks(q);
  });
  $('btnCloseSearch')?.addEventListener('click', () => { $('searchResultsBox').style.display = 'none'; });
  $('btnRetryAnalysis').addEventListener('click', () => { if (state.analysis) startAnalysis(state.analysis.url || `https://youtu.be/${state.analysis.id}`, true); });
  document.querySelectorAll('.sample-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.sample-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active'); loadVideoData(b.dataset.id, true);
  }));
  $('analysisHistorySelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__reset__') {
      resetAnalysisSection();
      return;
    }
    loadVideoData(val, false);
  });
  document.querySelectorAll('.tab-btn').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active'); $(tab.dataset.target).classList.add('active');
  }));
  $('btnCopyReport').addEventListener('click', () => copyText(state.analysis && state.analysis.report, '리포트를 복사했습니다.'));
  $('btnDownloadReport').addEventListener('click', () => { if (state.analysis) downloadText(`${state.analysis.id}_분석리포트.md`, state.analysis.report || ''); });
  $('btnCopyTranscript').addEventListener('click', () => copyText(state.analysis && state.analysis.transcript, '자막 전체를 복사했습니다.'));
  $('transcriptSearchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#transcriptContainer .transcript-row').forEach((row) => {
      const hit = !q || (row.dataset.text || '').includes(q);
      row.style.display = hit ? 'flex' : 'none'; row.classList.toggle('highlight', hit && !!q);
    });
  });
  $('transcriptContainer')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy-line');
    if (copyBtn) {
      const text = copyBtn.dataset.content;
      if (text) copyText(text, '자막 문장을 복사했습니다.');
      return;
    }
    if (e.target.closest('a')) return;
    const row = e.target.closest('.transcript-row');
    if (!row) return;
    const sec = Number(row.dataset.seconds ?? -1);
    if (sec >= 0) {
      playVideoAt(sec);
    }
  });
  $('btnPlayInApp')?.addEventListener('click', () => {
    playVideoAt(0);
  });
  $('btnCloseYtPlayer')?.addEventListener('click', () => {
    closeYouTubePlayer();
  });
  $('btnGoGenerate').addEventListener('click', () => {
    setMode('generate');
    if (state.analysis) { fillReferenceSelect(); $('referenceSelect').value = state.analysis.id; }
  });
  $('btnGoMarketingFromAnalysis')?.addEventListener('click', () => {
    setMode('marketing');
    syncMarketingWithCurrentState();
  });
  $('btnGoChannelFromAnalysis')?.addEventListener('click', () => {
    transferBenchToChannel();
  });
  $('btnBenchToChannel')?.addEventListener('click', () => {
    transferBenchToChannel();
  });
}

function resetAnalysisSection() {
  state.analysis = null;
  closeYouTubePlayer();
  if ($('dashboardSection')) $('dashboardSection').style.display = 'none';
  if ($('analysisProgressBox')) $('analysisProgressBox').style.display = 'none';
  if ($('aiFailNotice')) $('aiFailNotice').style.display = 'none';
  if ($('searchResultsBox')) $('searchResultsBox').style.display = 'none';
  if ($('urlInput')) $('urlInput').value = '';
  document.querySelectorAll('.sample-btn').forEach((x) => x.classList.remove('active'));

  if ($('videoTitle')) $('videoTitle').textContent = '';
  if ($('channelName')) $('channelName').textContent = '';
  if ($('channelSubs')) $('channelSubs').textContent = '';
  if ($('videoDuration')) $('videoDuration').textContent = '';
  if ($('uploadDate')) $('uploadDate').textContent = '';
  if ($('videoThumb')) $('videoThumb').src = '';
  if ($('videoLink')) $('videoLink').href = '#';
  if ($('sampleDataBadge')) $('sampleDataBadge').style.display = 'none';

  if ($('viewCount')) $('viewCount').textContent = '—';
  if ($('likeCount')) $('likeCount').textContent = '—';
  if ($('commentCount')) $('commentCount').textContent = '—';
  if ($('engagementRate')) $('engagementRate').textContent = '—';
  if ($('analysisMeta')) $('analysisMeta').innerHTML = '';

  if ($('hookPart1')) $('hookPart1').textContent = '—';
  if ($('hookPart2')) $('hookPart2').textContent = '—';
  if ($('hookAnalysisText')) $('hookAnalysisText').textContent = '—';

  if ($('stagesContainer')) $('stagesContainer').innerHTML = '';
  if ($('topCommentsList')) $('topCommentsList').innerHTML = '';
  if ($('markdownReportContent')) $('markdownReportContent').innerHTML = '';
  if ($('transcriptContainer')) $('transcriptContainer').innerHTML = '';
  if ($('transcriptSourceBadge')) $('transcriptSourceBadge').textContent = '';

  if ($('channelStrategyPos')) $('channelStrategyPos').textContent = '';
  if ($('channelStrategyTone')) $('channelStrategyTone').textContent = '';
  if ($('channelStrategyDiff')) $('channelStrategyDiff').textContent = '';
  state.clearedLists.analysisHistory = true;
  const aSel = $('analysisHistorySelect');
  if (aSel) {
    aSel.innerHTML = '<option value="">불러오기…</option><option value="__reset__">초기화</option>';
    aSel.value = '';
  }

  showToast('영상 분석 데이터가 초기화되었습니다.');
}

function applyAnalysisToChannel(analysis) {
  if (!analysis) return;
  const vis = analysis.visual || {};
  const cs = vis.channel_strategy || {};
  const info = analysis.info || {};
  const topic = cs.recommended_new_channel_topic || `${info.channel || info.title || '유튜브'} 벤치마킹 채널 기획`;
  
  if ($('channelTopicInput')) $('channelTopicInput').value = topic + (cs.differentiation_point ? ` — 차별화: ${cs.differentiation_point}` : '');
  if ($('channelAudienceInput')) $('channelAudienceInput').value = cs.positioning || '';
  const toneSel = $('channelToneSelect');
  if (toneSel && cs.core_tone) {
    if (![...toneSel.options].some((o) => o.value === cs.core_tone)) {
      const opt = document.createElement('option'); opt.value = cs.core_tone; opt.textContent = `벤치마크: ${cs.core_tone.slice(0, 30)}`; toneSel.appendChild(opt);
    }
    toneSel.value = cs.core_tone;
  }
}

function transferBenchToChannel() {
  if (!state.analysis) {
    showToast('먼저 분석된 영상 데이터가 필요합니다.', true);
    return;
  }
  applyAnalysisToChannel(state.analysis);
  setMode('channel');
  if ($('channelAnalysisSelect')) $('channelAnalysisSelect').value = state.analysis.id || '';
  showToast('벤치마킹 정보 반영: 추천 주제 + 차별화 포인트 + 타겟 + 톤앤매너');
}

async function searchBenchmarks(query) {
  const btn = $('btnAnalyze'); setBusy(btn, true, '유튜브에서 찾는 중…');
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(query)}`);
    const list = r.results || [];
    $('searchResultsCount').textContent = `— "${query}" ${list.length}건 (조회수 순)`;
    $('searchResultsList').innerHTML = list.length ? list.map((v) => `
      <button class="subtle-box p-2 flex gap-2.5 items-center text-left hover:border-black transition-all search-pick" data-id="${v.id}">
        <div class="relative shrink-0"><img src="${v.thumbnail}" alt="" class="w-[104px] h-[58px] object-cover rounded-md bg-neutral-100">
          ${v.duration_string ? `<span class="absolute bottom-1 right-1 px-1 bg-black/80 text-white rounded text-[9px] font-mono">${v.duration_string}</span>` : ''}</div>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-black leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(v.title)}</div>
          <div class="text-[10px] text-neutral-500 mt-0.5 truncate">${escapeHtml(v.channel)} · 조회수 ${fmtNum(v.view_count)}회${v.analyzed ? ' · <b class="text-emerald-700">분석됨</b>' : ''}</div>
        </div>
        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-neutral-300 shrink-0"></i>
      </button>`).join('') : '<p class="text-xs text-neutral-400 col-span-full">검색 결과가 없습니다. 키워드를 바꿔보세요.</p>';
    $('searchResultsList').querySelectorAll('.search-pick').forEach((b) => b.addEventListener('click', () => {
      const url = `https://youtu.be/${b.dataset.id}`;
      $('urlInput').value = url; $('searchResultsBox').style.display = 'none';
      startAnalysis(url, false);
    }));
    $('searchResultsBox').style.display = 'block'; icons();
  } catch (e) { showToast(e.message, true); }
  finally { setBusy(btn, false); }
}

async function loadVideoData(vid, isSample) {
  try {
    const r = await api(`/api/report?id=${encodeURIComponent(vid)}`);
    renderDashboard(r.data, isSample);
    $('urlInput').value = r.data.url || `https://youtu.be/${vid}`;
  } catch (e) { showToast(e.message, true); }
}

async function startAnalysis(url, force) {
  const btn = $('btnAnalyze'); setBusy(btn, true, '분석 중…');
  $('aiFailNotice').style.display = 'none';
  setProgress('analysis', { progress: 2, message: '서버에 요청 중...', step: 'metadata' });
  try {
    const resp = await api('/api/analyze', { url, force });
    if (resp.status === 'cached' || resp.cached) {
      hideProgress('analysis');
      renderDashboard(resp.data, false);
      showToast('저장된 분석 결과를 불러왔습니다. 새로 분석하려면 "캐시 무시"를 켜세요.');
      return;
    }
    const data = await runJob(resp, (job) => setProgress('analysis', job));
    setProgress('analysis', { progress: 100, message: '완료', status: 'done' });
    await sleep(500); hideProgress('analysis');
    renderDashboard(data, false); document.querySelectorAll('.sample-btn').forEach((x) => x.classList.remove('active'));
    state.clearedLists.analysisHistory = false;
    state.clearedLists.channelAnalysis = false;
    loadHistory();
  } catch (e) {
    setProgress('analysis', { progress: 100, message: `❌ ${e.message}`, step: null }); showToast(e.message, true);
  } finally { setBusy(btn, false); $('forceReanalyze').checked = false; }
}

function renderDashboard(data, isSample) {
  closeYouTubePlayer();
  state.analysis = data;
  const info = data.info || {}, visual = data.visual || null, report = data.report || '';
  $('videoTitle').textContent = info.title || '제목 없음';
  $('channelName').textContent = info.channel || '채널명 미상';
  $('channelSubs').textContent = info.channel_follower_count ? `구독자 ${fmtNum(info.channel_follower_count)}명` : '구독자 비공개';
  $('videoDuration').textContent = info.duration_string || '';
  $('uploadDate').textContent = info.upload_date ? `${fmtDate(info.upload_date)} 게시` : '';
  $('videoThumb').src = info.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`;
  $('videoLink').href = `https://youtu.be/${data.id}`;
  $('sampleDataBadge').style.display = isSample ? 'inline-flex' : 'none';

  const views = info.view_count || 0, likes = info.like_count || 0, comments = info.comment_count || 0;
  $('viewCount').textContent = views ? views.toLocaleString() : '—';
  $('likeCount').textContent = likes ? likes.toLocaleString() : '—';
  $('commentCount').textContent = comments ? comments.toLocaleString() : '—';
  $('engagementRate').textContent = views > 0 && (likes || comments) ? `${(((likes + comments) / views) * 100).toFixed(2)}%` : '—';

  const meta = [];
  if (data.ai_ok === false) meta.push('<span class="badge badge-warn">AI 분석 없음</span>');
  else if (data.llm) meta.push(`<span class="badge badge-ok" title="${escapeHtml(data.llm.model || '')}">AI · ${escapeHtml(data.llm.backend)}</span>`);
  if (data.analyzed_at) meta.push(`<span class="badge badge-mono">${fmtTs(data.analyzed_at)}</span>`);
  if (data.transcript_source) meta.push(`<span class="badge">자막 ${escapeHtml(data.transcript_source)}</span>`);
  else if ((data.transcript || '').trim() === '(자막 없음)') meta.push('<span class="badge badge-warn">자막 없음</span>');
  if (data.cached) meta.push('<span class="badge">저장된 결과</span>');
  $('analysisMeta').innerHTML = meta.join('');

  $('aiFailNotice').style.display = data.ai_ok === false ? 'flex' : 'none';
  $('aiFailText').textContent = data.ai_error || '';

  // 01 훅
  const title = info.title || '';
  const hookA = visual?.hook?.part_a || title.slice(0, Math.ceil(title.length / 2));
  const hookB = visual?.hook?.part_b || title.slice(Math.ceil(title.length / 2));
  $('hookPart1').textContent = hookA ? `"${hookA}"` : '—';
  $('hookPart2').textContent = hookB ? `"${hookB}"` : '—';
  const hookSec = sectionOf(report, 1);
  $('hookAnalysisText').textContent = visual?.hook?.mechanism || (hookSec ? plainSnippet(hookSec, 220) : (data.ai_ok === false ? 'AI 분석이 없어 훅 구조를 정리하지 못했습니다.' : '—'));

  // 02 타임라인
  let stages = (visual?.stages?.length && visual.stages.some((s) => (s.summary || '').trim() && s.summary !== '—')) ? visual.stages : null;
  if (!stages) {
    const p2 = sectionOf(report, 2);
    const defaultNames = ['도입', '갈등', '난제', '반전', '여운'];
    const defaultDefs = [
      '친숙한 모티브와 반전 요소로 시청자의 호기심을 즉시 자극',
      '문제의 스케일과 복합적 딜레마를 구체적 사실로 전달',
      '기존 방식으로는 해결 불가능한 구조적 난제 제시',
      '발상을 뒤집은 공학적 해법과 정밀한 분석 전개',
      '현실에 대한 깊이 있는 통찰과 여운을 남기는 마무리'
    ];
    stages = defaultNames.map((n, i) => {
      let sum = '';
      if (p2) {
        const reg = new RegExp(`[*-•]?\\s*\\*{0,2}${n}\\*{0,2}[:\\-]?\\s*([^\\n]+)`);
        const m = p2.match(reg);
        if (m) sum = m[1].replace(/[#*_`]/g, '').trim();
      }
      return { name: n, time_range: `0${i}:00~0${i + 1}:00`, summary: sum || defaultDefs[i] };
    });
  }
  $('storyTimelineGrid').innerHTML = stages.map((s, i) => `
    <div class="subtle-box p-2.5 text-center">
      <span class="text-[10px] font-mono font-bold text-black uppercase">${i + 1}. ${escapeHtml(s.name)}</span>
      <p class="text-[10px] text-neutral-400 my-1 font-mono">${escapeHtml(s.time_range || '—')}</p>
      <p class="text-xs text-neutral-800 font-medium leading-snug">${escapeHtml(s.summary || '—')}</p>
    </div>`).join('');

  // 03 핵심 메시지
  const coreSec = sectionOf(report, 3);
  $('coreMessageText').textContent = visual?.core_message ? `"${visual.core_message}"` : (coreSec ? `"${plainSnippet(coreSec, 160)}"` : '—');
  const kws = visual?.keywords?.length ? visual.keywords : (info.tags || []).slice(0, 4).map((t) => '#' + t);
  $('keywordChips').innerHTML = kws.map((k) => `<span class="badge badge-mono">${escapeHtml(k)}</span>`).join('');

  // 04 댓글 여론
  const sent = visual?.sentiment || {};
  $('sentimentSummary').textContent = sent.summary || (sectionOf(report, 4) ? plainSnippet(sectionOf(report, 4), 160) : '');
  const hasNums = [sent.positive, sent.neutral, sent.negative].every((v) => typeof v === 'number');
  $('sentimentBar').style.display = hasNums ? 'flex' : 'none'; $('sentimentLegend').style.display = hasNums ? 'flex' : 'none';
  if (hasNums) {
    const total = Math.max(1, sent.positive + sent.neutral + sent.negative);
    $('sentimentBar').innerHTML = `<span style="width:${(sent.positive / total) * 100}%;background:#059669"></span><span style="width:${(sent.neutral / total) * 100}%;background:#9CA3AF"></span><span style="width:${(sent.negative / total) * 100}%;background:#DC2626"></span>`;
    $('sentimentLegend').innerHTML = `<span>긍정 ${sent.positive}%</span><span>중립 ${sent.neutral}%</span><span>부정 ${sent.negative}%</span>`;
  }
  renderTopComments(data.comments || []);

  // 05 플레이북
  const playSec = sectionOf(report, 5);
  const tips = visual?.tips?.length ? visual.tips : [];
  $('playbookTips').innerHTML = tips.length ? tips.map((t, i) => `
    <div class="subtle-box p-2.5"><div class="text-xs font-bold text-black">📌 ${i + 1}. ${escapeHtml(t.title)}</div><div class="text-[11px] text-neutral-600 mt-0.5">${escapeHtml(t.summary || '')}</div></div>`).join('')
    : `<p class="text-xs text-neutral-400">${playSec ? '아래 전문을 확인하세요.' : (data.ai_ok === false ? 'AI 분석이 없어 플레이북이 없습니다.' : '—')}</p>`;
  $('playbookContent').innerHTML = playSec ? md(playSec) : '<p class="text-neutral-400">—</p>';

  // 06 채널 브랜딩 & 전략
  const cs = visual?.channel_strategy || {};
  const channelPos = cs.positioning || `${info.channel || '이 채널'}의 전문 지식 기반 콘텐츠`;
  const channelTone = cs.core_tone || '전문적이고 몰입감 있는 톤';
  const channelDiff = cs.differentiation_point || '쇼츠와 8초 씬 구성을 결합한 빠른 템포의 시각화';
  const recTopic = cs.recommended_new_channel_topic || `${(title.split(' ')[0] || info.channel)} 관련 1인 미디어 채널`;
  
  if ($('channelStrategyPos')) $('channelStrategyPos').textContent = channelPos;
  if ($('channelStrategyTone')) $('channelStrategyTone').textContent = channelTone;
  if ($('channelStrategyDiff')) $('channelStrategyDiff').textContent = channelDiff;
  if ($('channelStrategyRecTopic')) $('channelStrategyRecTopic').textContent = recTopic;

  $('markdownReportContent').innerHTML = md(report || '(리포트 없음)');
  renderTranscript(data.transcript || '', data.id);
  $('transcriptSourceBadge').textContent = data.transcript_source || '';
  $('dashboardSection').style.display = 'grid';
  fillReferenceSelect(); $('referenceSelect').value = data.id;
  icons();
}

// 리포트에서 "N." 섹션 본문 추출 (##, ###, #### 모두 허용)
function sectionOf(report, n) {
  const m = (report || '').match(new RegExp(`#{2,4}\\s*${n}[.)]\\s*[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s*${n + 1}[.)]|\\n---|$)`));
  return m ? m[1].trim() : '';
}
function plainSnippet(text, max) {
  const t = (text || '').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function renderTopComments(comments) {
  const list = $('topCommentsList');
  if (!comments.length) { list.innerHTML = '<p class="text-xs text-neutral-400">댓글이 없거나 비활성화된 영상입니다.</p>'; return; }
  list.innerHTML = comments.slice(0, 4).map((c) => `
    <div class="subtle-box p-3">
      <div class="flex justify-between items-center mb-1"><span class="text-xs font-bold text-black">${escapeHtml(c.author || '시청자')}</span>
        <span class="text-[11px] text-neutral-400 font-mono flex items-center gap-1"><i data-lucide="thumbs-up" class="w-3 h-3"></i> ${(c.like_count || 0).toLocaleString()}</span></div>
      <p class="text-xs text-neutral-600 leading-relaxed">${escapeHtml(c.text || '')}</p>
    </div>`).join('');
}

// ── 유튜브 인앱 플레이어 & 자막 싱크 매니저 ──
let ytPlayer = null;
let ytPlayerReady = false;
let ytSyncTimer = null;
let currentPlayingVideoId = null;

function loadYouTubeIFrameAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (document.getElementById('yt-iframe-api-script')) {
      const interval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      return;
    }
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(tag);
  });
}

async function initOrPlayYouTube(videoId, startSeconds = 0) {
  if (!videoId) return;
  const wrapper = $('ytPlayerWrapper');
  if (wrapper) wrapper.style.display = 'block';

  await loadYouTubeIFrameAPI();

  if (ytPlayer && ytPlayer.loadVideoById && currentPlayingVideoId === videoId) {
    try {
      ytPlayer.seekTo(startSeconds, true);
      ytPlayer.playVideo();
      startSubtitleSync();
      return;
    } catch (e) {}
  }

  if (ytPlayer && typeof ytPlayer.destroy === 'function') {
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null;
  }

  currentPlayingVideoId = videoId;
  ytPlayer = new YT.Player('ytPlayerBox', {
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      start: Math.floor(startSeconds),
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: (event) => {
        ytPlayerReady = true;
        if (startSeconds > 0) {
          try { event.target.seekTo(startSeconds, true); } catch (e) {}
        }
        try { event.target.playVideo(); } catch (e) {}
        startSubtitleSync();
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) {
          startSubtitleSync();
        } else {
          stopSubtitleSync();
        }
      }
    }
  });
}

function closeYouTubePlayer() {
  stopSubtitleSync();
  const wrapper = $('ytPlayerWrapper');
  if (wrapper) wrapper.style.display = 'none';
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }
}

function playVideoAt(seconds) {
  const vid = state.analysis?.id;
  if (!vid) {
    showToast('재생할 영상 정보가 없습니다.', true);
    return;
  }
  initOrPlayYouTube(vid, seconds);
  highlightSubtitleAtSeconds(seconds, true);
}

function startSubtitleSync() {
  stopSubtitleSync();
  ytSyncTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    try {
      const current = ytPlayer.getCurrentTime();
      highlightSubtitleAtSeconds(current, false);
    } catch (e) {}
  }, 300);
}

function stopSubtitleSync() {
  if (ytSyncTimer) {
    clearInterval(ytSyncTimer);
    ytSyncTimer = null;
  }
}

function highlightSubtitleAtSeconds(sec, forceScroll = false) {
  const rows = Array.from(document.querySelectorAll('#transcriptContainer .transcript-row'));
  if (!rows.length) return;

  let activeRow = null;
  for (let i = 0; i < rows.length; i++) {
    const rowSec = Number(rows[i].dataset.seconds ?? -1);
    if (rowSec >= 0 && rowSec <= sec + 0.5) {
      activeRow = rows[i];
    } else if (rowSec > sec + 0.5) {
      break;
    }
  }

  if (activeRow) {
    rows.forEach((r) => {
      if (r === activeRow) {
        if (!r.classList.contains('highlight')) r.classList.add('highlight');
      } else {
        r.classList.remove('highlight');
      }
    });

    if (forceScroll) {
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function renderTranscript(text, vid) {
  const c = $('transcriptContainer');
  if (!text || text.trim() === '(자막 없음)') {
    c.innerHTML = '<div class="transcript-row cursor-default"><span class="transcript-text text-neutral-400">자막이 제공되지 않는 영상입니다.</span></div>';
    return;
  }

  const lines = text.split('\n').filter((l) => l.trim());
  c.innerHTML = lines.map((line) => {
    const m = line.match(/^\[?(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{2}))\]?\s*(.*)$/);
    if (!m) {
      return `<div class="transcript-row" data-seconds="-1" data-text="${escapeHtml(line.toLowerCase())}">
        <span class="time-badge">자막</span>
        <span class="transcript-text">${escapeHtml(line)}</span>
      </div>`;
    }
    const hh = Number(m[1] || 0);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const totalSec = (hh * 3600) + (mm * 60) + ss;
    const timeDisplay = m[1]
      ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const contentText = m[4] || '';

    return `<div class="transcript-row group" data-seconds="${totalSec}" data-text="${escapeHtml(contentText.toLowerCase())}" title="클릭 시 영상이 이 시점으로 이동하여 재생됩니다">
      <span class="time-badge" title="이 시점으로 재생"><i data-lucide="play-circle"></i> ${timeDisplay}</span>
      <span class="transcript-text">${escapeHtml(contentText)}</span>
      <div class="transcript-actions" onclick="event.stopPropagation()">
        <button type="button" class="transcript-act-btn btn-copy-line" data-content="${escapeHtml(contentText)}" title="자막 복사"><i data-lucide="copy" class="w-3 h-3"></i></button>
        <a href="https://youtu.be/${vid}?t=${totalSec}" target="_blank" rel="noopener" class="transcript-act-btn" title="유튜브 새 창 열기"><i data-lucide="external-link" class="w-3 h-3"></i></a>
      </div>
    </div>`;
  }).join('');

  icons();
}

// ══════════════════════════ ② 기획 · 나레이션 ══════════════════════════

async function resetGenerator() {
  try {
    const resp = await api('/api/jobs/cancel', { kinds: ['generate', 'tts', 'full', 'marketing'] });
    state.generating = false;
    const btn = $('btnGenerate');
    if (btn) {
      setBusy(btn, false);
      const span = btn.querySelector('span');
      if (span) span.textContent = $('fullAutoToggle')?.checked ? '⚡ 풀 오토 시작' : '기획 시작';
    }
    hideProgress('gen');
    hideProgress('full');
    if ($('genProgressFill')) $('genProgressFill').style.width = '2%';
    if ($('genProgressMsg')) $('genProgressMsg').textContent = '';
    if ($('fullProgressFill')) $('fullProgressFill').style.width = '2%';
    if ($('fullProgressMsg')) $('fullProgressMsg').textContent = '';
    const count = (resp.cancelled || []).length;
    if (count > 0) {
      showToast(`진행 중이던 ${count}개의 작업과 상태가 초기화되었습니다. 다시 시작할 수 있습니다.`);
    } else {
      showToast('기획/나레이션 상태가 초기화되었습니다. 바로 기획을 시작할 수 있습니다.');
    }
  } catch (err) {
    state.generating = false;
    setBusy($('btnGenerate'), false);
    hideProgress('gen');
    hideProgress('full');
    showToast(`초기화 완료: ${err.message}`);
  }
  icons();
}

function bindGenerator() {
  $('topicInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') $('btnGenerate').click(); });
  $('btnGenerate').addEventListener('click', () => {
    const topic = $('topicInput').value.trim();
    if (!topic) { showToast('영상 주제를 입력해주세요.', true); return; }
    if ($('fullAutoToggle')?.checked) startFullAuto(topic); else startGeneration(topic);
  });
  $('btnResetGenerate')?.addEventListener('click', resetGenerator);
  $('btnCancelGenProgress')?.addEventListener('click', resetGenerator);
  $('btnCancelFullProgress')?.addEventListener('click', resetGenerator);
  $('fullAutoToggle')?.addEventListener('change', () => {
    $('fullAutoOptions').style.display = $('fullAutoToggle').checked ? 'flex' : 'none';
    const span = $('btnGenerate').querySelector('span'); if (span) span.textContent = $('fullAutoToggle').checked ? '⚡ 풀 오토 시작' : '기획 시작';
  });
  $('btnFullGoProduce')?.addEventListener('click', async () => {
    if (!state.plan) return;
    state.produceReset = false;
    state.clearedLists.producePlan = false;
    setMode('produce');
    await loadHistory();
    $('producePlanSelect').value = state.plan.plan_id;
    loadProducePlan(state.plan.plan_id);
  });
  $('btnFullGoMarketing')?.addEventListener('click', () => setMode('marketing'));
  document.querySelectorAll('.topic-chip').forEach((c) => c.addEventListener('click', () => { $('topicInput').value = c.dataset.topic; }));
  $('planHistorySelect').addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__reset__') {
      resetPlanSection();
      return;
    }
    state.planReset = false;
    try { const r = await api(`/api/plan?id=${encodeURIComponent(val)}`); renderPlan(r.data); showToast('기획서를 불러왔습니다.'); }
    catch (err) { showToast(err.message, true); }
  });

  $('btnPlayFullAudio').addEventListener('click', toggleFullAudio);
  $('btnDownloadAudioZip').addEventListener('click', () => {
    const url = state.plan?.audio_data?.zip_download_url;
    if (!url) { showToast('나레이션 오디오가 없습니다. "나레이션 다시 만들기"를 눌러주세요.', true); return; }
    const a = document.createElement('a'); a.href = url; a.download = `${state.plan.topic}_나레이션.zip`; document.body.appendChild(a); a.click(); a.remove();
  });
  $('btnRegenerateAudios').addEventListener('click', regenerateAudio);
  $('btnDownloadPlan').addEventListener('click', () => { if (state.plan) downloadText(`${state.plan.topic}_기획서.md`, state.plan.full_document || ''); });
  $('btnGoProduce').addEventListener('click', async () => {
    if (!state.plan) return;
    state.produceReset = false;
    state.clearedLists.producePlan = false;
    setMode('produce');
    await loadHistory();
    $('producePlanSelect').value = state.plan.plan_id;
    loadProducePlan(state.plan.plan_id);
  });

  $('btnCopyMeta').addEventListener('click', () => copyText(state.plan && `${state.plan.meta_text}`, '제목·설명란을 복사했습니다.'));
  $('btnCopyDescription').addEventListener('click', () => copyText(state.plan && state.plan.description_plain, '설명란을 복사했습니다.'));
  $('btnCopyFullScript').addEventListener('click', () => copyText(state.plan && (state.plan.structured_scenes || []).map((s) => `[씬 ${s.scene_num}] ${s.time_range}\n${s.subtitle}`).join('\n\n'), '전체 대본을 복사했습니다.'));
  $('btnCopyAllPrompts').addEventListener('click', () => copyText(state.plan && (state.plan.structured_scenes || []).map((s) => `// 씬 ${s.scene_num} (${s.time_range})\n${s.prompt_en}`).join('\n\n'), '전체 영상 프롬프트를 복사했습니다.'));
  $('btnCopyThumbnailPrompt').addEventListener('click', () => copyText(state.plan && state.plan.thumbnail_prompt_raw, '썸네일 프롬프트를 복사했습니다.'));
  $('btnCopyAllImagePrompts').addEventListener('click', () => {
    if (!state.plan) return;
    const parts = [`/* 썸네일 (${state.plan.aspect_ratio}) */\n${state.plan.thumbnail_prompt_raw}`];
    (state.plan.structured_scenes || []).forEach((s) => parts.push(`/* 씬 ${s.scene_num} 첫 프레임 (${s.time_range}) */\n${s.image_prompt_raw || ''}`));
    copyText(parts.join('\n\n'), '썸네일과 씬별 이미지 프롬프트를 모두 복사했습니다.');
  });
}

async function startFullAuto(topic) {
  if (state.generating) { showToast('이미 작업이 진행 중입니다.'); return; }
  const { scenes, seconds: sceneSeconds } = lengthPreset();
  const includeVideos = $('fullIncludeVideos')?.checked !== false;
  const quality = $('fullVideoQuality')?.value || '360p';
  const doMarketing = $('fullMarketing')?.checked !== false;
  const imgUsd = (scenes + 1) * IMAGE_USD;
  const vc = includeVideos ? videoCostKrw(scenes, quality) : { usd: 0, krw: 0 };
  const lines = [
    `1. 기획 + 대본 교정 + 나레이션(${$('voiceSelect').selectedOptions[0]?.textContent || ''}) — 무료`,
    `2. 이미지 ${scenes + 1}개 (썸네일 포함) — 약 $${imgUsd.toFixed(2)}`,
    includeVideos ? `3. AI 영상 ${scenes}개 · ${quality} — 약 $${vc.usd.toFixed(2)} (${vc.krw.toLocaleString()}원)` : '3. AI 영상 건너뜀 (이미지 켄번즈 합성)',
    `4. 자막·전환 합성 — 무료`,
    doMarketing ? '5. 스레드·블로그·뉴스레터 — 무료' : '5. 마케팅 건너뜀', '',
    `• 예상 소요: ${includeVideos ? '15~30분' : '5~10분'}`,
    `• 예상 비용 합계: 약 $${(imgUsd + vc.usd).toFixed(2)}`
  ];
  const ok = await tiConfirm({
    title: '⚡ 풀 오토 실행 확인',
    subtitle: topic,
    icon: 'zap',
    lines,
    okText: '⚡ 풀 오토 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  state.generating = true;
  const btn = $('btnGenerate'); setBusy(btn, true, '풀 오토 진행 중…');
  $('genResultsSection').style.display = 'none'; $('fullDoneCard').style.display = 'none'; hideProgress('gen');
  setProgress('full', { progress: 2, message: '시작 중...', step: 'meta' });
  try {
    const resp = await api('/api/pipeline/full', {
      topic, scenes, scene_seconds: sceneSeconds, aspect_ratio: $('aspectRatioSelect').value, voice_id: $('voiceSelect').value,
      reference_id: $('referenceSelect').value || null, style_guide: $('styleGuideSelect')?.value || null,
      include_videos: includeVideos, video_quality: quality, marketing: doMarketing,
    });
    const r = await runJob(resp, (job) => setProgress('full', job));
    setProgress('full', { progress: 100, message: '완료', status: 'done' });
    await sleep(500); hideProgress('full');

    renderPlan(r.plan); state.render = r.render || null;
    if (r.marketing) {
      state.marketing.currentData = r.marketing;
      if (r.marketing.threads_x) renderThreadsOutput(r.marketing.threads_x);
      if (r.marketing.seo_blog) renderBlogOutput(r.marketing.seo_blog);
      if (r.marketing.newsletter) renderNewsletterOutput(r.marketing.newsletter);
      $('marketingTopicInput').value = topic;
    }
    const ss = (r.plan.structured_scenes || []).length;
    const nv = Object.values(await api(`/api/render/status?plan_id=${encodeURIComponent(r.plan.plan_id)}`).then((x) => { state.media = x.media || {}; state.env = x.env; state.youtube = x.youtube; return x.media || {}; })).filter((m) => m.type === 'video').length;
    $('fullDoneMeta').textContent = `${ss}씬 · AI 영상 ${nv}/${ss} · ${r.render?.duration ? Math.round(r.render.duration) + '초' : ''} · ${r.marketing ? '마케팅 3종 포함' : '마케팅 없음'}`;
    $('fullDoneWarnings').innerHTML = (r.warnings || []).map((w) => `<div class="text-[11px] text-amber-700">• ${escapeHtml(w)}</div>`).join('');
    $('fullDoneCard').style.display = 'block'; $('fullDoneCard').scrollIntoView({ behavior: 'smooth' });
    showToast(r.warnings?.length ? `풀 오토 완료 — 경고 ${r.warnings.length}건 확인` : '⚡ 풀 오토 완성! 기획·영상·마케팅이 모두 준비됐습니다.', !!r.warnings?.length);
    loadHistory();
  } catch (e) {
    if (e.message && (e.message.includes('취소') || e.message.includes('초기화'))) {
      hideProgress('full');
    } else {
      setProgress('full', { progress: 100, message: `❌ ${e.message}`, step: null }); showToast(e.message, true);
    }
  } finally { setBusy(btn, false); state.generating = false; icons(); }
}

function lengthPreset() {
  const [n, s] = ($('sceneCountSelect')?.value || '10x8').split('x').map(Number);
  return { scenes: n || 10, seconds: s || 8 };
}

async function startGeneration(topic) {
  if (state.generating) { showToast('이미 기획서를 만드는 중입니다. 잠시만요.'); return; }
  state.generating = true;
  const btn = $('btnGenerate'); setBusy(btn, true, '기획 중…');
  $('genResultsSection').style.display = 'none';
  setProgress('gen', { progress: 2, message: '서버에 요청 중...', step: 'meta' });
  try {
    const resp = await api('/api/generate', {
      topic, scenes: lengthPreset().scenes, scene_seconds: lengthPreset().seconds, voice_id: $('voiceSelect').value || 'ko-KR-InJoonNeural',
      aspect_ratio: $('aspectRatioSelect').value, reference_id: $('referenceSelect').value || null, generate_audio: true,
      style_guide: $('styleGuideSelect')?.value || null,
    });
    const plan = await runJob(resp, (job) => setProgress('gen', job));
    setProgress('gen', { progress: 100, message: '완료', status: 'done' });
    await sleep(500); hideProgress('gen');
    renderPlan(plan); $('genResultsSection').scrollIntoView({ behavior: 'smooth' });
    showToast(`'${topic}' 기획서가 완성되었습니다.`); loadHistory();
  } catch (e) {
    if (e.message && (e.message.includes('취소') || e.message.includes('초기화'))) {
      hideProgress('gen');
    } else {
      setProgress('gen', { progress: 100, message: `❌ ${e.message}`, step: null }); showToast(e.message, true);
    }
  } finally { setBusy(btn, false); state.generating = false; }
}

function resetPlanSection() {
  state.plan = null;
  state.planReset = true;
  state.clearedLists.planHistory = true;
  stopFullAudio();

  const sel = $('planHistorySelect');
  if (sel) {
    sel.innerHTML = '<option value="">불러오기…</option><option value="__reset__">초기화</option>';
    sel.value = '';
  }

  if ($('topicInput')) $('topicInput').value = '';
  if ($('genResultsSection')) $('genResultsSection').style.display = 'none';
  if ($('genEmptyState')) $('genEmptyState').style.display = 'block';
  if ($('fullDoneCard')) $('fullDoneCard').style.display = 'none';
  if ($('genProgressBox')) $('genProgressBox').style.display = 'none';
  if ($('fullProgressBox')) $('fullProgressBox').style.display = 'none';

  if ($('genTopicBadge')) $('genTopicBadge').textContent = '';
  if ($('genRefBadge')) $('genRefBadge').textContent = '';
  if ($('genQualityBadge')) $('genQualityBadge').textContent = '';
  if ($('genMainTitle')) $('genMainTitle').textContent = '';
  if ($('titlesList')) $('titlesList').innerHTML = '';
  if ($('descriptionText')) $('descriptionText').textContent = '';
  if ($('thumbnailPromptJsonDisplay')) $('thumbnailPromptJsonDisplay').textContent = '';
  if ($('audioNotice')) $('audioNotice').innerHTML = '';
  if ($('scenesGrid')) $('scenesGrid').innerHTML = '';

  showToast('기획서 데이터가 초기화되었습니다.');
}

function renderPlan(plan) {
  state.plan = plan;
  state.planReset = false;
  state.clearedLists.planHistory = false;
  state.clearedLists.producePlan = false;
  stopFullAudio();
  if ($('genEmptyState')) $('genEmptyState').style.display = 'none';
  const scenes = plan.structured_scenes || [], n = scenes.length, q = plan.quality || {};
  $('genTopicBadge').textContent = `주제: ${plan.topic}`;
  $('genRefBadge').textContent = plan.reference ? `벤치마크: ${plan.reference.title.slice(0, 28)}` : '벤치마크: 기본 공식';
  const allOk = q.scenes_parsed === n && q.prompts_parsed === n && q.images_parsed === n;
  $('genQualityBadge').textContent = `대본 ${q.scenes_parsed ?? '?'}/${n} · 영상 프롬프트 ${q.prompts_parsed ?? '?'}/${n} · 이미지 프롬프트 ${q.images_parsed ?? '?'}/${n}`;
  $('genQualityBadge').className = 'badge badge-mono ' + (allOk ? 'badge-ok' : 'badge-warn');
  $('genMainTitle').textContent = plan.meta?.recommended?.title || plan.topic;
  $('badgeAspectRatio').textContent = `${plan.aspect_ratio} · 2K`;
  const psec = plan.scene_seconds || 8;
  $('totalDurationBadge').textContent = `${n}씬 × ${psec}초 · 총 ${Math.floor(n * psec / 60)}분 ${(n * psec) % 60}초`;

  let titles = plan.meta?.titles || [];
  if (!titles.length && plan.meta_text) {
    const candMatches = [...plan.meta_text.matchAll(/####\s*후보\s*(\d+)[^:\n]*:?\s*([^\n]+)?\s*\n\s*\*\s*\*\*제목:\*\*\s*\*\*([^*]+)\*\*(.*?)(?=\n####|\n###|\Z)/gs)];
    for (const m of candMatches) {
      titles.push({ type: (m[2] || `후보 ${m[1]}`).trim(), title: m[3].trim(), reason: '흥행 공식 적용' });
    }
    if (!titles.length) {
      const alt = [...plan.meta_text.matchAll(/(\d+)\.\s*\*\*([^*]+)\*\*\s*(?:_\(([^)]+)\)_)?\s*[—\-:]?\s*([^\n]+)?/g)];
      for (const a of alt) {
        titles.push({ type: (a[3] || `후보 ${a[1]}`).trim(), title: a[2].trim(), reason: (a[4] || '흥행 공식 적용').trim() });
      }
    }
  }
  if (!titles.length && plan.topic) {
    titles = [{ type: '추천', title: plan.topic, reason: '주제 기반 추천 제목' }];
  }

  $('titlesList').innerHTML = titles.map((t) => {
    const rec = t.title === (plan.meta?.recommended?.title || titles[0]?.title);
    return `<div class="subtle-box p-2.5 ${rec ? 'border-black' : ''}">
      <div class="flex items-start justify-between gap-2">
        <div><span class="badge ${rec ? 'badge-ok' : ''} mb-1">${rec ? '✓ 추천 · ' : ''}${escapeHtml(t.type || '후보')}</span><div class="text-xs font-bold text-black">${escapeHtml(t.title)}</div>
          <div class="text-[11px] text-neutral-500 mt-0.5">${escapeHtml(t.reason || '')}</div></div>
        <button class="btn btn-ghost !py-0.5 !px-2 shrink-0" data-copy="${escapeHtml(t.title)}"><i data-lucide="copy" class="w-3 h-3"></i></button></div></div>`;
  }).join('') + (plan.meta?.recommended?.reason ? `<p class="text-[11px] text-neutral-500 mt-1">${escapeHtml(plan.meta.recommended.reason)}</p>` : '');
  $('titlesList').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, '제목을 복사했습니다.')));

  const descPlain = plan.description_plain || plan.meta?.description?.summary || (plan.meta_text ? plainSnippet(plan.meta_text, 350) : '');
  $('descriptionText').textContent = descPlain || (plan.topic ? `${plan.topic} 기획 및 분석 요약입니다.` : '설명란 내용이 없습니다.');

  const thumbPrompt = plan.thumbnail_prompt_raw || (plan.thumbnail_image_prompt || plan.thumbnail_prompt ? JSON.stringify(plan.thumbnail_image_prompt || plan.thumbnail_prompt, null, 2) : '');
  $('thumbnailPromptJsonDisplay').textContent = thumbPrompt || '썸네일 프롬프트가 설정되지 않았습니다.';

  renderAudioNotice(plan);
  const audioMap = {};
  (plan.audio_data?.scenes_audio || []).forEach((a) => { audioMap[a.scene_num] = a; });

  $('scenesGrid').innerHTML = scenes.map((sc) => {
    const a = audioMap[sc.scene_num] || {};
    const len = (sc.subtitle || '').length;
    const lenBadge = sc.parse_ok ? `<span class="badge ${sc.length_warning ? 'badge-warn' : ''} badge-mono" title="8초 기준 30~45자 권장">${len}자</span>` : '';
    const durBadge = a.duration ? `<span class="badge ${a.over_limit ? 'badge-warn' : 'badge-ok'} badge-mono" title="${a.over_limit ? '8초를 넘습니다 — 대본을 줄이거나 ③ 탭의 \'나레이션 길이에 맞춤\'을 사용하세요' : '8초 이내'}">${a.duration}s${a.over_limit ? ' ⚠' : ''}</span>` : '';
    return `
    <div class="card p-5 border-l-2 border-l-black flex flex-col gap-3">
      <div class="flex justify-between items-center flex-wrap gap-1">
        <div class="flex items-center gap-2"><span class="badge badge-mono !bg-black !text-white !border-black">SCENE ${String(sc.scene_num).padStart(2, '0')}</span><span class="badge">${escapeHtml(sc.stage || '')}</span></div>
        <span class="text-[11px] font-mono text-neutral-500 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ${escapeHtml(sc.time_range)}</span>
      </div>
      <div class="subtle-box p-3 space-y-1.5">
        <div class="flex items-center justify-between"><span class="card-title flex items-center gap-1"><i data-lucide="mic" class="w-3 h-3"></i> 나레이션</span><div class="flex gap-1">${lenBadge}${durBadge}</div></div>
        ${sc.parse_ok ? `<p class="text-xs text-neutral-900 font-medium leading-relaxed narration-text" data-scene="${sc.scene_num}">"${escapeHtml(sc.subtitle)}"</p>` : '<p class="text-xs text-amber-700">AI 응답에서 이 씬의 대본을 읽지 못했습니다. 아래 "수정"으로 직접 입력할 수 있습니다.</p>'}
        <div class="narration-edit hidden" data-scene="${sc.scene_num}">
          <textarea class="w-full input px-2 py-1.5 text-xs" rows="2" maxlength="120">${escapeHtml(sc.subtitle || '')}</textarea>
          <div class="flex gap-1.5 mt-1.5">
            <button class="btn btn-primary !py-1 narration-save" data-scene="${sc.scene_num}"><i data-lucide="check" class="w-3 h-3"></i> 저장하고 나레이션 다시 만들기</button>
            <button class="btn btn-ghost !py-1 narration-cancel" data-scene="${sc.scene_num}">취소</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-[11px] text-neutral-500 hover:text-black underline narration-edit-btn" data-scene="${sc.scene_num}">✏️ 나레이션 수정</button>
          ${sc.proofread ? `<span class="badge badge-ok" title="원문: ${escapeHtml(sc.original_subtitle || '')}">교정됨</span>` : ''}${sc.edited ? '<span class="badge">직접 수정</span>' : ''}
        </div>
        ${sc.direction ? `<p class="text-[11px] text-neutral-500">연출: ${escapeHtml(sc.direction)}</p>` : ''}
        ${a.audio_url ? `<audio controls src="${a.audio_url}" class="w-full h-7 mt-1" preload="none"></audio>${a.fallback ? `<p class="text-[11px] text-amber-700 mt-0.5">⚠ ${escapeHtml(a.fallback)}</p>` : ''}` : `<p class="text-[11px] text-neutral-400">${a.error ? '오디오: ' + escapeHtml(a.error) : '나레이션 오디오 없음'}</p>`}
      </div>
      <div class="subtle-box p-3 space-y-2">
        <div class="flex justify-between items-center">
          <span class="card-title flex items-center gap-1"><i data-lucide="video" class="w-3 h-3"></i> 영상 프롬프트 ${sc.prompt_ok === false ? '<span class="badge badge-warn">기본값</span>' : ''}</span>
          <button class="btn btn-ghost !py-0.5 !px-2" data-copy="${escapeHtml(sc.prompt_en || '')}" data-msg="영상 프롬프트를 복사했습니다."><i data-lucide="copy" class="w-3 h-3"></i> 복사</button>
        </div>
        <p class="font-mono text-[11px] text-neutral-800 bg-white p-2.5 rounded border border-neutral-200 leading-relaxed">${escapeHtml(sc.prompt_en || '')}</p>
        ${sc.guide_ko ? `<p class="text-[11px] text-neutral-500">${escapeHtml(sc.guide_ko)}</p>` : ''}
      </div>
      <details class="bg-red-50/40 rounded-lg p-3 border border-red-200/60">
        <summary class="cursor-pointer card-title text-red-700 flex items-center justify-between">
          <span>첫 프레임 이미지 프롬프트 (JSON)</span>
          <button class="btn btn-ghost !py-0.5 !px-2 text-red-700" data-copy="${escapeHtml(sc.image_prompt_raw || '')}" data-msg="이미지 프롬프트를 복사했습니다."><i data-lucide="copy" class="w-3 h-3"></i> 복사</button>
        </summary>
        <pre class="code-box light mt-2 max-h-[200px] text-[11px]">${escapeHtml(sc.image_prompt_raw || '')}</pre>
      </details>
    </div>`;
  }).join('');
  $('scenesGrid').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); copyText(b.dataset.copy, b.dataset.msg); }));
  $('scenesGrid').querySelectorAll('.narration-edit-btn').forEach((b) => b.addEventListener('click', () => {
    const box = $('scenesGrid').querySelector(`.narration-edit[data-scene="${b.dataset.scene}"]`); box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) box.querySelector('textarea').focus();
  }));
  $('scenesGrid').querySelectorAll('.narration-cancel').forEach((b) => b.addEventListener('click', () => {
    $('scenesGrid').querySelector(`.narration-edit[data-scene="${b.dataset.scene}"]`).classList.add('hidden');
  }));
  $('scenesGrid').querySelectorAll('.narration-save').forEach((b) => b.addEventListener('click', () => saveNarration(b)));
  $('genResultsSection').style.display = 'block';
  fillPlanSelect($('planHistorySelect'), true); $('planHistorySelect').value = plan.plan_id;
  icons();
}

async function saveNarration(btn) {
  const sceneNum = parseInt(btn.dataset.scene, 10);
  const box = $('scenesGrid').querySelector(`.narration-edit[data-scene="${sceneNum}"]`);
  const text = box.querySelector('textarea').value.trim();
  if (!text) { showToast('나레이션을 입력해주세요.', true); return; }
  setBusy(btn, true, '재합성 중…');
  try {
    const resp = await api('/api/plan/scene', { plan_id: state.plan.plan_id, scene_num: sceneNum, subtitle: text, voice_id: $('voiceSelect').value });
    const plan = await runJob(resp, (job) => { const s = btn.querySelector('span'); if (s) s.textContent = job.message || '재합성 중…'; });
    renderPlan(plan); showToast(`씬 ${sceneNum} 나레이션을 수정하고 오디오를 다시 만들었습니다.`);
    if (state.producePlan?.plan_id === plan.plan_id) state.producePlan = plan;
  } catch (e) { showToast(e.message, true); setBusy(btn, false); }
}

function renderAudioNotice(plan) {
  const box = $('audioNotice'); const a = plan.audio_data; const items = [];
  if (plan.audio_error) items.push(`<div class="notice notice-bad"><i data-lucide="alert-circle" class="w-4 h-4 shrink-0"></i><span>나레이션 합성 실패: ${escapeHtml(plan.audio_error)} — Edge-TTS는 인터넷 연결이 필요합니다.</span></div>`);
  if (a?.engine_note) items.push(`<div class="notice notice-warn"><i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><span>${escapeHtml(a.engine_note)}</span></div>`);
  if (a?.failed_scenes?.length) items.push(`<div class="notice notice-warn"><i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><span>씬 ${a.failed_scenes.join(', ')}의 오디오 합성이 실패했습니다. "나레이션 다시 만들기"를 눌러보세요.</span></div>`);
  if (a?.over_limit_scenes?.length) items.push(`<div class="notice notice-info"><i data-lucide="timer" class="w-4 h-4 shrink-0"></i><span>씬 ${a.over_limit_scenes.join(', ')}의 나레이션이 8초를 넘습니다. 영상 제작 시 '나레이션 길이에 맞춤'이 켜져 있으면 해당 씬이 자동으로 길어집니다.</span></div>`);
  if (plan.quality && plan.quality.scenes_parsed < (plan.structured_scenes || []).length) items.push(`<div class="notice notice-warn"><i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><span>일부 씬의 대본을 AI 응답에서 읽지 못했습니다. 더 큰 모델을 쓰거나 다시 생성하면 개선됩니다.</span></div>`);
  box.innerHTML = items.join(''); box.className = items.length ? 'space-y-2' : ''; icons();
}

function toggleFullAudio() {
  const url = state.plan?.audio_data?.full_audio_url;
  if (!url) { showToast('전체 나레이션 오디오가 없습니다.', true); return; }
  if (state.fullAudio) { stopFullAudio(); return; }
  state.fullAudio = new Audio(url); state.fullAudio.play();
  $('btnPlayFullAudio').innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5"></i> 정지'; icons();
  state.fullAudio.onended = stopFullAudio;
}
function stopFullAudio() {
  if (state.fullAudio) { state.fullAudio.pause(); state.fullAudio = null; }
  $('btnPlayFullAudio').innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> 전체 나레이션'; icons();
}

async function regenerateAudio() {
  if (!state.plan) return;
  const btn = $('btnRegenerateAudios'); setBusy(btn, true, '합성 중…');
  try {
    const resp = await api('/api/tts/generate-scenes', { plan_id: state.plan.plan_id, voice_id: $('voiceSelect').value });
    const audio = await runJob(resp, (job) => { btn.querySelector('span').textContent = job.message || '합성 중…'; });
    state.plan.audio_data = audio; delete state.plan.audio_error; renderPlan(state.plan);
    showToast(audio.failed_scenes?.length ? `일부 씬(${audio.failed_scenes.join(', ')}) 합성에 실패했습니다.` : '나레이션을 다시 만들었습니다.', !!audio.failed_scenes?.length);
  } catch (e) { showToast(e.message, true); } finally { setBusy(btn, false); }
}

// ── 내 목소리 등록 ────────────────────────────────────────────────────

const rec = { recorder: null, chunks: [], base64: null, active: false };

async function loadStyleGuides() {
  const sel = $('styleGuideSelect'); if (!sel) return;
  const cur = sel.value;
  try {
    const r = await api('/api/knowledge');
    sel.innerHTML = '<option value="">기본 (내장 레드라인 규칙)</option>' +
      (r.guides || []).map((g) => `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name.replace(/\.(md|txt)$/i, ''))}</option>`).join('');
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    else if ([...sel.options].some((o) => o.value === '레드라인.md')) sel.value = '레드라인.md';
  } catch (e) { /* 무시 */ }
}

async function loadVoiceProfiles() {
  const sel = $('voiceSelect'); const cur = sel.value;
  try {
    const d = await api('/api/voice/profiles');
    sel.innerHTML = d.voices.map((v) => `<option value="${escapeHtml(v.id)}" title="${escapeHtml(v.style || '')}">${escapeHtml(v.name)}</option>`).join('');
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    $('cloneAvailabilityNote').innerHTML = d.clone_available
      ? '<i data-lucide="check-circle" class="w-3.5 h-3.5 shrink-0"></i><span>보이스 클로닝(Qwen3-TTS)이 설치되어 있습니다. 등록한 목소리로 나레이션을 합성합니다.</span>'
      : '<i data-lucide="info" class="w-3.5 h-3.5 shrink-0"></i><span>보이스 클로닝 패키지가 설치되어 있지 않습니다. 지금 등록해도 나레이션은 기본 음성(인준)으로 만들어집니다. 사용하려면 <code>pip3 install torch qwen-tts</code> (용량 큼) 후 서버를 재시작하세요.</span>';
    icons();
  } catch (e) { /* 무시 */ }
}

function bindVoiceModal() {
  const panel = $('voiceClonePanel');
  $('btnOpenVoiceModal').addEventListener('click', () => { panel.classList.add('open'); icons(); });
  $('btnCloseVoicePanel').addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.classList.remove('open'); });

  $('btnRecordVoice').addEventListener('click', async () => {
    const btn = $('btnRecordVoice');
    if (!rec.active) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec.chunks = []; rec.recorder = new MediaRecorder(stream);
        rec.recorder.ondataavailable = (e) => { if (e.data.size > 0) rec.chunks.push(e.data); };
        rec.recorder.onstop = async () => {
          const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'audio/webm' });
          $('recordedAudioPreview').src = URL.createObjectURL(blob); $('recordedAudioPreview').style.display = 'block';
          rec.base64 = await fileToDataUrl(blob);
          stream.getTracks().forEach((t) => t.stop());
        };
        rec.recorder.start(); rec.active = true; btn.classList.add('recording-red'); $('recordBtnText').textContent = '녹음 중… (끝나면 클릭)';
      } catch (e) { showToast('마이크 권한이 필요합니다.', true); }
    } else {
      if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
      rec.active = false; btn.classList.remove('recording-red'); $('recordBtnText').textContent = '다시 녹음';
    }
  });
  $('voiceFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    rec.base64 = await fileToDataUrl(f); $('recordedAudioPreview').src = URL.createObjectURL(f); $('recordedAudioPreview').style.display = 'block';
    showToast(`'${f.name}' 첨부됨`);
  });
  $('btnSaveVoiceProfile').addEventListener('click', async () => {
    if (!rec.base64) { showToast('먼저 녹음하거나 음성 파일을 첨부해주세요.', true); return; }
    const btn = $('btnSaveVoiceProfile'); setBusy(btn, true, '저장 중…');
    try {
      const r = await api('/api/voice/upload', { name: $('voiceProfileName').value.trim() || '내 목소리', ref_text: $('voiceRefText').value.trim(), audio_base64: rec.base64 });
      showToast(r.clone_available ? '목소리 프로필을 저장했습니다.' : '프로필을 저장했습니다 (클로닝 패키지가 없어 기본 음성으로 합성됩니다).', !r.clone_available);
      panel.classList.remove('open'); await loadVoiceProfiles(); $('voiceSelect').value = `custom:${r.profile.id}`;
    } catch (e) { showToast(e.message, true); } finally { setBusy(btn, false); }
  });
}

// ══════════════════════════ ③ 제작 · 업로드 ══════════════════════════

function bindProducer() {
  $('producePlanSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__reset__') {
      resetProduceSection();
      return;
    }
    state.produceReset = false;
    loadProducePlan(val);
  });
  $('btnSaveGeminiKey').addEventListener('click', async () => {
    try {
      const r = await api('/api/settings', { gemini_api_key: $('geminiKeyInput').value.trim() });
      state.env = r.env;
      $('geminiKeyInput').value = '';
      renderEnvRow();
      if (r.key_valid === true) showToast('✓ API 키 저장 — 인증 확인됨');
      else if (r.key_valid === false) showToast(`키를 저장했지만 인증에 실패했습니다: ${r.key_message}. 키를 다시 확인하세요.`, true);
      else showToast(r.env.gemini_key_set ? 'API 키를 저장했습니다.' : 'API 키를 지웠습니다.');
    } catch (e) { showToast(e.message, true); }
  });
  $('btnGenerateImages').addEventListener('click', generateImages);
  $('btnDownloadImagesZip')?.addEventListener('click', async () => {
    if (!state.producePlan) {
      showToast('기획서를 먼저 선택하세요.', true);
      return;
    }
    const btn = $('btnDownloadImagesZip');
    setBusy(btn, true, 'ZIP 준비 중…');
    try {
      const res = await api(`/api/render/images/zip?plan_id=${encodeURIComponent(state.producePlan.plan_id)}`);
      if (res.zip_url) {
        const a = document.createElement('a');
        a.href = `${res.zip_url}?t=${Date.now()}`;
        const topicSlug = (state.producePlan.topic || 'images')
          .replace(/[\/\\:*?"<>|]/g, '')
          .trim()
          .replace(/\s+/g, '_')
          .slice(0, 25);
        a.download = `${topicSlug}_씬이미지_전체.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('전체 씬 이미지 ZIP 다운로드를 시작합니다.');
      } else {
        showToast('다운로드할 씬 이미지가 없습니다.', true);
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(btn, false);
      icons();
    }
  });
  $('btnGenerateVideos').addEventListener('click', () => generateVideos(null));  // 이벤트 객체가 slots 로 넘어가지 않도록
  $('btnAutoProduce').addEventListener('click', autoProduce);
  $('btnReviewContinue')?.addEventListener('click', () => { $('reviewBar').style.display = 'none'; autoProduce(); });
  $('btnReviewStop')?.addEventListener('click', () => { $('reviewBar').style.display = 'none'; showToast('중단했습니다. 이미지는 저장돼 있으니 언제든 "▶ 완성 영상 만들기"로 이어서 진행하세요.'); });
  $('btnBuildVideo').addEventListener('click', buildVideo);
  $('videoQualitySelect').addEventListener('change', updateCostEstimate);
  $('btnYtConnect').addEventListener('click', connectYoutube);
  $('ytSecretFile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await api('/api/youtube/secret', { data_base64: await fileToDataUrl(f) });
      state.youtube = r.youtube; renderYoutube();
      showToast('client_secret.json 저장 완료 — 이제 "유튜브 계정 연결"을 누르세요.');
    } catch (err) { showToast(err.message, true); }
    e.target.value = '';
  });
  $('btnYtDisconnect').addEventListener('click', async () => {
    try {
      const r = await api('/api/youtube/disconnect', {});
      state.youtube = r.youtube;
      renderYoutube();
      showToast('연결을 해제했습니다.');
    } catch (e) { showToast(e.message, true); }
  });
  $('btnYtUpload').addEventListener('click', uploadYoutube);
}

function resetProduceSection() {
  state.producePlan = null;
  state.produceReset = true;
  state.clearedLists.producePlan = true;
  state.media = {};
  state.render = null;
  try { localStorage.removeItem('ti_last_plan'); } catch (e) {}

  const sel = $('producePlanSelect');
  if (sel) {
    sel.innerHTML = '<option value="">기획서 선택…</option><option value="__reset__">초기화</option>';
    sel.value = '';
  }

  if ($('producePlanSummary')) $('producePlanSummary').textContent = '';
  if ($('ytTitle')) $('ytTitle').value = '';
  if ($('ytDescription')) $('ytDescription').value = '';
  if ($('ytTags')) $('ytTags').value = '';

  if ($('mediaGrid')) {
    $('mediaGrid').innerHTML = '<div class="col-span-full subtle-box p-8 text-center text-neutral-400 text-xs">선택된 기획서가 없습니다. 상단에서 기획서를 선택해주세요.</div>';
  }
  if ($('renderResult')) $('renderResult').style.display = 'none';
  if ($('reviewBar')) $('reviewBar').style.display = 'none';
  if ($('autoProgressBox')) $('autoProgressBox').style.display = 'none';
  if ($('nextStepGuide')) $('nextStepGuide').innerHTML = '';
  if ($('btnDownloadImagesZip')) $('btnDownloadImagesZip').style.display = 'none';
  if ($('videoCostEstimateBadge')) $('videoCostEstimateBadge').textContent = '';

  showToast('제작/업로드 데이터가 초기화되었습니다.');
}

async function loadProducePlan(planId) {
  state.produceReset = false;
  state.clearedLists.producePlan = false;
  try {
    const r = await api(`/api/plan?id=${encodeURIComponent(planId)}`);
    state.producePlan = r.data;
    try { localStorage.setItem('ti_last_plan', r.data.plan_id); } catch (e) {}
    const p = r.data;
    const sceneCount = (p.structured_scenes || []).length;
    $('producePlanSummary').textContent = `${sceneCount}씬 · ${p.aspect_ratio} · ${p.audio_data?.full_audio_url ? '나레이션 있음' : '나레이션 없음'}`;
    $('ytTitle').value = p.meta?.recommended?.title || p.meta?.titles?.[0]?.title || p.topic || '';
    $('ytDescription').value = p.description_plain || (p.meta_text ? plainSnippet(p.meta_text, 400) : p.topic || '');
    const tags = (p.meta?.description?.hashtags || []).map((h) => h.replace(/^#/, ''));
    $('ytTags').value = tags.length ? tags.join(', ') : '지식다큐, 8초씬, 토목공학, AI영상';
    await refreshProduceStatus();
    updateCostEstimate();
  } catch (e) { showToast(e.message, true); }
}

function updateCostEstimate() {
  const p = state.producePlan;
  const numScenes = (p?.structured_scenes || []).length || 10;
  const quality = $('videoQualitySelect')?.value || '360p';
  const secPerScene = 10;
  const usdPerSec = 0.10;
  const ratio = { '360p': 1 / 3, '720p': 1.0, '1080p': 1.0 }[quality] || (1 / 3);
  const usd = numScenes * secPerScene * usdPerSec * ratio;
  const krw = Math.round(usd * 1400 / 10) * 10;
  const badge = $('videoCostEstimateBadge');
  if (badge) {
    badge.textContent = `💰 ${numScenes}장면 예상: 약 $${usd.toFixed(2)} (${krw.toLocaleString()}원)`;
  }
}

async function refreshProduceStatus() {
  const planId = state.producePlan?.plan_id;
  try {
    const r = await api(`/api/render/status?plan_id=${encodeURIComponent(planId || '')}`);
    state.env = r.env;
    state.youtube = r.youtube;
    state.media = r.media || {};
    state.render = r.render;
    renderEnvRow();
    renderMediaGrid();
    renderRenderResult();
    renderYoutube();
  } catch (e) { showToast(e.message, true); }
}

function renderEnvRow() {
  const env = state.env || {};
  const set = (id, ok, okText, badText) => {
    const el = $(id);
    if (!el) return;
    el.textContent = ok ? okText : badText;
    el.className = 'badge ' + (ok ? 'badge-ok' : 'badge-warn');
  };
  set('envFfmpeg', env.ffmpeg, '사용 가능', '없음 — pip3 install imageio-ffmpeg');
  set('envFont', !!env.font, (env.font || '').split('/').pop(), '없음 — 자막 굽기 불가');
  set('envGemini', env.gemini_key_set, '저장됨', '미설정');
  set('envFile', env.has_env_file, '.env 연동됨', '.env 없음');

  const hasKey = !!env.gemini_key_set;
  if ($('btnGenerateImages')) {
    $('btnGenerateImages').disabled = !hasKey;
    $('btnGenerateImages').title = hasKey ? '' : 'Gemini API 키를 먼저 저장하세요';
  }
  if ($('btnGenerateVideos')) {
    $('btnGenerateVideos').disabled = !hasKey;
    $('btnGenerateVideos').title = hasKey ? '' : 'Gemini API 키를 먼저 저장하세요';
  }
  if ($('btnAutoProduce')) {
    $('btnAutoProduce').disabled = false;
    $('btnAutoProduce').title = hasKey ? '' : 'Gemini API 키가 없으면 이미지·영상 생성은 건너뛰고, 넣어 둔 미디어와 나레이션만으로 합성합니다';
  }
}

function renderMediaGrid() {
  const grid = $('mediaGrid');
  const p = state.producePlan;
  if (!p) {
    grid.innerHTML = '<p class="text-xs text-neutral-400 col-span-full">기획서를 선택하세요.</p>';
    return;
  }
  const slots = [
    ...(p.structured_scenes || []).map((s) => ({
      slot: String(s.scene_num),
      label: `씬 ${String(s.scene_num).padStart(2, '0')}`,
      sub: s.subtitle,
    })),
    { slot: 'thumbnail', label: '썸네일', sub: '유튜브 썸네일 (이미지)' },
  ];

  grid.innerHTML = slots
    .map(({ slot, label, sub }) => {
      const m = state.media[slot];
      let tagBadge = '';
      if (m) {
        if (m.source === 'omni' || (m.type === 'video' && m.source !== 'upload')) {
          tagBadge = `<span class="badge media-tag badge-purple">AI 영상 (Omni)</span>`;
        } else if (m.source === 'gemini' || m.source === 'nanobanana') {
          tagBadge = `<span class="badge media-tag badge-red">AI 이미지</span>`;
        } else {
          tagBadge = `<span class="badge media-tag">${m.type === 'video' ? '영상 클립' : '이미지'}</span>`;
        }
      }

      let actionsHtml = '';
      if (m) {
        const topicSlug = (state.producePlan?.topic || 'TubeInsight')
          .replace(/[\/\\:*?"<>|]/g, '')
          .trim()
          .replace(/\s+/g, '_')
          .slice(0, 24);
        let ext = '.png';
        if (m.file && m.file.includes('.')) ext = '.' + m.file.split('.').pop();
        else if (m.type === 'video') ext = '.mp4';
        const downloadName = slot === 'thumbnail'
          ? `${topicSlug}_00_유튜브썸네일${ext}`
          : `${topicSlug}_씬${String(slot).padStart(2, '0')}${ext}`;

        actionsHtml = `<div class="media-actions">
          <a href="${m.url}" download="${escapeHtml(downloadName)}" class="media-btn media-download" title="${m.type === 'video' ? '영상 클립 다운로드' : '이미지 다운로드'} (${escapeHtml(downloadName)})" onclick="event.stopPropagation()">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
          </a>
          ${m.type === 'video' && m.image_url ? `
          <a href="${m.image_url}" download="${escapeHtml(topicSlug + '_씬' + String(slot).padStart(2, '0') + '_첫프레임.png')}" class="media-btn media-download" title="첫 프레임 정지 이미지 다운로드" onclick="event.stopPropagation()">
            <i data-lucide="image" class="w-3.5 h-3.5"></i>
          </a>` : ''}
          <button type="button" class="media-btn media-btn-danger media-remove" data-remove="${slot}" title="${m && m.type === 'video' ? '영상 제거 (첫 프레임 이미지로 되돌아감)' : '제거'}" onclick="event.stopPropagation()">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>`;
      }

      return `<div class="space-y-1">
      <div class="dropzone" data-slot="${slot}" title="클릭하거나 파일을 끌어다 놓으세요">
        ${
          m
            ? m.type === 'video'
              ? `<video src="${m.url}${m.trim_start ? '#t=' + (Number(m.trim_start) + 0.5) : ''}" muted preload="metadata" playsinline></video>`
              : `<img src="${m.url}?t=${Date.now()}" alt="">`
            : `<i data-lucide="${slot === 'thumbnail' ? 'image' : 'image-plus'}" class="w-6 h-6"></i><span>${
                slot === 'thumbnail' ? '썸네일 이미지' : '이미지 / AI 영상'
              }</span>`
        }
        ${tagBadge}
        ${actionsHtml}
      </div>
      <div class="flex items-center justify-between gap-1">
        <div class="text-[11px] font-bold text-neutral-700">${label}</div>
        ${slot !== 'thumbnail' ? `<button class="text-[10px] text-purple-700 hover:underline scene-video-btn" data-slot="${slot}" title="이 씬만 AI 영상 생성 (현재 화질 설정 적용, 첫 프레임 이미지는 유지)">${m && m.type === 'video' ? '🎬 이 씬만 다시' : '🎬 이 씬만 AI 영상'}</button>` : ''}
      </div>
      <div class="text-[10px] text-neutral-400 truncate" title="${escapeHtml(sub || '')}">${escapeHtml(sub || '')}</div>
    </div>`;
    })
    .join('');

  grid.querySelectorAll('.dropzone').forEach((z) => {
    z.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]') || e.target.closest('.media-download')) return;
      pickMedia(z.dataset.slot);
    });
    z.addEventListener('dragover', (e) => {
      e.preventDefault();
      z.classList.add('over');
    });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => {
      e.preventDefault();
      z.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) uploadMedia(z.dataset.slot, f);
    });
  });

  grid.querySelectorAll('.scene-video-btn').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.env?.gemini_key_set) { showToast('Gemini API 키를 먼저 저장하세요.', true); return; }
    generateVideos([b.dataset.slot]);
  }));
  grid.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await api('/api/render/media/delete', {
          plan_id: state.producePlan.plan_id,
          slot: b.dataset.remove,
        });
        state.media = r.media;
        renderMediaGrid();
      } catch (err) {
        showToast(err.message, true);
      }
    })
  );
  const sceneSlots = (p.structured_scenes || []).map((s) => String(s.scene_num));
  const nVideo = sceneSlots.filter((s) => state.media[s]?.type === 'video').length;
  const nImage = sceneSlots.filter((s) => state.media[s]?.type === 'image').length;
  const nEmpty = sceneSlots.length - nVideo - nImage;
  const gi = $('btnGenerateImages'); if (gi && !gi.disabled) gi.innerHTML = `<i data-lucide="wand-2" class="w-3.5 h-3.5"></i> ${nImage + nVideo + (state.media['thumbnail'] ? 1 : 0) === sceneSlots.length + 1 ? '이미지 모두 준비됨' : '비어 있는 ' + (sceneSlots.length - nImage - nVideo + (state.media['thumbnail'] ? 0 : 1)) + '칸 이미지 생성'}`;
  const gv = $('btnGenerateVideos'); if (gv && !gv.disabled) gv.innerHTML = `<i data-lucide="video" class="w-3.5 h-3.5"></i> ${nVideo === sceneSlots.length ? '모든 씬 AI 영상 있음' : 'AI 영상 없는 ' + (sceneSlots.length - nVideo) + '씬 생성'}`;
  const zipBtn = $('btnDownloadImagesZip');
  if (zipBtn) zipBtn.style.display = (nImage + nVideo + (state.media['thumbnail'] ? 1 : 0)) > 0 ? 'inline-flex' : 'none';
  renderNextStepGuide(sceneSlots.length, nVideo, nImage, nEmpty);
  icons();
}

// ③ 상단: 현재 상태를 보고 "지금 눌러야 할 버튼"을 한 줄로 안내
function renderNextStepGuide(total, nVideo, nImage, nEmpty) {
  const box = $('nextStepGuide'); if (!box) return;
  const p = state.producePlan; if (!p) { box.innerHTML = ''; return; }
  const audioOk = (p.audio_data?.scenes_audio || []).filter((s) => s.audio_url).length;
  const voice = p.audio_data?.voice_id || '';
  const voiceName = voice.startsWith('custom:') ? '내 목소리(Qwen)' : ({ 'ko-KR-InJoonNeural': '인준', 'ko-KR-SunHiNeural': '선희', 'ko-KR-HyunsuNeural': '현수' }[voice] || voice || '없음');
  const hasRender = !!state.render;
  const steps = [
    { name: '이미지', done: nEmpty === 0, detail: `${nImage + nVideo}/${total}` },
    { name: 'AI 영상', done: nVideo === total, detail: `${nVideo}/${total}` },
    { name: '나레이션', done: audioOk === total, detail: `${audioOk}/${total} · ${voiceName}` },
    { name: '합성', done: hasRender, detail: hasRender ? `${Math.round(state.render.duration || 0)}초` : '' },
    { name: '업로드', done: false, detail: state.youtube?.authorized ? '연결됨' : '나중에' },
  ];
  let next, tone = 'info';
  const vidCost = videoCostKrw(total - nVideo, $('videoQualitySelect')?.value || '360p');
  if (audioOk < total) next = `②탭에서 이 기획서를 불러와 <b>"나레이션 다시 만들기"</b>를 누르세요 (무료). 씬 ${total - audioOk}개에 나레이션이 없습니다.`;
  else if (nEmpty > 0) next = `1번 카드의 <b>"비어 있는 ${nEmpty + (state.media['thumbnail'] ? 0 : 1)}칸 이미지 생성"</b> (이미 있는 이미지는 다시 만들지 않음)`;
  else if (!hasRender) next = `3번 카드의 <b>"지금 재료로 합성하기"</b>를 누르면 영상이 완성됩니다 (무료 — 이미지는 켄번즈로 움직임).${nVideo < total ? ` 씬을 <b>진짜 움직이는 AI 영상</b>으로 만들고 싶으면 그 전에 2번 (약 $${vidCost.usd.toFixed(2)}, 선택).` : ''}`;
  else if (nVideo < total) { tone = 'ok'; next = `<b>✅ 영상 완성!</b> (이미지 켄번즈 기반) — 이대로 저장·업로드해도 됩니다.<br><span class="text-neutral-600">선택 업그레이드: 정지 이미지를 진짜 움직이는 영상으로 바꾸려면 2번 "AI 영상 없는 ${total - nVideo}씬 생성"(약 $${vidCost.usd.toFixed(2)}) → 3번 다시 합성.</span>`; }
  else { tone = 'ok'; next = `<b>✅ AI 영상 기반 완성!</b> 3번에서 미리보기·<b>mp4 저장</b>. 마음에 안 드는 씬은 "이 씬만 다시" 후 재합성. 업로드는 4번.`; }
  box.innerHTML = `
    <div class="flex items-center gap-1 flex-wrap text-[11px] mb-2">${steps.map((s, i) => `<span class="badge ${s.done ? 'badge-ok' : ''}">${s.done ? '✓' : (i + 1)} ${s.name}${s.detail ? ' ' + s.detail : ''}</span>${i < steps.length - 1 ? '<span class="text-neutral-300">→</span>' : ''}`).join('')}</div>
    <div class="notice notice-${tone}"><i data-lucide="${tone === 'ok' ? 'check-circle' : 'arrow-right-circle'}" class="w-4 h-4 shrink-0 mt-0.5"></i><div>${tone === 'ok' ? '' : '<b>다음 할 일:</b> '}${next}</div></div>`;
  icons();
}

function pickMedia(slot) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = slot === 'thumbnail' ? 'image/*' : 'image/*,video/mp4,video/quicktime,video/webm';
  input.onchange = () => {
    if (input.files[0]) uploadMedia(slot, input.files[0]);
  };
  input.click();
}

async function uploadMedia(slot, file) {
  if (file.size > 35 * 1024 * 1024) {
    showToast('35MB 이하 파일만 넣을 수 있습니다.', true);
    return;
  }
  try {
    showToast(`'${file.name}' 업로드 중…`);
    const r = await api('/api/render/media', {
      plan_id: state.producePlan.plan_id,
      slot,
      filename: file.name,
      data_base64: await fileToDataUrl(file),
    });
    state.media = r.media;
    renderMediaGrid();
    showToast(`${slot === 'thumbnail' ? '썸네일' : '씬 ' + slot}에 넣었습니다.`);
  } catch (e) {
    showToast(e.message, true);
  }
}

async function generateImages() {
  if (!state.producePlan) return;
  const mc = mediaCounts();
  if (mc.imagesMissing === 0) { showToast('이미지가 모두 준비되어 있습니다. 바꾸려면 해당 칸의 ✕로 지운 뒤 다시 생성하세요.'); return; }
  const ok = await tiConfirm({
    title: '씬 이미지 생성 확인',
    subtitle: state.producePlan.topic || state.producePlan.plan_id,
    icon: 'wand-2',
    lines: [
      `비어 있는 ${mc.imagesMissing}칸(씬 ${mc.noImage.length}개${!state.media['thumbnail'] ? ' + 썸네일' : ''})의 이미지를 생성합니다.`,
      '',
      `• 이미 있는 이미지는 다시 만들지 않습니다 (비용 $0).`,
      `• 예상 이미지 비용: 약 $${(mc.imagesMissing * IMAGE_USD).toFixed(2)} (Gemini API 과금)`
    ],
    okText: '이미지 생성 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  const btn = $('btnGenerateImages');
  setBusy(btn, true, '이미지 생성 중…');
  $('imagesNotice').innerHTML = '';
  try {
    const resp = await api('/api/render/images', { plan_id: state.producePlan.plan_id });
    const r = await runJob(resp, (job) => {
      if (btn.querySelector('span')) btn.querySelector('span').textContent = job.message;
    });
    state.media = r.media;
    renderMediaGrid();
    if (r.errors?.length) {
      $('imagesNotice').innerHTML = `<div class="notice notice-warn mb-3"><i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><div>${r.errors
        .map((e) => `<div>${escapeHtml(e.slot === 'thumbnail' ? '썸네일' : '씬 ' + e.slot)}: ${escapeHtml(e.error)}</div>`)
        .join('')}</div></div>`;
    }
    showToast(
      `이미지 ${r.generated.length}개 생성${r.errors?.length ? `, ${r.errors.length}개 실패` : ''}`,
      !!r.errors?.length
    );
    icons();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    setBusy(btn, false);
  }
}

const IMAGE_USD = 0.13;  // 나노바나나 프로 이미지 1장 대략 (실제 청구는 구글 요금표 기준)
function mediaCounts() {
  const ss = (state.producePlan?.structured_scenes || []).map((s) => String(s.scene_num));
  const noVideo = ss.filter((s) => state.media[s]?.type !== 'video');
  const noImage = ss.filter((s) => !state.media[s]);
  const thumbMissing = !state.media['thumbnail'];
  return { scenes: ss, noVideo, noImage, imagesMissing: noImage.length + (thumbMissing ? 1 : 0), hasVideo: ss.length - noVideo.length };
}
function videoCostKrw(numScenes, quality) {
  const ratio = { '360p': 1 / 3, '720p': 1.0, '1080p': 1.0 }[quality] || (1 / 3);
  const usd = numScenes * 10 * 0.10 * ratio;
  return { usd, krw: Math.round(usd * 1400 / 10) * 10 };
}

async function generateVideos(slots = null) {
  if (!Array.isArray(slots)) slots = null;
  if (!state.producePlan) return;
  const mc = mediaCounts();
  const count = slots ? slots.length : mc.noVideo.length;
  if (!slots && count === 0) { showToast('모든 씬에 이미 AI 영상이 있습니다. 특정 씬을 다시 만들려면 씬 카드의 "이 씬만 다시"를 누르세요.'); return; }
  const q = $('videoQualitySelect')?.value || '360p';
  const cost = videoCostKrw(count, q);
  const skipNote = !slots && mc.hasVideo ? ` (이미 AI 영상이 있는 ${mc.hasVideo}개 씬은 유지)` : '';
  const ok = await tiConfirm({
    title: 'AI 영상 생성 확인',
    subtitle: `Omni 1.1 Flash (${q})`,
    icon: 'video',
    lines: [
      `AI 영상 ${count}개 (${q})를 생성합니다.${skipNote}`,
      '',
      `• 예상 비용: 약 $${cost.usd.toFixed(2)} (${cost.krw.toLocaleString()}원) — Gemini API 과금`
    ],
    okText: 'AI 영상 생성 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  const btn = $('btnGenerateVideos');
  setBusy(btn, true, 'Omni 영상 생성 중…');
  const pBox = $('videosProgressBox');
  const pFill = $('videosProgressFill');
  const pMsg = $('videosProgressMsg');
  if (pBox) pBox.style.display = 'block';
  if ($('videosNotice')) $('videosNotice').innerHTML = '';

  try {
    const quality = $('videoQualitySelect')?.value || '360p';
    const resp = await api('/api/render/videos', {
      plan_id: state.producePlan.plan_id,
      quality,
      chain: $('videoChain')?.checked !== false,
      slots: slots || undefined,
      skip_existing: true,
    });
    const r = await runJob(resp, (job) => {
      if (pFill) pFill.style.width = `${job.progress || 10}%`;
      if (pMsg) pMsg.textContent = job.message || '영상 생성 중...';
    });
    state.media = r.media;
    renderMediaGrid();
    if (r.errors?.length && $('videosNotice')) {
      $('videosNotice').innerHTML = `<div class="notice notice-warn mb-3"><i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><div>${r.errors
        .map((e) => `<div>씬 ${escapeHtml(e.slot)}: ${escapeHtml(e.error)}</div>`)
        .join('')}</div></div>`;
    }
    showToast(`AI 영상 ${r.generated.length}개 생성 완료${r.skipped?.length ? ` (이미 있던 ${r.skipped.length}개는 유지)` : ''}`, !!r.errors?.length);
    icons();
  } catch (e) {
    showToast(e.message, true);
    if (pMsg) pMsg.textContent = `❌ ${e.message}`;
  } finally {
    setBusy(btn, false);
    if (pBox) setTimeout(() => { pBox.style.display = 'none'; }, 3000);
  }
}

async function autoProduce() {
  if (!state.producePlan) {
    const curVal = $('producePlanSelect')?.value;
    if (curVal) await loadProducePlan(curVal);
  }
  if (!state.producePlan) {
    showToast('기획서를 먼저 선택하세요.', true);
    return;
  }
  const mcPre = mediaCounts();
  const wantVideos = $('autoIncludeVideos')?.checked || false;

  // 검수 모드: 유료 영상 생성 전에 이미지를 먼저 만들어 보여주고 멈춤 (이미지가 이미 다 있으면 건너뜀)
  if (wantVideos && $('reviewImages')?.checked !== false && mcPre.imagesMissing > 0) {
    const ok = await tiConfirm({
      title: '1단계: 씬 이미지 생성 및 검수',
      subtitle: state.producePlan.topic || state.producePlan.plan_id,
      icon: 'image',
      lines: [
        `비어 있는 씬 이미지 ${mcPre.imagesMissing}개를 먼저 생성합니다.`,
        '',
        `• 예상 이미지 비용: 약 $${(mcPre.imagesMissing * IMAGE_USD).toFixed(2)}`,
        `• 이미지가 완성되면 제작을 잠시 멈추고 화면에 결과를 보여드립니다.`,
        `• 직접 눈으로 확인한 뒤 마음에 들면 AI 영상(유료)으로 진행할 수 있습니다.`
      ],
      okText: '1단계 이미지 생성 시작',
      cancelText: '취소'
    });
    if (!ok) return;

    const btn0 = $('btnAutoProduce');
    setBusy(btn0, true, '1단계: 이미지 생성 중…');
    try {
      const resp = await api('/api/render/images', { plan_id: state.producePlan.plan_id });
      const r = await runJob(resp);
      state.media = r.media; renderMediaGrid();
      if (r.errors?.length) showToast(`이미지 ${r.errors.length}개 실패 — 목록을 확인하세요.`, true);
      const ms = $('manualSteps'); if (ms) ms.open = true;
      $('reviewBar').style.display = 'block'; icons();
      $('reviewBar').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { showToast(e.message, true); }
    finally { setBusy(btn0, false); }
    return;  // 사용자가 검수 후 [계속]을 누르면 autoProduceContinue()가 이어감
  }

  // 전체 자동 제작 확인 (이미지 확인 모드가 아니거나 이미지가 이미 다 있는 경우 또는 영상 미포함인 경우)
  const includeVideos = $('autoIncludeVideos')?.checked || false;
  const quality = $('videoQualitySelect')?.value || '360p';
  const mc = mediaCounts();
  const nVid = includeVideos ? mc.noVideo.length : 0;
  const vc = videoCostKrw(nVid, quality);
  const imgUsd = mc.imagesMissing * IMAGE_USD;
  const totalUsd = imgUsd + (includeVideos ? vc.usd : 0);
  const totalKrw = Math.round(totalUsd * 1400 / 10) * 10;

  const ok = await tiConfirm({
    title: '완성 영상 자동 제작 확인',
    subtitle: state.producePlan.topic || state.producePlan.plan_id,
    icon: 'fast-forward',
    lines: [
      `이미 있는 이미지·AI 영상은 다시 만들지 않습니다 (비용 $0).`,
      '',
      `• 씬 이미지 생성: ${mc.imagesMissing}개 (약 $${imgUsd.toFixed(2)})`,
      includeVideos ? `• AI 영상 생성: ${nVid}개 · ${quality} (약 $${vc.usd.toFixed(2)}, ${vc.krw.toLocaleString()}원)` : `• AI 영상: 생성 안 함 (정지 이미지 켄번즈로 합성)`,
      `• 나레이션·자막 합성: 무료 (로컬 처리)`,
      '',
      (mc.imagesMissing + nVid) === 0 ? `과금 없이 합성만 진행합니다.` : `예상 총 비용: 약 $${totalUsd.toFixed(2)} (${totalKrw.toLocaleString()}원)`
    ],
    okText: '▶ 완성 영상 만들기 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  const btn = $('btnAutoProduce');
  setBusy(btn, true, '전체 자동 제작 중…');
  const pBox = $('autoProgressBox');
  const pFill = $('autoProgressFill');
  const pMsg = $('autoProgressMsg');
  if (pBox) pBox.style.display = 'block';
  $('renderResult').style.display = 'none';

  try {
    const resolution = $('renderResolution')?.value || '1080p';
    const burnSubtitles = $('burnSubtitles')?.checked !== false;
    const fitNarration = $('fitNarration')?.checked !== false;

    const resp = await api('/api/render/auto', {
      plan_id: state.producePlan.plan_id,
      include_videos: includeVideos,
      quality,
      resolution,
      burn_subtitles: burnSubtitles,
      fit_narration: fitNarration,
      chain: $('videoChain')?.checked !== false,
      subtitle_style: $('subtitleStyleSelect')?.value || 'outline',
      transition: $('transitionSelect')?.value || 'fade',
    });

    state.render = await runJob(resp, (job) => {
      if (pFill) pFill.style.width = `${job.progress || 10}%`;
      if (pMsg) pMsg.textContent = job.message || '진행 중...';
    });

    await refreshProduceStatus();
    renderRenderResult();
    showToast(state.render?.warnings?.length ? `영상은 완성됐지만 경고 ${state.render.warnings.length}건이 있습니다 — 아래 목록을 확인하세요.` : '원클릭 영상 제작이 완료되었습니다!', !!state.render?.warnings?.length);
    loadHistory();
  } catch (e) {
    showToast(e.message, true);
    if (pMsg) pMsg.textContent = `❌ ${e.message}`;
  } finally {
    setBusy(btn, false);
    if (pBox) setTimeout(() => { pBox.style.display = 'none'; }, 4000);
  }
}

async function buildVideo() {
  if (!state.producePlan) {
    showToast('기획서를 먼저 선택하세요.', true);
    return;
  }
  const btn = $('btnBuildVideo');
  setBusy(btn, true, '합성 중…');
  $('renderResult').style.display = 'none';
  setProgress('render', { progress: 2, message: '준비 중...' });
  try {
    const resp = await api('/api/render/build', {
      plan_id: state.producePlan.plan_id,
      resolution: $('renderResolution').value,
      burn_subtitles: $('burnSubtitles').checked,
      fit_narration: $('fitNarration').checked,
      subtitle_style: $('subtitleStyleSelect')?.value || 'outline',
      transition: $('transitionSelect')?.value || 'fade',
    });
    state.render = await runJob(resp, (job) => setProgress('render', job));
    hideProgress('render');
    renderRenderResult();
    showToast('영상이 완성되었습니다.');
    loadHistory();
  } catch (e) {
    setProgress('render', { progress: 100, message: `❌ ${e.message}` });
    showToast(e.message, true);
  } finally {
    setBusy(btn, false);
  }
}

function renderRenderResult() {
  const r = state.render;
  const box = $('renderResult');
  if (state.producePlan) { const ss = (state.producePlan.structured_scenes || []).map((s) => String(s.scene_num)); renderNextStepGuide(ss.length, ss.filter((s) => state.media[s]?.type === 'video').length, ss.filter((s) => state.media[s]?.type === 'image').length, ss.filter((s) => !state.media[s]).length); }
  if (!r) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  const v = $('renderVideo');
  v.src = `${r.video_url}?t=${Date.now()}`;
  $('btnDownloadVideo').href = r.video_url;
  $('btnDownloadVideo').download = `${state.producePlan?.topic || 'video'}.mp4`;
  $('renderInfo').innerHTML = [
    `<span class="badge badge-ok">완성</span>`,
    `<span class="badge badge-mono">${r.resolution}</span>`,
    `<span class="badge badge-mono">${r.duration ? Math.round(r.duration) + '초' : ''}</span>`,
    `<span class="badge">${r.scenes}씬</span>`,
    (() => { const ss = (state.producePlan?.structured_scenes || []).map((s) => String(s.scene_num)); const nv = ss.filter((s) => state.media[s]?.type === 'video').length; return `<span class="badge ${nv === ss.length ? 'badge-ok' : 'badge-warn'}">AI 영상 ${nv}/${ss.length} · 이미지 ${ss.length - nv}</span>`; })(),
    r.subtitles_burned ? '<span class="badge">자막 포함</span>' : '<span class="badge badge-warn">자막 없음</span>',
    r.thumbnail_url ? '<span class="badge">썸네일 준비됨</span>' : '<span class="badge badge-warn">썸네일 없음</span>',
  ].join('');
  $('renderWarnings').innerHTML = (r.warnings || []).map((w) => `<div class="text-[11px] text-amber-700">• ${escapeHtml(w)}</div>`).join('');
  icons();
}

function renderYoutube() {
  const y = state.youtube || {};
  const badge = $('ytStatusBadge');
  const ready = y.libs && y.client_secret;
  if (y.authorized) {
    badge.textContent = y.channel ? `연결됨 · ${y.channel.title}` : '연결됨';
    badge.className = 'badge badge-ok';
  } else if (ready) {
    badge.textContent = '계정 미연결';
    badge.className = 'badge badge-warn';
  } else {
    badge.textContent = '설정 필요';
    badge.className = 'badge badge-warn';
  }
  $('ytStatusText').innerHTML = y.authorized
    ? `<b>${escapeHtml(y.channel?.title || '내 채널')}</b>${y.channel?.subscribers ? ` · 구독자 ${fmtNum(+y.channel.subscribers)}명` : ''} 계정으로 업로드합니다.`
    : !y.libs
    ? '구글 API 패키지가 없습니다: <code>pip3 install google-api-python-client google-auth-oauthlib</code>'
    : !y.client_secret
    ? '<code>data/youtube/client_secret.json</code> 파일이 없습니다. 아래 안내를 따라 준비해주세요.'
    : '준비가 끝났습니다. 연결 버튼을 누르면 브라우저에서 구글 로그인 창이 열립니다.';
  if (y.error) $('ytStatusText').innerHTML += `<div class="text-amber-700 mt-1">${escapeHtml(y.error)}</div>`;
  $('btnYtConnect').style.display = y.authorized ? 'none' : '';
  $('btnYtConnect').disabled = !ready;
  $('btnYtDisconnect').style.display = y.authorized ? '' : 'none';
  $('ytSetupHelp').open = !ready;
  $('btnYtUpload').disabled = !y.authorized;
}

async function connectYoutube() {
  const btn = $('btnYtConnect');
  setBusy(btn, true, '브라우저에서 로그인 중…');
  try {
    const resp = await api('/api/youtube/auth', {});
    showToast('브라우저 창에서 구글 로그인과 권한 허용을 진행해주세요.');
    const r = await runJob(resp);
    await refreshProduceStatus();
    showToast(`'${r.channel?.title || '채널'}' 연결 완료`);
  } catch (e) {
    showToast(e.message, true);
  } finally {
    setBusy(btn, false);
    renderYoutube();
  }
}

async function uploadYoutube() {
  if (!state.render) {
    showToast('먼저 영상을 만들어주세요.', true);
    return;
  }
  const privacy = $('ytPrivacy').value;
  const publishLocal = $('ytPublishAt').value;
  const publish_at = publishLocal ? new Date(publishLocal).toISOString() : null;
  const privacyText = { private: '비공개', unlisted: '일부 공개', public: '공개' }[privacy] || privacy;
  const ok = await tiConfirm({
    title: '유튜브 업로드 확인',
    subtitle: $('ytTitle').value.trim() || '영상 업로드',
    icon: 'upload',
    lines: [
      `• 공개 상태: ${privacyText}`,
      publish_at ? `• 예약 공개: ${publishLocal.replace('T', ' ')}` : '',
      '',
      '현재 완성된 영상과 메타데이터로 유튜브 채널에 바로 업로드할까요?'
    ].filter(Boolean),
    okText: '유튜브에 업로드',
    cancelText: '취소'
  });
  if (!ok) return;
  const btn = $('btnYtUpload');
  setBusy(btn, true, '업로드 중…');
  $('uploadResult').innerHTML = '';
  setProgress('upload', { progress: 2, message: '준비 중...' });
  try {
    const resp = await api('/api/youtube/upload', {
      plan_id: state.producePlan.plan_id,
      title: $('ytTitle').value.trim(),
      description: $('ytDescription').value,
      tags: $('ytTags').value,
      privacy,
      publish_at,
    });
    const r = await runJob(resp, (job) => setProgress('upload', job));
    hideProgress('upload');
    $('uploadResult').innerHTML = `<div class="notice notice-ok"><i data-lucide="check-circle" class="w-4 h-4 shrink-0"></i><div><b>업로드 완료</b> · <a href="${
      r.url
    }" target="_blank" rel="noopener" class="underline">${r.url}</a><div class="text-[11px] mt-1">공개 상태: ${r.privacy}${
      r.publish_at ? ' · 예약됨' : ''
    }${r.thumbnail_set ? ' · 썸네일 설정됨' : ''}</div>${(r.warnings || [])
      .map((w) => `<div class="text-[11px] text-amber-700 mt-1">• ${escapeHtml(w)}</div>`)
      .join('')}</div></div>`;
    showToast('유튜브 업로드가 완료되었습니다.');
    icons();
  } catch (e) {
    setProgress('upload', { progress: 100, message: `❌ ${e.message}` });
    showToast(e.message, true);
  } finally {
    setBusy(btn, false);
  }
}


// ── 4단계: ✍️ 멀티채널 마케팅 & SNS 스튜디오 로직 ───────────────────────

function bindMarketing() {
  // 소스 전환 버튼
  $('btnSyncFromAnalysis')?.addEventListener('click', () => syncMarketingWithCurrentState('analysis'));
  $('btnSyncFromPlan')?.addEventListener('click', () => syncMarketingWithCurrentState('plan'));
  $('btnSyncCustom')?.addEventListener('click', () => syncMarketingWithCurrentState('custom'));

  // 컨텍스트 펼치기/접기
  $('btnToggleContext')?.addEventListener('click', () => {
    const wrap = $('marketingContextWrapper');
    if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  });

  // 분석 / 기획 화면의 바로가기 버튼 연동
  $('btnGoMarketingFromAnalysis')?.addEventListener('click', () => {
    syncMarketingWithCurrentState('analysis');
    setMode('marketing');
  });
  $('btnGoMarketingFromPlan')?.addEventListener('click', () => {
    syncMarketingWithCurrentState('plan');
    setMode('marketing');
  });

  // 3대 탭 전환
  document.querySelectorAll('.marketing-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.marketing-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.marketing-pane').forEach((p) => p.style.display = 'none');
      btn.classList.add('active');
      const target = $(btn.dataset.target);
      if (target) target.style.display = 'block';
      icons();
    });
  });

  // 1. 올인원 일괄 생성
  $('btnRunMarketingAll')?.addEventListener('click', () => executeMarketingGeneration('all'));

  // 2. 개별 채널 생성
  $('btnRunThreadX')?.addEventListener('click', () => executeMarketingGeneration('threads'));
  $('btnRunBlog')?.addEventListener('click', () => executeMarketingGeneration('blog'));
  $('btnRunNewsletter')?.addEventListener('click', () => executeMarketingGeneration('newsletter'));

  // 플랫폼별 알고리즘 가이드 연동
  $('threadPlatformSelect')?.addEventListener('change', updateThreadPlatformAlgoGuide);
  updateThreadPlatformAlgoGuide();

  // 블로그 뷰어 모드 토글 (렌더링 vs 마크다운 원본)
  $('btnBlogViewRendered')?.addEventListener('click', () => {
    $('btnBlogViewRendered').className = 'px-2.5 py-1 rounded-md bg-white shadow-sm text-black';
    $('btnBlogViewRaw').className = 'px-2.5 py-1 rounded-md text-neutral-500';
    $('blogRenderedViewer').style.display = 'block';
    $('blogRawTextarea').style.display = 'none';
  });
  $('btnBlogViewRaw')?.addEventListener('click', () => {
    $('btnBlogViewRaw').className = 'px-2.5 py-1 rounded-md bg-white shadow-sm text-black';
    $('btnBlogViewRendered').className = 'px-2.5 py-1 rounded-md text-neutral-500';
    $('blogRenderedViewer').style.display = 'none';
    $('blogRawTextarea').style.display = 'block';
  });

  // 뉴스레터 뷰어 모드 토글 (PC 640px vs 모바일 375px vs 텍스트)
  $('btnNewsViewDesktop')?.addEventListener('click', () => {
    $('btnNewsViewDesktop').className = 'px-2.5 py-1 rounded-md bg-white shadow-sm text-black flex items-center gap-1';
    $('btnNewsViewMobile').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('btnNewsViewPlain').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('newsPreviewFrameContainer').style.display = 'flex';
    $('newsIframePreview').style.maxWidth = '640px';
    $('newsPlainViewer').style.display = 'none';
  });
  $('btnNewsViewMobile')?.addEventListener('click', () => {
    $('btnNewsViewMobile').className = 'px-2.5 py-1 rounded-md bg-white shadow-sm text-black flex items-center gap-1';
    $('btnNewsViewDesktop').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('btnNewsViewPlain').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('newsPreviewFrameContainer').style.display = 'flex';
    $('newsIframePreview').style.maxWidth = '375px';
    $('newsPlainViewer').style.display = 'none';
  });
  $('btnNewsViewPlain')?.addEventListener('click', () => {
    $('btnNewsViewPlain').className = 'px-2.5 py-1 rounded-md bg-white shadow-sm text-black flex items-center gap-1';
    $('btnNewsViewDesktop').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('btnNewsViewMobile').className = 'px-2.5 py-1 rounded-md text-neutral-500 flex items-center gap-1';
    $('newsPreviewFrameContainer').style.display = 'none';
    $('newsPlainViewer').style.display = 'block';
  });

  // 보관함 버튼
  $('btnMarketingHistory')?.addEventListener('click', openMarketingHistoryModal);
  $('btnCloseMarketingHistory')?.addEventListener('click', () => $('marketingHistoryModal').classList.remove('open'));
  $('marketingHistoryModal')?.addEventListener('click', (e) => { if (e.target === $('marketingHistoryModal')) $('marketingHistoryModal').classList.remove('open'); });
}

async function syncMarketingWithCurrentState(forceSource) {
  // 아직 ①/②를 안 열었어도 최근 결과를 자동으로 불러와 연동
  if (forceSource === 'analysis' && !state.analysis) {
    const first = state.history.analyses[0];
    if (first) { try { const r = await api(`/api/report?id=${encodeURIComponent(first.id)}`); state.analysis = r.data; } catch (e) {} }
    if (!state.analysis) { showToast('분석된 영상이 없습니다. ① 탭에서 먼저 분석해주세요.', true); return; }
  }
  if (forceSource === 'plan' && !state.plan) {
    const first = state.history.plans[0];
    if (first) { try { const r = await api(`/api/plan?id=${encodeURIComponent(first.plan_id)}`); renderPlan(r.data); } catch (e) {} }
    if (!state.plan) { showToast('기획서가 없습니다. ② 탭에서 먼저 만들어주세요.', true); return; }
  }
  const badge = $('marketingSourceBadge');
  const topicInput = $('marketingTopicInput');
  const contextInput = $('marketingContextInput');
  const contextWrapper = $('marketingContextWrapper');

  if (forceSource === 'analysis' || (!forceSource && state.analysis && state.mode === 'marketing' && state.marketing.source !== 'plan')) {
    if (state.analysis) {
      state.marketing.source = 'analysis';
      const meta = state.analysis.info || {};
      const title = meta.title || state.analysis.id || '분석 영상';
      topicInput.value = title;

      let ctx = `[영상 제목] ${title}\n[채널] ${meta.channel || ''} | [조회수] ${(meta.view_count || 0).toLocaleString()}회 | [좋아요] ${(meta.like_count || 0).toLocaleString()}개\n`;
      if (state.analysis.report) {
        ctx += `\n[분석 리포트 요약]\n${state.analysis.report.slice(0, 2500)}\n`;
      }
      if (state.analysis.visual?.core_message) ctx += `\n[핵심 메시지] ${state.analysis.visual.core_message}\n`;
      contextInput.value = ctx;
      contextWrapper.style.display = 'block';
      badge.innerHTML = `연동 모드: <span class="text-red-600 font-bold">📹 분석 영상 연동</span> (${escapeHtml(title).slice(0, 25)}...)`;
      showToast('분석 영상 데이터가 마케팅 허브에 연동되었습니다.');
      return;
    }
  }

  if (forceSource === 'plan' || (!forceSource && state.plan && state.mode === 'marketing')) {
    if (state.plan) {
      state.marketing.source = 'plan';
      const title = state.plan.topic || '기획 콘텐츠';
      topicInput.value = title;
      
      const descText = state.plan.description_plain || (state.plan.meta_text ? plainSnippet(state.plan.meta_text, 500) : '');
      let ctx = `[기획 주제] ${title}\n[추천 제목] ${state.plan.meta?.recommended?.title || ''}\n[설명란]\n${descText.slice(0, 500)}\n\n[씬별 나레이션 대본]\n`;
      const scenes = state.plan.structured_scenes || [];
      scenes.forEach((s) => {
        ctx += `씬 ${s.scene_num}: ${s.subtitle || ''}\n`;
      });
      contextInput.value = ctx;
      contextWrapper.style.display = 'block';
      badge.innerHTML = `연동 모드: <span class="text-indigo-600 font-bold">🎬 기획 대본 연동</span> (${escapeHtml(title).slice(0, 25)}...)`;
      showToast('기획 대본 데이터가 마케팅 허브에 연동되었습니다.');
      return;
    }
  }

  if (forceSource === 'custom') {
    state.marketing.source = 'custom';
    badge.textContent = '연동 모드: 직접 입력 모드';
    topicInput.value = '';
    contextInput.value = '';
    contextWrapper.style.display = 'none';
    topicInput.focus();
    showToast('새로운 마케팅 주제를 입력해주세요.');
  }
}

async function executeMarketingGeneration(mode) {
  const topic = ($('marketingTopicInput')?.value || '').trim();
  if (!topic) {
    showToast('마케팅 주제 또는 키워드를 입력해주세요.', true);
    $('marketingTopicInput')?.focus();
    return;
  }

  const context = ($('marketingContextInput')?.value || '').trim();
  const audience = ($('marketingAudienceInput')?.value || '크리에이터, 직장인, 마케터').trim();

  const options = {
    platform: $('threadPlatformSelect')?.value || 'threads',
    tone: $('threadToneSelect')?.value || 'positive_informative',
    count: parseInt($('threadCountSelect')?.value || '5', 10),
    audience,
    blog_platform: $('blogPlatformSelect')?.value || 'general',
    campaign_type: $('newsCampaignSelect')?.value || 'video_launch',
    offer: ($('newsOfferInput')?.value || '').trim()
  };

  const btnMap = {
    all: $('btnRunMarketingAll'),
    threads: $('btnRunThreadX'),
    blog: $('btnRunBlog'),
    newsletter: $('btnRunNewsletter')
  };
  const activeBtn = btnMap[mode] || $('btnRunMarketingAll');
  const isXPlatform = $('threadPlatformSelect')?.value === 'twitter';

  const btnLabels = {
    all: '올인원 생성 중...',
    threads: isXPlatform ? 'X 트위터 생성중...' : '스레드 생성 중...',
    blog: '블로그 생성 중...',
    newsletter: '뉴스레터 생성 중...'
  };

  setBusy(activeBtn, true, btnLabels[mode] || (isXPlatform ? 'X 트위터 생성중...' : '생성 중...'));

  try {
    const payload = {
      mode,
      topic,
      context,
      options
    };

    const statusEl = $('marketingJobStatus');
    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '생성 시작...'; }
    const resp = await api('/api/marketing/generate', payload);
    const result = await runJob(resp, (job) => {
      if (statusEl) statusEl.textContent = `⏳ ${job.message || '생성 중...'} (${job.progress || 0}%)`;
    });
    if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }

    state.marketing.currentData = result;

    if (mode === 'all') {
      if (result.threads_x) renderThreadsOutput(result.threads_x);
      if (result.seo_blog) renderBlogOutput(result.seo_blog);
      if (result.newsletter) renderNewsletterOutput(result.newsletter);
      showToast('🚀 전채널 마케팅 콘텐츠가 모두 완성되었습니다!');
    } else if (mode === 'threads') {
      renderThreadsOutput(result);
      showToast(isXPlatform ? '𝕏 X(트위터) 바이럴 타래가 생성되었습니다.' : '🧵 스레드 바이럴 타래가 생성되었습니다.');
    } else if (mode === 'blog') {
      renderBlogOutput(result);
      showToast('📝 SEO 블로그 글이 생성되었습니다.');
    } else if (mode === 'newsletter') {
      renderNewsletterOutput(result);
      showToast('📧 뉴스레터 캠페인이 생성되었습니다.');
    }
  } catch (err) {
    showToast(`마케팅 생성 실패: ${err.message}`, true);
  } finally {
    setBusy(activeBtn, false);
    icons();
  }
}

// AI 응답 해석 실패로 기본 틀이 표시된 경우 경고 배너
function marketingFallbackNotice(wrapId, data) {
  const wrap = $(wrapId); if (!wrap) return;
  wrap.querySelector('.fallback-note')?.remove();
  if (data && (data.is_fallback || data.note)) {
    const div = document.createElement('div');
    div.className = 'notice notice-warn fallback-note mb-3';
    div.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i><span><b>이 내용은 AI가 만든 것이 아닙니다.</b> ${escapeHtml(data.note || 'AI 응답을 해석하지 못해 기본 틀이 표시되었습니다.')} — 로컬 AI 모델을 더 큰 것으로 바꾸거나 다시 생성해보세요.</span>`;
    wrap.prepend(div);
  }
}

function countEmojis(str) {
  if (!str) return 0;
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
  const matches = str.match(emojiRegex);
  return matches ? matches.length : 0;
}

window.setMarketingTopic = function(topic) {
  const input = $('marketingTopicInput');
  if (input) {
    input.value = topic;
    input.focus();
    showToast(`주제가 입력되었습니다: "${topic}"`);
  }
};

function updateThreadPlatformAlgoGuide() {
  const platformSelect = $('threadPlatformSelect');
  const noticeBox = $('threadAlgoNoticeBox');
  const btnRunLabel = $('btnRunThreadXLabel');
  if (!noticeBox) return;

  const isTwitter = platformSelect?.value === 'twitter';

  const charLimitNotice = $('threadCharLimitNotice');

  if (isTwitter) {
    if (btnRunLabel) btnRunLabel.textContent = '𝕏 트위터 단독 생성';
    if (charLimitNotice) {
      charLimitNotice.innerHTML = '<i data-lucide="zap" class="w-3.5 h-3.5 text-sky-500"></i> 타래당 글자 수 최적화: <strong>초단문 60~120자</strong> (짧을수록 도달률·완독률 극대화 ⚡)';
    }
    noticeBox.className = 'mt-3 p-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-sky-50/50 to-neutral-50 text-xs text-sky-950 space-y-2 transition-all shadow-sm';
    noticeBox.innerHTML = `
      <div class="flex items-center justify-between font-bold text-sky-900 flex-wrap gap-1">
        <span class="flex items-center gap-1.5">
          <span class="bg-black text-white px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">𝕏</span>
          X(Twitter) 알고리즘 최적화 전략
        </span>
        <span class="text-[11px] text-sky-700 font-semibold flex items-center gap-1">
          <i data-lucide="trending-up" class="w-3.5 h-3.5"></i> 댓글(Replies) 인게이지먼트 극대화 모드
        </span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed text-sky-900">
        <div class="bg-white/85 p-2 rounded-lg border border-sky-100 shadow-2xs">
          <strong class="text-sky-950 block mb-0.5 flex items-center gap-1">📌 콘텐츠 주제</strong>
          주간·업계·전망 / 이슈 화두 제시 (예: <em>"이번 주 AI / 업계에서 주목할 3가지 변수"</em>)
        </div>
        <div class="bg-white/85 p-2 rounded-lg border border-sky-100 shadow-2xs">
          <strong class="text-sky-950 block mb-0.5 flex items-center gap-1">⚡ 알고리즘 최적화 포인트</strong>
          질문으로 <strong>댓글 유도</strong> + <strong>외부링크 제외</strong> + <strong>초단문 60~120자 (짧을수록 유리!)</strong>
        </div>
      </div>
      <div class="pt-1 flex items-center gap-1.5 flex-wrap">
        <span class="text-[10px] text-neutral-400 font-bold">추천 주제 칩:</span>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('이번 주 AI / 업계에서 주목할 3가지 변수')">💡 이번 주 AI 3대 변수</button>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('2026 1인 기업 자동화 테크 주간 트렌드 전망')">📈 1인 기업 주간 전망</button>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('이번 주 크리에이터 생태계 핵심 이슈 3가지')">🔥 크리에이터 이슈 화두</button>
      </div>
    `;
  } else {
    if (btnRunLabel) btnRunLabel.textContent = '🧵 스레드 단독 생성';
    if (charLimitNotice) {
      charLimitNotice.innerHTML = '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i> 타래당 글자 수 최적화: <strong>공백 포함 100~200자</strong> (모바일 한눈 가독성 보장)';
    }
    noticeBox.className = 'mt-3 p-3 rounded-xl border border-pink-200/80 bg-gradient-to-r from-pink-50/70 via-purple-50/30 to-neutral-50 text-xs text-neutral-900 space-y-2 transition-all shadow-sm';
    noticeBox.innerHTML = `
      <div class="flex items-center justify-between font-bold text-pink-950 flex-wrap gap-1">
        <span class="flex items-center gap-1.5">
          <span class="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">🧵</span>
          Threads(스레드) 알고리즘 최적화 전략
        </span>
        <span class="text-[11px] text-rose-700 font-semibold flex items-center gap-1">
          <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> 부정글 노출 억제(-58%) 차단 모드
        </span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed text-neutral-800">
        <div class="bg-white/85 p-2 rounded-lg border border-pink-100 shadow-2xs">
          <strong class="text-pink-950 block mb-0.5 flex items-center gap-1">🌸 콘텐츠 주제</strong>
          긍정적 주간 다짐 / 비하인드 컷 (예: <em>"월요일 모닝 루틴과 이번 주 목표"</em>, 제작 비하인드)
        </div>
        <div class="bg-white/85 p-2 rounded-lg border border-pink-100 shadow-2xs">
          <strong class="text-pink-950 block mb-0.5 flex items-center gap-1">✨ 알고리즘 최적화 포인트</strong>
          <strong>이모지 2~3개 사용</strong> (절제된 가독성) + <strong>부정적 어조 절대 배제</strong> (공식 알고리즘 -58% 노출 페널티 방지)
        </div>
      </div>
      <div class="pt-1 flex items-center gap-1.5 flex-wrap">
        <span class="text-[10px] text-neutral-400 font-bold">추천 주제 칩:</span>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('월요일 모닝 루틴과 이번 주 목표')">🌱 월요일 모닝 루틴과 목표</button>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('1인 비즈니스 콘텐츠 제작 비하인드 컷')">📸 제작 비하인드 컷</button>
        <button type="button" class="algo-quick-chip" onclick="setMarketingTopic('작은 시도로 큰 성장을 만드는 주간 다짐')">✨ 이번 주 긍정 다짐</button>
      </div>
    `;
  }
  icons();
}

function getThreadCharBadgeInfo(count, isTwitter) {
  if (isTwitter) {
    // X(트위터): 짧을수록 유리함 (최적 60~120자 초단문)
    if (count > 280) {
      return { cls: 'danger', text: `${count}자 (한도 280자 초과)` };
    }
    if (count >= 50 && count <= 120) {
      return { cls: 'ok', text: `${count}자 (초단문 최적: 60~120자 ✓)` };
    }
    if (count > 120 && count <= 150) {
      return { cls: 'warn', text: `${count}자 (짧을수록 유리: 120자 이하 권장)` };
    }
    if (count > 150) {
      return { cls: 'danger', text: `${count}자 (너무 긺: 120자 이하 권장)` };
    }
    return { cls: 'warn', text: `${count}자 (최소 50자 권장)` };
  } else {
    // Threads(스레드): 100~200자 모바일 가독성 최적화
    if (count > 500) {
      return { cls: 'danger', text: `${count}자 (한도 500자 초과)` };
    }
    if (count >= 100 && count <= 200) {
      return { cls: 'ok', text: `${count}자 (적정: 100~200자 ✓)` };
    }
    if (count < 100) {
      return { cls: 'warn', text: `${count}자 (권장: 100~200자)` };
    }
    return { cls: count > 250 ? 'danger' : 'warn', text: `${count}자 (권장: 100~200자)` };
  }
}

function renderThreadsOutput(data) {
  if (!data || !data.posts) return;
  const wrap = $('threadOutputWrapper');
  const empty = $('threadEmptyState');
  if (wrap) wrap.style.display = 'block';
  if (empty) empty.style.display = 'none';
  marketingFallbackNotice('threadOutputWrapper', data);

  const isTwitter = data.platform === 'twitter';

  $('threadHookFormula').textContent = `후킹 공식: ${data.hook_formula || (isTwitter ? '주간 업계 전망 + 댓글 유도형' : '긍정적 주간 다짐 + 비하인드 컷')}`;
  $('threadHookScore').textContent = `바이럴 점수: ${data.hook_score || 95}점 🔥`;
  $('threadSummaryText').textContent = data.summary || `${data.topic} 핵심 요약 타래`;

  // Hashtags
  const hashList = $('threadHashtagsList');
  if (hashList) {
    const defaultTags = isTwitter
      ? ['#업계전망', '#트렌드분석', '#테크이슈', '#AI', '#생산성']
      : ['#주간다짐', '#모닝루틴', '#성장기록', '#크리에이터', '#응원'];
    const tags = data.hashtags || defaultTags;
    hashList.innerHTML = tags.map((t) => `<span class="hashtag-chip" data-copy="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('');
    hashList.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy, '해시태그를 복사했습니다.')));
  }

  // Posts Container
  const container = $('threadPostsContainer');
  if (container) {
    container.innerHTML = data.posts.map((p, idx) => {
      const charCount = p.text ? p.text.length : 0;
      const badgeInfo = getThreadCharBadgeInfo(charCount, isTwitter);

      const roleClass = p.role === 'hook' ? 'role-hook' : (p.role === 'cta' ? 'role-cta' : '');
      const roleLabel = p.role === 'hook' ? 'HOOK (후킹 첫인상)' : (p.role === 'cta' ? 'CTA (행동 촉구/요약)' : 'BODY (핵심 내용)');

      // 알고리즘 최적화 지표 배지
      let algoBadgeHtml = '';
      if (isTwitter) {
        const hasQuestion = /[?？]|(까요|은가요|나요|어떠신가요|어떤가요)/.test(p.text || '');
        const hasUrl = /(https?:\/\/[^\s]+)/i.test(p.text || '');
        const qBadge = hasQuestion ? '<span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold flex items-center gap-0.5">💬 질문(댓글 유도)</span>' : '';
        const urlBadge = hasUrl ? '<span class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold flex items-center gap-0.5">⚠️ 외부링크 감지</span>' : '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold flex items-center gap-0.5">✓ 외부링크 없음</span>';
        algoBadgeHtml = `${qBadge}${urlBadge}`;
      } else {
        const emCount = countEmojis(p.text || '');
        const emBadge = (emCount >= 2 && emCount <= 3)
          ? `<span class="px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 text-[10px] font-semibold flex items-center gap-0.5">✨ 이모지 ${emCount}개 (적정: 2~3개 ✓)</span>`
          : (emCount > 3 ? `<span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold flex items-center gap-0.5">이모지 ${emCount}개</span>` : '');
        const toneBadge = '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold flex items-center gap-0.5">✓ 긍정 어조(-58% 방어)</span>';
        algoBadgeHtml = `${emBadge}${toneBadge}`;
      }

      let postBtnHtml = '';
      if (isTwitter) {
        postBtnHtml = `
          <button type="button" class="btn btn-outline !py-0.5 !px-2 text-[11px] flex items-center gap-1 text-sky-600 hover:text-sky-700 border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950 font-semibold shadow-xs transition-all" title="비용 0원! 공식 X(웹인텐트)에 즉시 무료 공유" onclick="openTweetIntent(${idx})">
            <i data-lucide="share-2" class="w-3 h-3"></i>
            <span>무료 트윗 𝕏</span>
          </button>
          <button type="button" id="btnPostTweet_${idx}" class="btn btn-ghost !p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200" title="X 공식 API 자동 포스팅 (종량제 크레딧 필요)" onclick="postSingleTweet(event, ${idx})">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </button>
        `;
      } else {
        postBtnHtml = `
          <button type="button" id="btnPostThread_${idx}" class="btn btn-ghost !p-1 text-neutral-800 hover:text-black dark:text-neutral-200" title="Threads에 포스팅" onclick="postSingleThread(event, ${idx})">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 192 192">
              <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2109 139.019 87.8451C137.537 60.5382 122.616 44.905 97.4619 44.745C97.1266 44.7428 96.7909 44.7428 96.4548 44.745C75.2917 44.745 59.4589 57.0673 54.7214 77.0142C48.9715 101.218 58.2612 121.737 77.2918 126.852C94.4098 131.453 113.886 126.688 123.633 115.485L113.816 106.666C106.914 114.595 92.5181 117.882 79.9175 114.498C66.5298 110.903 59.8451 96.0886 64.0628 78.3371C67.5746 63.5574 79.2558 54.4019 95.8475 54.4019C96.0963 54.4002 96.3454 54.4002 96.5941 54.4019C115.348 54.5208 126.852 66.2307 128.026 87.7208C117.433 87.747 106.992 89.2882 97.0988 92.2829C72.8055 99.636 59.4004 113.864 64.9752 132.284C69.3496 146.74 83.1787 155.674 99.7027 154.717C120.215 153.528 134.629 140.672 139.734 122.95C146.126 128.718 153.486 132.748 161.764 134.802C167.319 136.181 172.935 136.634 178.435 136.177L180.203 126.241C175.766 126.608 171.233 126.241 166.757 125.129C157.068 122.724 148.877 117.514 142.668 110.155C147.24 102.502 149.208 94.0759 148.338 85.3411C147.054 72.4344 140.718 61.0427 130.514 53.2505L124.364 61.3148C132.339 67.4042 137.29 76.3015 138.293 86.386C139.049 94.0416 137.135 101.378 132.84 107.568C127.818 102.327 124.086 96.0664 121.905 89.2413L120.803 85.7925L117.297 86.6433C110.871 88.2005 104.341 89.176 97.7709 89.5606C110.609 85.6756 124.526 84.8142 137.95 87.0098C138.834 87.1541 139.713 87.3236 140.584 87.5173L141.537 88.9883ZM128.847 114.93C124.582 127.591 114.496 136.671 100.279 137.5C88.2023 138.203 78.4316 131.758 75.3121 121.455C71.5034 108.875 80.606 98.8105 99.8821 92.9765C108.204 90.4578 116.892 89.0669 125.688 88.8286C127.469 98.0583 128.536 106.945 128.847 114.93Z"/>
            </svg>
          </button>
        `;
      }

      return `
        <div class="thread-card ${roleClass}" id="threadCard_${idx}">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-1.5">
            <div class="flex items-center gap-2">
              <span class="thread-index-badge">${p.index || (idx + 1)}</span>
              <span class="text-[11px] font-bold text-neutral-700">${roleLabel}</span>
              ${algoBadgeHtml}
            </div>
            <div class="flex items-center gap-2">
              <span class="char-count-badge ${badgeInfo.cls}" id="charBadge_${idx}">${badgeInfo.text}</span>
              <button class="btn btn-ghost !p-1 text-xs" title="이 포스트 복사" onclick="copyText(document.getElementById('threadText_${idx}').value, '${p.index || (idx + 1)}번 포스트를 복사했습니다.')">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
              ${postBtnHtml}
            </div>
          </div>
          <textarea id="threadText_${idx}" rows="4" class="w-full input p-3 text-xs leading-relaxed font-sans bg-white/80" oninput="updateThreadCharCount(${idx}, ${isTwitter})">${escapeHtml(p.text || '')}</textarea>
        </div>
      `;
    }).join('');
  }

  // Bind Copy All & Download
  $('btnCopyAllThreads').onclick = () => {
    const allText = (data.posts || []).map((p, i) => {
      const el = $(`threadText_${i}`);
      return el ? el.value : (p.text || '');
    }).join('\n\n---\n\n');
    copyText(allText, '전체 스레드 타래를 복사했습니다.');
  };

  $('btnDownloadThreadsTxt').onclick = () => {
    const allText = (data.posts || []).map((p, i) => {
      const el = $(`threadText_${i}`);
      return el ? el.value : (p.text || '');
    }).join('\n\n====================\n\n');
    downloadText(`${data.topic || 'threads'}_스레드_타래.txt`, allText);
  };

  const btnFreeTwitter = $('btnOpenFreeTwitterHelper');
  if (btnFreeTwitter) {
    if (isTwitter) {
      btnFreeTwitter.style.display = 'inline-flex';
      btnFreeTwitter.onclick = () => showFreeTwitterThreadHelper(data);
    } else {
      btnFreeTwitter.style.display = 'none';
    }
  }

  const btnPostAll = $('btnPostAllThreads');
  if (btnPostAll) {
    if (isTwitter) {
      btnPostAll.innerHTML = `
        <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        전체 타래 포스팅 (𝕏 Twitter)
      `;
      btnPostAll.title = '타래 순서대로 X(Twitter)에 연속 체이닝 포스팅';
      btnPostAll.onclick = (e) => postAllTweets(e, data);
    } else {
      btnPostAll.innerHTML = `
        <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 192 192">
          <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2109 139.019 87.8451C137.537 60.5382 122.616 44.905 97.4619 44.745C97.1266 44.7428 96.7909 44.7428 96.4548 44.745C75.2917 44.745 59.4589 57.0673 54.7214 77.0142C48.9715 101.218 58.2612 121.737 77.2918 126.852C94.4098 131.453 113.886 126.688 123.633 115.485L113.816 106.666C106.914 114.595 92.5181 117.882 79.9175 114.498C66.5298 110.903 59.8451 96.0886 64.0628 78.3371C67.5746 63.5574 79.2558 54.4019 95.8475 54.4019C96.0963 54.4002 96.3454 54.4002 96.5941 54.4019C115.348 54.5208 126.852 66.2307 128.026 87.7208C117.433 87.747 106.992 89.2882 97.0988 92.2829C72.8055 99.636 59.4004 113.864 64.9752 132.284C69.3496 146.74 83.1787 155.674 99.7027 154.717C120.215 153.528 134.629 140.672 139.734 122.95C146.126 128.718 153.486 132.748 161.764 134.802C167.319 136.181 172.935 136.634 178.435 136.177L180.203 126.241C175.766 126.608 171.233 126.241 166.757 125.129C157.068 122.724 148.877 117.514 142.668 110.155C147.24 102.502 149.208 94.0759 148.338 85.3411C147.054 72.4344 140.718 61.0427 130.514 53.2505L124.364 61.3148C132.339 67.4042 137.29 76.3015 138.293 86.386C139.049 94.0416 137.135 101.378 132.84 107.568C127.818 102.327 124.086 96.0664 121.905 89.2413L120.803 85.7925L117.297 86.6433C110.871 88.2005 104.341 89.176 97.7709 89.5606C110.609 85.6756 124.526 84.8142 137.95 87.0098C138.834 87.1541 139.713 87.3236 140.584 87.5173L141.537 88.9883ZM128.847 114.93C124.582 127.591 114.496 136.671 100.279 137.5C88.2023 138.203 78.4316 131.758 75.3121 121.455C71.5034 108.875 80.606 98.8105 99.8821 92.9765C108.204 90.4578 116.892 89.0669 125.688 88.8286C127.469 98.0583 128.536 106.945 128.847 114.93Z"/>
          </svg>
          전체 타래 포스팅 (Threads)
        `;
        btnPostAll.title = '타래 순서대로 Threads에 연속 체이닝 포스팅';
        btnPostAll.onclick = (e) => postAllThreads(e, data);
    }
  }

  icons();
}

async function showThreadsSetupModal() {
  const ok = await tiConfirm({
    title: 'Threads API 연동 안내',
    subtitle: 'Meta Threads 자동 포스팅을 위한 계정 인증 정보가 필요합니다.',
    icon: 'key',
    html: `
      <div class="space-y-3 text-xs leading-relaxed text-neutral-700">
        <p class="font-medium text-neutral-900">
          Threads에 포스트를 등록하려면 Meta Developers에서 발급받은 계정 키를 프로젝트 설정 파일에 입력해야 합니다.
        </p>
        <div class="bg-neutral-900 text-neutral-200 p-3 rounded-lg font-mono text-[11px] select-all space-y-1 shadow-inner">
          <div class="text-neutral-400"># .env 파일에 아래 설정을 입력해주세요:</div>
          <div class="text-emerald-400">THREADS_USER_ID=<span class="text-neutral-400">내_스레드_ID</span></div>
          <div class="text-emerald-400">THREADS_ACCESS_TOKEN=<span class="text-neutral-400">Threads_장기_액세스_토큰</span></div>
        </div>
        <div class="bg-sky-50 border border-sky-200 rounded p-2.5 text-[11px] text-sky-800 space-y-1">
          <div class="font-bold flex items-center gap-1">💡 즉시 테스트(모의 시뮬레이션) 방법</div>
          <p>토큰 발급 전 전체 타래 연속 체이닝 발행 기능을 바로 시험해보고 싶으시다면, <code>.env</code> 파일에서 <code>THREADS_MOCK=true</code>로 설정하시면 됩니다.</p>
        </div>
      </div>
    `,
    okText: '⚙️ 환경 상태 보기',
    cancelText: '확인 / 닫기',
    okClass: 'btn-primary'
  });
  if (ok) openEnvModal();
}

window._publishedThreadIds = window._publishedThreadIds || {};

window.postSingleThread = async function(event, idx) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const textarea = document.getElementById(`threadText_${idx}`);
  const text = textarea ? textarea.value.trim() : '';
  if (!text) {
    showToast('포스팅할 내용이 없습니다.', true);
    return;
  }

  const prevPostId = (idx > 0 && window._publishedThreadIds) ? window._publishedThreadIds[idx - 1] : null;

  let chainNoticeHtml = '';
  if (idx === 0) {
    chainNoticeHtml = `
      <div class="p-2 bg-neutral-50 rounded border border-neutral-200 text-neutral-600 text-[11px]">
        💡 1번 포스트(Hook)는 새로운 스레드 타래의 <strong>시작 글(Root)</strong>로 등록됩니다.
      </div>
    `;
  } else if (prevPostId) {
    chainNoticeHtml = `
      <div class="p-2.5 bg-sky-50 border border-sky-200 rounded text-sky-900 text-xs space-y-1">
        <label class="flex items-center gap-2 cursor-pointer font-semibold">
          <input type="checkbox" id="replyToPrevCheck_${idx}" checked class="accent-sky-600 w-4 h-4 cursor-pointer" />
          <span>🔗 직전 ${idx}번 포스트에 이어서 타래(답글)로 연결하기</span>
        </label>
        <p class="text-[11px] text-sky-700 pl-6">
          체크 시 Threads 홈피에서 1번~${idx}번 포스트 밑에 댓글(타래)로 자연스럽게 이어집니다.
        </p>
      </div>
    `;
  } else {
    chainNoticeHtml = `
      <div class="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs space-y-1">
        <div class="font-semibold flex items-center gap-1 text-amber-800">
          <span>ℹ️ 개별 포스트 vs 전체 타래 안내</span>
        </div>
        <p class="text-[11px] leading-relaxed text-amber-800">
          현재 ${idx + 1}번 글을 개별 등록하면 <strong>독립된 단독 새 글</strong>로 올라갑니다.<br>
          1번부터 5번까지 <strong>하나로 엮인 타래(Thread)</strong>로 올리시려면 상단 요약 카드의 <strong>[🚀 전체 타래 포스팅 (Threads)]</strong> 버튼을 이용하세요!
        </p>
      </div>
    `;
  }

  // 1. 사전 확인 모달
  const ok = await tiConfirm({
    title: 'Threads 포스트 등록 확인',
    subtitle: `${idx + 1}번 포스트를 Threads에 즉시 등록합니다.`,
    icon: 'send',
    html: `
      <div class="space-y-2 text-xs">
        <div class="font-medium text-neutral-600">등록할 내용 (${text.length}자):</div>
        <div class="p-2.5 bg-neutral-100 rounded border border-neutral-200 text-neutral-800 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">${escapeHtml(text)}</div>
        ${chainNoticeHtml}
        <p class="text-[11px] text-neutral-500">이 포스트를 내 Threads 계정에 게시하시겠습니까?</p>
      </div>
    `,
    okText: 'Threads에 게시',
    cancelText: '취소',
    okClass: 'btn-primary'
  });
  if (!ok) return;

  // 체크박스 상태 확인
  const replyCheckbox = document.getElementById(`replyToPrevCheck_${idx}`);
  const shouldReply = replyCheckbox ? replyCheckbox.checked : false;
  const reply_to_id = (shouldReply && prevPostId) ? prevPostId : null;

  const btn = document.getElementById(`btnPostThread_${idx}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block w-3 h-3 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin"></span>`;
  }

  try {
    const res = await api('/api/threads/post', { text, reply_to_id });
    if (res && res.status === 'success') {
      window._publishedThreadIds = window._publishedThreadIds || {};
      window._publishedThreadIds[idx] = res.media_id;

      showToast(reply_to_id ? '✓ 직전 포스트의 타래(답글)로 연결되었습니다!' : '✓ Threads에 포스팅되었습니다!');
      if (btn) {
        btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>`;
        icons();
        setTimeout(() => { if (btn) { btn.innerHTML = origHtml; btn.disabled = false; icons(); } }, 3000);
      }
      if (res.permalink) {
        const viewNow = await tiConfirm({
          title: '포스팅 완료! 🎉',
          subtitle: reply_to_id ? `${idx}번 글의 답글 타래로 연결되어 등록되었습니다.` : 'Threads에 새 게시물이 성공적으로 등록되었습니다.',
          icon: 'check-circle',
          lines: [
            `게시물 ID: ${res.media_id}`,
            reply_to_id ? `연결된 상위 포스트 ID: ${reply_to_id}` : '',
            '지금 웹 브라우저에서 작성된 게시물을 확인하시겠습니까?'
          ].filter(Boolean),
          okText: '🔗 Threads에서 확인하기',
          cancelText: '닫기'
        });
        if (viewNow) window.open(res.permalink, '_blank');
      }
    } else {
      throw new Error(res.error || '포스팅 응답 오류');
    }
  } catch (err) {
    if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
    const msg = err.message || '';
    if (msg.includes('ACCESS_TOKEN') || msg.includes('설정되지 않았습니다') || msg.includes('unconfigured')) {
      await showThreadsSetupModal();
    } else {
      await tiConfirm({
        title: 'Threads 포스팅 실패 안내',
        subtitle: '게시물 등록 중 오류가 발생했습니다.',
        icon: 'alert-circle',
        lines: [
          `오류 내용: ${msg}`,
          'Threads 계정 권한 또는 네트워크 상태를 확인해주세요.'
        ],
        okText: '확인',
        cancelText: '닫기'
      });
    }
  }
};

window.postAllThreads = async function(event, data) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const textareas = document.querySelectorAll('[id^="threadText_"]');
  const posts = Array.from(textareas).map((t) => t.value.trim()).filter(Boolean);
  if (posts.length === 0) {
    showToast('포스팅할 타래 내용이 없습니다.', true);
    return;
  }

  // 1. 전체 타래 연속 발행 확인 모달
  const ok = await tiConfirm({
    title: '전체 타래 연속 포스팅 확인',
    subtitle: `총 ${posts.length}개의 포스트를 하나의 타래(Thread Chain)로 연결하여 게시합니다.`,
    icon: 'send',
    lines: [
      `• 1번 포스트(Hook)부터 ${posts.length}번 포스트(CTA)까지 순차 답글(reply_to_id) 체이닝`,
      `• 각 포스트별 진행 상황(1/${posts.length} ~ ${posts.length}/${posts.length}) 실시간 표시`,
      `• Threads API 동기화 및 복제 안정성을 위해 포스트 간 2.5초 간격 순차 부여`,
      `• 예상 소요 시간: 약 ${Math.ceil(posts.length * 4)}초`,
      '',
      '지금 Threads에 전체 타래 포스팅을 시작하시겠습니까?'
    ],
    okText: '🚀 전체 타래 연속 발행 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  const btn = $('btnPostAllThreads');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) btn.disabled = true;

  // 카드별 원래 버튼 HTML 보관
  const origCardBtns = {};
  for (let idx = 0; idx < posts.length; idx++) {
    const cardBtn = $(`btnPostThread_${idx}`);
    if (cardBtn) origCardBtns[idx] = cardBtn.innerHTML;
  }

  window._publishedThreadIds = window._publishedThreadIds || {};
  let parentId = null;
  const publishedResults = [];

  try {
    for (let idx = 0; idx < posts.length; idx++) {
      const pText = posts[idx];
      const stepNum = idx + 1;
      const totalNum = posts.length;

      // 1. 메인 버튼 실시간 카운트 갱신 (1/3 -> 2/3 -> 3/3)
      if (btn) {
        btn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 타래 등록 중 (${stepNum}/${totalNum})...`;
      }

      // 2. 현재 작업 중인 카드 UI 표시
      const cardBtn = $(`btnPostThread_${idx}`);
      if (cardBtn) {
        cardBtn.disabled = true;
        cardBtn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin"></span>`;
      }

      const cardEl = $(`threadCard_${idx}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        cardEl.classList.add('ring-2', 'ring-primary', 'ring-offset-1');
      }

      // 3. API 요청 (단일 포스트 발행 & 부모 답글 체이닝)
      const res = await api('/api/threads/post', {
        text: pText,
        reply_to_id: parentId
      });

      if (!res || res.status !== 'success') {
        throw new Error(res?.error || `${stepNum}번 포스트 등록 실패`);
      }

      // 4. 성공 시 상태 기록
      parentId = res.media_id;
      window._publishedThreadIds[idx] = res.media_id;
      publishedResults.push({
        index: stepNum,
        media_id: res.media_id,
        permalink: res.permalink,
        reply_to_id: res.reply_to_id
      });

      // 카드 버튼 완료 표시 (녹색 체크)
      if (cardBtn) {
        cardBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>`;
        icons();
      }
      if (cardEl) {
        cardEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-1');
        cardEl.classList.add('border-emerald-400');
      }

      showToast(`✓ (${stepNum}/${totalNum}) ${stepNum}번 포스트 등록 완료!`);

      // 다음 포스트 등록 전 Meta 서버 동기화 대기 (마지막 포스트 제외)
      if (idx < posts.length - 1) {
        if (btn) {
          btn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 다음 답글 연결 준비 중 (${stepNum}/${totalNum})...`;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    }

    // 전체 완료 처리
    if (btn) {
      btn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> 전체 타래 포스팅 완료! (${publishedResults.length}/${posts.length})`;
      icons();
      setTimeout(() => {
        if (btn) {
          btn.innerHTML = origHtml;
          btn.disabled = false;
          icons();
        }
      }, 5000);
    }

    const rootPermalink = publishedResults[0]?.permalink || `https://www.threads.net/post/${publishedResults[0]?.media_id}`;
    const viewThread = await tiConfirm({
      title: '전체 타래 포스팅 완료! 🎉',
      subtitle: `총 ${publishedResults.length}개의 포스트가 하나의 타래로 연결되어 완벽하게 등록되었습니다.`,
      icon: 'check-circle',
      lines: [
        '1번 훅 포스트부터 마지막 CTA 포스트까지 순차적으로 정상 연결되었습니다.',
        '지금 Threads에서 완성된 타래 전체를 확인하시겠습니까?'
      ],
      okText: '🔗 Threads에서 타래 보기',
      cancelText: '닫기'
    });
    if (viewThread) window.open(rootPermalink, '_blank');

  } catch (err) {
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
    // 실패하지 않은 카드 제외하고 복원
    for (let idx = 0; idx < posts.length; idx++) {
      const cardBtn = $(`btnPostThread_${idx}`);
      if (cardBtn && !publishedResults.find(r => r.index === idx + 1)) {
        cardBtn.disabled = false;
        if (origCardBtns[idx]) cardBtn.innerHTML = origCardBtns[idx];
      }
      const cardEl = $(`threadCard_${idx}`);
      if (cardEl) cardEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-1');
    }

    const msg = err.message || '';
    if (msg.includes('ACCESS_TOKEN') || msg.includes('설정되지 않았습니다') || msg.includes('unconfigured')) {
      await showThreadsSetupModal();
    } else {
      await tiConfirm({
        title: '타래 포스팅 실패 안내',
        subtitle: `총 ${posts.length}개 중 ${publishedResults.length}개 발행 후 오류가 발생했습니다.`,
        icon: 'alert-circle',
        lines: [
          `오류 내용: ${msg}`,
          publishedResults.length > 0 ? `현재까지 ${publishedResults.length}번 포스트까지는 정상 등록되었습니다.` : '',
          '네트워크 상태 또는 Threads 권한을 확인해주세요.'
        ].filter(Boolean),
        okText: '확인',
        cancelText: '닫기'
      });
    }
  }
};

window.openTweetIntent = function(idx) {
  const textarea = $(`threadText_${idx}`);
  const text = textarea ? textarea.value.trim() : '';
  if (!text) {
    showToast('공유할 트윗 내용이 없습니다.', true);
    return;
  }

  // 1. 클립보드 자동 복사 (팝업 차단 대비 및 붙여넣기 편의)
  copyText(text, `${idx + 1}번 트윗이 복사되었습니다.`);

  // 2. X 공식 웹인텐트 최신 URL 생성 (x.com 공식)
  const encodedText = encodeURIComponent(text);
  const url = `https://x.com/intent/post?text=${encodedText}`;

  // 3. 화면 중앙 최적 팝업창 오픈 (모바일/데스크톱 대응)
  const w = 580, h = 520;
  const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
  window.open(url, `x_intent_${idx}_${Date.now()}`, `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);

  showToast(`✓ ${idx + 1}번 트윗 복사 완료 & X 공식 작성창이 열렸습니다! (비용 0원 100% 무료)`);
};

window.copyHelperStep = function(btn, idx) {
  const textarea = $(`threadText_${idx}`);
  const text = textarea ? textarea.value.trim() : '';
  if (!text) {
    showToast('복사할 트윗 내용이 없습니다.', true);
    return;
  }
  copyText(text, `${idx + 1}번 트윗을 복사했습니다.`);
  if (btn) {
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> ${idx + 1}번 복사됨!`;
    btn.classList.add('!bg-emerald-600', '!text-white', '!border-emerald-600');
  }
  const card = $(`helperCard_${idx}`);
  if (card) {
    card.classList.remove('border-neutral-200', 'bg-neutral-50');
    card.classList.add('border-emerald-400', 'bg-emerald-50/50', 'ring-1', 'ring-emerald-300');
  }
  showToast(`✓ ${idx + 1}번 트윗 복사 완료! X 작성창 우측 하단의 [+] 버튼을 누르고 붙여넣으세요.`);
  icons();
};

window.openHelperStep1 = function(btn, idx) {
  openTweetIntent(idx);
  if (btn) {
    btn.innerHTML = `<i data-lucide="check-circle" class="w-3 h-3"></i> 1번 X 창 열림 완료!`;
    btn.classList.add('!bg-sky-600', '!text-white', '!border-sky-600');
  }
  const card = $(`helperCard_${idx}`);
  if (card) {
    card.classList.add('ring-2', 'ring-sky-400');
  }
  icons();
};

window.showFreeTwitterThreadHelper = async function(data) {
  const textareas = document.querySelectorAll('[id^="threadText_"]');
  const posts = Array.from(textareas).map((t, i) => ({
    idx: i,
    text: t.value.trim()
  })).filter((p) => Boolean(p.text));

  if (posts.length === 0) {
    showToast('공유할 타래 내용이 없습니다.', true);
    return;
  }

  const stepsHtml = posts.map((p, i) => {
    const isFirst = i === 0;
    const label = isFirst ? 'STEP 1 · 1번 시작 글 (HOOK)' : `STEP ${i + 1} · ${i + 1}번 답글 타래 (BODY)`;
    const preview = escapeHtml(p.text.length > 80 ? p.text.slice(0, 80) + '...' : p.text);
    const charLen = p.text.length;
    const charBadge = charLen <= 120
      ? `<span class="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">${charLen}자 (최적 ✓)</span>`
      : `<span class="text-[10px] text-neutral-500">${charLen}자</span>`;

    if (isFirst) {
      return `
        <div id="helperCard_${p.idx}" class="p-3 rounded-lg border border-sky-300 bg-sky-50/70 space-y-2 transition-all">
          <div class="flex items-center justify-between flex-wrap gap-1.5">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-xs text-sky-900">${label}</span>
              ${charBadge}
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" class="btn btn-ghost !py-1 !px-2 text-[11px] flex items-center gap-1 bg-white border border-neutral-200 hover:bg-neutral-100 shadow-xs" onclick="copyText(document.getElementById('threadText_${p.idx}').value, '1번 트윗을 복사했습니다.')">
                <i data-lucide="copy" class="w-3 h-3"></i> 복사
              </button>
              <button type="button" class="btn btn-primary !py-1 !px-2.5 text-[11px] flex items-center gap-1.5 !bg-sky-500 hover:!bg-sky-600 text-white shadow-xs font-bold transition-all" onclick="openHelperStep1(this, ${p.idx})">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i> 🚀 1번 트윗 X에서 열기
              </button>
            </div>
          </div>
          <p class="text-[11px] text-neutral-700 font-sans leading-relaxed whitespace-pre-wrap bg-white/70 p-2 rounded border border-sky-100">${preview}</p>
        </div>
      `;
    }

    return `
      <div id="helperCard_${p.idx}" class="p-3 rounded-lg border border-neutral-200 bg-neutral-50/80 space-y-2 transition-all">
        <div class="flex items-center justify-between flex-wrap gap-1.5">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-xs text-neutral-800">${label}</span>
            ${charBadge}
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" class="btn btn-primary !py-1 !px-2.5 text-[11px] flex items-center gap-1.5 !bg-neutral-800 hover:!bg-black text-white shadow-xs font-semibold transition-all" onclick="copyHelperStep(this, ${p.idx})">
              <i data-lucide="copy" class="w-3 h-3"></i> 📋 ${i + 1}번 복사
            </button>
            <button type="button" class="btn btn-ghost !py-1 !px-1.5 text-[10px] text-neutral-500 hover:text-sky-600" title="단독 트윗으로 열기" onclick="openTweetIntent(${p.idx})">
              새 창 열기
            </button>
          </div>
        </div>
        <p class="text-[11px] text-neutral-600 font-sans leading-relaxed whitespace-pre-wrap bg-white/70 p-2 rounded border border-neutral-100">${preview}</p>
      </div>
    `;
  }).join('');

  await tiConfirm({
    title: 'X(트위터) 100% 무료 타래(Thread) 작성 도우미 🌐',
    subtitle: 'API 크레딧 결제 없이 공식 X 웹사이트에서 비용 0원으로 완벽한 5단 타래를 엮습니다.',
    icon: 'share-2',
    html: `
      <div class="space-y-3.5 text-xs leading-relaxed text-neutral-700 max-h-[62vh] overflow-y-auto pr-1">
        <!-- 3단계 비주얼 플로우 -->
        <div class="p-3 bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 border border-sky-200 rounded-xl space-y-2 shadow-xs">
          <div class="font-bold text-sky-950 flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5">⚡ X 공식 웹에서 타래 엮는 3단계 공식 (1분 완성)</span>
            <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">비용 0원 100% 무료</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div class="p-2 bg-white/90 rounded-lg border border-sky-200 shadow-xs">
              <div class="font-bold text-sky-700">① 1번 트윗 열기</div>
              <p class="text-neutral-600 text-[10px] mt-0.5">아래 <strong>[🚀 1번 트윗 X에서 열기]</strong>를 누르면 공식 X 작성창이 팝업됩니다.</p>
            </div>
            <div class="p-2 bg-white/90 rounded-lg border border-indigo-200 shadow-xs">
              <div class="font-bold text-indigo-700">② X 창의 [+] 버튼 클릭</div>
              <p class="text-neutral-600 text-[10px] mt-0.5">X 작성창 우측 하단의 <strong>[+] (타래 추가)</strong>를 눌러 2~5번 빈 칸을 만듭니다.</p>
            </div>
            <div class="p-2 bg-white/90 rounded-lg border border-emerald-200 shadow-xs">
              <div class="font-bold text-emerald-700">③ 복사 & 붙여넣기 후 게시</div>
              <p class="text-neutral-600 text-[10px] mt-0.5">아래 <strong>[📋 N번 복사]</strong>를 눌러 붙여넣고 <strong>[모두 게시]</strong>를 누르면 완성!</p>
            </div>
          </div>
        </div>

        <!-- 스텝별 카드 목록 -->
        <div class="space-y-2.5">
          ${stepsHtml}
        </div>
      </div>
    `,
    okText: '📋 1~5번 전체 타래 한 번에 복사',
    cancelText: '닫기',
    okClass: 'btn-primary !bg-neutral-900 hover:!bg-black text-white'
  }).then((copyAll) => {
    if (copyAll) {
      const allText = posts.map((p) => p.text).join('\n\n---\n\n');
      copyText(allText, '전체 타래를 클립보드에 복사했습니다.');
      showToast('✓ 전체 타래 복사 완료! X 웹 작성창에 붙여넣어보세요.');
    }
  });
  icons();
};

async function showTwitterSetupModal() {
  const ok = await tiConfirm({
    title: 'X (트위터) API 연동 안내',
    subtitle: 'X 공식 API v2 자동 포스팅을 위한 계정 인증 키가 필요합니다.',
    icon: 'key',
    html: `
      <div class="space-y-3 text-xs leading-relaxed text-neutral-700">
        <p class="font-medium text-neutral-900">
          X(Twitter)에 트윗을 등록하려면 X Developer Portal에서 발급받은 API Key 및 Access Token을 프로젝트 설정 파일에 입력해야 합니다.
        </p>
        <div class="p-2.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 space-y-1">
          <div class="font-bold flex items-center gap-1">⚠️ 주의: User authentication settings 권한 확인</div>
          <p>앱 생성 후 기본값인 <code>Read</code> 상태에서는 트윗 작성이 불가(403)합니다. 반드시 <strong>Read and Write</strong>로 변경 후 토큰을 생성해야 합니다. (프로젝트 내 <code>X 트위트 API.md</code> 5단계 가이드 참조)</p>
        </div>
        <div class="bg-neutral-900 text-neutral-200 p-3 rounded-lg font-mono text-[11px] select-all space-y-1 shadow-inner">
          <div class="text-neutral-400"># .env 파일에 아래 설정을 입력해주세요:</div>
          <div class="text-sky-400">TWITTER_API_KEY=<span class="text-neutral-400">내_API_Key</span></div>
          <div class="text-sky-400">TWITTER_API_SECRET=<span class="text-neutral-400">내_API_Secret</span></div>
          <div class="text-sky-400">TWITTER_ACCESS_TOKEN=<span class="text-neutral-400">내_Access_Token</span></div>
          <div class="text-sky-400">TWITTER_ACCESS_TOKEN_SECRET=<span class="text-neutral-400">내_Access_Token_Secret</span></div>
        </div>
        <div class="bg-sky-50 border border-sky-200 rounded p-2.5 text-[11px] text-sky-800 space-y-1">
          <div class="font-bold flex items-center gap-1">💡 즉시 시뮬레이션(모의 테스트) 방법</div>
          <p>API 키 발급 전 타래 연속 체이닝 발행 기능을 바로 시험해보고 싶으시다면, <code>.env</code> 파일에서 <code>TWITTER_MOCK=true</code>로 설정하시면 됩니다.</p>
        </div>
      </div>
    `,
    okText: '⚙️ 환경 설정 열기',
    cancelText: '확인 / 닫기',
    okClass: 'btn-primary'
  });
  if (ok) openEnvModal();
}

window._publishedTweetIds = window._publishedTweetIds || {};

window.postSingleTweet = async function(event, idx) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const textarea = document.getElementById(`threadText_${idx}`);
  const text = textarea ? textarea.value.trim() : '';
  if (!text) {
    showToast('포스팅할 내용이 없습니다.', true);
    return;
  }

  const prevPostId = (idx > 0 && window._publishedTweetIds) ? window._publishedTweetIds[idx - 1] : null;

  let chainNoticeHtml = '';
  if (idx === 0) {
    chainNoticeHtml = `
      <div class="p-2 bg-neutral-50 rounded border border-neutral-200 text-neutral-600 text-[11px]">
        💡 1번 트윗(Hook)은 새로운 X 타래의 <strong>시작 글(Root)</strong>로 등록됩니다.
      </div>
    `;
  } else if (prevPostId) {
    chainNoticeHtml = `
      <div class="p-2.5 bg-sky-50 border border-sky-200 rounded text-sky-900 text-xs space-y-1">
        <label class="flex items-center gap-2 cursor-pointer font-semibold">
          <input type="checkbox" id="replyToPrevTweetCheck_${idx}" checked class="accent-sky-600 w-4 h-4 cursor-pointer" />
          <span>🔗 직전 ${idx}번 트윗에 이어서 타래(답글)로 연결하기</span>
        </label>
        <p class="text-[11px] text-sky-700 pl-6">
          체크 시 X 피드에서 1번~${idx}번 트윗 밑에 <code>in_reply_to_tweet_id</code> 답글(타래)로 자연스럽게 이어집니다.
        </p>
      </div>
    `;
  } else {
    chainNoticeHtml = `
      <div class="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs space-y-1">
        <div class="font-semibold flex items-center gap-1 text-amber-800">
          <span>ℹ️ 단일 트윗 vs 전체 타래 안내</span>
        </div>
        <p class="text-[11px] leading-relaxed text-amber-800">
          현재 ${idx + 1}번 글을 개별 등록하면 <strong>독립된 단독 새 트윗</strong>으로 올라갑니다.<br>
          1번부터 5번까지 <strong>하나로 엮인 타래(Thread)</strong>로 올리시려면 상단 요약 카드의 <strong>[🚀 전체 타래 포스팅 (𝕏 Twitter)]</strong> 버튼을 이용하세요!
        </p>
      </div>
    `;
  }

  // 사전 확인 모달
  const ok = await tiConfirm({
    title: 'X(트위터) 포스트 등록 확인',
    subtitle: `${idx + 1}번 트윗을 X에 즉시 등록합니다.`,
    icon: 'send',
    html: `
      <div class="space-y-2 text-xs">
        <div class="font-medium text-neutral-600">등록할 내용 (${text.length}자):</div>
        <div class="p-2.5 bg-neutral-100 rounded border border-neutral-200 text-neutral-800 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">${escapeHtml(text)}</div>
        ${chainNoticeHtml}
        <p class="text-[11px] text-neutral-500">이 트윗을 내 X(Twitter) 계정에 게시하시겠습니까?</p>
      </div>
    `,
    okText: 'X에 게시',
    cancelText: '취소',
    okClass: 'btn-primary'
  });
  if (!ok) return;

  const replyCheckbox = document.getElementById(`replyToPrevTweetCheck_${idx}`);
  const shouldReply = replyCheckbox ? replyCheckbox.checked : false;
  const reply_to_id = (shouldReply && prevPostId) ? prevPostId : null;

  const btn = document.getElementById(`btnPostTweet_${idx}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></span>`;
  }

  try {
    const res = await api('/api/twitter/post', { text, reply_to_id });
    if (res && res.status === 'success') {
      window._publishedTweetIds = window._publishedTweetIds || {};
      window._publishedTweetIds[idx] = res.tweet_id;

      showToast(reply_to_id ? '✓ 직전 트윗의 타래(답글)로 연결되었습니다!' : '✓ X(Twitter)에 트윗되었습니다!');
      if (btn) {
        btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>`;
        icons();
        setTimeout(() => { if (btn) { btn.innerHTML = origHtml; btn.disabled = false; icons(); } }, 3000);
      }
      if (res.permalink) {
        const viewNow = await tiConfirm({
          title: '트윗 포스팅 완료! 🎉',
          subtitle: reply_to_id ? `${idx}번 글의 답글 타래로 연결되어 등록되었습니다.` : 'X(Twitter)에 새 트윗이 성공적으로 등록되었습니다.',
          icon: 'check-circle',
          lines: [
            `트윗 ID: ${res.tweet_id}`,
            reply_to_id ? `연결된 상위 트윗 ID: ${reply_to_id}` : '',
            '지금 웹 브라우저에서 작성된 트윗을 확인하시겠습니까?'
          ].filter(Boolean),
          okText: '🔗 X(Twitter)에서 확인하기',
          cancelText: '닫기'
        });
        if (viewNow) window.open(res.permalink, '_blank');
      }
    } else {
      throw new Error(res?.error || '포스팅 응답 오류');
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('credits depleted') || msg.includes('크레딧 잔액')) {
      const action = await tiConfirm({
        title: 'X(Twitter) API 크레딧 안내 & 무료 타래 도우미 💳',
        subtitle: 'X의 새로운 종량제(Pay-Per-Use) 정책으로 API 크레딧 잔액이 부족합니다 ($0.00).',
        icon: 'alert-circle',
        html: `
          <div class="space-y-3 text-xs leading-relaxed text-neutral-700">
            <div class="p-3 bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 border border-sky-200 rounded-xl space-y-1.5 shadow-xs">
              <div class="font-bold text-sky-950 flex items-center justify-between">
                <span>✨ 추천: 100% 무료 타래 도우미 (비용 0원)</span>
                <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">비용 0원</span>
              </div>
              <p class="text-[11px] text-sky-900 leading-relaxed">
                결제할 필요 없이 <strong>[무료 타래 도우미]</strong>를 이용하시면 공식 X 작성창을 통해 100% 무료로 5단 타래를 1분 만에 완성하여 게시할 수 있습니다!
              </p>
            </div>
            <div class="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600 space-y-1">
              <div class="font-semibold text-neutral-800">
                💳 API 자동 포스팅을 원하시는 경우:
              </div>
              <p>X Developer Portal 대시보드에서 종량제 크레딧 소액($5)을 충전하시면 공식 API 자동 포스팅이 즉시 활성화됩니다.</p>
              <div class="pt-1">
                <a href="https://developer.x.com/en/portal/dashboard" target="_blank" class="text-sky-600 underline font-medium">X Developer Portal 크레딧 충전 페이지 열기 ↗</a>
              </div>
            </div>
          </div>
        `,
        okText: '🌐 무료 타래 도우미로 즉시 발행',
        cancelText: '닫기',
        okClass: 'btn-primary !bg-sky-600 hover:!bg-sky-700 text-white font-bold'
      });
      if (action) showFreeTwitterThreadHelper();
    } else if (msg.includes('ACCESS_TOKEN') || msg.includes('API_KEY') || msg.includes('설정되지 않았습니다') || msg.includes('unconfigured')) {
      await showTwitterSetupModal();
    } else {
      await tiConfirm({
        title: 'X 포스팅 실패 안내',
        subtitle: '트윗 등록 중 오류가 발생했습니다.',
        icon: 'alert-circle',
        lines: [
          `오류 내용: ${msg}`,
          'X Developer Portal의 Read and Write 권한 또는 토큰 값을 확인해주세요.'
        ],
        okText: '확인',
        cancelText: '닫기'
      });
    }
  }
};

window.postAllTweets = async function(event, data) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const textareas = document.querySelectorAll('[id^="threadText_"]');
  const posts = Array.from(textareas).map((t) => t.value.trim()).filter(Boolean);
  if (posts.length === 0) {
    showToast('포스팅할 타래 내용이 없습니다.', true);
    return;
  }

  // 전체 타래 연속 발행 확인 모달
  const ok = await tiConfirm({
    title: '𝕏 (트위터) 전체 타래 연속 포스팅 확인',
    subtitle: `총 ${posts.length}개의 트윗을 하나의 타래(Thread Chain)로 연결하여 순차 게시합니다.`,
    icon: 'send',
    lines: [
      `• 1번 트윗(Hook)부터 ${posts.length}번 트윗(질문/결론)까지 in_reply_to_tweet_id 순차 체이닝`,
      `• 각 트윗별 진행 상황(1/${posts.length} ~ ${posts.length}/${posts.length}) 실시간 표시`,
      `• X API v2 속도 제한(Rate Limit) 준수 및 안정성을 위해 트윗 간 2초 간격 순차 부여`,
      `• 예상 소요 시간: 약 ${Math.ceil(posts.length * 3)}초`,
      '',
      '지금 X(Twitter)에 전체 타래 포스팅을 시작하시겠습니까?'
    ],
    okText: '🚀 전체 타래 연속 발행 시작',
    cancelText: '취소'
  });
  if (!ok) return;

  const btn = $('btnPostAllThreads');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) btn.disabled = true;

  // 카드별 원래 버튼 HTML 보관
  const origCardBtns = {};
  for (let idx = 0; idx < posts.length; idx++) {
    const cardBtn = $(`btnPostTweet_${idx}`);
    if (cardBtn) origCardBtns[idx] = cardBtn.innerHTML;
  }

  window._publishedTweetIds = window._publishedTweetIds || {};
  let parentId = null;
  const publishedResults = [];

  try {
    for (let idx = 0; idx < posts.length; idx++) {
      const pText = posts[idx];
      const stepNum = idx + 1;
      const totalNum = posts.length;

      // 1. 메인 버튼 실시간 카운트 갱신 (1/3 -> 2/3 -> 3/3)
      if (btn) {
        btn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 트윗 등록 중 (${stepNum}/${totalNum})...`;
      }

      // 2. 현재 작업 중인 카드 UI 표시
      const cardBtn = $(`btnPostTweet_${idx}`);
      if (cardBtn) {
        cardBtn.disabled = true;
        cardBtn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></span>`;
      }

      const cardEl = $(`threadCard_${idx}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        cardEl.classList.add('ring-2', 'ring-sky-500', 'ring-offset-1');
      }

      // 3. API 요청 (단일 트윗 발행 & 직전 트윗 ID로 reply 체이닝)
      const res = await api('/api/twitter/post', {
        text: pText,
        reply_to_id: parentId
      });

      if (!res || res.status !== 'success') {
        throw new Error(res?.error || `${stepNum}번 트윗 등록 실패`);
      }

      // 4. 성공 시 상태 기록
      parentId = res.tweet_id;
      window._publishedTweetIds[idx] = res.tweet_id;
      publishedResults.push({
        index: stepNum,
        tweet_id: res.tweet_id,
        permalink: res.permalink,
        reply_to_id: res.reply_to_id
      });

      // 카드 버튼 완료 표시 (녹색 체크)
      if (cardBtn) {
        cardBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>`;
        icons();
      }
      if (cardEl) {
        cardEl.classList.remove('ring-2', 'ring-sky-500', 'ring-offset-1');
        cardEl.classList.add('border-emerald-400');
      }

      showToast(`✓ (${stepNum}/${totalNum}) ${stepNum}번 트윗 등록 완료!`);

      // 다음 트윗 등록 전 안정적인 체이닝을 위해 대기 (마지막 포스트 제외)
      if (idx < posts.length - 1) {
        if (btn) {
          btn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 다음 답글 연결 준비 중 (${stepNum}/${totalNum})...`;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // 전체 완료 처리
    if (btn) {
      btn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> 전체 타래 포스팅 완료! (${publishedResults.length}/${posts.length})`;
      icons();
      setTimeout(() => {
        if (btn) {
          btn.innerHTML = origHtml;
          btn.disabled = false;
          icons();
        }
      }, 5000);
    }

    const rootPermalink = publishedResults[0]?.permalink || (publishedResults[0]?.tweet_id ? `https://twitter.com/i/web/status/${publishedResults[0]?.tweet_id}` : 'https://x.com');
    const viewThread = await tiConfirm({
      title: '전체 타래 포스팅 완료! 🎉',
      subtitle: `총 ${publishedResults.length}개의 트윗이 하나의 타래(Thread Chain)로 연결되어 완벽하게 등록되었습니다.`,
      icon: 'check-circle',
      lines: [
        '1번 Hook 트윗부터 마지막 질문/결론 트윗까지 순차적으로 정상 연결되었습니다.',
        '지금 X(Twitter)에서 완성된 타래 전체를 확인하시겠습니까?'
      ],
      okText: '🔗 X(Twitter)에서 타래 보기',
      cancelText: '닫기'
    });
    if (viewThread) window.open(rootPermalink, '_blank');

  } catch (err) {
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
    // 실패하지 않은 카드 제외하고 복원
    for (let idx = 0; idx < posts.length; idx++) {
      const cardBtn = $(`btnPostTweet_${idx}`);
      if (cardBtn && !publishedResults.find(r => r.index === idx + 1)) {
        cardBtn.disabled = false;
        if (origCardBtns[idx]) cardBtn.innerHTML = origCardBtns[idx];
      }
      const cardEl = $(`threadCard_${idx}`);
      if (cardEl) cardEl.classList.remove('ring-2', 'ring-sky-500', 'ring-offset-1');
    }

    const msg = err.message || '';
    if (msg.includes('credits depleted') || msg.includes('크레딧 잔액')) {
      const action = await tiConfirm({
        title: 'X(Twitter) API 크레딧 안내 & 무료 타래 도우미 💳',
        subtitle: 'X의 새로운 종량제(Pay-Per-Use) 정책으로 API 크레딧 잔액이 부족합니다 ($0.00).',
        icon: 'alert-circle',
        html: `
          <div class="space-y-3 text-xs leading-relaxed text-neutral-700">
            <div class="p-3 bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 border border-sky-200 rounded-xl space-y-1.5 shadow-xs">
              <div class="font-bold text-sky-950 flex items-center justify-between">
                <span>✨ 추천: 100% 무료 타래 도우미 (비용 0원)</span>
                <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">비용 0원</span>
              </div>
              <p class="text-[11px] text-sky-900 leading-relaxed">
                결제할 필요 없이 <strong>[무료 타래 도우미]</strong>를 이용하시면 공식 X 작성창을 통해 100% 무료로 5단 타래를 1분 만에 완성하여 게시할 수 있습니다!
              </p>
            </div>
            <div class="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600 space-y-1">
              <div class="font-semibold text-neutral-800">
                💳 API 자동 포스팅을 원하시는 경우:
              </div>
              <p>X Developer Portal 대시보드에서 종량제 크레딧 소액($5)을 충전하시면 공식 API 자동 포스팅이 즉시 활성화됩니다.</p>
              <div class="pt-1">
                <a href="https://developer.x.com/en/portal/dashboard" target="_blank" class="text-sky-600 underline font-medium">X Developer Portal 크레딧 충전 페이지 열기 ↗</a>
              </div>
            </div>
          </div>
        `,
        okText: '🌐 무료 타래 도우미로 즉시 발행',
        cancelText: '닫기',
        okClass: 'btn-primary !bg-sky-600 hover:!bg-sky-700 text-white font-bold'
      });
      if (action) showFreeTwitterThreadHelper();
    } else if (msg.includes('ACCESS_TOKEN') || msg.includes('API_KEY') || msg.includes('설정되지 않았습니다') || msg.includes('unconfigured')) {
      await showTwitterSetupModal();
    } else {
      await tiConfirm({
        title: 'X 타래 포스팅 실패 안내',
        subtitle: `총 ${posts.length}개 중 ${publishedResults.length}개 발행 후 오류가 발생했습니다.`,
        icon: 'alert-circle',
        lines: [
          `오류 내용: ${msg}`,
          publishedResults.length > 0 ? `현재까지 ${publishedResults.length}번 트윗까지는 정상 등록되었습니다.` : '',
          '네트워크 상태 또는 X Developer Portal 설정을 확인해주세요.'
        ].filter(Boolean),
        okText: '확인',
        cancelText: '닫기'
      });
    }
  }
};


function updateThreadCharCount(idx, isTwitter) {
  const textarea = $(`threadText_${idx}`);
  const badge = $(`charBadge_${idx}`);
  if (!textarea || !badge) return;
  const count = textarea.value.length;
  const info = getThreadCharBadgeInfo(count, isTwitter);
  badge.textContent = info.text;
  badge.className = 'char-count-badge ' + info.cls;
}

function renderBlogOutput(data) {
  if (!data || !data.markdown_content) return;
  const wrap = $('blogOutputWrapper');
  const empty = $('blogEmptyState');
  if (wrap) wrap.style.display = 'block';
  if (empty) empty.style.display = 'none';
  marketingFallbackNotice('blogOutputWrapper', data);

  const meta = data.meta || {};
  $('blogReadingTime').textContent = `예상 완독 시간: ${meta.reading_time_min || 5}분`;
  $('blogMetaTitleText').textContent = meta.title || `${data.topic} 완벽 가이드`;
  $('blogMetaDescText').textContent = meta.description || `${data.topic}에 대한 핵심 요약 및 실전 가이드입니다.`;

  // Keywords
  const kwList = $('blogKeywordsList');
  if (kwList) {
    const kws = meta.keywords || [data.topic, 'AI자동화', '생산성', 'TubeInsight', '가이드'];
    kwList.innerHTML = kws.map((k) => `<span class="hashtag-chip" data-copy="${escapeHtml(k)}">#${escapeHtml(k)}</span>`).join('');
    kwList.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy, '키워드를 복사했습니다.')));
  }

  // Cover Image Prompt
  $('blogCoverPromptText').textContent = data.cover_image_prompt || 'Minimalist modern 3D workspace aesthetic, 8k resolution, cinematic lighting --ar 16:9';

  // Markdown Render
  const mdContent = data.markdown_content || '';
  $('blogRenderedViewer').innerHTML = md(mdContent);
  $('blogRawTextarea').value = mdContent;

  // Copy Buttons
  $('btnCopyMetaTitle').onclick = () => copyText($('blogMetaTitleText').textContent, '메타 타이틀을 복사했습니다.');
  $('btnCopyMetaDesc').onclick = () => copyText($('blogMetaDescText').textContent, '메타 디스크립션을 복사했습니다.');
  $('btnCopyCoverPrompt').onclick = () => copyText($('blogCoverPromptText').textContent, '커버 이미지 프롬프트를 복사했습니다.');
  
  $('btnCopyBlogMarkdown').onclick = () => copyText($('blogRawTextarea').value, '블로그 마크다운 본문을 복사했습니다.');
  $('btnCopyBlogHtml').onclick = () => copyText($('blogRenderedViewer').innerHTML, '블로그 HTML 본문을 복사했습니다.');
  $('btnDownloadBlogMd').onclick = () => downloadText(`${data.topic || 'blog'}_SEO_블로그.md`, $('blogRawTextarea').value);

  icons();
}

function renderNewsletterOutput(data) {
  if (!data || !data.html_template) return;
  const wrap = $('newsletterOutputWrapper');
  const empty = $('newsletterEmptyState');
  if (wrap) wrap.style.display = 'block';
  if (empty) empty.style.display = 'none';
  marketingFallbackNotice('newsletterOutputWrapper', data);

  // A/B Subject lines
  const subList = $('newsSubjectLinesList');
  if (subList) {
    const subjects = data.subject_lines || [];
    subList.innerHTML = subjects.map((s, idx) => `
      <div class="subject-item-card" data-copy="${escapeHtml(s.subject || '')}" title="클릭하면 제목 복사">
        <div class="flex items-center gap-2">
          <span class="badge badge-purple text-[10px] font-bold">${escapeHtml(s.type || `안 ${idx + 1}`)}</span>
          <span class="text-xs font-bold text-neutral-800">${escapeHtml(s.subject || '')}</span>
        </div>
        <span class="text-[11px] text-neutral-400 font-normal truncate max-w-[200px]">${escapeHtml(s.preview_text || '')}</span>
      </div>
    `).join('');
    subList.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy, '이메일 제목을 복사했습니다.')));
  }

  // HTML Frame Preview
  const iframe = $('newsIframePreview');
  if (iframe) {
    iframe.srcdoc = data.html_template;
  }

  // Plain text
  $('newsPlainViewer').value = data.plain_text || '';

  // Copy & Download
  $('btnCopyNewsHtml').onclick = () => copyText(data.html_template, '이메일 HTML 템플릿을 복사했습니다.');
  $('btnDownloadNewsHtml').onclick = () => downloadText(`${data.topic || 'newsletter'}_이메일_뉴스레터.html`, data.html_template);
  $('btnCopyNewsPlain').onclick = () => copyText($('newsPlainViewer').value, '이메일 일반 텍스트를 복사했습니다.');

  icons();
}

async function openMarketingHistoryModal() {
  try {
    const res = await api('/api/marketing/history');
    const items = res.history || [];
    const list = $('marketingHistoryList');
    const modeLabel = { all: '올인원', threads: '스레드', blog: '블로그', newsletter: '뉴스레터' };
    list.innerHTML = items.length ? items.map((it) => `
      <button class="subtle-box p-2.5 w-full text-left hover:border-black transition-all" data-entry="${escapeHtml(it.id)}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-black truncate">${escapeHtml(it.topic || '무제')}</span>
          <span class="badge shrink-0">${modeLabel[it.mode] || it.mode || '올인원'}</span>
        </div>
        <div class="text-[10px] text-neutral-400 font-mono mt-0.5">${fmtTs(it.timestamp)}</div>
      </button>`).join('') : '<p class="text-xs text-neutral-400">저장된 기록이 없습니다. 생성하면 자동으로 보관됩니다.</p>';
    list.querySelectorAll('[data-entry]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await api(`/api/marketing/get?id=${encodeURIComponent(b.dataset.entry)}`);
        const entry = r.entry || {}; const result = entry.result || entry;  // 신·구 형식 모두
        $('marketingHistoryModal').classList.remove('open');
        if (entry.topic) $('marketingTopicInput').value = entry.topic;
        state.marketing.currentData = result;
        if (result.threads_x || result.seo_blog || result.newsletter) {
          if (result.threads_x) renderThreadsOutput(result.threads_x);
          if (result.seo_blog) renderBlogOutput(result.seo_blog);
          if (result.newsletter) renderNewsletterOutput(result.newsletter);
        } else if (result.posts) renderThreadsOutput(result);
        else if (result.markdown_content) renderBlogOutput(result);
        else if (result.html_template) renderNewsletterOutput(result);
        showToast('보관함에서 불러왔습니다.');
      } catch (e) { showToast(e.message, true); }
    }));
    $('marketingHistoryModal').classList.add('open'); icons();
  } catch (e) {
    showToast(e.message, true);
  }
}


// ══════════════════════════ 00 채널 세팅 스튜디오 ══════════════════════════

function bindChannelStudio() {
  $('btnRunChannelGen')?.addEventListener('click', generateChannelSetup);
  $('btnGenChannelImages')?.addEventListener('click', generateChannelImages);
  $('btnCheckManualHandle')?.addEventListener('click', checkManualHandle);
  $('manualHandleInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkManualHandle(); });
  $('btnApplyChannelBranding')?.addEventListener('click', applyChannelBranding);
  $('channelHistorySelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__reset__') {
      resetChannelHistoryList();
      return;
    }
    loadChannelData(val);
  });
  $('channelAnalysisSelect')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__reset__') {
      resetChannelAnalysisList();
      return;
    }
    try {
      let analysis = (state.analysis && state.analysis.id === val) ? state.analysis : null;
      if (!analysis) {
        const r = await api(`/api/report?id=${encodeURIComponent(val)}`);
        analysis = r.data;
      }
      if (analysis) {
        applyAnalysisToChannel(analysis);
        showToast('분석 영상에서 채널 주제 및 정보를 가져왔습니다.');
      }
    } catch (err) {
      showToast('분석 영상 정보를 가져오지 못했습니다: ' + err.message, true);
    }
  });
  $('btnChannelFromAnalysis')?.addEventListener('click', () => {
    if (state.analysis) {
      transferBenchToChannel();
    } else {
      showToast('분석된 영상이 없습니다. 01 영상 분석 탭에서 영상을 분석해주세요.', true);
    }
  });

  // 복사 버튼들
  $('btnCopyChannelName')?.addEventListener('click', () => {
    copyText($('channelNameOutput').textContent, '채널 이름을 복사했습니다.');
  });
  $('btnCopyChannelDesc')?.addEventListener('click', () => {
    copyText($('channelDescOutput').value, '채널 설명을 복사했습니다.');
  });
  $('btnCopyKeywords')?.addEventListener('click', () => {
    const kws = (state.channel.currentData?.channel_keywords || []).join(', ');
    copyText(kws, '채널 키워드를 복사했습니다.');
  });
  $('btnCopyAvatarPrompt')?.addEventListener('click', () => {
    copyText($('channelAvatarPromptText').textContent, '아바타 프롬프트를 복사했습니다.');
  });
  $('btnCopyBannerPrompt')?.addEventListener('click', () => {
    copyText($('channelBannerPromptText').textContent, '배너 프롬프트를 복사했습니다.');
  });
  $('btnCopyUploadDefaults')?.addEventListener('click', () => {
    const def = state.channel.currentData?.upload_defaults;
    if (!def) return;
    const txt = `[제목 템플릿]\n${def.title_template}\n\n[설명란 템플릿]\n${def.description_template}\n\n[태그]\n${(def.tags || []).join(', ')}\n\n[카테고리] ${def.category_id}\n[공개] ${def.privacy_status}`;
    copyText(txt, '업로드 기본값을 복사했습니다.');
  });
}

function resetChannelInputsAndOutputs() {
  state.channel.currentData = null;
  if ($('channelTopicInput')) $('channelTopicInput').value = '';
  if ($('channelAudienceInput')) $('channelAudienceInput').value = '';
  if ($('channelLangSelect')) $('channelLangSelect').value = 'ko';
  if ($('channelToneSelect')) $('channelToneSelect').value = 'professional';
  if ($('channelPersonaSelect')) $('channelPersonaSelect').value = 'character';
  if ($('channelAudioLangSelect')) $('channelAudioLangSelect').value = 'ko';
  if ($('manualHandleInput')) $('manualHandleInput').value = '';

  if ($('channelProgressBox')) $('channelProgressBox').style.display = 'none';
  if ($('channelResultWrapper')) $('channelResultWrapper').style.display = 'none';
  if ($('channelEmptyState')) $('channelEmptyState').style.display = 'block';

  if ($('channelNameOutput')) $('channelNameOutput').textContent = '';
  if ($('channelDescOutput')) $('channelDescOutput').value = '';
  if ($('channelKeywordsList')) $('channelKeywordsList').innerHTML = '';
  if ($('channelHandlesList')) $('channelHandlesList').innerHTML = '';
  if ($('manualHandleResult')) {
    $('manualHandleResult').style.display = 'none';
    $('manualHandleResult').textContent = '';
  }

  if ($('channelAvatarImg')) {
    $('channelAvatarImg').src = '';
    $('channelAvatarImg').style.display = 'none';
  }
  if ($('channelAvatarEmpty')) $('channelAvatarEmpty').style.display = 'block';
  if ($('channelAvatarPromptText')) $('channelAvatarPromptText').textContent = '';
  if ($('btnDownloadAvatar')) $('btnDownloadAvatar').style.display = 'none';

  if ($('channelBannerImg')) {
    $('channelBannerImg').src = '';
    $('channelBannerImg').style.display = 'none';
  }
  if ($('channelBannerEmpty')) $('channelBannerEmpty').style.display = 'block';
  if ($('channelBannerPromptText')) $('channelBannerPromptText').textContent = '';
  if ($('btnDownloadBanner')) $('btnDownloadBanner').style.display = 'none';
}

function resetChannelAnalysisList() {
  state.clearedLists.channelAnalysis = true;
  const sel = $('channelAnalysisSelect');
  if (sel) {
    sel.innerHTML = '<option value="">01 분석 영상에서 주제 가져오기…</option><option value="__reset__">초기화</option>';
    sel.value = '';
  }
  resetChannelInputsAndOutputs();
  showToast('채널 입력 및 결과창이 초기화되었습니다.');
}

function resetChannelHistoryList() {
  state.clearedLists.channelHistory = true;
  const hSel = $('channelHistorySelect');
  if (hSel) {
    hSel.innerHTML = '<option value="">저장된 채널 목록…</option><option value="__reset__">초기화</option>';
    hSel.value = '';
  }
  resetChannelInputsAndOutputs();
  showToast('채널 입력 및 결과창이 초기화되었습니다.');
}

async function loadChannelHistory() {
  try {
    const r = await api('/api/channel/history');
    state.channel.history = r.channels || [];
    const sel = $('channelHistorySelect');
    if (sel) {
      if (state.clearedLists?.channelHistory) {
        sel.innerHTML = '<option value="">저장된 채널 목록…</option><option value="__reset__">초기화</option>';
        sel.value = '';
      } else {
        const cur = sel.value;
        sel.innerHTML = '<option value="">저장된 채널 목록…</option>' +
          state.channel.history.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.channel_name || c.topic)} (${c.lang})</option>`).join('') +
          '<option value="__reset__">초기화</option>';
        if (state.channel.currentData) sel.value = state.channel.currentData.channel_id;
        else if (cur && cur !== '__reset__' && state.channel.history.some(c => c.id === cur)) sel.value = cur;
      }
    }
  } catch (e) {
    console.error('채널 히스토리 로드 실패:', e);
  }
}

async function loadChannelData(id) {
  state.clearedLists.channelHistory = false;
  try {
    const r = await api(`/api/channel?id=${encodeURIComponent(id)}`);
    if (r.data) {
      renderChannelOutput(r.data);
      showToast(`'${r.data.channel_name}' 채널 설정을 불러왔습니다.`);
    }
  } catch (e) {
    showToast(e.message, true);
  }
}

async function generateChannelSetup() {
  const topic = $('channelTopicInput').value.trim();
  if (!topic) {
    showToast('채널 주제를 입력해주세요.', true);
    $('channelTopicInput').focus();
    return;
  }
  const lang = $('channelLangSelect').value || 'ko';
  const audience = $('channelAudienceInput').value.trim() || undefined;
  const tone = $('channelToneSelect').value || undefined;
  const persona_type = $('channelPersonaSelect').value || 'character';
  const audio_lang = $('channelAudioLangSelect').value || lang;

  const btn = $('btnRunChannelGen');
  setBusy(btn, true, '채널 세팅 8종 생성 및 핸들 검사 중…');
  try {
    const res = await api('/api/channel/generate', {
      topic, lang, audience, tone, persona_type, audio_lang
    });
    const result = await runJob(res, (job) => {
      setProgress('channel', job);
    });
    hideProgress('channel');
    renderChannelOutput(result);
    state.clearedLists.channelHistory = false;
    await loadChannelHistory();
    showToast('🎉 채널 세팅 8종이 성공적으로 생성되었습니다!');
  } catch (e) {
    hideProgress('channel');
    showToast(`채널 생성 실패: ${e.message}`, true);
  } finally {
    setBusy(btn, false);
  }
}

async function generateChannelImages() {
  if (!state.channel.currentData) {
    showToast('먼저 채널 세팅을 생성해주세요.', true);
    return;
  }
  const btn = $('btnGenChannelImages');
  setBusy(btn, true, '나노바나나로 프로필/배너 생성 중…');
  try {
    const res = await api('/api/channel/images', {
      channel_id: state.channel.currentData.channel_id,
      channel_data: state.channel.currentData
    });
    const result = await runJob(res, (job) => {
      setProgress('channel', job);
    });
    hideProgress('channel');
    renderChannelOutput(result);
    showToast('📸 AI 프로필 및 배너 이미지가 생성되었습니다!');
  } catch (e) {
    hideProgress('channel');
    showToast(`이미지 생성 실패: ${e.message}`, true);
  } finally {
    setBusy(btn, false);
  }
}

async function checkManualHandle() {
  const input = $('manualHandleInput');
  const handle = (input.value || '').trim().replace(/^@/, '');
  if (!handle) {
    showToast('확인할 핸들을 입력해주세요.', true);
    return;
  }
  const btn = $('btnCheckManualHandle');
  setBusy(btn, true, '중복 확인 중…');
  const resBox = $('manualHandleResult');
  try {
    const r = await api('/api/channel/check-handle', { handle });
    resBox.style.display = 'block';
    if (r.available) {
      resBox.className = 'mt-2 text-xs font-bold text-emerald-600 flex items-center gap-1';
      resBox.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> @${escapeHtml(r.handle)} 은(는) 사용 가능합니다!`;
    } else {
      resBox.className = 'mt-2 text-xs font-bold text-red-600 flex items-center gap-1';
      resBox.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> @${escapeHtml(r.handle)} 은(는) 이미 사용 중입니다. (<a href="${r.url}" target="_blank" class="underline">채널 확인</a>)`;
    }
    icons();
  } catch (e) {
    showToast(`핸들 확인 오류: ${e.message}`, true);
  } finally {
    setBusy(btn, false);
  }
}

async function applyChannelBranding() {
  if (!state.channel.currentData) {
    showToast('적용할 채널 데이터가 없습니다.', true);
    return;
  }
  const d = state.channel.currentData;
  const btn = $('btnApplyChannelBranding');
  setBusy(btn, true, '유튜브 Data API 전송 중…');
  try {
    const r = await api('/api/channel/apply-branding', {
      description: d.channel_description,
      keywords: d.channel_keywords,
      default_language: d.channel_language
    });
    if (r.status === 'success') {
      showToast('🎉 유튜브 채널 설명 & 키워드가 성공적으로 업데이트되었습니다!');
    } else {
      showToast(r.message || '업데이트 실패', true);
    }
  } catch (e) {
    showToast(`브랜딩 적용 실패: ${e.message}`, true);
  } finally {
    setBusy(btn, false);
  }
}

async function checkChannelYtStatus() {
  const badge = $('channelYtStatusBadge');
  if (!badge) return;
  try {
    const r = await api('/api/render/status');
    const yt = r.youtube || {};
    if (yt.authorized) {
      badge.textContent = `연결됨 (${yt.channel?.title || yt.channel_title || '내 채널'})`;
      badge.className = 'badge badge-ok';
    } else {
      badge.textContent = '계정 미연결 (03 탭에서 연결 가능)';
      badge.className = 'badge badge-warn';
    }
  } catch (e) {
    badge.textContent = '상태 확인 불가';
    badge.className = 'badge';
  }
}

function renderChannelOutput(data) {
  if (!data) return;
  state.channel.currentData = data;
  $('channelEmptyState').style.display = 'none';
  $('channelResultWrapper').style.display = 'block';

  // 1. 이름 & 핸들
  $('channelNameOutput').textContent = data.channel_name || '—';
  $('channelLangBadge').textContent = `${data.channel_language || 'ko'}`;

  const handlesList = $('channelHandlesList');
  if (handlesList) {
    const handles = data.handle_candidates || [];
    handlesList.innerHTML = handles.map(h => {
      const isAvail = h.available !== false;
      const badgeCls = isAvail ? 'available' : 'taken';
      const badgeText = isAvail ? '사용 가능' : '사용 중';
      return `
        <div class="handle-card ${badgeCls}">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-sm text-neutral-900">@${escapeHtml(h.handle)}</span>
            <span class="handle-status-badge ${badgeCls}">${badgeText}</span>
            <span class="text-[10px] text-neutral-400 font-mono">(${escapeHtml(h.style || 'candidate')})</span>
          </div>
          <div class="flex items-center gap-1.5">
            <a href="${escapeHtml(h.url)}" target="_blank" rel="noopener" class="text-xs text-neutral-500 hover:text-black underline" title="유튜브 채널 이동">확인</a>
            <button class="btn btn-ghost !py-1 text-xs copy-handle-btn" data-handle="@${escapeHtml(h.handle)}">
              <i data-lucide="copy" class="w-3 h-3"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    handlesList.querySelectorAll('.copy-handle-btn').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.dataset.handle, '핸들을 복사했습니다.'));
    });
  }

  // 2. 설명 & 키워드
  $('channelDescOutput').value = data.channel_description || '';
  const kwList = $('channelKeywordsList');
  if (kwList) {
    const kws = data.channel_keywords || [];
    kwList.innerHTML = kws.map(k => `
      <button class="chip hover:border-black text-xs kw-chip" data-kw="${escapeHtml(k)}">
        #${escapeHtml(k)}
      </button>
    `).join('');
    kwList.querySelectorAll('.kw-chip').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.dataset.kw, `'${btn.dataset.kw}' 키워드를 복사했습니다.`));
    });
  }

  // 3. 프로필 & 배너 프롬프트 및 이미지
  $('channelAvatarPromptText').textContent = data.avatar_prompt || '—';
  $('channelBannerPromptText').textContent = data.banner_prompt || '—';

  const avatarImg = $('channelAvatarImg');
  const avatarEmpty = $('channelAvatarEmpty');
  const dlAvatar = $('btnDownloadAvatar');
  if (data.avatar_image) {
    avatarImg.src = data.avatar_image + `?t=${Date.now()}`;
    avatarImg.style.display = 'block';
    avatarEmpty.style.display = 'none';
    dlAvatar.href = data.avatar_image;
    dlAvatar.style.display = 'inline-flex';
  } else {
    avatarImg.style.display = 'none';
    avatarEmpty.style.display = 'block';
    dlAvatar.style.display = 'none';
  }

  const bannerImg = $('channelBannerImg');
  const bannerEmpty = $('channelBannerEmpty');
  const dlBanner = $('btnDownloadBanner');
  if (data.banner_image) {
    bannerImg.src = data.banner_image + `?t=${Date.now()}`;
    bannerImg.style.display = 'block';
    bannerEmpty.style.display = 'none';
    dlBanner.href = data.banner_image;
    dlBanner.style.display = 'inline-flex';
  } else {
    bannerImg.style.display = 'none';
    bannerEmpty.style.display = 'block';
    dlBanner.style.display = 'none';
  }

  // 4. 업로드 기본값
  const def = data.upload_defaults || {};
  $('defTitleTmpl').textContent = def.title_template || '—';
  $('defDescTmpl').value = def.description_template || '';
  $('defCategoryBadge').textContent = `카테고리: ${def.category_id || '27'}`;
  $('defPrivacyBadge').textContent = `공개: ${def.privacy_status || 'private'}`;
  $('defLangBadge').textContent = `언어: ${def.default_language || data.channel_language || 'ko'}`;

  // 5. 8단계 체크리스트
  const stepsList = $('channelSetupStepsList');
  if (stepsList) {
    const steps = data.setup_steps || [];
    stepsList.innerHTML = steps.map((s, idx) => `
      <label class="step-checklist-item cursor-pointer">
        <input type="checkbox" class="step-check mt-0.5 rounded border-neutral-300">
        <div class="text-xs text-neutral-800 leading-snug">
          <span class="font-bold text-neutral-900">${idx + 1}. ${escapeHtml(s.step)}</span>:
          <span class="text-neutral-600">${escapeHtml(s.guide)}</span>
        </div>
      </label>
    `).join('');

    stepsList.querySelectorAll('.step-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const item = e.target.closest('.step-checklist-item');
        if (item) item.classList.toggle('completed', e.target.checked);
      });
    });
  }

  icons();
}


