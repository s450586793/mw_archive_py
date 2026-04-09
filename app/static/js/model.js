/**
 * model.js — v2 模型详情页前端渲染
 * 读取 meta.json 并动态生成所有页面内容
 */
(function () {
    'use strict';

    // ============ 工具函数 ============

    /** 从 URL 路径解析 modelDir */
    function getModelDir() {
        var parts = location.pathname.split('/').filter(Boolean);
        // 路由: /v2/files/{modelDir}
        var idx = parts.indexOf('v2');
        if (idx >= 0 && parts[idx + 1] === 'files' && parts.length > idx + 2) {
            return decodeURIComponent(parts[idx + 2]);
        }
        // 路由: /files/{modelDir}/index.html
        var filesIdx = parts.indexOf('files');
        if (filesIdx >= 0 && parts.length > filesIdx + 1) {
            return decodeURIComponent(parts[filesIdx + 1]);
        }
        return '';
    }

    /** 构建模型文件目录下的相对资源 URL */
    function fileUrl(modelDir, relPath) {
        if (window.__OFFLINE_META__) {
            return './' + relPath;
        }
        // 使用 API 路由替代 StaticFiles，避免中文/特殊字符路径编码问题
        return '/api/models/' + encodeURIComponent(modelDir) + '/file/' + relPath;
    }

    /** HTML 转义 */
    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    /** 格式化时长（秒） */
    function formatDuration(seconds) {
        var sec = parseInt(seconds, 10);
        if (isNaN(sec) || sec <= 0) return '';
        var hours = sec / 3600;
        if (hours >= 1) return hours.toFixed(1) + ' h';
        return (sec / 60).toFixed(1) + ' min';
    }

    /** 格式化日期 */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var clean = String(dateStr).replace('Z', '+00:00');
            var d = new Date(clean);
            if (isNaN(d.getTime())) return dateStr;
            return d.toISOString().slice(0, 10);
        } catch (e) {
            return dateStr || '';
        }
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '';
        try {
            var clean = String(dateStr).replace('Z', '+00:00');
            var d = new Date(clean);
            if (isNaN(d.getTime())) return dateStr;
            var yyyy = d.getFullYear();
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            var dd = String(d.getDate()).padStart(2, '0');
            var hh = String(d.getHours()).padStart(2, '0');
            var mi = String(d.getMinutes()).padStart(2, '0');
            var ss = String(d.getSeconds()).padStart(2, '0');
            return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi + ':' + ss;
        } catch (e) {
            return dateStr || '';
        }
    }

    function formatUnixDate(ts) {
        var num = Number(ts || 0);
        if (!Number.isFinite(num) || num <= 0) return '';
        try {
            var d = new Date(num * 1000);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
        } catch (_) {
            return '';
        }
    }

    /** 提取文件名 */
    function toName(item) {
        if (!item) return null;
        var parts = String(item).replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || null;
    }

    /** 移除命名前缀（与 archiver.py 逻辑一致） */
    function stripPrefix(name, baseName) {
        if (!name || !baseName) return name;
        var prefix = baseName + '_';
        if (name.startsWith(prefix)) {
            return name.substring(prefix.length);
        }
        return name;
    }

    function escapeHtmlText(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
        return escapeHtmlText(str);
    }

    function parseVideoEmbedInfo(rawUrl) {
        var input = String(rawUrl || '').trim();
        if (!input) return null;

        var urlObj;
        try {
            urlObj = new URL(input);
        } catch (_) {
            return null;
        }

        var host = String(urlObj.hostname || '').toLowerCase();
        var pathName = String(urlObj.pathname || '');
        var match;

        if (host.indexOf('bilibili.com') >= 0 || host === 'b23.tv') {
            if (host.indexOf('player.bilibili.com') >= 0) {
                var directBvid = urlObj.searchParams.get('bvid');
                if (directBvid) {
                    return {
                        platform: 'bilibili',
                        sourceUrl: input,
                        embedUrl: 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(directBvid) + '&autoplay=0&poster=1',
                        label: 'Bilibili'
                    };
                }
            }
            match = pathName.match(/\/video\/(BV[0-9A-Za-z]+)/i) || pathName.match(/\/(BV[0-9A-Za-z]+)/i);
            if (match && match[1]) {
                return {
                    platform: 'bilibili',
                    sourceUrl: input,
                    embedUrl: 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(match[1]) + '&autoplay=0&poster=1',
                    label: 'Bilibili'
                };
            }
            return {
                platform: 'bilibili',
                sourceUrl: input,
                embedUrl: '',
                label: 'Bilibili'
            };
        }

        if (host === 'youtu.be' || host.indexOf('youtube.com') >= 0) {
            var videoId = '';
            if (host === 'youtu.be') {
                match = pathName.match(/^\/([^/?#]+)/);
                videoId = match && match[1] ? match[1] : '';
            } else if (pathName.indexOf('/watch') === 0) {
                videoId = urlObj.searchParams.get('v') || '';
            } else if (pathName.indexOf('/shorts/') === 0) {
                match = pathName.match(/^\/shorts\/([^/?#]+)/);
                videoId = match && match[1] ? match[1] : '';
            } else if (pathName.indexOf('/embed/') === 0) {
                match = pathName.match(/^\/embed\/([^/?#]+)/);
                videoId = match && match[1] ? match[1] : '';
            }
            if (videoId) {
                return {
                    platform: 'youtube',
                    sourceUrl: input,
                    embedUrl: 'https://www.youtube.com/embed/' + encodeURIComponent(videoId),
                    label: 'YouTube'
                };
            }
            return {
                platform: 'youtube',
                sourceUrl: input,
                embedUrl: '',
                label: 'YouTube'
            };
        }

        return {
            platform: 'external',
            sourceUrl: input,
            embedUrl: '',
            label: 'External video'
        };
    }

    function buildSummaryVideoHtml(rawUrl) {
        var info = parseVideoEmbedInfo(rawUrl);
        if (!info || !info.sourceUrl) return '';

        var safeSourceUrl = escapeAttr(info.sourceUrl);
        var safeLabel = escapeHtmlText(info.label || 'Video');

        if (!info.embedUrl) {
            return '<div class="summary-video summary-video__fallback">' +
                '<div class="summary-video__meta">当前视频不支持直接嵌入播放，请打开原视频查看。</div>' +
                '<a class="summary-video__link" href="' + safeSourceUrl + '" target="_blank" rel="noopener noreferrer">打开原视频</a>' +
                '</div>';
        }

        return '<div class="summary-video">' +
            '<div class="summary-video__inner">' +
            '<iframe class="summary-video__frame" src="' + escapeAttr(info.embedUrl) + '" title="' + safeLabel + ' video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>' +
            '</div>' +
            '<div class="summary-video__meta"><a class="summary-video__link" href="' + safeSourceUrl + '" target="_blank" rel="noopener noreferrer">在新标签页打开原视频</a></div>' +
            '</div>';
    }

    function transformSummaryHtml(html, resolveImageSrc) {
        var raw = String(html || '');
        raw = raw.replace(/<div[^>]*class=["'][^"']*translated-text[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
        raw = raw.replace(/<boostme>\s*<boosttitle>([\s\S]*?)<\/boosttitle>\s*<boostcontent>([\s\S]*?)<\/boostcontent>\s*<\/boostme>/gi, function (_match, title, content) {
            return '<div class="boostmeroot"><div class="boostme"><p class="boosttitle">' + title + '</p><p class="boostcontent">' + content + '</p></div></div>';
        });
        raw = raw.replace(/<figure[^>]*class=["'][^"']*media[^"']*["'][^>]*>\s*<oembed[^>]*url=["']([^"']+)["'][^>]*><\/oembed>\s*<\/figure>/gi, function (_match, url) {
            return buildSummaryVideoHtml(url) || _match;
        });
        raw = raw.replace(/<oembed[^>]*url=["']([^"']+)["'][^>]*><\/oembed>/gi, function (_match, url) {
            return buildSummaryVideoHtml(url) || _match;
        });
        raw = raw.replace(/<div[^>]*data-oembed-url=["']([^"']+)["'][^>]*>[\s\S]*?<\/div>/gi, function (_match, url) {
            return buildSummaryVideoHtml(url) || _match;
        });
        raw = raw.replace(/src=(["'])(?!https?:\/\/|\/)(.*?)\1/gi, function (_match, quote, src) {
            var fileName = toName(src);
            if (!fileName) return _match;
            var finalUrl = typeof resolveImageSrc === 'function' ? resolveImageSrc(fileName) : src;
            return 'src=' + quote + finalUrl + quote;
        });
        return raw;
    }

    // ============ 数据标准化 ============

    function normalizeStats(meta) {
        var stats = meta.stats || meta.counts || {};
        return {
            likes: stats.likes || stats.like || 0,
            favorites: stats.favorites || stats.favorite || 0,
            comments: stats.comments || stats.comment || meta.commentCount || 0,
            downloads: stats.downloads || stats.download || 0,
            prints: stats.prints || stats.print || 0,
            views: stats.views || stats.read || stats.reads || 0,
        };
    }

    function normalizeAuthor(meta) {
        var a = meta.author;
        if (typeof a === 'string') return { name: a, url: '', avatar: null };
        if (!a || typeof a !== 'object') return { name: '', url: '', avatar: null };
        var avatarRel = a.avatarRelPath || a.avatar_local_path || '';
        if (!avatarRel && (a.avatarLocal || a.avatar_local)) {
            avatarRel = 'images/' + (a.avatarLocal || a.avatar_local);
        }
        return {
            name: a.name || '',
            url: a.url || '',
            avatar: avatarRel || null,
        };
    }

    function normalizeSource(meta) {
        var source = String((meta && meta.source) || '').trim().toLowerCase();
        if (source === 'mw_cn' || source === 'mw_global' || source === 'localmodel' || source === 'others') {
            return source;
        }
        var url = String((meta && meta.url) || '').trim().toLowerCase();
        if (url.indexOf('makerworld.com/') >= 0 && url.indexOf('makerworld.com.cn') < 0) {
            return 'mw_global';
        }
        return 'mw_cn';
    }

    function formatSourceLabel(source) {
        if (source === 'mw_global') return 'MakerWorld 国际';
        if (source === 'localmodel') return '手动导入';
        if (source === 'others') return '其他来源';
        return 'MakerWorld 国内';
    }

    function normalizeImages(meta) {
        var raw = meta.images;
        var design = [], summary = [], cover = null;

        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            design = (raw.design || []).map(toName).filter(Boolean);
            summary = (raw.summary || []).map(toName).filter(Boolean);
            cover = toName(raw.cover);
        } else if (Array.isArray(raw)) {
            design = raw.map(toName).filter(Boolean);
        }

        if (!design.length && meta.designImages) {
            meta.designImages.forEach(function (item) {
                if (typeof item === 'object') {
                    var n = toName(item.fileName || item.localName || item.relPath);
                    if (n) design.push(n);
                }
            });
        }

        if (!summary.length && meta.summaryImages) {
            meta.summaryImages.forEach(function (item) {
                if (typeof item === 'object') {
                    var n = toName(item.fileName || item.relPath);
                    if (n) summary.push(n);
                } else if (typeof item === 'string') {
                    var n2 = toName(item);
                    if (n2) summary.push(n2);
                }
            });
        }

        if (!cover) {
            var ci = meta.cover || {};
            cover = toName(ci.relPath || ci.localName);
        }

        return { design: design, summary: summary, cover: cover };
    }

    // ============ 实例文件名计算 ============

    function pickInstanceFilename(inst, nameHint) {
        // 优先使用已明确指定的文件名
        var explicit = toName((inst && (inst.fileName || inst.name || inst.sourceFileName || inst.localName)) || '');
        if (explicit) return explicit;

        // 优先按真实文件名字段推断，避免回退到 title 造成错链
        var baseName = (inst && (inst.name || inst.sourceFileName || inst.fileName)) || '';
        if (!baseName && inst) baseName = String(inst.id || 'model');
        // 简单 sanitize：去除文件系统不允许的字符
        var base = String(baseName).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+$/, '');
        if (!base) base = String((inst && inst.id) || 'model');
        // 如果 base 本身就带 .3mf 后缀，先去掉
        if (/\.3mf$/i.test(base)) base = base.slice(0, -4);

        // 从 nameHint 推断扩展名
        var ext = '';
        var hint = nameHint || (inst && (inst.name || inst.sourceFileName)) || '';
        if (hint && hint.indexOf('.') > -1) {
            ext = '.' + hint.split('.').pop();
        }
        if (!ext) {
            ext = '.3mf';
        } else if (!ext.startsWith('.')) {
            ext = '.' + ext;
        }
        return base + ext;
    }

    function pickInstanceFilenameStrict(inst) {
        var n = toName((inst && (inst.fileName || inst.name || inst.sourceFileName || inst.localName)) || '');
        return n || '';
    }

    // ============ DOM 渲染 ============

    var MODEL_DIR = '';
    var CURRENT_META = null;
    var GALLERY_STATE = { items: [], index: 0 };
    var INSTANCE_STATE = { items: [], activeIndex: 0 };
    var OFFLINE_API_BASE_KEY = 'mw_offline_api_base';
    var DEFAULT_OFFLINE_API_BASE = 'http://127.0.0.1:8000';

    function normalizeApiBase(raw) {
        var v = String(raw || '').trim();
        if (!v) return '';
        return v.replace(/\/+$/, '');
    }

    function getOfflineApiBase() {
        var fromQuery = '';
        var fromMeta = '';
        var fromStorage = '';

        try {
            var q = new URLSearchParams(location.search || '');
            fromQuery = normalizeApiBase(q.get('apiBase') || '');
        } catch (_) { }

        try {
            var m = window.__OFFLINE_META__ || {};
            fromMeta = normalizeApiBase(m.apiBase || m.api_base || '');
        } catch (_) { }

        try {
            fromStorage = normalizeApiBase(localStorage.getItem(OFFLINE_API_BASE_KEY) || '');
        } catch (_) { }

        var chosen = fromQuery || fromMeta || fromStorage || DEFAULT_OFFLINE_API_BASE;
        chosen = normalizeApiBase(chosen);
        try {
            if (chosen) localStorage.setItem(OFFLINE_API_BASE_KEY, chosen);
        } catch (_) { }
        return chosen;
    }

    function apiUrl(path) {
        var p = String(path || '');
        if (location.protocol === 'file:') {
            var base = getOfflineApiBase();
            return base ? (base + p) : p;
        }
        return p;
    }

    function canUseBackendApi() {
        if (!MODEL_DIR) return false;
        if (location.protocol === 'file:') return false;
        return true;
    }

    function joinLocalPath(root, modelDir) {
        var base = String(root || '').trim();
        var name = String(modelDir || '').trim();
        if (!base || !name) return '';
        var hasBackslash = base.indexOf('\\') >= 0;
        var sep = hasBackslash ? '\\' : '/';
        base = base.replace(/[\\/]+$/, '');
        return base + sep + name;
    }

    function copyTextToClipboard(text) {
        var value = String(text || '');
        if (!value) return Promise.reject(new Error('空文本'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = value;
                ta.setAttribute('readonly', 'readonly');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (!ok) {
                    reject(new Error('浏览器拒绝复制'));
                    return;
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    function initBackButton() {
        var btn = document.getElementById('detailBackBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            try {
                if (document.referrer) {
                    var ref = new URL(document.referrer, window.location.href);
                    if (ref.origin === window.location.origin) {
                        window.history.back();
                        return;
                    }
                }
            } catch (_) { }
            window.location.assign('/');
        });
    }

    function getOfflineFileList(kind) {
        try {
            var meta = window.__OFFLINE_META__ || {};
            var offline = meta.offlineFiles || {};
            var arr = null;
            if (kind === 'attachments') {
                if (Array.isArray(offline.attachments)) arr = offline.attachments;
                else if (Array.isArray(meta.attachments)) arr = meta.attachments;
                else if (Array.isArray(meta.attachmentFiles)) arr = meta.attachmentFiles;
            } else if (kind === 'printed') {
                if (Array.isArray(offline.printed)) arr = offline.printed;
                else if (Array.isArray(meta.printed)) arr = meta.printed;
                else if (Array.isArray(meta.printedFiles)) arr = meta.printedFiles;
            }
            if (!Array.isArray(arr)) return null;
            return arr.filter(function (x) { return typeof x === 'string' && x.trim(); });
        } catch (_) {
            return null;
        }
    }

    function renderTitle(meta) {
        var el = document.getElementById('titleSection');
        var title = esc(meta.title || '');
        var url = meta.url || '';
        el.innerHTML = '<span class="title-text">' + title + '</span>' +
            (url ? '<span class="title-links"><a class="origin-link" href="' + esc(url) + '" target="_blank" rel="noreferrer">原文链接</a></span>' : '');
        document.title = meta.title || '模型详情';
    }

    function getDownloadWarningConfig(meta, canRetry) {
        var status = String((meta && meta.download_status) || '').trim().toLowerCase();
        if (status !== 'failed') {
            return { visible: false, retryable: false, text: '' };
        }
        if (canRetry) {
            return {
                visible: true,
                retryable: true,
                text: '当前模型下载不完整，点击重试',
            };
        }
        return {
            visible: true,
            retryable: false,
            text: '当前模型下载不完整',
        };
    }

    function setDownloadWarningMessage(type, text) {
        var el = document.getElementById('downloadWarning');
        if (!el) return;
        var safeText = esc(text || '');
        el.className = 'download-warning';
        if (type === 'success') el.classList.add('download-warning--success');
        if (type === 'error') el.classList.add('download-warning--error');
        if (type === 'retry') el.classList.add('download-warning--retry');
        el.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-circle-check' : (type === 'retry' ? 'fa-rotate-right' : 'fa-triangle-exclamation')) + '"></i><span>' + safeText + '</span>';
        el.classList.remove('hidden');
    }

    async function handleModelRedownload() {
        var meta = CURRENT_META || {};
        var modelId = Number(meta.id || 0);
        if (!modelId) {
            setDownloadWarningMessage('error', '当前模型缺少重试所需的模型 ID');
            return;
        }
        setDownloadWarningMessage('retry', '正在重新下载模型，请稍候...');
        try {
            var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(modelId) + '/redownload'), {
                method: 'POST',
            });
            var data = {};
            try {
                data = await res.json();
            } catch (_) { }
            if (!res.ok) {
                throw new Error((data && (data.detail || data.message)) || ('HTTP ' + res.status));
            }
            var successCount = Number((data && data.success) || 0);
            if (successCount <= 0) {
                throw new Error('重新下载未成功，请检查 Cookie 或稍后重试');
            }
            setDownloadWarningMessage('success', '重新下载完成，页面即将刷新');
            if (CURRENT_META) CURRENT_META.download_status = 'ok';
            setTimeout(function () {
                location.reload();
            }, 900);
        } catch (e) {
            setDownloadWarningMessage('error', '重试失败：' + (e && e.message ? e.message : e));
        }
    }

    function renderDownloadWarning(meta) {
        var el = document.getElementById('downloadWarning');
        if (!el) return;
        el.onclick = null;
        var config = getDownloadWarningConfig(meta, canUseBackendApi() && Number((meta && meta.id) || 0) > 0);
        if (!config.visible) {
            el.className = 'download-warning hidden';
            el.innerHTML = '';
            return;
        }
        setDownloadWarningMessage(config.retryable ? 'retry' : 'error', config.text);
        if (config.retryable) {
            el.onclick = function () {
                handleModelRedownload();
            };
        }
    }

    function shortenText(value, limit) {
        var text = String(value || '').trim();
        if (!text || text.length <= limit) return text;
        return text.slice(0, Math.max(0, limit - 1)) + '…';
    }

    function buildGalleryItems(meta, images) {
        var out = [];
        var seen = Object.create(null);

        function push(relPath, alt) {
            var rel = String(relPath || '').trim();
            if (!rel || seen[rel]) return;
            seen[rel] = true;
            out.push({
                relPath: rel,
                alt: alt || meta.title || '模型图片'
            });
        }

        if (images.cover) push('images/' + images.cover, meta.title || '封面图');
        (images.design || []).forEach(function (name) {
            push('images/' + name, meta.title || '设计图');
        });
        if (!out.length) push('screenshot.png', meta.title || '模型截图');
        return out;
    }

    function updateHeroSelection() {
        var hero = document.getElementById('heroImage');
        var counter = document.getElementById('heroCounter');
        var items = GALLERY_STATE.items || [];
        if (!hero) return;
        if (!items.length) {
            hero.classList.add('hidden');
            hero.removeAttribute('src');
            if (counter) counter.textContent = '';
            return;
        }

        var index = GALLERY_STATE.index || 0;
        if (index < 0) index = 0;
        if (index >= items.length) index = 0;
        GALLERY_STATE.index = index;

        var item = items[index];
        hero.classList.remove('hidden');
        hero.classList.add('zoomable');
        hero.alt = item.alt || '模型图片';
        hero.src = fileUrl(MODEL_DIR, item.relPath);
        hero.onerror = function () {
            if (item.relPath === 'screenshot.png') {
                this.onerror = null;
                return;
            }
            this.onerror = null;
            this.src = fileUrl(MODEL_DIR, 'screenshot.png');
        };

        Array.from(document.querySelectorAll('#designThumbs [data-idx]')).forEach(function (node) {
            var idx = Number(node.getAttribute('data-idx') || 0);
            node.classList.toggle('active', idx === index);
        });

        if (counter) {
            counter.textContent = (index + 1) + ' / ' + items.length;
        }
    }

    function moveHero(delta) {
        var items = GALLERY_STATE.items || [];
        if (items.length <= 1) return;
        GALLERY_STATE.index = (GALLERY_STATE.index + delta + items.length) % items.length;
        updateHeroSelection();
    }

    function renderAuthor(meta) {
        var author = normalizeAuthor(meta);
        var el = document.getElementById('authorSection');
        var html = '';
        if (author.avatar) {
            html += '<img class="avatar" src="' + fileUrl(MODEL_DIR, author.avatar) + '" alt="avatar">';
        }
        html += '<div class="author-meta">';
        html += '<span class="author-label">设计师</span>';
        if (author.url) {
            html += '<a class="author-name" href="' + esc(author.url) + '" target="_blank" rel="noreferrer">' + esc(author.name) + '</a>';
        } else {
            html += '<span class="author-name">' + esc(author.name) + '</span>';
        }
        html += '</div>';
        el.innerHTML = html;
    }

    function renderHero(meta, images) {
        GALLERY_STATE.items = buildGalleryItems(meta, images);
        if (GALLERY_STATE.index >= GALLERY_STATE.items.length) {
            GALLERY_STATE.index = 0;
        }
        updateHeroSelection();
    }

    function renderCollectDate(meta) {
        var el = document.getElementById('collectDate');
        var ts = meta.collectDate; // Unix timestamp from server
        if (!ts) {
            el.textContent = '';
            return;
        }
        var dateStr = formatUnixDate(ts);
        el.innerHTML = '<i class="far fa-calendar-alt"></i> 本地归档于 ' + dateStr;
    }

    function renderMetaExtras(meta) {
        var el = document.getElementById('metaExtraList');
        if (!el) return;
        var category = String((meta && (meta.category || meta.modelCategory)) || '').trim();
        var versionNote = String((meta && (meta.versionNote || meta.version_note)) || '').trim();
        var items = [];
        if (category) {
            items.push('<span class="meta-extra__item"><i class="fas fa-folder-open"></i> 分类：' + esc(category) + '</span>');
        }
        if (versionNote) {
            items.push('<span class="meta-extra__item"><i class="fas fa-code-branch"></i> 版本备注：' + esc(versionNote) + '</span>');
        }
        if (!items.length) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }
        el.classList.remove('hidden');
        el.innerHTML = items.join('');
    }

    function renderSource(meta) {
        var el = document.getElementById('sourceBadge');
        if (!el) return;
        var source = normalizeSource(meta);
        el.textContent = formatSourceLabel(source);
        el.className = 'source-badge source-badge--' + source;
    }

    function renderStats(meta) {
        var source = normalizeSource(meta);
        var stats = normalizeStats(meta);
        var el = document.getElementById('statsSection');
        if (!el) return;

        var shareCount = Number(meta.shareCount || (meta.stats && meta.stats.shares) || 0) || 0;
        var publishDate = '';
        if (meta.publishTime || meta.publishedAt || meta.createTime || meta.createdAt) {
            publishDate = formatDate(meta.publishTime || meta.publishedAt || meta.createTime || meta.createdAt);
        }
        if (!publishDate && Array.isArray(meta.instances)) {
            var dated = meta.instances
                .map(function (inst) { return formatDate(inst && inst.publishTime); })
                .filter(Boolean);
            if (dated.length) publishDate = dated.sort()[0];
        }
        if (!publishDate) publishDate = formatUnixDate(meta.collectDate);

        var ctaLabel = source === 'localmodel' ? '手动导入' : '本地归档';
        var actions = [
            '<button class="engagement-pill engagement-pill--cta" type="button" disabled><i class="fas fa-box-archive"></i><span>' + ctaLabel + '</span></button>',
            '<button class="engagement-pill" type="button" disabled><i class="far fa-thumbs-up"></i><span>' + stats.likes + '</span></button>',
            '<button class="engagement-pill" type="button" disabled><i class="far fa-star"></i><span>' + stats.favorites + '</span></button>',
            '<button class="engagement-pill" type="button" disabled><i class="far fa-comment"></i><span>' + (stats.comments || 0) + '</span></button>',
            '<button class="engagement-pill" type="button" disabled><i class="fas fa-share-nodes"></i><span>' + shareCount + '</span></button>'
        ];
        var metaRow = [
            '<span><i class="fas fa-download"></i> ' + stats.downloads + '</span>',
            '<span><i class="fas fa-print"></i> ' + (stats.prints || 0) + '</span>',
            '<span><i class="fas fa-eye"></i> ' + (stats.views || 0) + '</span>',
            publishDate ? '<span><i class="far fa-calendar"></i> 发布于 ' + publishDate + '</span>' : ''
        ].filter(Boolean);

        el.innerHTML =
            '<div class="engagement-bar">' + actions.join('') + '</div>' +
            '<div class="engagement-meta">' + metaRow.join('') + '</div>';
    }

    function renderTags(meta) {
        var tags = meta.tags || meta.tagsOriginal || [];
        var block = document.getElementById('tagsBlock');
        var el = document.getElementById('tagList');
        if (!tags.length) {
            block.classList.add('hidden');
            el.innerHTML = '';
            return;
        }
        block.classList.remove('hidden');
        el.innerHTML = tags.map(function (t) {
            return '<span>' + esc(t) + '</span>';
        }).join('\n');
    }

    function renderSummary(meta) {
        var s = meta.summary || {};
        var html = s.html || s.raw || '';
        html = transformSummaryHtml(html, function (fileName) {
            return fileUrl(MODEL_DIR, 'images/' + fileName);
        });
        document.getElementById('summaryContent').innerHTML = html
            ? '<div class="summary-rich">' + html + '</div>'
            : '<div class="section-empty">暂无描述内容</div>';
    }

    function renderCommentStars(rating) {
        var numeric = Number(rating || 0);
        if (!Number.isFinite(numeric) || numeric <= 0) return '';
        var stars = '';
        for (var i = 0; i < 5; i += 1) {
            stars += '<i class="fa' + (i < numeric ? 's' : 'r') + ' fa-star"></i>';
        }
        return '<div class="comment-card__stars" aria-label="评分 ' + numeric + ' / 5">' + stars + '</div>';
    }

    function renderComments(meta) {
        var block = document.getElementById('commentsBlock');
        var countEl = document.getElementById('commentsCount');
        var listEl = document.getElementById('commentsList');
        if (!block || !countEl || !listEl) return;

        var comments = Array.isArray(meta.comments) ? meta.comments.slice() : [];
        var totalCount = Number(meta.commentCount || (meta.stats && meta.stats.comments) || comments.length || 0);
        countEl.textContent = totalCount > 0 ? '(' + totalCount + ')' : '';

        if (!comments.length) {
            block.classList.toggle('hidden', totalCount <= 0);
            listEl.innerHTML = totalCount > 0
                ? '<div class="section-empty">当前模型有评论计数，但归档时未抓到评论内容。</div>'
                : '';
            return;
        }

        comments.sort(function (a, b) {
            return String(b && b.createdAt || '').localeCompare(String(a && a.createdAt || ''));
        });

        block.classList.remove('hidden');
        listEl.innerHTML = comments.map(function (item) {
            var author = item && item.author && typeof item.author === 'object' ? item.author : {};
            var authorName = esc(author.name || '匿名用户');
            var avatarUrl = author.avatarRelPath
                ? fileUrl(MODEL_DIR, author.avatarRelPath)
                : (author.avatarUrl || '');
            var authorHtml = author.url
                ? '<a class="comment-card__author-name" href="' + esc(author.url) + '" target="_blank" rel="noreferrer">' + authorName + '</a>'
                : '<span class="comment-card__author-name">' + authorName + '</span>';
            var badges = Array.isArray(item.badges) ? item.badges.filter(Boolean) : [];
            var badgeHtml = badges.map(function (badge) {
                return '<span class="comment-badge">' + esc(badge) + '</span>';
            }).join('');
            var images = Array.isArray(item.images) ? item.images : [];
            var imagesHtml = images.map(function (image, index) {
                var src = image && (image.relPath ? fileUrl(MODEL_DIR, image.relPath) : image.url);
                if (!src) return '';
                return '<img class="comment-image zoomable" src="' + esc(src) + '" alt="评论图片 ' + (index + 1) + '">';
            }).join('');

            return '<article class="comment-card">' +
                '<div class="comment-card__header">' +
                (avatarUrl ? '<img class="comment-card__avatar" src="' + esc(avatarUrl) + '" alt="' + authorName + '">' : '<div class="comment-card__avatar comment-card__avatar--placeholder"><i class="fas fa-user"></i></div>') +
                '<div class="comment-card__meta">' +
                '<div class="comment-card__author-row">' + authorHtml + badgeHtml + '</div>' +
                '<div class="comment-card__info">' +
                (item.createdAt ? '<span><i class="far fa-clock"></i> ' + esc(formatDateTime(item.createdAt)) + '</span>' : '') +
                (item.likeCount ? '<span><i class="far fa-thumbs-up"></i> ' + esc(String(item.likeCount)) + '</span>' : '') +
                (item.replyCount ? '<span><i class="far fa-message"></i> ' + esc(String(item.replyCount)) + '</span>' : '') +
                '</div>' +
                renderCommentStars(item.rating) +
                '</div>' +
                '</div>' +
                '<div class="comment-card__body">' + esc(item.content || '') + '</div>' +
                (imagesHtml ? '<div class="comment-card__images">' + imagesHtml + '</div>' : '') +
                '</article>';
        }).join('');
    }

    function summaryEditorValue(meta) {
        var s = (meta && meta.summary) || {};
        return String(s.html || s.raw || s.text || '').trim();
    }

    // ============ 实例卡片 ============

    function getInstanceViewModel(inst, baseName) {
        var title = inst.title || inst.name || '实例 ' + (inst.id || '');
        var publish = formatDate(inst.publishTime || '');
        var summary = inst.summary || '';
        var dls = inst.downloadCount || 0;
        var prints = inst.printCount || 0;
        var weight = inst.weight || '';
        var prediction = inst.prediction;
        var timeStr = prediction ? formatDuration(prediction) : '';
        var plates = inst.plates || [];
        var plateCnt = plates.length;
        var pictures = inst.pictures || [];
        var filaments = inst.instanceFilaments || [];
        var coverRel = '';

        if (pictures.length) {
            var pictureName = stripPrefix(toName((pictures[0] && (pictures[0].relPath || pictures[0].localPath || pictures[0].fileName)) || ''), baseName);
            if (pictureName) coverRel = 'images/' + pictureName;
        }
        if (!coverRel && plates.length) {
            var plateName = stripPrefix(toName((plates[0] && (plates[0].thumbnailRelPath || plates[0].thumbnailFile)) || ''), baseName);
            if (plateName) coverRel = 'images/' + plateName;
        }

        var isFileProtocol = location.protocol === 'file:';
        var isOfflineMetaPage = !isFileProtocol && !!window.__OFFLINE_META__;
        var hasInstId = inst && inst.id !== undefined && inst.id !== null && String(inst.id).trim() !== '';
        var hasModelDir = !!String(MODEL_DIR || '').trim();

        // 关键规则：
        // 1) 直开 file:// 与 /files 离线页（内嵌 __OFFLINE_META__）都严格用真实文件名字段
        // 2) 在线模式才允许兼容推断
        var fileName = (isFileProtocol || isOfflineMetaPage)
            ? pickInstanceFilenameStrict(inst)
            : pickInstanceFilename(inst, inst.name || '');

        var dlHrefLocal = '';
        if (!isFileProtocol && hasInstId && hasModelDir) {
            // HTTP 场景优先实例下载接口，避免任何 title/name 偏差
            dlHrefLocal = apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/instances/' + encodeURIComponent(String(inst.id)) + '/download');
        } else if (!isFileProtocol && fileName && hasModelDir) {
            // 兜底走后端文件接口（仍不直接拼 /files 路径）
            dlHrefLocal = apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/file/instances/' + encodeURIComponent(fileName));
        } else if (fileName) {
            // 仅 file:// 场景使用相对本地路径
            dlHrefLocal = fileUrl(MODEL_DIR, 'instances/' + fileName);
        }

        function toHex(str) {
            var utf8Str = unescape(encodeURIComponent(str));
            var hex = '';
            for (var i = 0; i < utf8Str.length; i++) {
                var h = utf8Str.charCodeAt(i).toString(16);
                if (h.length === 1) h = '0' + h;
                hex += h;
            }
            return hex;
        }
        var rawRelPath = MODEL_DIR + '/instances/' + (fileName || '');
        // 仅在线模式显示 Bambu 打印按钮：
        // - v2 在线页（无 __OFFLINE_META__）显示
        // - /files 离线页与 file:// 直开隐藏
        var showBambuButton = !isFileProtocol && !isOfflineMetaPage;

        var bambuProxyUrl = '';
        if (!isFileProtocol && hasInstId && hasModelDir) {
            bambuProxyUrl = apiUrl('/api/bambu/model/' + encodeURIComponent(MODEL_DIR) + '/instance/' + encodeURIComponent(String(inst.id)) + '.3mf');
        } else if (!isFileProtocol && fileName && hasModelDir) {
            bambuProxyUrl = apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/file/instances/' + encodeURIComponent(fileName));
        } else if (isFileProtocol) {
            bambuProxyUrl = fileName ? new URL(fileUrl(MODEL_DIR, 'instances/' + fileName), window.location.href).href : '';
        } else {
            bambuProxyUrl = window.location.origin + '/api/bambu/download/' + toHex(rawRelPath) + '.3mf';
        }
        // Bambu Studio 需要可直接访问的绝对 http(s) URL，不能是相对路径
        var bambuProxyUrlAbs = String(bambuProxyUrl || '');
        if (bambuProxyUrlAbs && !/^https?:\/\//i.test(bambuProxyUrlAbs)) {
            bambuProxyUrlAbs = window.location.origin + bambuProxyUrlAbs;
        }

        // 耗材 chips
        var chipsHtml = '';
        if (filaments.length) {
            var chips = filaments.map(function (f) {
                var typ = f.type || '';
                var usedG = f.usedG || f.usedg || '';
                var col = f.color || '';
                var dot = col ? '<span class="color-dot" style="background:' + esc(col) + '"></span>' : '';
                return '<span class="chip">' + dot + esc(typ) + ' ' + usedG + 'g</span>';
            });
            chipsHtml = '<div class="chips">' + chips.join('\n') + '</div>';
        }

        // 盘片弹窗使用的详细 HTML
        var platesDataHtml = '';
        if (plates.length) {
            platesDataHtml = plates.map(function (p) {
                var th = toName(p.thumbnailRelPath || '');
                var localTh = stripPrefix(th, baseName);
                var pred = p.prediction ? formatDuration(p.prediction) : '';
                var w = p.weight ? p.weight + ' g' : '';

                var fs = p.filaments || [];
                var fsHtml = '';
                if (fs.length) {
                    fsHtml = '<div class="plate-row-filaments">' + fs.map(function (f) {
                        var col = f.color ? '<span class="color-dot" style="background:' + esc(f.color) + ';width:12px;height:12px;margin-right:4px;"></span>' : '';
                        return '<span class="chip" style="font-size:12px;">' + col + esc(f.type || '') + ' | ' + (f.usedG || f.usedg || '') + ' g</span>';
                    }).join('') + '</div>';
                }

                var imgSrc = localTh ? fileUrl(MODEL_DIR, 'images/' + localTh) : '';
                var spoolIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M4.5 12c0-4.142 1.567-7.5 3.5-7.5s3.5 3.358 3.5 7.5-1.567 7.5-3.5 7.5-3.5-3.358-3.5-7.5z"/><path d="M11 4.5h5c1.933 0 3.5 3.358 3.5 7.5s-1.567 7.5-3.5 7.5h-5"/><circle cx="8" cy="12" r="1.5"/></svg>';
                return '<div class="plate-row">' +
                    '<div class="plate-row-img">' +
                    '<div class="p-index">盘 ' + (p.index || '') + '</div>' +
                    (imgSrc ? '<img src="' + imgSrc + '" alt="plate ' + p.index + '">' : '') +
                    '</div>' +
                    '<div class="plate-row-info">' +
                    '<div class="plate-row-stats">' +
                    (pred ? '<span><i class="far fa-clock"></i> ' + pred + '</span>' : '') +
                    (w ? '<span>' + spoolIcon + w + '</span>' : '') +
                    '</div>' +
                    fsHtml +
                    '</div>' +
                    '</div>';
            }).join('').replace(/"/g, '&quot;'); // 转义双引号以便存入 data 属性
        }

        // 实例配图
        var picsHtml = '';
        if (pictures.length) {
            var imgs = pictures.map(function (pic) {
                var rel = stripPrefix(toName(pic.relPath || ''), baseName);
                if (!rel) return '';
                return '<img class="inst-thumb zoomable" src="' + fileUrl(MODEL_DIR, 'images/' + rel) + '" alt="pic ' + (pic.index || '') + '" style="width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:zoom-in;">';
            }).filter(Boolean);
            if (imgs.length) picsHtml = '<div class="thumbs" style="padding:0;background:transparent;">' + imgs.join('') + '</div>';
        }

        return {
            title: title,
            publish: publish,
            summary: summary,
            downloads: dls,
            prints: prints,
            weight: weight,
            predictionText: timeStr,
            platesCount: plateCnt,
            picturesHtml: picsHtml,
            chipsHtml: chipsHtml,
            coverUrl: coverRel ? fileUrl(MODEL_DIR, coverRel) : '',
            platesDataHtml: platesDataHtml,
            dlHrefLocal: dlHrefLocal,
            showBambuButton: showBambuButton,
            bambuProxyUrlAbs: bambuProxyUrlAbs,
            fileName: fileName
        };
    }

    function buildInstanceHtml(inst, baseName, index, active) {
        var vm = getInstanceViewModel(inst, baseName);
        var metaHtml = [
            vm.predictionText ? '<span class="meta-item" title="预计打印时间"><i class="far fa-clock"></i> ' + esc(vm.predictionText) + '</span>' : '',
            vm.platesCount ? '<span class="meta-item" title="盘数"><i class="far fa-clone"></i> ' + esc(String(vm.platesCount)) + ' 盘</span>' : '',
            vm.downloads ? '<span class="meta-item" title="下载次数"><i class="fas fa-download"></i> ' + esc(String(vm.downloads)) + '</span>' : '',
            vm.prints ? '<span class="meta-item" title="打印次数"><i class="fas fa-print"></i> ' + esc(String(vm.prints)) + '</span>' : '',
            vm.weight ? '<span class="meta-item" title="重量"><i class="fas fa-weight-hanging"></i> ' + esc(String(vm.weight)) + ' g</span>' : ''
        ].filter(Boolean).join('');
        var tools = [];
        if (vm.platesDataHtml) {
            tools.push('<button class="inst-mini-btn" type="button" onclick="event.stopPropagation();openPlatesModal(this)" data-plates="' + vm.platesDataHtml + '"><i class="fas fa-layer-group"></i> 分盘</button>');
        }
        if (vm.fileName) {
            tools.push('<span class="inst-file-name">' + esc(vm.fileName) + '</span>');
        }
        return '<article class="inst-card' + (active ? ' is-active' : '') + '" data-instance-index="' + index + '" tabindex="0" role="button">' +
            '<div class="inst-header">' +
            (vm.coverUrl ? '<img class="inst-cover" src="' + vm.coverUrl + '" alt="' + esc(vm.title) + '">' : '<div class="inst-cover inst-cover--placeholder"><i class="fas fa-cube"></i></div>') +
            '<div class="inst-title-area">' +
            '<div class="inst-title-row"><strong>' + esc(vm.title) + '</strong>' + (active ? '<span class="inst-selected-chip">已选</span>' : '') + '</div>' +
            (vm.summary ? '<div class="inst-summary">' + esc(shortenText(vm.summary, 96)) + '</div>' : '') +
            (metaHtml ? '<div class="inst-meta">' + metaHtml + '</div>' : '') +
            (vm.publish ? '<div class="inst-publish">发布于 ' + esc(vm.publish) + '</div>' : '') +
            (tools.length ? '<div class="inst-tools">' + tools.join('') + '</div>' : '') +
            '</div>' +
            '</div>' +
            '</article>';
    }

    function renderInstancePrimaryAction(meta) {
        var el = document.getElementById('instancesPrimaryAction');
        if (!el) return;
        var instances = INSTANCE_STATE.items || [];
        var activeIndex = INSTANCE_STATE.activeIndex || 0;
        var inst = instances[activeIndex];
        if (!inst) {
            el.innerHTML = '';
            return;
        }
        var vm = getInstanceViewModel(inst, meta.baseName);
        var mainAction = vm.dlHrefLocal
            ? '<a class="inst-btn inst-btn--primary" href="' + vm.dlHrefLocal + '" target="_blank" rel="noreferrer"><i class="fas fa-download"></i> 下载 3MF</a>'
            : '';
        var sub = [];
        if (vm.showBambuButton && vm.bambuProxyUrlAbs) {
            sub.push('<a class="inst-btn inst-btn--secondary inst-bambu" href="bambustudio://open?file=' + encodeURIComponent(vm.bambuProxyUrlAbs) + '" title="在 Bambu Studio 中打开"><i class="fas fa-cube"></i> Bambu 打印</a>');
        }
        if (vm.platesDataHtml) {
            sub.push('<button class="inst-btn inst-btn--secondary" type="button" onclick="openPlatesModal(this)" data-plates="' + vm.platesDataHtml + '"><i class="fas fa-layer-group"></i> 查看分盘</button>');
        }
        el.innerHTML = mainAction + (sub.length ? '<div class="instances-secondary-actions">' + sub.join('') + '</div>' : '');
    }

    function renderInstances(meta) {
        var instances = Array.isArray(meta.instances) ? meta.instances : [];
        var el = document.getElementById('instanceList');
        var countEl = document.getElementById('instancesCount');
        var stripEl = document.getElementById('instanceFilterStrip');
        if (countEl) countEl.textContent = instances.length ? '(' + instances.length + ')' : '';
        if (!instances.length) {
            if (el) el.innerHTML = '<div class="section-empty">当前模型没有可用的打印配置</div>';
            if (stripEl) stripEl.innerHTML = '';
            renderInstancePrimaryAction(meta);
            return;
        }

        INSTANCE_STATE.items = instances.slice();
        if (INSTANCE_STATE.activeIndex >= instances.length || INSTANCE_STATE.activeIndex < 0) {
            INSTANCE_STATE.activeIndex = 0;
        }

        if (stripEl) {
            var chips = [];
            instances.forEach(function (inst, idx) {
                chips.push('<button class="instance-filter-chip' + (INSTANCE_STATE.activeIndex === idx ? ' is-active' : '') + '" type="button" data-instance-chip="' + idx + '">' + esc(shortenText(inst.title || inst.name || ('配置 ' + (idx + 1)), 14)) + '</button>');
            });
            stripEl.innerHTML = chips.join('');
            Array.from(stripEl.querySelectorAll('[data-instance-chip]')).forEach(function (node) {
                node.addEventListener('click', function () {
                    var idx = Number(this.getAttribute('data-instance-chip') || 0);
                    if (idx < 0 || idx >= instances.length) idx = 0;
                    INSTANCE_STATE.activeIndex = idx;
                    renderInstances(meta);
                });
            });
        }

        if (el) {
            el.innerHTML = instances.map(function (inst, idx) {
                return buildInstanceHtml(inst, meta.baseName, idx, idx === INSTANCE_STATE.activeIndex);
            }).join('\n');
            Array.from(el.querySelectorAll('.inst-card[data-instance-index]')).forEach(function (card) {
                function activateCard() {
                    var idx = Number(card.getAttribute('data-instance-index') || 0);
                    if (idx < 0 || idx >= instances.length) return;
                    INSTANCE_STATE.activeIndex = idx;
                    renderInstances(meta);
                }
                card.addEventListener('click', activateCard);
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activateCard();
                    }
                });
            });
        }

        renderInstancePrimaryAction(meta);
    }

    // ============ 设计图轮播 ============

    function renderCarousel() {
        var designImgs = GALLERY_STATE.items || [];
        var el = document.getElementById('carouselSection');
        if (!designImgs.length) { el.innerHTML = ''; return; }

        var thumbTags = designImgs.map(function (item, i) {
            return '<button class="hero-thumb' + (i === GALLERY_STATE.index ? ' active' : '') + '" type="button" data-idx="' + i + '">' +
                '<img src="' + fileUrl(MODEL_DIR, item.relPath) + '" alt="thumb ' + (i + 1) + '">' +
                '</button>';
        }).join('\n');

        el.innerHTML =
            '<div class="hero-controls">' +
            (designImgs.length > 1 ? '<button class="hero-nav-btn hero-nav-btn--prev" type="button" id="heroPrevBtn"><i class="fas fa-chevron-left"></i></button>' : '') +
            '<div class="hero-counter" id="heroCounter"></div>' +
            (designImgs.length > 1 ? '<button class="hero-nav-btn hero-nav-btn--next" type="button" id="heroNextBtn"><i class="fas fa-chevron-right"></i></button>' : '') +
            '</div>' +
            '<div class="thumbs" id="designThumbs">' + thumbTags + '</div>';

        initCarousel();
        updateHeroSelection();
    }

    function initCarousel() {
        var prevBtn = document.getElementById('heroPrevBtn');
        var nextBtn = document.getElementById('heroNextBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function () { moveHero(-1); });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function () { moveHero(1); });
        }
        Array.from(document.querySelectorAll('#designThumbs [data-idx]')).forEach(function (t) {
            t.addEventListener('click', function () {
                GALLERY_STATE.index = Number(this.getAttribute('data-idx') || 0);
                updateHeroSelection();
            });
        });
    }

    // ============ 灯箱 ============

    function initLightbox() {
        var overlay = document.getElementById('imgLightbox');
        var overlayImg = overlay ? overlay.querySelector('img') : null;
        if (!overlay || !overlayImg) return;

        var currentImages = [];
        var currentIndex = -1;

        function showImage(index) {
            if (currentImages.length === 0) return;
            if (index < 0) index = currentImages.length - 1;
            if (index >= currentImages.length) index = 0;
            currentIndex = index;
            overlayImg.src = currentImages[currentIndex].src;
        }

        document.addEventListener('click', function (e) {
            var target = e.target;

            // Handle lightbox navigation arrows
            if (target.closest('.lb-prev')) {
                e.preventDefault();
                showImage(currentIndex - 1);
                return;
            }
            if (target.closest('.lb-next')) {
                e.preventDefault();
                showImage(currentIndex + 1);
                return;
            }

            if (!(target instanceof HTMLImageElement)) return;
            if (!target.classList.contains('zoomable')) return;

            currentImages = Array.from(document.querySelectorAll('img.zoomable'));
            currentIndex = currentImages.indexOf(target);
            if (currentIndex === -1) {
                currentImages.push(target);
                currentIndex = currentImages.length - 1;
            }

            overlayImg.src = target.src;
            overlay.classList.add('show');
        });

        overlay.addEventListener('click', function (e) {
            // Close if clicked outside arrows or image
            if (e.target === overlay || e.target === overlayImg) {
                overlay.classList.remove('show');
                overlayImg.src = '';
            }
        });

        // Keyboard arrows support
        document.addEventListener('keydown', function (e) {
            if (!overlay.classList.contains('show')) return;
            if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
            else if (e.key === 'ArrowRight') showImage(currentIndex + 1);
            else if (e.key === 'Escape') {
                overlay.classList.remove('show');
                overlayImg.src = '';
            }
        });
    }

    // ============ Bambu 打开防重入 ============
    function initBambuOpenGuard() {
        if (window.__mw_bambu_guard_inited) return;
        window.__mw_bambu_guard_inited = true;

        var lastHref = '';
        var lastTs = 0;

        document.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || !target.closest) return;
            var link = target.closest('a.inst-bambu');
            if (!link) return;

            var href = String(link.getAttribute('href') || '');
            if (!/^bambustudio:\/\//i.test(href)) return;

            // 统一由脚本触发，避免浏览器偶发重复拉起协议
            e.preventDefault();
            e.stopPropagation();

            var now = Date.now();
            if (href === lastHref && (now - lastTs) < 1500) {
                return;
            }
            lastHref = href;
            lastTs = now;
            window.location.href = href;
        }, true);
    }

    // ============ 附件 ============

    function initAttachments() {
        var listEl = document.getElementById('attachList');
        var msgEl = document.getElementById('attachMsg');
        var inputEl = document.getElementById('attachInput');
        var btnEl = document.getElementById('attachUploadBtn');
        if (!listEl) return;

        function setMsg(text, isError) {
            if (!msgEl) return;
            msgEl.textContent = text || '';
            if (isError) msgEl.classList.add('error');
            else msgEl.classList.remove('error');
        }

        function normalizeAttachmentItems(payload) {
            if (!Array.isArray(payload)) return [];
            return payload.map(function (item) {
                if (item && typeof item === 'object') {
                    return {
                        name: String(item.name || item.fileName || item.filename || ''),
                        size: Number(item.size || 0) || 0,
                    };
                }
                return { name: String(item || ''), size: 0 };
            }).filter(function (item) {
                return !!item.name;
            });
        }

        function renderList(items) {
            listEl.innerHTML = '';
            if (!items || !items.length) {
                var li = document.createElement('li');
                li.className = 'attach-empty';
                li.textContent = '暂无附件';
                listEl.appendChild(li);
                return;
            }
            items.forEach(function (item) {
                var li = document.createElement('li');
                var link = document.createElement('a');
                link.href = fileUrl(MODEL_DIR, 'file/' + encodeURIComponent(item.name));
                link.textContent = item.name;
                link.setAttribute('download', item.name);
                li.appendChild(link);
                listEl.appendChild(li);
            });
        }

        function loadList() {
            function loadFromLocalIndex() {
                var metaList = getOfflineFileList('attachments');
                if (metaList !== null) {
                    renderList(metaList);
                    setMsg('离线模式：已从页面元数据加载附件');
                    return;
                }
                fetch('./file/_index.json')
                    .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
                    .then(function (data) {
                        var items = normalizeAttachmentItems((data && (data.items || data.files)) || []);
                        renderList(items);
                        setMsg('离线模式：已从本地清单加载附件');
                    })
                    .catch(function () {
                        renderList([]);
                        setMsg('离线模式未找到附件清单（_index.json）', true);
                    });
            }
            if (location.protocol === 'file:') {
                var quickMetaList = getOfflineFileList('attachments');
                if (quickMetaList !== null) {
                    renderList(normalizeAttachmentItems(quickMetaList));
                    setMsg('离线模式：已从页面元数据加载附件');
                    return;
                }
            }
            if (!canUseBackendApi()) {
                loadFromLocalIndex();
                return;
            }
            fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/attachments'))
                .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
                .then(function (data) {
                    var items = normalizeAttachmentItems((data && (data.items || data.files)) || []);
                    renderList(items);
                    setMsg('');
                })
                .catch(function () {
                    if (location.protocol === 'file:') {
                        loadFromLocalIndex();
                        return;
                    }
                    renderList([]);
                    setMsg('附件列表加载失败', true);
                });
        }
        loadList();

        if (!btnEl || !inputEl) return;
        btnEl.addEventListener('click', async function () {
            if (!canUseBackendApi()) {
                setMsg('当前页面不支持上传，请通过本地服务地址访问', true);
                return;
            }
            var files = inputEl.files ? Array.from(inputEl.files) : [];
            if (!files.length) { setMsg('请选择附件', true); return; }
            btnEl.disabled = true;
            var success = 0, failed = 0;
            setMsg('上传中... (0/' + files.length + ')');
            for (var fi = 0; fi < files.length; fi++) {
                var fd = new FormData();
                fd.append('file', files[fi]);
                try {
                    var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/attachments'), {
                        method: 'POST', body: fd,
                    });
                    if (!res.ok) throw new Error('upload failed');
                    success++;
                } catch (e) { failed++; }
                setMsg('上传中... (' + (success + failed) + '/' + files.length + ')');
            }
            inputEl.value = '';
            loadList();
            if (failed === 0) setMsg('上传成功');
            else if (success === 0) setMsg('上传失败', true);
            else setMsg('部分成功 ' + success + '/' + files.length, true);
            btnEl.disabled = false;
        });
    }

    // ============ 打印成品 ============

    function initPrinted() {
        var listEl = document.getElementById('printedList');
        var msgEl = document.getElementById('printedMsg');
        var inputEl = document.getElementById('printedInput');
        var btnEl = document.getElementById('printedUploadBtn');
        if (!listEl) return;

        function setMsg(text, isError) {
            if (!msgEl) return;
            msgEl.textContent = text || '';
            if (isError) msgEl.classList.add('error');
            else msgEl.classList.remove('error');
        }

        function renderList(files) {
            listEl.innerHTML = '';
            if (!files || !files.length) {
                var empty = document.createElement('div');
                empty.className = 'printed-empty';
                empty.textContent = '暂无图片';
                listEl.appendChild(empty);
                return;
            }
            files.forEach(function (name) {
                var item = document.createElement('div');
                item.className = 'printed-item';
                var img = document.createElement('img');
                img.className = 'zoomable';
                img.src = fileUrl(MODEL_DIR, 'printed/' + encodeURIComponent(name));
                img.alt = name;
                var caption = document.createElement('div');
                caption.className = 'printed-caption';
                caption.textContent = name;
                item.appendChild(img);
                item.appendChild(caption);
                listEl.appendChild(item);
            });
        }

        function loadList() {
            function loadFromLocalIndex() {
                var metaList = getOfflineFileList('printed');
                if (metaList !== null) {
                    renderList(metaList);
                    setMsg('离线模式：已从页面元数据加载图片');
                    return;
                }
                fetch('./printed/_index.json')
                    .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
                    .then(function (data) {
                        renderList((data && data.files) || []);
                        setMsg('离线模式：已从本地清单加载图片');
                    })
                    .catch(function () {
                        renderList([]);
                        setMsg('离线模式未找到图片清单（_index.json）', true);
                    });
            }
            if (location.protocol === 'file:') {
                var quickMetaList = getOfflineFileList('printed');
                if (quickMetaList !== null) {
                    renderList(quickMetaList);
                    setMsg('离线模式：已从页面元数据加载图片');
                    return;
                }
            }
            if (!canUseBackendApi()) {
                loadFromLocalIndex();
                return;
            }
            fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/printed'))
                .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
                .then(function (data) {
                    renderList((data && data.files) || []);
                    setMsg('');
                })
                .catch(function () {
                    if (location.protocol === 'file:') {
                        loadFromLocalIndex();
                        return;
                    }
                    renderList([]);
                    setMsg('图片列表加载失败', true);
                });
        }
        loadList();

        if (!btnEl || !inputEl) return;
        btnEl.addEventListener('click', async function () {
            if (!canUseBackendApi()) {
                setMsg('当前页面不支持上传，请通过本地服务地址访问', true);
                return;
            }
            var files = inputEl.files ? Array.from(inputEl.files) : [];
            if (!files.length) { setMsg('请选择图片', true); return; }
            btnEl.disabled = true;
            var success = 0, failed = 0;
            setMsg('上传中... (0/' + files.length + ')');
            for (var fi = 0; fi < files.length; fi++) {
                var fd = new FormData();
                fd.append('file', files[fi]);
                try {
                    var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/printed'), {
                        method: 'POST', body: fd,
                    });
                    if (!res.ok) throw new Error('upload failed');
                    success++;
                } catch (e) { failed++; }
                setMsg('上传中... (' + (success + failed) + '/' + files.length + ')');
            }
            inputEl.value = '';
            loadList();
            if (failed === 0) setMsg('上传成功');
            else if (success === 0) setMsg('上传失败', true);
            else setMsg('部分成功 ' + success + '/' + files.length, true);
            btnEl.disabled = false;
        });
    }

    function initModelEditor() {
        var openBtn = document.getElementById('modelEditOpenBtn');
        var msgEl = document.getElementById('modelEditMsg');
        var modal = document.getElementById('modelEditModal');
        var closeBtn = document.getElementById('modelEditCloseBtn');
        var cancelBtn = document.getElementById('modelEditCancelBtn');
        var saveBtn = document.getElementById('modelEditSaveBtn');
        var restoreBtn = document.getElementById('modelRestoreLatestBtn');
        var titleInput = document.getElementById('modelEditTitleInput');
        var categoryInput = document.getElementById('modelEditCategoryInput');
        var tagsInput = document.getElementById('modelEditTagsInput');
        var versionNoteInput = document.getElementById('modelEditVersionNoteInput');
        var summaryInput = document.getElementById('modelEditSummaryInput');
        var summaryEditor = document.getElementById('modelEditSummaryEditor');
        var summaryToolbar = document.getElementById('modelEditToolbar');
        var imageInput = document.getElementById('modelEditImageInput');
        var galleryEl = document.getElementById('modelEditGallery');
        var statusEl = document.getElementById('modelEditStatus');
        var historyHintEl = document.getElementById('modelEditHistoryHint');
        if (!openBtn || !modal || !closeBtn || !cancelBtn || !saveBtn) return;

        var galleryState = [];

        function setTopMsg(text, isError) {
            if (!msgEl) return;
            msgEl.textContent = text || '';
            if (isError) msgEl.classList.add('error');
            else msgEl.classList.remove('error');
        }

        function setStatus(text, isError) {
            if (!statusEl) return;
            statusEl.textContent = text || '';
            if (isError) statusEl.classList.add('error');
            else statusEl.classList.remove('error');
        }

        function syncSummaryValue() {
            if (!summaryInput || !summaryEditor) return;
            summaryInput.value = summaryEditor.innerHTML.trim();
        }

        function focusSummaryEditor() {
            if (!summaryEditor) return;
            summaryEditor.focus();
        }

        function execEditorCommand(cmd, value) {
            if (!summaryEditor) return;
            focusSummaryEditor();
            try {
                document.execCommand(cmd, false, value || null);
            } catch (_) { }
            syncSummaryValue();
        }

        function setBlockTag(tagName) {
            if (!summaryEditor) return;
            focusSummaryEditor();
            try {
                document.execCommand('formatBlock', false, tagName);
            } catch (_) { }
            syncSummaryValue();
        }

        function updateCoverRadios() {
            var checked = galleryState.some(function (item) { return item.keep && item.cover; });
            if (!checked) {
                for (var i = 0; i < galleryState.length; i++) {
                    if (galleryState[i].keep) {
                        galleryState[i].cover = true;
                        checked = true;
                        break;
                    }
                }
            }
            if (!checked) {
                for (var j = 0; j < galleryState.length; j++) galleryState[j].cover = false;
            }
        }

        function renderGalleryEditor() {
            if (!galleryEl) return;
            updateCoverRadios();
            galleryEl.innerHTML = '';
            if (!galleryState.length) {
                galleryEl.innerHTML = '<div class="attach-empty">当前没有设计图，上传后可设为封面</div>';
                return;
            }
            galleryState.forEach(function (item, idx) {
                var wrap = document.createElement('div');
                wrap.className = 'model-edit-gallery-item';
                var img = document.createElement('img');
                img.alt = item.name || ('image-' + (idx + 1));
                img.src = item.previewUrl || fileUrl(MODEL_DIR, 'images/' + item.name);
                var meta = document.createElement('div');
                meta.className = 'model-edit-gallery-meta';
                meta.innerHTML =
                    '<div class="model-edit-gallery-name">' + esc(item.name || ('图片 ' + (idx + 1))) + '</div>' +
                    '<div class="model-edit-gallery-actions">' +
                    '<label><input type="checkbox" data-role="keep" data-index="' + idx + '"' + (item.keep ? ' checked' : '') + '> 保留图片</label>' +
                    '<label><input type="radio" name="model-edit-cover" data-role="cover" data-index="' + idx + '"' + (item.cover ? ' checked' : '') + (item.keep ? '' : ' disabled') + '> 设为封面</label>' +
                    (item.isNew ? '<span>新上传</span>' : '<span>已有图片</span>') +
                    '</div>';
                wrap.appendChild(img);
                wrap.appendChild(meta);
                galleryEl.appendChild(wrap);
            });
            Array.from(galleryEl.querySelectorAll('input[data-role="keep"]')).forEach(function (el) {
                el.addEventListener('change', function () {
                    var idx = parseInt(this.getAttribute('data-index') || '-1', 10);
                    if (idx < 0 || idx >= galleryState.length) return;
                    galleryState[idx].keep = !!this.checked;
                    if (!galleryState[idx].keep) galleryState[idx].cover = false;
                    renderGalleryEditor();
                });
            });
            Array.from(galleryEl.querySelectorAll('input[data-role="cover"]')).forEach(function (el) {
                el.addEventListener('change', function () {
                    var idx = parseInt(this.getAttribute('data-index') || '-1', 10);
                    if (idx < 0 || idx >= galleryState.length) return;
                    galleryState.forEach(function (item, itemIdx) {
                        item.cover = itemIdx === idx && item.keep;
                    });
                    renderGalleryEditor();
                });
            });
        }

        function buildGalleryState() {
            var images = normalizeImages(CURRENT_META || {});
            var cover = images.cover || '';
            galleryState = images.design.map(function (name, idx) {
                return {
                    id: 'existing-' + idx,
                    name: name,
                    keep: true,
                    cover: name === cover,
                    isNew: false,
                    file: null,
                    previewUrl: '',
                };
            });
            updateCoverRadios();
            renderGalleryEditor();
        }

        async function loadHistoryHint() {
            if (!historyHintEl || !canUseBackendApi()) return;
            historyHintEl.classList.add('hidden');
            historyHintEl.textContent = '';
            try {
                var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/history'));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                var items = Array.isArray(data && data.items) ? data.items : [];
                if (!items.length) return;
            historyHintEl.textContent = '最近备份：' + formatDateTime(items[0].updated_at || '');
                historyHintEl.classList.remove('hidden');
            } catch (_) { }
        }

        function fillFormFromMeta() {
            var meta = CURRENT_META || {};
            if (titleInput) titleInput.value = meta.title || '';
            if (categoryInput) categoryInput.value = meta.category || meta.modelCategory || '';
            if (tagsInput) tagsInput.value = Array.isArray(meta.tags) ? meta.tags.join('\n') : '';
            if (versionNoteInput) versionNoteInput.value = meta.versionNote || meta.version_note || '';
            if (summaryEditor) summaryEditor.innerHTML = summaryEditorValue(meta);
            syncSummaryValue();
            if (imageInput) imageInput.value = '';
            setStatus('');
            buildGalleryState();
            loadHistoryHint();
        }

        function openModal() {
            if (!canUseBackendApi()) {
                setTopMsg('当前页面不支持在线编辑，请通过本地服务地址访问', true);
                return;
            }
            fillFormFromMeta();
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        openBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
        });

        if (imageInput) {
            imageInput.addEventListener('change', function () {
                var files = imageInput.files ? Array.from(imageInput.files) : [];
                files.forEach(function (file, idx) {
                    galleryState.push({
                        id: 'new-' + Date.now() + '-' + idx,
                        name: file.name,
                        keep: true,
                        cover: false,
                        isNew: true,
                        file: file,
                        previewUrl: URL.createObjectURL(file),
                    });
                });
                renderGalleryEditor();
            });
        }

        if (summaryEditor) {
            ['input', 'blur', 'paste'].forEach(function (eventName) {
                summaryEditor.addEventListener(eventName, function () {
                    syncSummaryValue();
                });
            });
        }

        if (summaryToolbar) {
            summaryToolbar.addEventListener('click', function (e) {
                var btn = e.target.closest('button');
                if (!btn) return;
                var cmd = btn.getAttribute('data-cmd') || '';
                var block = btn.getAttribute('data-block') || '';
                if (cmd === 'createLink') {
                    var url = window.prompt('请输入链接地址', 'https://');
                    if (!url) return;
                    execEditorCommand(cmd, url);
                    return;
                }
                if (block) {
                    setBlockTag(block);
                    return;
                }
                if (cmd) execEditorCommand(cmd);
            });
        }

        saveBtn.addEventListener('click', async function () {
            if (!canUseBackendApi()) {
                setStatus('当前页面不支持在线编辑', true);
                return;
            }
            syncSummaryValue();
            var title = titleInput ? String(titleInput.value || '').trim() : '';
            if (!title) {
                setStatus('标题不能为空', true);
                return;
            }
            saveBtn.disabled = true;
            restoreBtn.disabled = true;
            setStatus('正在保存...');
            try {
                var keepNames = galleryState.filter(function (item) {
                    return item.keep && !item.isNew;
                }).map(function (item) { return item.name; });
                var coverItem = galleryState.filter(function (item) { return item.keep && item.cover; })[0] || null;
                var fd = new FormData();
                fd.append('title', title);
                fd.append('tags', tagsInput ? tagsInput.value || '' : '');
                fd.append('category', categoryInput ? categoryInput.value || '' : '');
                fd.append('version_note', versionNoteInput ? versionNoteInput.value || '' : '');
                fd.append('summary_html', summaryInput ? summaryInput.value || '' : '');
                fd.append('keep_design_images', JSON.stringify(keepNames));
                fd.append('cover_name', coverItem ? coverItem.name : '');
                galleryState.forEach(function (item) {
                    if (item.keep && item.isNew && item.file) {
                        fd.append('design_images', item.file, item.file.name);
                    }
                });
                var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/edit'), {
                    method: 'POST',
                    body: fd
                });
                if (!res.ok) {
                    var txt = await res.text();
                    throw new Error(txt || ('HTTP ' + res.status));
                }
                var data = await res.json();
                setTopMsg((data && data.message) || '模型信息已保存');
                closeModal();
                location.reload();
            } catch (e) {
                setStatus('保存失败：' + (e.message || e), true);
            } finally {
                saveBtn.disabled = false;
                restoreBtn.disabled = false;
            }
        });

        restoreBtn.addEventListener('click', async function () {
            if (!canUseBackendApi()) {
                setStatus('当前页面不支持恢复', true);
                return;
            }
            if (!window.confirm('将恢复最近一次备份，并覆盖当前 meta.json。是否继续？')) {
                return;
            }
            saveBtn.disabled = true;
            restoreBtn.disabled = true;
            setStatus('正在恢复最近备份...');
            try {
                var res = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/history/restore-latest'), {
                    method: 'POST'
                });
                if (!res.ok) {
                    var txt = await res.text();
                    throw new Error(txt || ('HTTP ' + res.status));
                }
                var data = await res.json();
                setTopMsg((data && data.message) || '已恢复最近备份');
                closeModal();
                location.reload();
            } catch (e) {
                setStatus('恢复失败：' + (e.message || e), true);
            } finally {
                saveBtn.disabled = false;
                restoreBtn.disabled = false;
            }
        });
    }

    function initModelPathCopy(meta) {
        var copyBtn = document.getElementById('modelPathCopyBtn');
        var msgEl = document.getElementById('modelEditMsg');
        if (!copyBtn) return;

        function setMsg(text, isError) {
            if (!msgEl) return;
            msgEl.textContent = text || '';
            if (isError) msgEl.classList.add('error');
            else msgEl.classList.remove('error');
        }

        if (!canUseBackendApi()) {
            copyBtn.style.display = 'none';
            return;
        }

        var folderOpen = (meta && typeof meta === 'object' && meta.folder_open && typeof meta.folder_open === 'object')
            ? meta.folder_open
            : {};
        var enabled = folderOpen.enabled !== false;
        var localRoot = String(folderOpen.local_real_root_path || '').trim();
        if (!enabled || !localRoot) {
            copyBtn.style.display = 'none';
            return;
        }

        copyBtn.style.display = '';
        copyBtn.addEventListener('click', async function () {
            var targetPath = joinLocalPath(localRoot, MODEL_DIR);
            if (!targetPath) {
                setMsg('路径配置无效，请先在配置页填写本地真实目录地址', true);
                return;
            }
            try {
                await copyTextToClipboard(targetPath);
                setMsg('模型路径已复制到剪贴板');
            } catch (_) {
                setMsg('复制失败，请检查浏览器剪贴板权限', true);
            }
        });
    }

    // ============ 在线追加打印配置 ============

    function initInstanceImport() {
        var bar = document.getElementById('instanceAdminBar');
        var openBtn = document.getElementById('instanceImportOpenBtn');
        var modal = document.getElementById('instanceImportModal');
        var closeBtn = document.getElementById('instanceImportCloseBtn');
        var cancelBtn = document.getElementById('instanceImportCancelBtn');
        var fileInput = document.getElementById('instanceImportFileInput');
        var parseBtn = document.getElementById('instanceImportParseBtn');
        var preview = document.getElementById('instanceImportPreview');
        var sourceNameEl = document.getElementById('instanceImportSourceName');
        var titleInput = document.getElementById('instanceImportTitleInput');
        var summaryInput = document.getElementById('instanceImportSummaryInput');
        var picsEl = document.getElementById('instanceImportPics');
        var platesEl = document.getElementById('instanceImportPlates');
        var saveBtn = document.getElementById('instanceImportSaveBtn');
        var msgEl = document.getElementById('instanceImportMsg');
        if (!bar || !openBtn || !modal || !closeBtn || !cancelBtn || !fileInput || !parseBtn || !saveBtn) return;

        var parsedFile = null;
        var parseDraftSessionId = '';

        function normalize3mfName(name) {
            return String(name || '').replace(/^s\d+_/i, '');
        }

        function normalizeSessionId(value) {
            var sid = String(value || '').trim();
            return /^[a-f0-9]{32}$/.test(sid) ? sid : '';
        }

        async function discardParseDraft(sessionId) {
            var sid = normalizeSessionId(sessionId);
            if (!sid) return;
            try {
                await fetch(apiUrl('/api/manual/drafts/' + encodeURIComponent(sid)), {
                    method: 'DELETE'
                });
            } catch (_) { }
            if (parseDraftSessionId === sid) parseDraftSessionId = '';
        }

        function stem(name) {
            var n = normalize3mfName(name);
            var i = n.lastIndexOf('.');
            return i > 0 ? n.slice(0, i) : n;
        }

        function renderImageList(el, items, type) {
            if (!el) return;
            el.innerHTML = '';
            if (!items || !items.length) {
                var empty = document.createElement('div');
                empty.className = 'inst-import-gallery-item';
                empty.innerHTML = '<div class="caption">无</div>';
                el.appendChild(empty);
                return;
            }
            items.forEach(function (item, idx) {
                var url = '';
                var cap = '';
                if (type === 'pic') {
                    url = item && item.previewUrl ? item.previewUrl : '';
                    cap = '图 ' + (idx + 1);
                } else {
                    url = item && item.thumbnailPreviewUrl ? item.thumbnailPreviewUrl : '';
                    cap = '盘 ' + (item && item.index ? item.index : (idx + 1));
                }
                if (!url) return;
                var wrap = document.createElement('div');
                wrap.className = 'inst-import-gallery-item';
                var img = document.createElement('img');
                img.src = url;
                img.alt = cap;
                var caption = document.createElement('div');
                caption.className = 'caption';
                caption.textContent = cap;
                wrap.appendChild(img);
                wrap.appendChild(caption);
                el.appendChild(wrap);
            });
            if (!el.children.length) {
                var empty2 = document.createElement('div');
                empty2.className = 'inst-import-gallery-item';
                empty2.innerHTML = '<div class="caption">无</div>';
                el.appendChild(empty2);
            }
        }

        function setMsg(text, isError) {
            if (!msgEl) return;
            msgEl.textContent = text || '';
            if (isError) msgEl.classList.add('error');
            else msgEl.classList.remove('error');
        }

        function resetModal() {
            parsedFile = null;
            parseDraftSessionId = '';
            fileInput.value = '';
            if (preview) preview.classList.add('hidden');
            if (sourceNameEl) sourceNameEl.textContent = '-';
            if (titleInput) titleInput.value = '';
            if (summaryInput) summaryInput.value = '';
            renderImageList(picsEl, [], 'pic');
            renderImageList(platesEl, [], 'plate');
            saveBtn.disabled = true;
            setMsg('');
        }

        function openModal() {
            resetModal();
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            var sid = parseDraftSessionId;
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            resetModal();
            discardParseDraft(sid);
        }

        if (!canUseBackendApi() || location.protocol === 'file:') {
            bar.classList.add('hidden');
            return;
        }
        bar.classList.remove('hidden');

        openBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
        });

        parseBtn.addEventListener('click', async function () {
            var f = fileInput.files && fileInput.files[0];
            if (!f) {
                setMsg('请先选择 3MF 文件', true);
                return;
            }
            if (!/\.3mf$/i.test(f.name || '')) {
                setMsg('仅支持 .3mf 文件', true);
                return;
            }
            parseBtn.disabled = true;
            setMsg('正在识别配置信息...');
            try {
                var prevSid = parseDraftSessionId;
                var fd = new FormData();
                fd.append('files', f);
                var res = await fetch(apiUrl('/api/manual/3mf/parse'), {
                    method: 'POST',
                    body: fd
                });
                if (!res.ok) {
                    var txt = await res.text();
                    throw new Error(txt || ('HTTP ' + res.status));
                }
                var data = await res.json();
                var draft = data && data.draft ? data.draft : null;
                var inst = draft && Array.isArray(draft.instances) ? draft.instances[0] : null;
                if (!inst) throw new Error('未识别到实例配置');
                var newSid = normalizeSessionId(draft && draft.sessionId ? draft.sessionId : '');
                parseDraftSessionId = newSid;
                if (prevSid && prevSid !== newSid) {
                    discardParseDraft(prevSid);
                }
                parsedFile = f;
                if (preview) preview.classList.remove('hidden');
                if (sourceNameEl) sourceNameEl.textContent = normalize3mfName(inst.sourceFileName || inst.name || f.name);
                if (titleInput) titleInput.value = inst.title || stem(f.name);
                if (summaryInput) summaryInput.value = inst.summary || '';
                renderImageList(picsEl, inst.pictures || [], 'pic');
                renderImageList(platesEl, inst.plates || [], 'plate');
                saveBtn.disabled = false;
                setMsg('识别完成，可修改后保存');
            } catch (e) {
                setMsg('识别失败：' + (e.message || e), true);
            } finally {
                parseBtn.disabled = false;
            }
        });

        saveBtn.addEventListener('click', async function () {
            var f = parsedFile || (fileInput.files && fileInput.files[0]);
            if (!f) {
                setMsg('请先选择并识别 3MF 文件', true);
                return;
            }
            var title = titleInput ? String(titleInput.value || '').trim() : '';
            var summary = summaryInput ? String(summaryInput.value || '').trim() : '';
            if (!title) {
                setMsg('配置标题不能为空', true);
                return;
            }
            saveBtn.disabled = true;
            parseBtn.disabled = true;
            setMsg('正在保存配置...');
            try {
                var fd2 = new FormData();
                fd2.append('file', f);
                fd2.append('title', title);
                fd2.append('summary', summary);
                var res2 = await fetch(apiUrl('/api/models/' + encodeURIComponent(MODEL_DIR) + '/instances/import-3mf'), {
                    method: 'POST',
                    body: fd2
                });
                if (!res2.ok) {
                    var txt2 = await res2.text();
                    throw new Error(txt2 || ('HTTP ' + res2.status));
                }
                var data2 = await res2.json();
                setMsg((data2 && data2.message) || '已追加打印配置');
                if (parseDraftSessionId) {
                    discardParseDraft(parseDraftSessionId);
                }
                setTimeout(function () {
                    closeModal();
                    location.reload();
                }, 450);
            } catch (e2) {
                setMsg('保存失败：' + (e2.message || e2), true);
                saveBtn.disabled = false;
                parseBtn.disabled = false;
            }
        });
    }

    // ============ 主入口 ============

    async function main() {
        var meta;
        if (window.__OFFLINE_META__) {
            meta = window.__OFFLINE_META__;
            MODEL_DIR = meta.dir || meta.baseName || getModelDir();
        } else {
            MODEL_DIR = getModelDir();
            if (!MODEL_DIR) {
                showError('无法从 URL 解析模型目录');
                return;
            }

            try {
                var res = await fetch(apiUrl('/api/v2/models/' + encodeURIComponent(MODEL_DIR) + '/meta'));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                meta = await res.json();
            } catch (e) {
                showError('请求模型数据失败：' + e.message);
                return;
            }
        }

        try {
            var images = normalizeImages(meta);
            CURRENT_META = meta;

            // 渲染各区域
            renderTitle(meta);
            renderDownloadWarning(meta);
            renderAuthor(meta);
            renderSource(meta);
            renderHero(meta, images);
            renderCollectDate(meta);
            renderMetaExtras(meta);
            renderStats(meta);
            renderTags(meta);
            renderInstances(meta);
            renderCarousel();
            renderSummary(meta);
            renderComments(meta);

            // 显示主内容，隐藏加载状态
            document.getElementById('loadingState').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('hidden');

            // 初始化交互
            initLightbox();
            initAttachments();
            initPrinted();
            initModelEditor();
            initModelPathCopy(meta);
            initInstanceImport();
            initBambuOpenGuard();
            initBackButton();

            // 仅在 file:// 直开且无法调用本地 API 时隐藏上传区块
            if (!canUseBackendApi()) {
                var attachUpload = document.getElementById('attachUploadBtn');
                var printedUpload = document.getElementById('printedUploadBtn');
                if (attachUpload && attachUpload.parentElement) attachUpload.parentElement.style.display = 'none';
                if (printedUpload && printedUpload.parentElement) printedUpload.parentElement.style.display = 'none';
            }
        } catch (e) {
            showError('加载模型数据失败：' + e.message);
        }
    }

    function showError(msg) {
        document.getElementById('loadingState').classList.add('hidden');
        var el = document.getElementById('errorState');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            parseVideoEmbedInfo: parseVideoEmbedInfo,
            transformSummaryHtml: transformSummaryHtml,
            getDownloadWarningConfig: getDownloadWarningConfig,
        };
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    // 启动
    /* 分盘弹窗控制逻辑 */
    window.openPlatesModal = function (btn) {
        var platesHtml = btn.getAttribute('data-plates');
        var modal = document.getElementById('platesModal');
        var body = document.getElementById('platesModalBody');
        var preview = document.getElementById('platesModalPreview');
        body.innerHTML = platesHtml;
        modal.classList.add('active');

        // 初始化侧边栏交互逻辑
        var rows = body.querySelectorAll('.plate-row');
        function selectRow(row) {
            rows.forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            var img = row.querySelector('.plate-row-img img');
            if (img) {
                preview.innerHTML = '<img src="' + img.src + '" alt="preview">';
            } else {
                preview.innerHTML = '<div style="color:#666;">暂无预览</div>';
            }
        }

        rows.forEach(function (row) {
            row.addEventListener('click', function () {
                selectRow(this);
            });
        });

        // 默认选中第一项
        if (rows.length > 0) {
            selectRow(rows[0]);
        } else {
            preview.innerHTML = '';
        }
    };

    document.getElementById('platesModalClose').addEventListener('click', function () {
        document.getElementById('platesModal').classList.remove('active');
    });

    document.getElementById('platesModal').addEventListener('click', function (e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });

    // 页面主入口
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();
