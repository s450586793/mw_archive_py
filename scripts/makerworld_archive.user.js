// ==UserScript==
// @name         MakerWorld Archive Helper
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  MakerWorld 模型归档助手，提供API配置、模型归档和Cookie同步功能
// @match        *://makerworld.com/*/models/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // 1. 注入 CSS 样式
    GM_addStyle(`
        /* 悬浮球图标 */
        #mwa-fab {
            position: fixed;
            right: 30px;
            bottom: 100px;
            width: 50px;
            height: 50px;
            background: #00AE42; /* 竹海绿 */
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            z-index: 9999;
            font-size: 24px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        #mwa-fab:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 16px rgba(0, 174, 66, 0.3);
        }

        /* 隐藏功能悬浮面板 */
        #mwa-panel {
            position: fixed;
            right: 30px;
            bottom: 160px;
            width: 320px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            padding: 20px;
            z-index: 9998;
            display: none;
            flex-direction: column;
            gap: 16px;
            font-family: system-ui, -apple-system, sans-serif;
            border: 1px solid #f0f0f0;
        }
        #mwa-panel.show { display: flex; }

        /* 面板标题栏 */
        .mwa-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 4px;
        }
        .mwa-close {
            cursor: pointer;
            color: #999;
            font-size: 14px;
            padding: 4px;
        }
        .mwa-close:hover { color: #333; }

        /* 表单与按钮 */
        .mwa-form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .mwa-label {
            font-size: 13px;
            color: #555;
            font-weight: 500;
        }
        .mwa-input-row { display: flex; gap: 8px; }
        .mwa-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            transition: border 0.2s;
        }
        .mwa-input:focus { border-color: #00AE42; }
        
        .mwa-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .mwa-btn-primary {
            background: #00AE42;
            color: white;
        }
        .mwa-btn-primary:hover { background: #009639; }
        .mwa-btn-secondary {
            background: #f4f4f5;
            color: #333;
        }
        .mwa-btn-secondary:hover { background: #e4e4e7; }
        .mwa-btn-sm { padding: 8px 12px; font-size: 13px; }

        /* 注入在页面内的独立归档按钮 */
        .mwa-inline-btn {
            background-color: #fce4e4;
            color: #d93025;
            border: 1px solid #fad2d2;
            border-radius: 6px; /* 扁平风格与原站融合 */
            padding: 6px 12px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin-left: 12px;
            transition: all 0.2s;
        }
        .mwa-inline-btn:hover { background-color: #fad2d2; }

        /* 提示 Toast */
        .mwa-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: none;
            opacity: 0;
            transition: opacity 0.3s;
        }
    `);

    // 2. 状态管理
    let apiUrl = GM_getValue('mwa_api_url', 'http://127.0.0.1:5000');

    // 3. 构建 UI 组件

    // Toast
    const toast = document.createElement('div');
    toast.className = 'mwa-toast';
    document.body.appendChild(toast);

    let toastTimeout;
    const showToast = (msg, duration = 3000) => {
        toast.textContent = msg;
        toast.style.display = 'block';
        toast.offsetHeight; // forced reflow
        toast.style.opacity = '1';
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, duration);
    };

    // 悬浮球 FAB
    const fab = document.createElement('div');
    fab.id = 'mwa-fab';
    fab.innerHTML = '🧰';
    fab.title = 'MakerWorld 归档助手';
    document.body.appendChild(fab);

    // 菜单面板 Panel
    const panel = document.createElement('div');
    panel.id = 'mwa-panel';
    panel.innerHTML = `
        <div class="mwa-header">
            <span>✨ MW 归档助手</span>
            <span class="mwa-close" id="mwa-close">✖</span>
        </div>
        
        <div class="mwa-form-group">
            <label class="mwa-label">归档服务器 API 地址</label>
            <div class="mwa-input-row">
                <input type="text" id="mwa-api-url" class="mwa-input" value="${apiUrl}" placeholder="http://127.0.0.1:5000">
                <button class="mwa-btn mwa-btn-primary mwa-btn-sm" id="mwa-save-api">保存</button>
            </div>
        </div>

        <hr style="border: none; border-top: 1px dashed #eee; margin: 0;">

        <button class="mwa-btn mwa-btn-primary" id="mwa-archive-btn">
            📦 归档当前模型
        </button>
        <button class="mwa-btn mwa-btn-secondary" id="mwa-sync-cookie">
            🍪 上报同步当前 Cookie
        </button>
    `;
    document.body.appendChild(panel);

    // 4. 事件绑定

    fab.addEventListener('click', () => panel.classList.toggle('show'));
    document.getElementById('mwa-close').addEventListener('click', () => panel.classList.remove('show'));

    document.getElementById('mwa-save-api').addEventListener('click', () => {
        apiUrl = document.getElementById('mwa-api-url').value.trim();
        GM_setValue('mwa_api_url', apiUrl);
        showToast('✅ API地址保存成功！');
    });

    const getModelId = () => {
        const match = location.href.match(/models\/(\d+)/);
        return match ? match[1] : null;
    };

    const executeArchive = () => {
        const modelId = getModelId();
        if (!modelId) {
            showToast('⚠️ 当前页面未检测到模型ID，请确保在模型详情页使用');
            return;
        }

        const endpoint = apiUrl.replace(/\/$/, '') + '/api/archive';
        showToast(`正在发送归档请求 (ID: ${modelId})...`, 5000);

        GM_xmlhttpRequest({
            method: 'POST',
            url: endpoint,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                model_id: modelId,
                url: location.href
            }),
            onload: function (res) {
                if (res.status === 200) {
                    showToast('✅ 模型归档请求发送成功！');
                } else {
                    showToast('❌ 归档失败: HTTP ' + res.status);
                }
            },
            onerror: function (err) {
                showToast('❌ 请求失败，无法连接到归档服务器，请检查API地址');
            }
        });
    };

    document.getElementById('mwa-archive-btn').addEventListener('click', executeArchive);

    document.getElementById('mwa-sync-cookie').addEventListener('click', () => {
        const cookie = document.cookie;
        if (!cookie) {
            showToast('⚠️ 未获取到页面 Cookie，可能未登录');
            return;
        }

        const endpoint = apiUrl.replace(/\/$/, '') + '/api/cookie';
        showToast('正在同步 Cookie 到后端...', 5000);

        GM_xmlhttpRequest({
            method: 'POST',
            url: endpoint,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ cookie: cookie }),
            onload: function (res) {
                if (res.status === 200) {
                    showToast('✅ Cookie 同步成功！');
                } else {
                    showToast('❌ 同步失败: 返回码 ' + res.status);
                }
            },
            onerror: function (err) {
                showToast('❌ 网络请求失败，请确保后端服务正在运行并允许跨域');
            }
        });
    });

    // 5. 页面原生注入：尝试在模型页分享收藏栏加入按钮
    const injectInlineButton = () => {
        if (document.getElementById('mwa-inline-archive')) return;

        // 我们利用寻找 Makerworld DOM 里包含 flex 且有按钮的地方插入 (通常是"助力"按钮平级)
        // 这个 XPath 去尝试找到类似 "收藏/分享" 按钮的区域
        const titlesOrActions = document.querySelectorAll('h1, button svg');
        let container = null;

        for (let el of titlesOrActions) {
            if (el.tagName.toLowerCase() === 'svg' && el.parentElement && el.parentElement.parentElement) {
                // 判断一下可能是 Action Bar 容器，通过判断里面有多个同级 button 判断
                const flexContainer = el.parentElement.parentElement;
                if (flexContainer.style.display === 'flex' || window.getComputedStyle(flexContainer).display === 'flex') {
                    if (flexContainer.children.length >= 3) {
                        container = flexContainer;
                        break;
                    }
                }
            }
        }

        // 如果找不到 action bar，就先加到 H1 标题旁边
        if (!container) {
            const h1 = document.querySelector('h1');
            if (h1 && h1.parentElement) {
                container = h1.parentElement;
                // 令标题保持 Flex 对齐
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.flexWrap = 'wrap';
            }
        }

        if (container) {
            const inlineBtn = document.createElement('button');
            inlineBtn.id = 'mwa-inline-archive';
            inlineBtn.className = 'mwa-inline-btn';
            inlineBtn.innerHTML = '📥 归档本模型';
            inlineBtn.title = '利用归档助手一键归档至私有库';
            inlineBtn.onclick = (e) => {
                e.preventDefault();
                executeArchive();
            };

            container.appendChild(inlineBtn);
            return true;
        }
        return false;
    };

    let retryCounts = 0;
    const observerTimer = setInterval(() => {
        if (injectInlineButton() || retryCounts > 10) {
            clearInterval(observerTimer);
        }
        retryCounts++;
    }, 1500);

})();
