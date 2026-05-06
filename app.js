/* ===== 状态管理 ===== */
const State = {
  count: 1,
  generating: false,
  settings: JSON.parse(localStorage.getItem('t2i_settings') || '{}'),
};

/* ===== 初始化 ===== */
window.addEventListener('DOMContentLoaded', () => {
  updateApiStatus();
  initPromptCounter();
  if (State.settings.apiKey) {
    document.getElementById('apiKey').value = State.settings.apiKey;
    document.getElementById('apiProvider').value = State.settings.provider || 'aliyun';
    onProviderChange();
  }
});

function initPromptCounter() {
  const ta = document.getElementById('prompt');
  const cc = document.getElementById('charCount');
  ta.addEventListener('input', () => {
    const len = ta.value.length;
    cc.textContent = `${len} / 500`;
    cc.style.color = len > 450 ? 'var(--danger)' : 'var(--text3)';
  });
}

/* ===== 设置 ===== */
function openSettings() {
  document.getElementById('settingsModal').classList.add('active');
}
function closeSettings(e) {
  if (!e || e.target === document.getElementById('settingsModal')) {
    document.getElementById('settingsModal').classList.remove('active');
  }
}
function saveSettings() {
  const provider = document.getElementById('apiProvider').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const customUrl = document.getElementById('customUrl').value.trim();
  if (!apiKey) { showToast('请填入 API Key', 'error'); return; }
  State.settings = { provider, apiKey, customUrl };
  localStorage.setItem('t2i_settings', JSON.stringify(State.settings));
  updateApiStatus();
  closeSettings();
  showToast('配置已保存', 'success');
}
function onProviderChange() {
  const prov = document.getElementById('apiProvider').value;
  const hints = {
    aliyun: '格式：sk-xxxxx（阿里云百炼）',
    tencent: '格式：SecretId::SecretKey（腾讯云，用::分隔）',
    zhipu: '格式：xxxxx.xxxxx（智谱平台）',
    stability: '格式：sk-xxxxx（Stability AI）',
    custom: '填入你的 API Key',
  };
  document.getElementById('keyHint').textContent = hints[prov] || '';
  document.getElementById('customUrlRow').style.display = prov === 'custom' ? 'flex' : 'none';
}
function updateApiStatus() {
  const el = document.getElementById('apiStatus');
  if (State.settings.apiKey) {
    const names = { aliyun:'阿里通义万象', tencent:'腾讯混元', zhipu:'智谱CogView', stability:'Stability AI', custom:'自定义接口' };
    el.innerHTML = `<span class="dot dot--green"></span> ${names[State.settings.provider] || '已配置'}`;
  } else {
    el.innerHTML = `<span class="dot dot--gray"></span> 未配置 API`;
  }
}

/* ===== 计数器 ===== */
function changeCount(delta) {
  State.count = Math.max(1, Math.min(4, State.count + delta));
  document.getElementById('countVal').textContent = State.count;
}

/* ===== 快捷标签 ===== */
function appendTag(tag) {
  const ta = document.getElementById('prompt');
  const val = ta.value.trim();
  ta.value = val ? `${val}，${tag}` : tag;
  ta.dispatchEvent(new Event('input'));
}

/* ===== 核心：生成图片 ===== */
async function generate() {
  if (State.generating) return;

  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) { showToast('请先输入提示词', 'error'); return; }

  if (!State.settings.apiKey) {
    showToast('请先配置 API Key', 'error');
    openSettings();
    return;
  }

  const negPrompt = document.getElementById('negPrompt').value.trim();
  const style = document.getElementById('style').value;
  const size = document.getElementById('size').value;
  const seed = parseInt(document.getElementById('seed').value) || -1;
  const count = State.count;

  // 组合完整提示词
  const fullPrompt = [style, prompt, 'professional design, high quality'].filter(Boolean).join(', ');

  setGenerating(true);
  hideEmpty();

  // 生成占位骨架屏
  const skeletons = [];
  for (let i = 0; i < count; i++) {
    skeletons.push(addSkeleton());
  }

  try {
    const results = await callAPI({ prompt: fullPrompt, negPrompt, size, seed, count });
    skeletons.forEach((sk, i) => {
      if (results[i]) {
        replaceSkeleton(sk, results[i], prompt, size);
      } else {
        sk.remove();
      }
    });
    showToast(`生成完成，共 ${results.filter(Boolean).length} 张`, 'success');
  } catch (err) {
    skeletons.forEach(sk => sk.remove());
    showToast('生成失败：' + err.message, 'error');
    console.error(err);
    checkEmpty();
  } finally {
    setGenerating(false);
  }
}

/* ===== API 调用路由 ===== */
async function callAPI({ prompt, negPrompt, size, seed, count }) {
  const { provider, apiKey, customUrl } = State.settings;
  switch (provider) {
    case 'aliyun':   return callAliyun({ prompt, negPrompt, size, count, apiKey });
    case 'tencent':  return callTencent({ prompt, negPrompt, size, count, apiKey });
    case 'zhipu':    return callZhipu({ prompt, size, count, apiKey });
    case 'stability':return callStability({ prompt, negPrompt, size, count, apiKey });
    case 'custom':   return callCustom({ prompt, negPrompt, size, count, apiKey, customUrl });
    default: throw new Error('未知的服务商');
  }
}

/* ===== 阿里云通义万象 ===== */
async function callAliyun({ prompt, negPrompt, size, count, apiKey }) {
  const [w, h] = size.split('x');
  const body = {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt, negative_prompt: negPrompt || undefined },
    parameters: { size: `${w}*${h}`, n: count },
  };

  // 提交任务
  const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
    body: JSON.stringify(body),
  });
  const submitData = await submitRes.json();
  if (submitData.code) throw new Error(submitData.message || '提交失败');

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('未获取到任务ID');

  // 轮询结果
  return await pollAliyun(taskId, apiKey);
}

async function pollAliyun(taskId, apiKey, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    const status = data.output?.task_status;
    if (status === 'SUCCEEDED') {
      return (data.output?.results || []).map(r => r.url);
    }
    if (status === 'FAILED') throw new Error(data.output?.message || '任务失败');
  }
  throw new Error('生成超时，请重试');
}

/* ===== 智谱 CogView ===== */
async function callZhipu({ prompt, size, count, apiKey }) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'cogview-3-flash', prompt, size }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    results.push(data.data?.[0]?.url);
  }
  return results;
}

/* ===== Stability AI ===== */
async function callStability({ prompt, negPrompt, size, count, apiKey }) {
  const [width, height] = size.split('x').map(Number);
  const results = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        text_prompts: [
          { text: prompt, weight: 1 },
          ...(negPrompt ? [{ text: negPrompt, weight: -1 }] : []),
        ],
        cfg_scale: 7, width, height, samples: 1, steps: 30,
      }),
    });
    const data = await res.json();
    if (data.message) throw new Error(data.message);
    const b64 = data.artifacts?.[0]?.base64;
    if (b64) results.push(`data:image/png;base64,${b64}`);
  }
  return results;
}

/* ===== 腾讯混元（Cloudflare Pages Functions 代理） ===== */
async function callTencent({ prompt, negPrompt, size, count, apiKey }) {
  const res = await fetch('/api/tencent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size, count }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // 腾讯云返回的是 Base64 图片数据
  if (data.Response?.ResultImage) {
    return ['data:image/png;base64,' + data.Response.ResultImage];
  }
  return data.images || [];
}

/* ===== 自定义接口 ===== */
async function callCustom({ prompt, negPrompt, size, count, apiKey, customUrl }) {
  const res = await fetch(customUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, negative_prompt: negPrompt, size, n: count }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // 尝试兼容多种返回格式
  if (data.data) return data.data.map(d => d.url || d.b64_json ? `data:image/png;base64,${d.b64_json}` : null);
  if (data.images) return data.images;
  if (data.url) return [data.url];
  throw new Error('无法解析接口返回格式');
}

/* ===== UI 辅助 ===== */
function setGenerating(val) {
  State.generating = val;
  const btn = document.getElementById('generateBtn');
  const txt = document.getElementById('btnText');
  btn.disabled = val;
  txt.textContent = val ? '⏳ 生成中...' : '🚀 开始生成';
}

function hideEmpty() {
  const el = document.getElementById('emptyState');
  if (el) el.style.display = 'none';
}

function checkEmpty() {
  const gallery = document.getElementById('gallery');
  const hasItems = gallery.querySelectorAll('.gallery-item').length > 0;
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = hasItems ? 'none' : 'flex';
}

function addSkeleton() {
  const gallery = document.getElementById('gallery');
  const sk = document.createElement('div');
  sk.className = 'skeleton';
  sk.innerHTML = `
    <div class="skeleton__img"></div>
    <div class="progress-wrap">
      <div class="progress-bar"><div class="progress-bar__fill" style="width:60%"></div></div>
    </div>
    <div class="skeleton__text"></div>
    <div class="skeleton__text skeleton__text--short"></div>
  `;
  gallery.appendChild(sk);
  return sk;
}

function replaceSkeleton(sk, imgUrl, prompt, size) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  const isBase64 = imgUrl.startsWith('data:');
  const downloadHref = imgUrl;
  const fileName = `t2i_${Date.now()}.png`;
  item.innerHTML = `
    <div class="gallery-item__img-wrap" onclick="openPreview('${isBase64 ? '' : imgUrl}', this)">
      <img class="gallery-item__img" src="${imgUrl}" alt="${prompt}" loading="lazy" />
      <div class="gallery-item__overlay"><span class="overlay-icon">🔍</span></div>
    </div>
    <div class="gallery-item__info">
      <div class="gallery-item__prompt">${escapeHtml(prompt)}</div>
      <div class="gallery-item__meta">
        <span class="gallery-item__size">${size}</span>
        <div class="gallery-item__actions">
          <button class="icon-btn" title="复制提示词" onclick="copyPrompt('${escapeAttr(prompt)}')">📋</button>
          <a class="icon-btn" href="${downloadHref}" download="${fileName}" title="下载">⬇️</a>
        </div>
      </div>
    </div>
  `;
  // 存储 base64 数据用于预览
  if (isBase64) item.querySelector('.gallery-item__img-wrap').dataset.src = imgUrl;
  sk.replaceWith(item);
}

function clearGallery() {
  const gallery = document.getElementById('gallery');
  gallery.querySelectorAll('.gallery-item, .skeleton').forEach(el => el.remove());
  checkEmpty();
}

/* ===== 预览 ===== */
function openPreview(url, wrap) {
  const src = url || wrap?.dataset?.src || wrap?.querySelector('img')?.src;
  if (!src) return;
  document.getElementById('previewImg').src = src;
  document.getElementById('downloadBtn').href = src;
  document.getElementById('downloadBtn').download = `t2i_${Date.now()}.png`;
  document.getElementById('previewModal').classList.add('active');
}
function closePreview() {
  document.getElementById('previewModal').classList.remove('active');
}

/* ===== 复制提示词 ===== */
function copyPrompt(text) {
  navigator.clipboard.writeText(text).then(() => showToast('提示词已复制'));
}

/* ===== Toast ===== */
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = `toast${type ? ` toast--${type}` : ''}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  toastTimer = setTimeout(() => toast.remove(), 3000);
}

/* ===== 工具函数 ===== */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(s) { return s.replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
