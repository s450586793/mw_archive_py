let models = [];
let activeTag = "";
let activeAuthor = "";
let currentPage = 1;
let pageSize = 12; // 每页显示数量
let currentLightboxList = [];
let currentLightboxIndex = 0;
const statBlueprint = [
  { key: "likes", icon: "👍", label: "点赞" },
  { key: "favorites", icon: "⭐", label: "收藏" },
  { key: "downloads", icon: "⬇️", label: "下载" },
  { key: "prints", icon: "🖨️", label: "打印" },
  { key: "views", icon: "👁️", label: "浏览" }
];
const kwInput = document.getElementById("kw");
const filterChips = document.getElementById("filterChips");
const authorChips = document.getElementById("authorChips");
const clearBtn = document.getElementById("clearBtn");
const paginationWrap = document.getElementById("pagination");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
let favoriteSet = new Set();
let printedSet = new Set();

function getModelKey(m){
  return String(m.dir || "");
}

async function loadFlags(){
  try{
    const res = await fetch("/api/gallery/flags");
    if(!res.ok) throw new Error("flags request failed");
    const data = await res.json();
    favoriteSet = new Set(Array.isArray(data.favorites) ? data.favorites : []);
    printedSet = new Set(Array.isArray(data.printed) ? data.printed : []);
  } catch (e) {
    console.warn("载入标记失败", e);
    favoriteSet = new Set();
    printedSet = new Set();
  }
}

async function saveFlags(){
  try{
    await fetch("/api/gallery/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        favorites: Array.from(favoriteSet),
        printed: Array.from(printedSet)
      })
    });
  } catch (e) {
    console.warn("保存标记失败", e);
  }
}

function updatePageSize(){
  const w = window.innerWidth || document.documentElement.clientWidth;
  const prev = pageSize;
  pageSize = w < 600 ? 8 : 12;
  return prev !== pageSize;
}

window.addEventListener('resize', () => {
  const changed = updatePageSize();
  if(changed){ currentPage = 1; render(); }
});

function formatDate(value){
  if(!value) return "";
  const parsed = new Date(value);
  if(Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("zh-CN");
}

function toNumber(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toggleFavorite(m){
  const key = getModelKey(m);
  if(!key) return;
  if(favoriteSet.has(key)){ favoriteSet.delete(key); } else { favoriteSet.add(key); }
  saveFlags();
  render();
}

function togglePrinted(m){
  const key = getModelKey(m);
  if(!key) return;
  if(printedSet.has(key)){ printedSet.delete(key); } else { printedSet.add(key); }
  saveFlags();
  render();
}

function deleteModel(m){
  const key = getModelKey(m);
  if(!key) return;
  const name = m.title || m.baseName || m.dir || "该模型";
  if(!window.confirm(`确定物理删除「${name}」? 删除后无法恢复。`)) return;
  fetch(`/api/models/${encodeURIComponent(key)}/delete`, { method: "POST" })
    .then((res) => {
      if(!res.ok) throw new Error("delete failed");
      models = models.filter(item => getModelKey(item) !== key);
      favoriteSet.delete(key);
      printedSet.delete(key);
      saveFlags();
      currentPage = 1;
      renderFilters();
      renderAuthorFilters();
      render();
    })
    .catch((e) => {
      console.error("删除失败", e);
      alert("删除失败，请检查服务器日志");
    });
}

async function load(){
  try{
    await loadFlags();
    const res = await fetch("/api/gallery");
    models = await res.json();
  } catch (e) {
    console.error("载入模型失败", e);
    models = [];
  }
  renderFilters();
  renderAuthorFilters();
  updatePageSize();
  currentPage = 1;
  render();
}

function renderFilters(){
  if(!filterChips) return;
  const counts = {};
  models.forEach(m => (m.tags || []).forEach(tag => {
    counts[tag] = (counts[tag] || 0) + 1;
  }));
  filterChips.innerHTML = "";
  const createChip = (label, tag, count) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip" + (activeTag === tag ? " active" : "");
    btn.setAttribute('aria-pressed', activeTag === tag ? 'true' : 'false');
    btn.textContent = `${label}${typeof count === "number" ? ` (${count})` : ""}`;
    btn.addEventListener("click", () => {
      activeTag = tag;
      currentPage = 1;
      renderFilters();
      renderAuthorFilters();
      render();
    });
    return btn;
  };
  filterChips.appendChild(createChip("全部模型", "", models.length || 0));
  Object.entries(counts)
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([tag, count]) => filterChips.appendChild(createChip(tag, tag, count)));
}

function renderAuthorFilters(){
  if(!authorChips) return;
  const counts = {};
  models.forEach(m => {
    const name = (m.author && m.author.name) ? m.author.name : "未知作者";
    counts[name] = (counts[name] || 0) + 1;
  });
  authorChips.innerHTML = "";
  const createChip = (label, name, count) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip" + (activeAuthor === name ? " active" : "");
    btn.setAttribute('aria-pressed', activeAuthor === name ? 'true' : 'false');
    btn.textContent = `${label}${typeof count === "number" ? ` (${count})` : ""}`;
    btn.addEventListener("click", () => {
      activeAuthor = name;
      currentPage = 1;
      renderFilters();
      renderAuthorFilters();
      render();
    });
    return btn;
  };
  authorChips.appendChild(createChip("全部作者", "", models.length || 0));
  Object.entries(counts)
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([name, count]) => authorChips.appendChild(createChip(name, name, count)));
}

function renderPagination(totalPages){
  if(!paginationWrap) return;
  paginationWrap.innerHTML = "";
  if(totalPages <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'small';
  prev.textContent = '上一页';
  prev.setAttribute('aria-label','上一页');
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); render(); });
  paginationWrap.appendChild(prev);

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for(let i = start; i <= end; i++){
    const btn = document.createElement('button');
    btn.textContent = String(i);
    if(i === currentPage){ btn.className = 'active'; btn.setAttribute('aria-current','page'); }
    btn.addEventListener('click', () => { currentPage = i; render(); });
    paginationWrap.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'small';
  next.textContent = '下一页';
  next.setAttribute('aria-label','下一页');
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => { currentPage = Math.min(totalPages, currentPage + 1); render(); });
  paginationWrap.appendChild(next);
}

function openLightbox(list, index){
  if(!list || !list.length) return;
  currentLightboxList = list;
  currentLightboxIndex = index;
  const m = list[index];
  const imgPath = `/files/${m.dir}/images/${m.cover || 'design_01.png'}`;
  lightboxImg.src = imgPath;
  lightboxImg.alt = m.title || m.baseName || '';
  lightboxImg.classList.remove('zoomed');
  lightboxCaption.textContent = m.title || m.baseName || '';
  lightbox.style.display = 'flex';
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const closeBtn = lightbox.querySelector('.lightbox-close');
  if(closeBtn) closeBtn.focus();
}
function closeLightbox(){
  lightbox.style.display = 'none';
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
  document.body.style.overflow = '';
}
function lightboxPrev(){
  if(currentLightboxIndex > 0){ currentLightboxIndex--; openLightbox(currentLightboxList, currentLightboxIndex); }
}
function lightboxNext(){
  if(currentLightboxIndex < currentLightboxList.length - 1){ currentLightboxIndex++; openLightbox(currentLightboxList, currentLightboxIndex); }
}

function render(){
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  if(!grid) return;
  const keyword = (kwInput?.value || "").trim().toLowerCase();
  let list = models;
  if(keyword){
    list = list.filter(m => {
      const title = (m.title || m.baseName || "").toLowerCase();
      const tags = (m.tags || []).map(t => t.toLowerCase());
      return title.includes(keyword) || tags.some(t => t.includes(keyword));
    });
  }
  if(activeTag){
    list = list.filter(m => (m.tags || []).includes(activeTag));
  }
  if(activeAuthor){
    list = list.filter(m => (m.author?.name || "未知作者") === activeAuthor);
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if(currentPage > totalPages) currentPage = totalPages;

  // slice for pagination
  const start = (currentPage - 1) * pageSize;
  const pagedList = list.slice(start, start + pageSize);

  grid.innerHTML = "";
  if(!pagedList.length){
    const tips = [];
    if(activeTag) tips.push(`标签「${activeTag}」`);
    if(keyword) tips.push(`关键词「${kwInput.value.trim()}」`);
    if(activeAuthor) tips.push(`作者「${activeAuthor}」`);
    empty.textContent = tips.length ? `未找到匹配 ${tips.join("、")}` : "暂无模型";
    empty.style.display = "block";
    paginationWrap.innerHTML = '';
    return;
  }
  empty.style.display = "none";

  pagedList.forEach((m, idx) => {
    const modelKey = getModelKey(m);
    const isFavorite = modelKey && favoriteSet.has(modelKey);
    const isPrinted = modelKey && printedSet.has(modelKey);
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;
    card.onclick = () => window.open(`/files/${m.dir}/index.html`, `_blank`);
    card.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); window.open(`/files/${m.dir}/index.html`, `_blank`); } });

    const cover = document.createElement("img");
    const coverName = m.cover || "design_01.png";
    cover.src = `/files/${m.dir}/images/${coverName}`;
    cover.loading = 'lazy';
    cover.alt = m.title || m.baseName || "模型封面";
    // click on image opens lightbox (prevent propagation to card)
    cover.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(pagedList, idx); });
    card.appendChild(cover);

    const overlay = document.createElement('div');
    overlay.className = 'img-overlay';
    overlay.innerHTML = `<div class="overlay-content"><div class="overlay-title">${escapeHtml(m.title || m.baseName || '')}</div><button class="view-btn" aria-label="查看">查看</button></div>`;
    overlay.querySelector('.view-btn').addEventListener('click', (e) => { e.stopPropagation(); openLightbox(pagedList, idx); });
    card.appendChild(overlay);

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = m.title || m.baseName || "未知模型";
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const authorWrap = document.createElement("div");
    authorWrap.className = "author";
    if(m.author?.avatarRelPath){
      const avatar = document.createElement("img");
      avatar.src = `/files/${m.dir}/${m.author.avatarRelPath}`;
      avatar.alt = m.author?.name || "作者头像";
      authorWrap.appendChild(avatar);
    }
    const authorName = document.createElement("span");
    authorName.textContent = m.author?.name || "未知作者";
    authorWrap.appendChild(authorName);
    meta.appendChild(authorWrap);

    const countInfo = document.createElement("span");
    countInfo.textContent = `${m.instanceCount || 0} 个打印配置`;
    meta.appendChild(countInfo);
    body.appendChild(meta);

    const badgeRow = document.createElement("div");
    badgeRow.className = "badges";
    let hasBadge = false;
    if(isFavorite){
      const badge = document.createElement("span");
      badge.className = "badge-favorite";
      badge.textContent = "已收藏";
      badgeRow.appendChild(badge);
      hasBadge = true;
    }
    if(isPrinted){
      const badge = document.createElement("span");
      badge.className = "badge-printed";
      badge.textContent = "已打印";
      badgeRow.appendChild(badge);
      hasBadge = true;
    }
    if(m.instanceCount){
      const badge = document.createElement("span");
      badge.textContent = `打印配置 ${m.instanceCount}`;
      badgeRow.appendChild(badge);
      hasBadge = true;
    }
    if(m.publishedAt){
      const badge = document.createElement("span");
      badge.textContent = `发布时间 ${formatDate(m.publishedAt)}`;
      badgeRow.appendChild(badge);
      hasBadge = true;
    }
    if(m.collectedAt){
      const badge = document.createElement("span");
      badge.textContent = `采集日期 ${formatDate(m.collectedAt)}`;
      badgeRow.appendChild(badge);
      hasBadge = true;
    }
    if(hasBadge){
      body.appendChild(badgeRow);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "action-btn" + (isFavorite ? " active" : "");
    favBtn.textContent = isFavorite ? "已收藏" : "收藏";
    favBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(m); });
    actions.appendChild(favBtn);

    const printedBtn = document.createElement("button");
    printedBtn.type = "button";
    printedBtn.className = "action-btn" + (isPrinted ? " active" : "");
    printedBtn.textContent = isPrinted ? "已打印" : "标记已打印";
    printedBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePrinted(m); });
    actions.appendChild(printedBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "action-btn danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteModel(m); });
    actions.appendChild(deleteBtn);
    body.appendChild(actions);

    const statsWrap = document.createElement("div");
    statsWrap.className = "stats";
    statBlueprint.forEach(stat => {
      const value = toNumber(m.stats?.[stat.key]);
      const chip = document.createElement("span");
      chip.className = "stat-chip";
      chip.title = stat.label;
      chip.innerHTML = `<span class="stat-icon">${stat.icon}</span><strong>${value}</strong><span class="stat-label">${stat.label}</span>`;
      statsWrap.appendChild(chip);
    });
    body.appendChild(statsWrap);

    if(m.tags?.length){
      const tagsRow = document.createElement("div");
      tagsRow.className = "card-tags";
      m.tags.forEach(tag => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tagsRow.appendChild(chip);
      });
      body.appendChild(tagsRow);
    }

    card.appendChild(body);
    grid.appendChild(card);
  });

  renderPagination(totalPages);
}

// small helper to avoid embedding raw html
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

if(kwInput){
  kwInput.addEventListener("input", () => { currentPage = 1; render(); });
}
if(clearBtn && kwInput){
  clearBtn.addEventListener("click", () => {
    kwInput.value = "";
    currentPage = 1;
    render();
  });
}

// lightbox controls
if(lightbox){
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  if(closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if(prevBtn) prevBtn.addEventListener('click', lightboxPrev);
  if(nextBtn) nextBtn.addEventListener('click', lightboxNext);

  lightbox.addEventListener('click', (e) => { if(e.target === lightbox) closeLightbox(); });

  // touch / swipe support
  let touchStartX = 0; let touchStartY = 0; let touchStartTime = 0; let lastTap = 0;
  lightboxImg.addEventListener('touchstart', (e) => {
    if(e.touches && e.touches.length === 1){
      touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchStartTime = Date.now();
    }
  }, { passive: true });
  lightboxImg.addEventListener('touchend', (e) => {
    const dt = Date.now() - touchStartTime;
    const now = Date.now();
    // double tap to toggle zoom
    if(now - lastTap < 300){
      lightboxImg.classList.toggle('zoomed');
      lastTap = 0; return;
    }
    lastTap = now;
    if(dt < 500 && e.changedTouches && e.changedTouches.length === 1){
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      // horizontal swipe
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
        if(dx < 0) lightboxNext(); else lightboxPrev();
      }
    }
  }, { passive: true });

  // double click to toggle zoom (desktop)
  lightboxImg.addEventListener('dblclick', (e) => { e.preventDefault(); lightboxImg.classList.toggle('zoomed'); });

  // keyboard navigation
  window.addEventListener('keydown', (e) => {
    if(lightbox.style.display !== 'none'){
      if(e.key === 'Escape') closeLightbox();
      if(e.key === 'ArrowLeft') lightboxPrev();
      if(e.key === 'ArrowRight') lightboxNext();
    }
  });
}

load();
