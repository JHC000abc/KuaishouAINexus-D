// ==UserScript==
// @name         快手视频信息拦截与解析 (AI神评论增强版)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  全功能终极版：抓取任务防中断挂起机制、评论后置触发赞藏、全维度气泡通知、悬浮球位置记忆、FIFO防重队列、全局异常阻断、全息日志
// @author       Assistant & Gemini && JHC000abc@gmail.com
// @license      CC-BY-NC-SA-4.0
// @match        https://www.kuaishou.com/*
// @connect      *
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// @require      https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 全局状态与缓存
    // ==========================================
    let videoInfoMap = new Map();
    let currentUserInfo = null;
    let currentActivePhotoId = null;
    let lastTriggeredPhotoId = null;
    let allCapturedComments = [];
    let autoSwitchTimer = null;
    let isDraggingFab = false;
    let consecutiveSwitchFailures = 0;

    // 【新增】：用于追踪当前视频是否还有尚未完成的评论抓取任务
    let isScrapingActive = false;

    // 主页批量解析专属状态
    let profileExportData = [];
    let isProfileParsing = false;
    let currentProfileUserId = null;

    const STATS = {
        captured: GM_getValue('ks_stat_captured', 0),
        videos: GM_getValue('ks_stat_videos', 0),
        sent: GM_getValue('ks_stat_sent', 0),
        downloaded: GM_getValue('ks_stat_downloaded', 0),
        liked: GM_getValue('ks_stat_liked', 0),
        collected: GM_getValue('ks_stat_collected', 0)
    };

    const CONFIG = {
        defaults: {
            enabled: true,
            darkMode: true,

            // 交互配置 (点赞与收藏)
            enableAutoInteract: false,
            likeProbability: 100,
            collectProbability: 100,

            // 评论配置
            enableCommenting: false,
            commentProbability: 100,
            replyMode: 'fixed',
            fixedText: '为你点赞！拍得太好啦~\n支持一下！\n太棒了吧！',
            aiPrompt: '你是一个快手神评达人，请根据视频内容简短幽默地评论，不要带有说教味，控制在20字以内。',
            aiTimeout: 30,

            // AI 模型相关配置
            localUrl: 'http://127.0.0.1:11434/api/generate',
            localModel: 'deepseek-r1:1.5b',
            localStream: false,
            onlineUrl: 'https://api.deepseek.com/chat/completions',
            onlineModel: 'deepseek-chat',
            onlineKey: '',
            onlineStream: false,

            // 抓取配置
            enableScraping: false,
            scrapeComments: true,
            scrapeSubComments: true,

            // 下载配置
            enableDownload: false,
            useMotrix: false,
            motrixRpc: 'http://127.0.0.1:16800/jsonrpc',
            motrixToken: '',
            saveDir: '',

            // 播控配置
            autoSwitchEnabled: true,
            switchMinTime: 10,
            switchMaxTime: 30,

            // 主页批量处理配置
            enableProfileParse: false,
            autoProfileParse: false
        }
    };

    function getSettings() {
        return {
            enabled: GM_getValue('ks_enabled', CONFIG.defaults.enabled),
            darkMode: GM_getValue('ks_dark_mode', CONFIG.defaults.darkMode),

            enableAutoInteract: GM_getValue('ks_enable_auto_interact', CONFIG.defaults.enableAutoInteract),
            likeProbability: GM_getValue('ks_like_prob', CONFIG.defaults.likeProbability),
            collectProbability: GM_getValue('ks_collect_prob', CONFIG.defaults.collectProbability),

            enableCommenting: GM_getValue('ks_enable_commenting', CONFIG.defaults.enableCommenting),
            commentProbability: GM_getValue('ks_comment_prob', CONFIG.defaults.commentProbability),
            replyMode: GM_getValue('ks_reply_mode', CONFIG.defaults.replyMode),
            fixedText: GM_getValue('ks_fixed_text', CONFIG.defaults.fixedText),
            aiPrompt: GM_getValue('ks_ai_prompt', CONFIG.defaults.aiPrompt),
            aiTimeout: GM_getValue('ks_ai_timeout', CONFIG.defaults.aiTimeout),

            localUrl: GM_getValue('ks_local_url', CONFIG.defaults.localUrl),
            localModel: GM_getValue('ks_local_model', CONFIG.defaults.localModel),
            localStream: GM_getValue('ks_local_stream', CONFIG.defaults.localStream),
            onlineUrl: GM_getValue('ks_online_url', CONFIG.defaults.onlineUrl),
            onlineModel: GM_getValue('ks_online_model', CONFIG.defaults.onlineModel),
            onlineKey: GM_getValue('ks_online_key', CONFIG.defaults.onlineKey),
            onlineStream: GM_getValue('ks_online_stream', CONFIG.defaults.onlineStream),

            enableScraping: GM_getValue('ks_enable_scraping', CONFIG.defaults.enableScraping),
            scrapeComments: GM_getValue('ks_scrape_comments', CONFIG.defaults.scrapeComments),
            scrapeSubComments: GM_getValue('ks_scrape_sub', CONFIG.defaults.scrapeSubComments),

            enableDownload: GM_getValue('ks_enable_download', CONFIG.defaults.enableDownload),
            useMotrix: GM_getValue('ks_use_motrix', CONFIG.defaults.useMotrix),
            motrixRpc: GM_getValue('ks_motrix_rpc', CONFIG.defaults.motrixRpc),
            motrixToken: GM_getValue('ks_motrix_token', CONFIG.defaults.motrixToken),
            saveDir: GM_getValue('ks_save_dir', CONFIG.defaults.saveDir),

            autoSwitchEnabled: GM_getValue('ks_auto_switch_enabled', CONFIG.defaults.autoSwitchEnabled),
            switchMinTime: GM_getValue('ks_switch_min', CONFIG.defaults.switchMinTime),
            switchMaxTime: GM_getValue('ks_switch_max', CONFIG.defaults.switchMaxTime),

            enableProfileParse: GM_getValue('ks_enable_profile_parse', CONFIG.defaults.enableProfileParse),
            autoProfileParse: GM_getValue('ks_auto_profile_parse', CONFIG.defaults.autoProfileParse)
        };
    }

    function updateStat(key, val = 1) {
        STATS[key] += val;
        GM_setValue(`ks_stat_${key}`, STATS[key]);
        const el = document.getElementById(`stat-val-${key}`);
        if (el) el.innerText = STATS[key];
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ==========================================
    // 文件命名与工具函数
    // ==========================================
    function sanitizeFilename(name) {
        if (!name) return "未命名";
        return name.replace(/[\\/:*?"<>|\r\n\t]/g, "_").trim();
    }

    function formatKsTime(timestamp) {
        const d = new Date(timestamp);
        return d.getFullYear().toString() +
               (d.getMonth() + 1).toString().padStart(2, '0') +
               d.getDate().toString().padStart(2, '0') + "_" +
               d.getHours().toString().padStart(2, '0') +
               d.getMinutes().toString().padStart(2, '0') +
               d.getSeconds().toString().padStart(2, '0');
    }

    // ==========================================
    // UI气泡通知系统 (Toast)
    // ==========================================
    function showToast(title, subtitle, msg, color) {
        let container = document.getElementById('ks-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ks-toast-container';
            document.body.appendChild(container);
        }
        const d = document.createElement('div');
        d.className = 'ks-toast-msg';
        if (getSettings().darkMode) d.classList.add('ks-dark-mode-toast');
        d.style.borderLeft = `5px solid ${color}`;
        d.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <b style="font-size:14px;">${title}</b>
                <span style="font-size:12px; opacity:0.8; background:rgba(127,140,141,0.2); padding:2px 6px; border-radius:4px;">${subtitle}</span>
            </div>
            <span style="font-size:12px; line-height:1.4; word-break: break-all;">${msg}</span>
        `;
        container.appendChild(d);

        setTimeout(() => { d.style.transform = 'translateX(0)'; d.style.opacity = '1'; }, 10);
        setTimeout(() => {
            d.style.opacity = '0';
            d.style.transform = 'translateX(120%)';
            setTimeout(() => d.remove(), 300);
        }, 4500);
    }

    // ==========================================
    // 悬浮球状态控制与 UI 面板跟随
    // ==========================================
    function updateFabState(state, text) {
        const btn = document.getElementById('ks-helper-btn');
        if (!btn) return;

        btn.innerHTML = text !== undefined ? text : '⚡';
        btn.style.background = '';
        btn.style.fontSize = (text === '静止' || text === '等抓取') ? '14px' : '20px';

        switch(state) {
            case 'SUCCESS':
                btn.style.background = 'linear-gradient(135deg, #00b894, #27ae60)';
                break;
            case 'ERROR':
                btn.style.background = 'linear-gradient(135deg, #ff7675, #d63031)';
                break;
            case 'COUNTDOWN':
                btn.style.background = 'linear-gradient(135deg, #0984e3, #74b9ff)';
                break;
            case 'PROCESSING':
                btn.style.background = 'linear-gradient(135deg, #fd79a8, #e84393)';
                break;
            case 'SKIPPING':
                btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                break;
            case 'IDLE':
                btn.style.background = 'linear-gradient(135deg, #636e72, #b2bec3)';
                break;
            default:
                btn.style.background = 'linear-gradient(135deg, #ff4757, #fe2c55)';
        }
    }

    function updatePanelPosition() {
        const fab = document.getElementById('ks-helper-btn');
        const panel = document.getElementById('ks-settings-panel');
        if (fab && panel && panel.style.display !== 'none') {
            const rect = fab.getBoundingClientRect();
            let topPos = rect.top;
            if (topPos + panel.offsetHeight > window.innerHeight) {
                topPos = window.innerHeight - panel.offsetHeight - 20;
            }
            panel.style.top = Math.max(10, topPos) + 'px';

            if (rect.left > window.innerWidth / 2) {
                panel.style.left = (rect.left - 355) + 'px';
                panel.style.right = 'auto';
            } else {
                panel.style.left = (rect.right + 15) + 'px';
                panel.style.right = 'auto';
            }
        }
    }

    // ==========================================
    // 自动关闭连播管控功能
    // ==========================================
    async function disableAutoPlay() {
        await sleep(1000);
        const switchSpan = document.querySelector('.autoPlay .toggle-switch') || document.querySelector('.auto-play-btn span[role="switch"]');
        if (switchSpan) {
            const isChecked = switchSpan.getAttribute('aria-checked');
            if (isChecked === 'true') {
                console.log('%c[自动连播管控] 检测到系统连播开启，正在强制关闭...', 'color: #e67e22; font-weight: bold;');
                switchSpan.click();
                showToast('🛠️ 系统', '连播管控', '已成功关闭快手自带连播', '#e67e22');
            }
        }
    }

    // ==========================================
    // 全自动播控模块 (含抓取挂起保护)
    // ==========================================
    function executeSwitchVideoWithCheck() {
        clearInterval(autoSwitchTimer);
        if (getSettings().autoSwitchEnabled) {
            executeSwitchVideo();
        } else {
            updateFabState('IDLE', '静止');
            showToast('⏸️ 播控拦截', '自动切换未开启', '任务完毕，停留在当前视频', '#f39c12');
            console.log('%c[播控拦截] 倒计时结束，但自动播控模块处于关闭状态，停留在当前视频。', 'color: #f39c12; font-weight: bold;');
        }
    }

    function scheduleNextVideo() {
        clearInterval(autoSwitchTimer);
        const s = getSettings();

        if (!s.enabled) {
            updateFabState('IDLE');
            return;
        }

        let min = parseInt(s.switchMinTime, 10) || 10;
        let max = parseInt(s.switchMaxTime, 10) || 30;
        if (min > max) { let temp = min; min = max; max = temp; }

        let delaySeconds = Math.floor(Math.random() * (max - min + 1) + min);

        showToast('⏱️ 播控启动', '倒计时开始', `将在 ${delaySeconds} 秒后自动切换视频`, '#3498db');
        console.log(`%c[播控调度] 正常倒计时开启: ${delaySeconds} 秒`, 'color: #3498db; font-weight: bold;');

        updateFabState('COUNTDOWN', delaySeconds);
        autoSwitchTimer = setInterval(() => {
            if (delaySeconds > 0) {
                delaySeconds--;
                if (delaySeconds > 0) {
                    updateFabState('COUNTDOWN', delaySeconds);
                } else {
                    // 倒计时刚刚归零，检查是否还有未完结的抓取任务
                    if (isScrapingActive) {
                        updateFabState('PROCESSING', '等抓取');
                        showToast('⏳ 等待抓取', '任务未结束', '倒计时完毕，正等待所有评论抓取完成后再切换', '#0984e3');
                        console.log('%c[播控等待] 正常倒计时完毕，挂起等待抓取队列清空...', 'color: #0984e3; font-weight: bold;');
                    } else {
                        executeSwitchVideoWithCheck();
                    }
                }
            } else {
                // 倒计时已归零，处于轮询等待状态，一旦抓取结束立刻执行
                if (!isScrapingActive) {
                    executeSwitchVideoWithCheck();
                }
            }
        }, 1000);
    }

    function triggerFastSwitch(seconds, mode = 'SKIPPING') {
        clearInterval(autoSwitchTimer);
        const s = getSettings();

        if (!s.enabled) {
            updateFabState('IDLE');
            return;
        }

        let delaySeconds = seconds;
        showToast('⚡ 极速接管', '跳过倒计时', `触发保护机制，将在 ${delaySeconds} 秒后强制切换`, '#e74c3c');
        console.log(`%c[强控调度] 触发极速跳过倒计时: ${delaySeconds} 秒 (${mode})`, 'color: #e74c3c; font-weight: bold;');

        updateFabState(mode, delaySeconds);
        autoSwitchTimer = setInterval(() => {
            if (delaySeconds > 0) {
                delaySeconds--;
                if (delaySeconds > 0) {
                    updateFabState(mode, delaySeconds);
                } else {
                    if (isScrapingActive) {
                        updateFabState('PROCESSING', '等抓取');
                        showToast('⏳ 等待抓取', '任务未结束', '极速倒计时完毕，正等待所有评论抓取完成后再切换', '#0984e3');
                        console.log('%c[播控等待] 极速倒计时完毕，挂起等待抓取队列清空...', 'color: #0984e3; font-weight: bold;');
                    } else {
                        executeSwitchVideoWithCheck();
                    }
                }
            } else {
                if (!isScrapingActive) {
                    executeSwitchVideoWithCheck();
                }
            }
        }, 1000);
    }

    function executeSwitchVideo() {
        updateFabState('PROCESSING', '切换');

        showToast('⏭️ 播控执行', '正在下滑', '倒计时结束，且队列清空，正在切换至下一视频...', '#e84393');

        const oldId = currentActivePhotoId;
        const nextBtn = document.querySelector('.nextVideo .next') || document.querySelector('.next-video-btn');

        if (nextBtn) {
            nextBtn.click();
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        }

        setTimeout(() => {
            if (oldId === currentActivePhotoId) {
                consecutiveSwitchFailures++;
                if (consecutiveSwitchFailures >= 10) {
                    updateFabState('ERROR', '刷新');
                    showToast('🔄 自动恢复', '连续失败过多', '切换视频连续失败10次，正在强制刷新页面...', '#d63031');
                    setTimeout(() => location.reload(), 2000);
                    return;
                }

                updateFabState('ERROR', '重试');
                showToast('⚠️ 播控异常', '切换失败', `未成功进入下一视频，强制重试(${consecutiveSwitchFailures}/10)`, '#d63031');
                executeSwitchVideo();
            } else {
                consecutiveSwitchFailures = 0;
                updateFabState('IDLE', '⚡');
            }
        }, 3000);
    }

    // ==========================================
    // 独立赞藏交互引擎 (评论后置触发)
    // ==========================================
    async function triggerAutoInteract() {
        const s = getSettings();
        if (!s.enabled || !s.enableAutoInteract) return;

        // 随机延迟1~2秒，模拟真人刚看一会儿视频/发完评论后的自然反应
        const delay = Math.floor(Math.random() * 1000) + 1000;
        await sleep(delay);

        try {
            // 1. 点赞逻辑判断
            const likeRand = Math.random() * 100;
            if (likeRand <= s.likeProbability) {
                const likeContainer = document.querySelector('.hover-tip.like');
                const likeBtn = likeContainer ? likeContainer.querySelector('.like-btn') : document.querySelector('.like-btn');

                if (likeBtn) {
                    likeBtn.click();
                    updateStat('liked');
                    showToast('❤️ 自动点赞', '操作执行', '已成功为当前视频点赞', '#fd79a8');
                    console.log('%c[赞藏引擎] 执行自动点赞 (元素点击)', 'color: #fd79a8; font-weight: bold;');
                } else {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', keyCode: 90, bubbles: true }));
                    updateStat('liked');
                    showToast('❤️ 自动点赞', '操作执行', '已成功为当前视频点赞 (快捷键Z兜底)', '#fd79a8');
                    console.log('%c[赞藏引擎] 执行自动点赞 (快捷键Z兜底)', 'color: #fd79a8; font-weight: bold;');
                }

                // 给DOM一点反应时间，防止同时点击过快
                await sleep(Math.floor(Math.random() * 500) + 500);
            } else {
                showToast('⏭️ 自动点赞', '概率跳过', `未命中点赞概率(${s.likeProbability}%)，不执行点赞`, '#b2bec3');
                console.log(`%c[赞藏引擎] 未命中点赞概率(${s.likeProbability}%)，跳过点赞`, 'color: #7f8c8d;');
            }

            // 2. 收藏逻辑判断
            const collectRand = Math.random() * 100;
            if (collectRand <= s.collectProbability) {
                const starContainer = document.querySelector('.star');
                const collectBtn = starContainer ? starContainer : document.querySelector('.collect-svg')?.parentElement;

                if (collectBtn) {
                    collectBtn.click();
                    updateStat('collected');
                    showToast('⭐ 自动收藏', '操作执行', '已成功为当前视频收藏', '#f1c40f');
                    console.log('%c[赞藏引擎] 执行自动收藏 (元素点击)', 'color: #f1c40f; font-weight: bold;');
                } else {
                    console.log('%c[赞藏引擎] 执行自动收藏失败 (未找到相关DOM元素)', 'color: #e74c3c; font-weight: bold;');
                }
            } else {
                showToast('⏭️ 自动收藏', '概率跳过', `未命中收藏概率(${s.collectProbability}%)，不执行收藏`, '#b2bec3');
                console.log(`%c[赞藏引擎] 未命中收藏概率(${s.collectProbability}%)，跳过收藏`, 'color: #7f8c8d;');
            }

        } catch (e) {
            console.error('[赞藏引擎异常]', e);
        }
    }


    // ==========================================
    // UI 样式注入
    // ==========================================
    GM_addStyle(`
        #ks-toast-container { position: fixed; top: 20px; right: 20px; z-index: 2147483647; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
        .ks-toast-msg { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); color: #2d3436; padding: 12px 16px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-family: 'Segoe UI', sans-serif; min-width: 220px; max-width: 300px; transform: translateX(120%); opacity: 0; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: auto; }
        .ks-dark-mode-toast { background: rgba(45, 52, 54, 0.95); color: #dfe6e9; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .ks-dark-mode-toast span { color: #b2bec3 !important; }

        #ks-helper-btn { position: fixed; top: 30%; right: 20px; z-index: 2147483646; width: 48px; height: 48px; background: linear-gradient(135deg, #ff4757, #fe2c55); border-radius: 50%; cursor: move; display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); font-weight: bold; transition: box-shadow 0.2s; user-select: none; }
        #ks-helper-btn:hover { box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5); }

        #ks-settings-panel { position: fixed; z-index: 2147483645; width: 350px; max-height: 85vh; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); padding: 20px; display: none; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.6); font-family: 'Segoe UI', Roboto, sans-serif; color: #2d3436; overflow: hidden; flex-direction: column; }
        #ks-settings-panel h3 { margin: 0 0 15px 0; font-size: 18px; display: flex; justify-content: space-between; align-items: center; color: #2d3436; }

        .ks-scroll-content { overflow-y: auto; padding-right: 5px; flex-grow: 1; margin-bottom: 10px; }
        .ks-scroll-content::-webkit-scrollbar { width: 5px; }
        .ks-scroll-content::-webkit-scrollbar-thumb { background: #b2bec3; border-radius: 4px; }

        .ks-dark-mode { background: rgba(30, 39, 46, 0.95) !important; color: #dfe6e9 !important; border-color: rgba(255,255,255,0.1) !important; }
        .ks-dark-mode h3 { color: #dfe6e9 !important; }

        .ks-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 20px; }
        .ks-stat-box { background: #f1f2f6; padding: 8px 2px; border-radius: 8px; text-align: center; border: 1px solid #dfe6e9; }
        .ks-dark-mode .ks-stat-box { background: #2d3436; border-color: #636e72; }
        .ks-stat-label { font-size: 9px; color: #636e72; display: block; margin-bottom: 3px; }
        .ks-dark-mode .ks-stat-label { color: #b2bec3; }
        .ks-stat-val { font-size: 13px; font-weight: bold; color: #fe2c55; }

        .ks-toggle-wrapper { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; font-weight: 500;}
        .ks-toggle { position: relative; width: 40px; height: 20px; display: inline-block; }
        .ks-toggle input { opacity: 0; width: 0; height: 0; }
        .ks-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #dfe6e9; transition: .3s; border-radius: 20px; }
        .ks-dark-mode .ks-slider { background-color: #636e72; }
        .ks-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
        input:checked + .ks-slider { background-color: #00b894 !important; }
        input:checked + .ks-slider:before { transform: translateX(20px); }

        .ks-input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ccc; border-radius: 6px; margin-top: 5px; font-size: 12px; font-family: inherit; background: #fff; }
        .ks-dark-mode .ks-input { background: #2d3436; color: #dfe6e9; border-color: #636e72; }

        .ks-label { font-size: 12px; color: #2d3436; font-weight: bold; display: block; margin-top: 8px; }
        .ks-dark-mode .ks-label { color: #dfe6e9; }

        .ks-btn { width: 100%; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; margin-top: 10px; color: white; display: flex; justify-content: center; align-items: center;}
        .ks-btn-primary { background: #fe2c55; }
        .ks-btn-success { background: #00b894; }
        .ks-btn-danger { background: #d63031; }
        .ks-btn-info { background: #0984e3; }
        .ks-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .ks-btn:disabled { opacity: 0.6; cursor: not-allowed; background: #636e72 !important; }

        .ks-section { border: 1px dashed #fe2c55; padding: 12px; border-radius: 8px; margin-bottom: 15px; background: rgba(254, 44, 85, 0.03); }
        .ks-dark-mode .ks-section { border-color: #ff7675; background: rgba(255, 118, 117, 0.05); }
        .ks-section-title { font-weight: bold; color: #fe2c55; margin-bottom: 10px; display: block; font-size: 14px; }
        .ks-dark-mode .ks-section-title { color: #ff7675; }

        .ks-tab-container { display: flex; background: #dfe6e9; border-radius: 8px; padding: 2px; margin-bottom: 10px; }
        .ks-dark-mode .ks-tab-container { background: #1e272e; }
        .ks-tab-btn { flex: 1; border: none; background: transparent; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600; color: #636e72; cursor: pointer; transition: 0.2s; }
        .ks-dark-mode .ks-tab-btn { color: #b2bec3; }
        .ks-tab-btn.active { background: white; color: #fe2c55; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .ks-dark-mode .ks-tab-btn.active { background: #636e72; color: #fff; }
    `);

    // ==========================================
    // UI 构建与交互逻辑
    // ==========================================
    function renderUI() {
        if (document.getElementById('ks-helper-btn')) return;

        const s = getSettings();
        const repliedArr = GM_getValue('ks_replied_videos', []);

        const btn = document.createElement('div');
        btn.id = 'ks-helper-btn';
        btn.innerHTML = '⚡';
        btn.title = '拖拽移动，点击展开/收起配置';

        const savedFabTop = GM_getValue('ks_fab_top', null);
        const savedFabLeft = GM_getValue('ks_fab_left', null);
        if (savedFabTop !== null && savedFabLeft !== null) {
            btn.style.top = savedFabTop + 'px';
            btn.style.left = savedFabLeft + 'px';
            btn.style.right = 'auto';
        }

        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'ks-settings-panel';
        if (s.darkMode) panel.classList.add('ks-dark-mode');

        panel.innerHTML = `
            <h3>
                <span>快手神评助手 v1.0.0</span>
                <span id="ks-close-btn" style="cursor:pointer; font-size:20px; color:#b2bec3; padding:0 5px;">×</span>
            </h3>

            <div class="ks-stats-row">
                <div class="ks-stat-box"><span class="ks-stat-label">捕获评论</span><span class="ks-stat-val" id="stat-val-captured">${STATS.captured}</span></div>
                <div class="ks-stat-box"><span class="ks-stat-label">解析视频</span><span class="ks-stat-val" id="stat-val-videos">${STATS.videos}</span></div>
                <div class="ks-stat-box"><span class="ks-stat-label">自动回评</span><span class="ks-stat-val" id="stat-val-sent">${STATS.sent}</span></div>
                <div class="ks-stat-box"><span class="ks-stat-label">下载成功</span><span class="ks-stat-val" id="stat-val-downloaded">${STATS.downloaded}</span></div>
                <div class="ks-stat-box"><span class="ks-stat-label">自动点赞</span><span class="ks-stat-val" id="stat-val-liked">${STATS.liked}</span></div>
                <div class="ks-stat-box"><span class="ks-stat-label">自动收藏</span><span class="ks-stat-val" id="stat-val-collected">${STATS.collected}</span></div>
            </div>

            <div class="ks-scroll-content">
                <div class="ks-toggle-wrapper">
                    <span>⚡ 插件总开关</span>
                    <label class="ks-toggle"><input type="checkbox" id="ui-enable" ${s.enabled ? 'checked' : ''}><span class="ks-slider"></span></label>
                </div>
                <div class="ks-toggle-wrapper" style="margin-bottom: 15px;">
                    <span>🌙 暗黑模式</span>
                    <label class="ks-toggle"><input type="checkbox" id="ui-dark-mode" ${s.darkMode ? 'checked' : ''}><span class="ks-slider"></span></label>
                </div>

                <div class="ks-section" style="border-color: #00cec9; background: rgba(0, 206, 201, 0.03);">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0; color: #00cec9;">👤 创作者主页批量处理</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-enable-profile-parse" ${s.enableProfileParse ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>
                    <div id="cfg-profile-details" style="display: ${s.enableProfileParse ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper">
                            <span>进入主页自动运行提取</span>
                            <label class="ks-toggle"><input type="checkbox" id="ui-auto-profile-parse" ${s.autoProfileParse ? 'checked' : ''}><span class="ks-slider"></span></label>
                        </div>
                        <div style="display:flex; gap:8px; margin-top:8px; flex-direction: column;">
                            <button class="ks-btn ks-btn-info" id="ui-profile-start" style="margin-top:0; width: 100%;">🚀 手动提取当前页</button>
                            <button class="ks-btn ks-btn-success" id="ui-profile-export" style="margin-top:0; width: 100%;">📊 导出主页视频数据</button>
                        </div>
                        <div style="font-size:11px; color:#e67e22; margin-top:5px;">* 触发后控制台将打印详细的原始解析日志，方便查错。</div>
                    </div>
                </div>

                <div class="ks-section" style="border-color: #f39c12; background: rgba(243, 156, 18, 0.03);">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0; color: #f39c12;">📥 无水印下载模块</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-enable-download" ${s.enableDownload ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>
                    <div id="cfg-download-details" style="display: ${s.enableDownload ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper" style="margin-bottom: 10px;">
                            <span>优先调用 Motrix (Aria2)</span>
                            <label class="ks-toggle"><input type="checkbox" id="ui-use-motrix" ${s.useMotrix ? 'checked' : ''}><span class="ks-slider"></span></label>
                        </div>
                        <div id="cfg-motrix-details" style="display: ${s.useMotrix ? 'block' : 'none'}; margin-bottom: 10px;">
                            <input type="text" id="ui-motrix-rpc" class="ks-input" placeholder="Motrix RPC地址 (如 http://127...)" value="${s.motrixRpc}">
                            <input type="text" id="ui-motrix-token" class="ks-input" placeholder="Motrix Token (留空则无)" value="${s.motrixToken}">
                        </div>
                        <span style="font-size:12px; color:#636e72;">自定义保存主目录 (为空则存默认区):</span>
                        <input type="text" id="ui-save-dir" class="ks-input" placeholder="留空则自动保存至软件默认路径" value="${s.saveDir}">
                        <div style="font-size:11px; color:#e67e22; margin-top:5px;">* 自动建立多级目录: www.kuaishou.com/作者名/视频名.mp4</div>
                    </div>
                </div>

                <div class="ks-section" style="border-color: #9b59b6; background: rgba(155, 89, 182, 0.03);">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0; color: #9b59b6;">🚀 自动播控模块</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-auto-switch" ${s.autoSwitchEnabled ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>
                    <div id="cfg-switch-details" style="display: ${s.autoSwitchEnabled ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper" style="margin-bottom: 8px;">
                            <span>随机最小间隔(秒)</span>
                            <input type="number" id="ui-switch-min" class="ks-input" style="width: 80px; margin-top:0; text-align: center;" value="${s.switchMinTime}">
                        </div>
                        <div class="ks-toggle-wrapper" style="margin-bottom: 8px;">
                            <span>随机最大间隔(秒)</span>
                            <input type="number" id="ui-switch-max" class="ks-input" style="width: 80px; margin-top:0; text-align: center;" value="${s.switchMaxTime}">
                        </div>
                        <div style="font-size:11px; color:#7f8c8d; margin-top:5px;">系统将在设定区间内随机取值，触发下一条视频</div>
                    </div>
                </div>

                <div class="ks-section" style="border-color: #fd79a8; background: rgba(253, 121, 168, 0.03);">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0; color: #fd79a8;">❤️ 赞藏交互模块</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-enable-interact" ${s.enableAutoInteract ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>
                    <div id="cfg-interact-details" style="display: ${s.enableAutoInteract ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper" style="margin-bottom: 12px;">
                            <span>点赞触发概率 (<span id="like-prob-val" style="color:#fd79a8; font-weight:bold;">${s.likeProbability}</span>%)</span>
                            <input type="range" id="ui-like-prob" min="0" max="100" value="${s.likeProbability}" style="width: 140px; vertical-align: middle;">
                        </div>
                        <div class="ks-toggle-wrapper" style="margin-bottom: 12px;">
                            <span>收藏触发概率 (<span id="collect-prob-val" style="color:#fd79a8; font-weight:bold;">${s.collectProbability}</span>%)</span>
                            <input type="range" id="ui-collect-prob" min="0" max="100" value="${s.collectProbability}" style="width: 140px; vertical-align: middle;">
                        </div>
                        <div style="font-size:11px; color:#e84393; margin-top:5px;">* 将在评论发送完成后基于概率判定是否触发点赞与收藏</div>
                    </div>
                </div>

                <div class="ks-section">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0;">🤖 自动评论模块</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-enable-commenting" ${s.enableCommenting ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>

                    <div id="cfg-comment-details" style="display: ${s.enableCommenting ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper" style="margin-bottom: 12px;">
                            <span>触发概率 (<span id="prob-val" style="color:#fe2c55; font-weight:bold;">${s.commentProbability}</span>%)</span>
                            <input type="range" id="ui-comment-prob" min="0" max="100" value="${s.commentProbability}" style="width: 140px; vertical-align: middle;">
                        </div>

                        <div class="ks-tab-container">
                            <button class="ks-tab-btn ${s.replyMode === 'fixed' ? 'active' : ''}" data-mode="fixed">固定</button>
                            <button class="ks-tab-btn ${s.replyMode === 'ai_local' ? 'active' : ''}" data-mode="ai_local">本地AI</button>
                            <button class="ks-tab-btn ${s.replyMode === 'ai_online' ? 'active' : ''}" data-mode="ai_online">在线AI</button>
                        </div>

                        <div id="cfg-fixed" style="display: ${s.replyMode === 'fixed' ? 'block' : 'none'};">
                            <span class="ks-label">📝 固定回复词库 (每行一条，系统将随机抽取)</span>
                            <textarea class="ks-input" id="ui-fixed-text" rows="4" placeholder="例如：&#10;为你点赞！拍得太好啦~&#10;支持一下！&#10;太棒了吧！">${s.fixedText}</textarea>
                        </div>
                        <div id="cfg-local" style="display: ${s.replyMode === 'ai_local' ? 'block' : 'none'};">
                            <span class="ks-label">🤖 本地模型名称</span>
                            <input class="ks-input" id="ui-local-model" type="text" placeholder="如 deepseek-r1:1.5b" value="${s.localModel}">
                            <span class="ks-label">🔗 API 地址</span>
                            <input class="ks-input" id="ui-local-url" type="text" placeholder="如 http://127.0.0.1:11434/api/generate" value="${s.localUrl}">

                            <div class="ks-toggle-wrapper" style="margin-top: 10px;">
                                <span style="font-size:12px; color:#636e72;">🌊 启用流式输出效果 (Stream)</span>
                                <label class="ks-toggle"><input type="checkbox" id="ui-local-stream" ${s.localStream ? 'checked' : ''}><span class="ks-slider"></span></label>
                            </div>
                        </div>
                        <div id="cfg-online" style="display: ${s.replyMode === 'ai_online' ? 'block' : 'none'};">
                            <span class="ks-label">🤖 在线模型名称</span>
                            <input class="ks-input" id="ui-online-model" type="text" placeholder="如 deepseek-chat" value="${s.onlineModel}">
                            <span class="ks-label">🔗 API 地址</span>
                            <input class="ks-input" id="ui-online-url" type="text" placeholder="https://api.deepseek.com/chat/completions" value="${s.onlineUrl}">
                            <span class="ks-label">🔑 API Key (Bearer Token)</span>
                            <input class="ks-input" id="ui-online-key" type="password" placeholder="sk-..." value="${s.onlineKey}">

                            <div class="ks-toggle-wrapper" style="margin-top: 10px;">
                                <span style="font-size:12px; color:#636e72;">🌊 启用流式输出效果 (Stream)</span>
                                <label class="ks-toggle"><input type="checkbox" id="ui-online-stream" ${s.onlineStream ? 'checked' : ''}><span class="ks-slider"></span></label>
                            </div>
                        </div>

                        <div id="cfg-ai-common" style="display: ${s.replyMode !== 'fixed' ? 'block' : 'none'}; margin-top: 15px;">
                            <span class="ks-label">📝 AI 提示词 (System Prompt)</span>
                            <textarea class="ks-input" id="ui-ai-prompt" rows="3" placeholder="你是一个快手神评达人...">${s.aiPrompt}</textarea>

                            <div class="ks-toggle-wrapper" style="margin-top: 10px;">
                                <span style="font-size:12px; color:#636e72;">AI 请求超时上限(秒)</span>
                                <input type="number" id="ui-ai-timeout" class="ks-input" style="width: 80px; margin-top:0; text-align: center;" value="${s.aiTimeout}">
                            </div>
                        </div>

                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(254, 44, 85, 0.3);">
                            <div class="ks-toggle-wrapper" style="margin-bottom: 5px;">
                                <span style="font-size:12px; font-weight:bold; color:#d63031;">🛡️ 防重记录 (自动存30条)</span>
                                <span style="font-size:12px; color:#00b894; font-weight:bold;" id="ui-replied-count">${repliedArr.length}/30</span>
                            </div>
                            <button class="ks-btn ks-btn-danger" id="ui-clear-replied-btn" style="margin-top: 5px; padding: 6px; font-size:12px; background: #e17055;">🧹 一键清理已回评缓存</button>
                            <div style="font-size:11px; color:#e67e22; margin-top:5px;">* 命中缓存将触发极速跳过保护，不执行赞评藏</div>
                        </div>
                    </div>
                </div>

                <div class="ks-section" style="border-color: #0984e3; background: rgba(9, 132, 227, 0.03);">
                    <div class="ks-toggle-wrapper" style="margin-bottom: 0;">
                        <span class="ks-section-title" style="margin: 0; color: #0984e3;">📥 数据抓取与层级导出</span>
                        <label class="ks-toggle"><input type="checkbox" id="ui-enable-scraping" ${s.enableScraping ? 'checked' : ''}><span class="ks-slider"></span></label>
                    </div>

                    <div id="cfg-scrape-details" style="display: ${s.enableScraping ? 'block' : 'none'}; margin-top: 15px;">
                        <div class="ks-toggle-wrapper">
                            <span>自动抓取主评论</span>
                            <label class="ks-toggle"><input type="checkbox" id="ui-scrape-comments" ${s.scrapeComments ? 'checked' : ''}><span class="ks-slider"></span></label>
                        </div>
                        <div class="ks-toggle-wrapper">
                            <span>包含子评论(支持层级)</span>
                            <label class="ks-toggle"><input type="checkbox" id="ui-scrape-sub" ${s.scrapeSubComments ? 'checked' : ''}><span class="ks-slider"></span></label>
                        </div>
                        <button class="ks-btn ks-btn-success" id="ui-export-btn">📊 导出视频评论 Excel</button>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 5px;">
                <button class="ks-btn ks-btn-primary" id="ui-save-btn" style="flex: 2; margin-top: 0;">💾 保存配置</button>
                <button class="ks-btn ks-btn-danger" id="ui-clear-btn" style="flex: 1; margin-top: 0; background: #e17055;">🗑️ 清空</button>
            </div>
        `;

        document.body.appendChild(panel);

        // --- 拖拽交互引擎 ---
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        btn.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            isDraggingFab = false;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            isDraggingFab = true;
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            btn.style.top = (btn.offsetTop - pos2) + "px";
            btn.style.left = (btn.offsetLeft - pos1) + "px";
            btn.style.right = 'auto';
            updatePanelPosition();
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            if (btn) {
                GM_setValue('ks_fab_top', btn.offsetTop);
                GM_setValue('ks_fab_left', btn.offsetLeft);
            }
        }

        // --- 事件绑定 ---
        btn.onclick = () => {
            if (isDraggingFab) return;
            if (panel.style.display === 'flex') {
                panel.style.display = 'none';
            } else {
                panel.style.display = 'flex';
                updatePanelPosition();
            }
        };

        document.getElementById('ks-close-btn').onclick = () => { panel.style.display = 'none'; };

        document.getElementById('ui-dark-mode').addEventListener('change', (e) => {
            const isDark = e.target.checked;
            GM_setValue('ks_dark_mode', isDark);

            if (isDark) {
                panel.classList.add('ks-dark-mode');
            } else {
                panel.classList.remove('ks-dark-mode');
            }

            document.querySelectorAll('.ks-toast-msg').forEach(t => {
                if (isDark) t.classList.add('ks-dark-mode-toast');
                else t.classList.remove('ks-dark-mode-toast');
            });
        });

        document.getElementById('ui-enable-profile-parse').addEventListener('change', (e) => {
            document.getElementById('cfg-profile-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-enable-commenting').addEventListener('change', (e) => {
            document.getElementById('cfg-comment-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-enable-interact').addEventListener('change', (e) => {
            document.getElementById('cfg-interact-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-enable-scraping').addEventListener('change', (e) => {
            document.getElementById('cfg-scrape-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-auto-switch').addEventListener('change', (e) => {
            document.getElementById('cfg-switch-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-enable-download').addEventListener('change', (e) => {
            document.getElementById('cfg-download-details').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('ui-use-motrix').addEventListener('change', (e) => {
            document.getElementById('cfg-motrix-details').style.display = e.target.checked ? 'block' : 'none';
        });

        document.getElementById('ui-comment-prob').addEventListener('input', (e) => {
            document.getElementById('prob-val').innerText = e.target.value;
        });
        document.getElementById('ui-like-prob').addEventListener('input', (e) => {
            document.getElementById('like-prob-val').innerText = e.target.value;
        });
        document.getElementById('ui-collect-prob').addEventListener('input', (e) => {
            document.getElementById('collect-prob-val').innerText = e.target.value;
        });

        const tabs = panel.querySelectorAll('.ks-tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const mode = tab.dataset.mode;
                document.getElementById('cfg-fixed').style.display = mode === 'fixed' ? 'block' : 'none';
                document.getElementById('cfg-local').style.display = mode === 'ai_local' ? 'block' : 'none';
                document.getElementById('cfg-online').style.display = mode === 'ai_online' ? 'block' : 'none';
                document.getElementById('cfg-ai-common').style.display = mode !== 'fixed' ? 'block' : 'none';
            };
        });

        const clearRepliedBtn = document.getElementById('ui-clear-replied-btn');
        if (clearRepliedBtn) {
            clearRepliedBtn.onclick = () => {
                GM_setValue('ks_replied_videos', []);
                document.getElementById('ui-replied-count').innerText = '0/30';
                showToast('🧹 清理完成', '防重记录', '已清空防重复缓存，所有视频将重新评估', '#e17055');
            };
        }

        document.getElementById('ui-clear-btn').onclick = () => {
            if (confirm('确定要清空所有自定义配置及统计数据，并恢复系统默认设置吗？')) {
                GM_setValue('ks_enabled', CONFIG.defaults.enabled);
                GM_setValue('ks_dark_mode', CONFIG.defaults.darkMode);

                GM_setValue('ks_enable_auto_interact', CONFIG.defaults.enableAutoInteract);
                GM_setValue('ks_like_prob', CONFIG.defaults.likeProbability);
                GM_setValue('ks_collect_prob', CONFIG.defaults.collectProbability);

                GM_setValue('ks_enable_commenting', CONFIG.defaults.enableCommenting);
                GM_setValue('ks_comment_prob', CONFIG.defaults.commentProbability);
                GM_setValue('ks_reply_mode', CONFIG.defaults.replyMode);
                GM_setValue('ks_fixed_text', CONFIG.defaults.fixedText);
                GM_setValue('ks_ai_prompt', CONFIG.defaults.aiPrompt);
                GM_setValue('ks_ai_timeout', CONFIG.defaults.aiTimeout);

                GM_setValue('ks_enable_scraping', CONFIG.defaults.enableScraping);
                GM_setValue('ks_scrape_comments', CONFIG.defaults.scrapeComments);
                GM_setValue('ks_scrape_sub', CONFIG.defaults.scrapeSubComments);

                GM_setValue('ks_enable_download', CONFIG.defaults.enableDownload);
                GM_setValue('ks_use_motrix', CONFIG.defaults.useMotrix);
                GM_setValue('ks_motrix_rpc', CONFIG.defaults.motrixRpc);
                GM_setValue('ks_motrix_token', CONFIG.defaults.motrixToken);
                GM_setValue('ks_save_dir', CONFIG.defaults.saveDir);

                GM_setValue('ks_auto_switch_enabled', CONFIG.defaults.autoSwitchEnabled);
                GM_setValue('ks_switch_min', CONFIG.defaults.switchMinTime);
                GM_setValue('ks_switch_max', CONFIG.defaults.switchMaxTime);

                GM_setValue('ks_enable_profile_parse', CONFIG.defaults.enableProfileParse);
                GM_setValue('ks_auto_profile_parse', CONFIG.defaults.autoProfileParse);

                GM_setValue('ks_local_url', CONFIG.defaults.localUrl);
                GM_setValue('ks_local_model', CONFIG.defaults.localModel);
                GM_setValue('ks_local_stream', CONFIG.defaults.localStream);
                GM_setValue('ks_online_url', CONFIG.defaults.onlineUrl);
                GM_setValue('ks_online_model', CONFIG.defaults.onlineModel);
                GM_setValue('ks_online_key', CONFIG.defaults.onlineKey);
                GM_setValue('ks_online_stream', CONFIG.defaults.onlineStream);

                GM_setValue('ks_replied_videos', []);

                GM_setValue('ks_stat_captured', 0);
                GM_setValue('ks_stat_videos', 0);
                GM_setValue('ks_stat_sent', 0);
                GM_setValue('ks_stat_downloaded', 0);
                GM_setValue('ks_stat_liked', 0);
                GM_setValue('ks_stat_collected', 0);

                GM_setValue('ks_fab_top', null);
                GM_setValue('ks_fab_left', null);

                document.getElementById('ui-enable').checked = CONFIG.defaults.enabled;
                document.getElementById('stat-val-captured').innerText = 0;
                document.getElementById('stat-val-videos').innerText = 0;
                document.getElementById('stat-val-sent').innerText = 0;
                document.getElementById('stat-val-downloaded').innerText = 0;
                document.getElementById('stat-val-liked').innerText = 0;
                document.getElementById('stat-val-collected').innerText = 0;

                if(document.getElementById('ui-replied-count')) document.getElementById('ui-replied-count').innerText = '0/30';

                showToast('🗑️ 清理完成', '恢复出厂', '所有配置与统计数据已清空', '#e17055');
            }
        };

        document.getElementById('ui-save-btn').onclick = () => {
            GM_setValue('ks_enabled', document.getElementById('ui-enable').checked);
            GM_setValue('ks_dark_mode', document.getElementById('ui-dark-mode').checked);

            GM_setValue('ks_enable_auto_interact', document.getElementById('ui-enable-interact').checked);
            GM_setValue('ks_like_prob', parseInt(document.getElementById('ui-like-prob').value, 10));
            GM_setValue('ks_collect_prob', parseInt(document.getElementById('ui-collect-prob').value, 10));

            GM_setValue('ks_enable_commenting', document.getElementById('ui-enable-commenting').checked);
            GM_setValue('ks_comment_prob', parseInt(document.getElementById('ui-comment-prob').value, 10));
            GM_setValue('ks_reply_mode', document.querySelector('.ks-tab-btn.active').dataset.mode);
            GM_setValue('ks_fixed_text', document.getElementById('ui-fixed-text').value);
            GM_setValue('ks_ai_prompt', document.getElementById('ui-ai-prompt').value);
            GM_setValue('ks_ai_timeout', parseInt(document.getElementById('ui-ai-timeout').value, 10) || 30);

            GM_setValue('ks_enable_scraping', document.getElementById('ui-enable-scraping').checked);
            GM_setValue('ks_scrape_comments', document.getElementById('ui-scrape-comments').checked);
            GM_setValue('ks_scrape_sub', document.getElementById('ui-scrape-sub').checked);

            GM_setValue('ks_enable_download', document.getElementById('ui-enable-download').checked);
            GM_setValue('ks_use_motrix', document.getElementById('ui-use-motrix').checked);
            GM_setValue('ks_motrix_rpc', document.getElementById('ui-motrix-rpc').value);
            GM_setValue('ks_motrix_token', document.getElementById('ui-motrix-token').value);
            GM_setValue('ks_save_dir', document.getElementById('ui-save-dir').value);

            GM_setValue('ks_auto_switch_enabled', document.getElementById('ui-auto-switch').checked);
            GM_setValue('ks_switch_min', parseInt(document.getElementById('ui-switch-min').value, 10) || 10);
            GM_setValue('ks_switch_max', parseInt(document.getElementById('ui-switch-max').value, 10) || 30);

            GM_setValue('ks_enable_profile_parse', document.getElementById('ui-enable-profile-parse').checked);
            GM_setValue('ks_auto_profile_parse', document.getElementById('ui-auto-profile-parse').checked);

            GM_setValue('ks_local_url', document.getElementById('ui-local-url').value);
            GM_setValue('ks_local_model', document.getElementById('ui-local-model').value);
            GM_setValue('ks_local_stream', document.getElementById('ui-local-stream').checked);
            GM_setValue('ks_online_url', document.getElementById('ui-online-url').value);
            GM_setValue('ks_online_model', document.getElementById('ui-online-model').value);
            GM_setValue('ks_online_key', document.getElementById('ui-online-key').value);
            GM_setValue('ks_online_stream', document.getElementById('ui-online-stream').checked);

            showToast('💾 核心设置', '保存成功', '你的最新配置已经录入系统', '#00b894');
        };

        document.getElementById('ui-export-btn').onclick = () => {
            if (allCapturedComments.length === 0) {
                showToast('⚠️ 拦截导出', '数据为空', '当前未抓取到任何评论数据', '#e67e22');
                return;
            }
            try {
                const worksheet = XLSX.utils.json_to_sheet(allCapturedComments);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "快手评论层级数据");
                const filename = `Kuaishou_Comments_${new Date().getTime()}.xlsx`;
                XLSX.writeFile(workbook, filename);
                showToast('📊 数据报表', '导出成功', `文件: ${filename}`, '#27ae60');
            } catch (e) {
                showToast('❌ 报表生成异常', '导出失败', '可能数据过大或依赖加载异常', '#d63031');
            }
        };

        document.getElementById('ui-profile-start').onclick = startProfileExtraction;

        document.getElementById('ui-profile-export').onclick = () => {
            if (isProfileParsing) {
                showToast('⚠️ 导出被拦截', '正在抓取中', '请等待所有视频解析完成后再点击导出', '#e67e22');
                return;
            }
            if (profileExportData.length === 0) {
                showToast('⚠️ 数据为空', '无法导出', '请先在主页完成抓取', '#e67e22');
                return;
            }
            try {
                const worksheet = XLSX.utils.json_to_sheet(profileExportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "主页视频数据");
                const filename = `KS_Profile_${profileExportData[0]["作者名称"]}_${new Date().getTime()}.xlsx`;
                XLSX.writeFile(workbook, filename);
                showToast('📊 导出成功', '主页数据分析表', `文件: ${filename}`, '#27ae60');
            } catch (e) {
                showToast('❌ 导出异常', '报表生成失败', '请检查控制台报错', '#d63031');
            }
        };
    }

    // ==========================================
    // 深度查找快手乱码 State 中的 Profile
    // ==========================================
    function findUserProfileNode(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.userProfile && obj.userProfile.profile && obj.userProfile.ownerCount) {
            return obj.userProfile;
        }
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                let res = findUserProfileNode(obj[key]);
                if (res) return res;
            }
        }
        return null;
    }

    // ==========================================
    // 主页批量解析与自动下载流
    // ==========================================
    async function startProfileExtraction() {
        const s = getSettings();
        if (!s.enableProfileParse) {
            showToast('⚠️ 模块拦截', '功能未开启', '请先开启【创作者主页批量处理】总开关', '#e67e22');
            return;
        }

        const match = location.pathname.match(/\/profile\/([\w-]+)/);
        if (!match) {
            showToast('⚠️ 运行失败', '页面错误', '请在作者主页 (包含/profile/的链接) 下触发此功能', '#e67e22');
            return;
        }

        const userId = match[1];
        if (isProfileParsing) {
            showToast('⚠️ 任务冲突', '请勿重复点击', '当前正在后台处理该主页数据', '#e67e22');
            return;
        }

        const profileBtn = document.getElementById('ui-profile-start');
        const exportBtn = document.getElementById('ui-profile-export');

        if (profileBtn) {
            profileBtn.innerText = '⏳ 正在初始化...';
            profileBtn.disabled = true;
        }
        if (exportBtn) {
            exportBtn.innerText = '⏳ 准备记录数据...';
            exportBtn.disabled = true;
        }

        isProfileParsing = true;
        profileExportData = [];
        updateFabState('PROCESSING', '主页');
        showToast('🚀 引擎启动', '正在深层解析', `目标 UserID: ${userId}`, '#3498db');

        let authorInfo = { userName: userId, userId: userId, fan: 0, like: 0, follow: 0, photoCount: 0, userText: "" };
        let parsedSuccessfully = false;

        try {
            console.log('%c[主页解析] 发起静态HTML抓取，规避SPA旧状态污染...', 'color: #3498db;');
            const htmlRes = await fetch(`https://www.kuaishou.com/profile/${userId}`, {credentials: 'include'});
            const htmlText = await htmlRes.text();

            const stateMatch = htmlText.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});(?:\(|<\/script>)/);
            if (stateMatch && stateMatch[1]) {
                const stateObj = JSON.parse(stateMatch[1]);
                const profileNode = findUserProfileNode(stateObj);
                if (profileNode && profileNode.ownerCount) {
                    authorInfo.userName = profileNode.profile?.user_name || userId;
                    authorInfo.userId = profileNode.profile?.user_id || userId;
                    authorInfo.userText = profileNode.profile?.user_text || "";
                    authorInfo.fan = profileNode.ownerCount?.fan || 0;
                    authorInfo.like = profileNode.ownerCount?.like || 0;
                    authorInfo.follow = profileNode.ownerCount?.follow || 0;
                    authorInfo.photoCount = profileNode.ownerCount?.photo_public || 0;
                    parsedSuccessfully = true;

                    console.log('%c========== [深度解析] 创作者主页原始数据 ==========', 'color: #e74c3c; font-weight: bold;');
                    console.log('%c[数据来源] 新鲜 HTML -> window.__INITIAL_STATE__', 'color: #3498db;');
                    console.log('%c[提取到的原始 profileNode] ->', 'color: #e67e22;', profileNode);
                    console.log('%c[提取到的原始 ownerCount] ->', 'color: #e67e22;', profileNode.ownerCount);
                }
            }

            if (!parsedSuccessfully || authorInfo.fan === 0) {
                console.log('%c[主页解析] 标准解析未找到有效数据，启用暴力正则提取兜底...', 'color: #f39c12; font-weight: bold;');
                const fanMatch = htmlText.match(/"fan":(\d+)/);
                const likeMatch = htmlText.match(/"like":(\d+)/);
                const followMatch = htmlText.match(/"follow":(\d+)/);
                const photoMatch = htmlText.match(/"photo_public":(\d+)/);
                const nameMatch = htmlText.match(/"user_name":"([^"]+)"/);
                const descMatch = htmlText.match(/"user_text":"([^"]*)"/);

                if (fanMatch) authorInfo.fan = parseInt(fanMatch[1]);
                if (likeMatch) authorInfo.like = parseInt(likeMatch[1]);
                if (followMatch) authorInfo.follow = parseInt(followMatch[1]);
                if (photoMatch) authorInfo.photoCount = parseInt(photoMatch[1]);
                if (nameMatch) authorInfo.userName = nameMatch[1];
                if (descMatch) authorInfo.userText = descMatch[1];

                console.log('%c========== [深度解析] 创作者主页原始数据 ==========', 'color: #f39c12; font-weight: bold;');
                console.log('%c[数据来源] 暴力正则直接提取 HTML', 'color: #3498db;');
            }

            console.log(`%c[变量最终赋值结果]
-> 作者名称: ${authorInfo.userName}
-> 关注数(follow): ${authorInfo.follow}
-> 粉丝数(fan): ${authorInfo.fan}
-> 获赞数(like): ${authorInfo.like}
-> 作品数(photo_public): ${authorInfo.photoCount}
-> 简介: ${authorInfo.userText}`, 'color: #2ecc71; font-weight: bold;');
            console.log('%c=====================================================', 'color: #e74c3c; font-weight: bold;');

        } catch (e) {
            console.error('[页面状态解析异常]', e);
        }

        showToast('✅ 页面锁定', '作者数据解析完成', `名称: ${authorInfo.userName} | 粉丝: ${authorInfo.fan}`, '#27ae60');

        if (profileBtn) profileBtn.innerText = '🔍 开始分页拉取数据...';

        await fetchProfileFeedLoop(userId, "", authorInfo, profileBtn, exportBtn);

        isProfileParsing = false;
        updateFabState('SUCCESS', '完成');
        showToast('🎉 扫描结束', '批量提取完成', `共获取并处理 ${profileExportData.length} 个视频`, '#00b894');
        setTimeout(() => updateFabState('IDLE'), 3000);

        if (profileBtn) {
            profileBtn.innerText = '🚀 手动提取当前页';
            profileBtn.disabled = false;
        }
        if (exportBtn) {
            exportBtn.innerText = `📊 导出主页视频数据 (${profileExportData.length} 个)`;
            exportBtn.disabled = false;
            exportBtn.style.background = '';
        }
    }

    async function fetchProfileFeedLoop(userId, pcursor, authorInfo, profileBtn, exportBtn) {
        if (!isProfileParsing) return;

        const url = "https://www.kuaishou.com/rest/v/profile/feed";
        const payload = { "user_id": userId, "pcursor": pcursor, "page": "profile" };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "x-custom-skip": "true" },
                body: JSON.stringify(payload),
                credentials: 'include'
            });

            const data = await response.json();

            if (data && data.result === 1 && Array.isArray(data.feeds)) {
                for (let i = 0; i < data.feeds.length; i++) {
                    const item = data.feeds[i];
                    if (!item.photo) continue;

                    let bestUrl = "";
                    let maxRes = 0;
                    try {
                        const manifestStr = item.photo.manifestH265 || item.photo.manifest;
                        if (manifestStr) {
                            const manifestObj = JSON.parse(manifestStr);
                            if (manifestObj.adaptationSet && manifestObj.adaptationSet[0] && manifestObj.adaptationSet[0].representation) {
                                manifestObj.adaptationSet[0].representation.forEach(rep => {
                                    const res = (rep.width||0) * (rep.height||0);
                                    if (res >= maxRes && rep.url) { maxRes = res; bestUrl = rep.url; }
                                });
                            }
                        }
                    } catch(e) {}

                    if (!bestUrl) {
                        if (item.photo.mainMvUrls && item.photo.mainMvUrls.length > 0) bestUrl = item.photo.mainMvUrls[0].url;
                        else if (item.photo.photoH265Urls && item.photo.photoH265Urls.length > 0) bestUrl = item.photo.photoH265Urls[0].url;
                        else if (item.photo.photoUrls && item.photo.photoUrls.length > 0) bestUrl = item.photo.photoUrls[0].url;
                    }

                    const caption = item.photo.caption || "未命名";
                    const timestamp = item.photo.timestamp || new Date().getTime();

                    const excelRow = {
                        "视频ID": item.photo.id,
                        "作者名称": authorInfo.userName,
                        "作者ID": authorInfo.userId,
                        "关注数": authorInfo.follow,
                        "粉丝数": authorInfo.fan,
                        "作者获赞": authorInfo.like,
                        "作品发布数": authorInfo.photoCount,
                        "个人简介": authorInfo.userText,
                        "视频文案": caption,
                        "视频点赞": item.photo.likeCount || 0,
                        "发布时间": new Date(timestamp).toLocaleString(),
                        "无水印链接": bestUrl
                    };
                    profileExportData.push(excelRow);

                    if (profileBtn) {
                        profileBtn.innerText = `📥 提取记录: ${profileExportData.length}个`;
                    }
                    if (exportBtn) {
                        exportBtn.innerText = `⏳ 抓取中... 已记录 ${profileExportData.length} 个`;
                    }

                    const s = getSettings();
                    if (s.enabled && s.enableDownload) {
                        if (profileBtn) profileBtn.innerText = `📥 提取记录: ${profileExportData.length}个 | 推送下载中...`;
                        await executeSharedDownloadLogic(bestUrl, authorInfo.userName, caption, timestamp);
                        if (profileBtn) profileBtn.innerText = `📥 提取并推送成功: ${profileExportData.length}个`;
                    }

                    await sleep(300);
                }

                if (data.pcursor && data.pcursor !== "no_more") {
                    if (profileBtn) profileBtn.innerText = `🔄 正在拉取下一页... 已处理 ${profileExportData.length} 个`;
                    if (exportBtn) exportBtn.innerText = `⏳ 翻页中... 已记录 ${profileExportData.length} 个`;
                    await sleep(1000);
                    await fetchProfileFeedLoop(userId, data.pcursor, authorInfo, profileBtn, exportBtn);
                }
            }
        } catch (e) {
            console.error('[Profile Feed 请求异常]', e);
            showToast('❌ 网络异常', 'Feed获取中断', '请检查网络或是否触发了风控', '#d63031');
        }
    }

    const originPushState = history.pushState;
    const originReplaceState = history.replaceState;

    function handleRouteChange() {
        setTimeout(() => {
            const s = getSettings();
            if (s.enabled && s.enableProfileParse && s.autoProfileParse) {
                const match = location.pathname.match(/\/profile\/([\w-]+)/);
                if (match && currentProfileUserId !== match[1]) {
                    currentProfileUserId = match[1];
                    console.log(`%c[路由监听] 检测到进入新主页，自动触发抓取: ${currentProfileUserId}`, 'color: #3498db; font-weight: bold;');
                    startProfileExtraction();
                }
            }
        }, 2000);
    }

    history.pushState = function() {
        originPushState.apply(this, arguments);
        handleRouteChange();
    };
    history.replaceState = function() {
        originReplaceState.apply(this, arguments);
        handleRouteChange();
    };
    window.addEventListener('popstate', handleRouteChange);

    // ==========================================
    // 下载中心 (共用通道: Motrix / GM_download)
    // ==========================================
    function callMotrix(rpcUrl, token, url, relativePath, baseDir) {
        return new Promise((resolve, reject) => {
            let params = [];
            if (token) params.push(`token:${token}`);

            let options = {
                out: relativePath,
                header: ["User-Agent: " + navigator.userAgent, "Referer: https://www.kuaishou.com/"]
            };

            if (baseDir && baseDir.trim() !== "") {
                options.dir = baseDir.trim();
            }

            params.push([url]);
            params.push(options);

            const payload = {
                jsonrpc: "2.0",
                id: new Date().getTime().toString(),
                method: "aria2.addUri",
                params: params
            };

            GM_xmlhttpRequest({
                method: "POST",
                url: rpcUrl,
                data: JSON.stringify(payload),
                headers: { "Content-Type": "application/json" },
                onload: (res) => {
                    if (res.status === 200 && res.responseText.includes('result')) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error("Motrix 返回异常: " + res.responseText));
                    }
                },
                onerror: (err) => reject(err)
            });
        });
    }

    async function executeSharedDownloadLogic(downloadUrl, userName, caption, timestamp) {
        const s = getSettings();
        if (!s.enabled || !s.enableDownload || !downloadUrl) return;

        const safeAuth = sanitizeFilename(userName);
        let safeDesc = sanitizeFilename(caption).substring(0, 60);
        if (!safeDesc) safeDesc = "未命名";

        const timeStr = formatKsTime(timestamp);
        const domain = "www.kuaishou.com";
        const fileName = `${safeDesc}_${timeStr}.mp4`;

        const relativePath = `${domain}/${safeAuth}/${fileName}`;

        if (s.useMotrix && s.motrixRpc) {
            try {
                await callMotrix(s.motrixRpc, s.motrixToken, downloadUrl, relativePath, s.saveDir);
                updateStat('downloaded');
                return;
            } catch (e) {
                console.error('%c[Motrix 失败] 接口调用异常，自动回退到浏览器下载...', 'color: #e74c3c;');
            }
        }

        GM_download({
            url: downloadUrl,
            name: relativePath,
            headers: { "Referer": "https://www.kuaishou.com/", "User-Agent": navigator.userAgent },
            onload: () => {
                updateStat('downloaded');
            },
            onerror: (err) => {
                console.error('[内置下载异常]', err);
            }
        });
    }

    async function triggerDownloadProcess(photoId) {
        const s = getSettings();
        if (!s.enabled || !s.enableDownload) return;

        const info = videoInfoMap.get(photoId);
        if (!info || !info.downloadUrl || info.hasTriggeredDownload) return;

        info.hasTriggeredDownload = true;

        showToast('⬇️ 后台任务', '推送下载', `开始获取视频源文件...`, '#3498db');
        await executeSharedDownloadLogic(info.downloadUrl, info.userName, info.caption, new Date().getTime());
    }

    // ==========================================
    // 核心网络请求与解析引擎 (支持真实 API 与流式输出并带详细日志)
    // ==========================================
    function generateAIContent(videoInfo) {
        return new Promise((resolve, reject) => {
            const s = getSettings();

            if (s.replyMode === 'fixed') {
                const textSource = s.fixedText || "你好";
                const lines = textSource.split('\n').filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    resolve(lines[Math.floor(Math.random() * lines.length)]);
                } else {
                    resolve("你好");
                }
                return;
            }

            const contextStr = `【视频分析】\n标题:${videoInfo.caption || "无标题"}\n作者:${videoInfo.userName || "未知"}\n标签:${(videoInfo.tags || []).join(',')}`;
            const userPrompt = `请根据【视频分析】提供的信息，生成一条简短、幽默的神评论。`;

            const isOnline = s.replyMode === 'ai_online';
            const useStream = isOnline ? s.onlineStream : s.localStream;
            const apiUrl = isOnline ? s.onlineUrl : s.localUrl;
            const modelName = isOnline ? s.onlineModel : s.localModel;
            const finalSystemPrompt = s.aiPrompt || "你是一个快手神评达人，请根据视频内容简短幽默地评论，不要带有说教味，控制在20字以内。";

            if (isOnline && !s.onlineKey) {
                reject(new Error("在线模式未配置API Key"));
                return;
            }

            let headers = { "Content-Type": "application/json" };
            let data = {};

            if (isOnline) {
                headers["Authorization"] = `Bearer ${s.onlineKey}`;
                data = {
                    "model": modelName,
                    "messages": [
                        { "role": "system", "content": finalSystemPrompt },
                        { "role": "user", "content": contextStr },
                        { "role": "user", "content": userPrompt }
                    ],
                    "stream": useStream
                };
            } else {
                data = {
                    "model": modelName,
                    "prompt": `${finalSystemPrompt}\n\n${contextStr}\n\n${userPrompt}`,
                    "stream": useStream
                };
            }

            console.log('%c[AI Request] ==============================', 'color: #3498db; font-weight: bold; background: #ecf0f1; padding: 2px 5px;');
            console.log(`%c[AI Request] Mode: %c${isOnline ? 'Online API' : 'Local Model'} %c| Stream: %c${useStream}`, 'color: #3498db;', 'color: #e74c3c; font-weight: bold;', 'color: #3498db;', 'color: #e74c3c; font-weight: bold;');
            console.log(`%c[AI Request] API URL: %c${apiUrl}`, 'color: #3498db;', 'color: #2c3e50;');
            console.log('%c[AI Request] Headers:', 'color: #3498db;', JSON.parse(JSON.stringify(headers)));
            console.log('%c[AI Request] Payload (data):', 'color: #3498db;', JSON.parse(JSON.stringify(data)));
            console.log('%c=============================================', 'color: #3498db; font-weight: bold; background: #ecf0f1; padding: 2px 5px;');

            GM_xmlhttpRequest({
                method: "POST",
                url: apiUrl,
                headers: headers,
                data: JSON.stringify(data),
                timeout: (s.aiTimeout || 30) * 1000,
                onload: (res) => {
                    console.log('%c[AI Response Raw] =========================', 'color: #e67e22; font-weight: bold; background: #fdf2e9; padding: 2px 5px;');
                    console.log(`%c[AI Response Raw] Status: %c${res.status}`, 'color: #e67e22;', 'color: #c0392b; font-weight: bold;');
                    console.log('%c[AI Response Raw] ResponseText:', 'color: #e67e22;', res.responseText);
                    console.log('%c=============================================', 'color: #e67e22; font-weight: bold; background: #fdf2e9; padding: 2px 5px;');

                    if (res.status === 200) {
                        try {
                            let reply = "";

                            if (useStream) {
                                const lines = res.responseText.split('\n');
                                for (const line of lines) {
                                    const trimLine = line.trim();
                                    if (!trimLine) continue;

                                    if (trimLine.startsWith('data: ')) {
                                        const jsonStr = trimLine.substring(6);
                                        if (jsonStr === '[DONE]') break;
                                        try {
                                            const json = JSON.parse(jsonStr);
                                            if (json.choices && json.choices.length > 0) {
                                                const delta = json.choices[0].delta;
                                                if (delta && delta.content) {
                                                    reply += delta.content;
                                                }
                                            }
                                        } catch (e) {}
                                    }
                                    else if (trimLine.startsWith('{') && trimLine.endsWith('}')) {
                                        try {
                                            const json = JSON.parse(trimLine);
                                            if (json.response !== undefined) {
                                                reply += json.response;
                                            }
                                        } catch (e) {}
                                    }
                                }
                            } else {
                                const json = JSON.parse(res.responseText);
                                if (isOnline) {
                                    if (json.choices && json.choices.length > 0 && json.choices[0].message) {
                                        reply = json.choices[0].message.content;
                                    }
                                } else {
                                    reply = json.response || "";
                                }
                            }

                            reply = (reply || "")
                                .replace(/<think>[\s\S]*?<\/think>/g, '')
                                .trim()
                                .replace(/^["'“]+|["'”]+$/g, '');

                            console.log('%c[AI Parsed Output] =======================', 'color: #2ecc71; font-weight: bold; background: #eafaf1; padding: 2px 5px;');
                            console.log('%c[AI Parsed Output] Cleaned Reply:', 'color: #2ecc71; font-weight: bold;', reply);
                            console.log('%c=============================================', 'color: #2ecc71; font-weight: bold; background: #eafaf1; padding: 2px 5px;');

                            if (reply) {
                                resolve(reply);
                            } else {
                                reject(new Error("AI 返回结果为空"));
                            }

                        } catch (e) {
                            reject(new Error("AI 解析失败: " + e.message));
                        }
                    } else {
                        let errorMsg = `HTTP异常 ${res.status}`;
                        try {
                            const errData = JSON.parse(res.responseText);
                            if (errData.error && errData.error.message) {
                                errorMsg = `API阻断: ${errData.error.message}`;
                            } else if (errData.message) {
                                errorMsg = `API阻断: ${errData.message}`;
                            }
                        } catch (e) {}
                        reject(new Error(errorMsg));
                    }
                },
                ontimeout: () => {
                    reject(new Error("AI 请求超时拦截"));
                },
                onerror: () => {
                    reject(new Error("AI 网络层断连拦截"));
                }
            });
        });
    }

    async function generateAIContentWithTimeout(videoInfo) {
        const s = getSettings();
        const timeoutSeconds = s.aiTimeout || 30;

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`AI请求强制截断(${timeoutSeconds}秒)`));
            }, timeoutSeconds * 1000);
        });

        try {
            return await Promise.race([generateAIContent(videoInfo), timeoutPromise]);
        } catch (error) {
            throw error;
        }
    }


    // ==========================================
    // 自动回评测试器
    // ==========================================
    async function testSendComment(photoId, authorId) {
        const s = getSettings();
        if (!s.enabled || !currentUserInfo || !s.enableCommenting) return;

        const randomVal = Math.random() * 100;
        if (randomVal > s.commentProbability) {
            showToast('🛡️ 风控规避', '概率拦截', `未命中触发阈值(${s.commentProbability}%)，跳过执行`, '#e67e22');
            // 评论未命中概率跳过时，继续执行赞藏判定
            triggerAutoInteract();
            return;
        }

        const vInfo = videoInfoMap.get(photoId);
        let finalContent = "";

        try {
            updateFabState('PROCESSING', '解析');
            showToast('🧠 AI引擎启动', '生成评论', `正在分析视频并生成专属神评...`, '#fd79a8');

            finalContent = await generateAIContentWithTimeout(vInfo);
        } catch (err) {
            throw err;
        }

        const url = "https://www.kuaishou.com/rest/v/photo/comment/add";
        const payloadStr = JSON.stringify({ "content": finalContent, "photo_id": photoId, "user_id": authorId });

        try {
            showToast('📤 提交请求', '发送评论', `准备发送: ${finalContent}`, '#0984e3');

            const response = await fetch(url, {
                method: 'POST',
                headers: { "Content-Type": "application/json", "x-custom-skip": "true" },
                body: payloadStr
            });
            const result = await response.json();

            if (result && result.result === 1) {
                updateStat('sent');

                let repliedVideos = GM_getValue('ks_replied_videos', []);
                if (!repliedVideos.includes(photoId)) {
                    repliedVideos.push(photoId);
                    if (repliedVideos.length > 30) {
                        repliedVideos.shift();
                    }
                    GM_setValue('ks_replied_videos', repliedVideos);

                    const uiCount = document.getElementById('ui-replied-count');
                    if (uiCount) uiCount.innerText = `${repliedVideos.length}/30`;
                }

                updateFabState('SUCCESS', '✔️');
                showToast('💬 自动交互', '评论成功', `已成功发出评论：${finalContent}`, '#00b894');

                // 评论发送成功后，执行赞藏判定
                triggerAutoInteract();
            } else {
                throw new Error('快手服务端拦截或状态异常');
            }
        } catch (e) {
            throw e;
        }
    }


    // ==========================================
    // 快手接口抓取与记录引擎
    // ==========================================
    function recordComment(c, parentId = "ROOT") {
        const s = getSettings();
        if (!s.enableScraping || !s.scrapeComments) return;
        const cid = c.commentId || c.comment_id;
        if (!cid) return;

        allCapturedComments.push({
            "所属视频ID": currentActivePhotoId || "未知",
            "本条评论ID": cid,
            "父级节点ID": parentId,
            "评论者昵称": c.author_name || c.userName || "匿名",
            "评论文本内容": c.content,
            "发布时间": new Date(c.timestamp).toLocaleString(),
            "点赞数量": c.likeCount || 0
        });
        updateStat('captured');
    }

    async function fetchSubComments(photoId, rootCommentId, pcursor = "", subPageCount = 1) {
        const s = getSettings();
        if (!s.enableScraping || !s.scrapeSubComments || photoId !== currentActivePhotoId) return;

        const url = "https://www.kuaishou.com/rest/v/photo/comment/sublist";
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "x-custom-skip": "true" },
                body: JSON.stringify({ photoId, pcursor, rootCommentId })
            });

            const result = await response.json();
            if (photoId !== currentActivePhotoId) return;

            if (result && result.result === 1 && result.subCommentsV2) {
                result.subCommentsV2.forEach(c => recordComment(c, rootCommentId));
                const nextCursor = result.pcursorV2;
                if (nextCursor && nextCursor !== "no_more" && nextCursor !== "") {
                    await sleep(1200);
                    // 【重构】：确保子评论分页完全 await 阻塞
                    await fetchSubComments(photoId, rootCommentId, nextCursor, subPageCount + 1);
                }
            }
        } catch (e) {}
    }

    async function fetchCommentsManual(photoId, pcursorV2 = "", pageCount = 1) {
        const s = getSettings();
        if (!s.enableScraping || !s.scrapeComments || photoId !== currentActivePhotoId) return;

        const url = "https://www.kuaishou.com/rest/v/photo/comment/list";
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "x-custom-skip": "true" },
                body: JSON.stringify({ photoId, pcursor: pcursorV2 })
            });

            const result = await response.json();
            if (photoId !== currentActivePhotoId) return;

            if (result && result.result === 1) {
                const comments = result.rootCommentsV2 || result.rootComments || [];

                // 【重构】：将所有子评论的 Promise 搜集起来
                const subTasks = [];
                comments.forEach(comment => {
                    recordComment(comment, "ROOT");
                    if (comment.hasSubComments === true) {
                        const rootId = comment.commentId || comment.comment_id;
                        if (rootId) {
                            subTasks.push(fetchSubComments(photoId, rootId, ""));
                        }
                    }
                });

                // 【重构】：必须等待该页下属的所有子评论抓取完毕，再进行下一页的主评论抓取
                await Promise.all(subTasks);

                const nextCursor = result.pcursorV2;
                if (nextCursor && nextCursor !== "no_more" && nextCursor !== "") {
                    await sleep(1500);
                    // 【重构】：确保主评论分页完全 await 阻塞
                    await fetchCommentsManual(photoId, nextCursor, pageCount + 1);
                }
            }
        } catch (e) {
            throw e;
        }
    }


    // ==========================================
    // 拦截与 Hook 模块 (含最高画质无水印解析)
    // ==========================================
    function parseAndStoreFeeds(data) {
        if (!data || !data.feeds || !Array.isArray(data.feeds)) return;

        let newCount = 0;
        data.feeds.forEach(item => {
            if (item.photo && item.photo.id && !videoInfoMap.has(item.photo.id)) {

                let bestDownloadUrl = "";
                let maxRes = 0;

                try {
                    const manifestStr = item.photo.manifestH265 || item.photo.manifest;
                    if (manifestStr) {
                        const manifestObj = JSON.parse(manifestStr);
                        if (manifestObj.adaptationSet && manifestObj.adaptationSet[0] && manifestObj.adaptationSet[0].representation) {
                            const reps = manifestObj.adaptationSet[0].representation;
                            reps.forEach(rep => {
                                const currentRes = (rep.width || 0) * (rep.height || 0);
                                if (currentRes >= maxRes && rep.url) {
                                    maxRes = currentRes;
                                    bestDownloadUrl = rep.url;
                                }
                            });
                        }
                    }
                } catch (e) {}

                if (!bestDownloadUrl) {
                    if (item.photo.mainMvUrls && item.photo.mainMvUrls.length > 0) {
                        bestDownloadUrl = item.photo.mainMvUrls[0].url;
                    } else if (item.photo.photoH265Urls && item.photo.photoH265Urls.length > 0) {
                        bestDownloadUrl = item.photo.photoH265Urls[0].url;
                    } else if (item.photo.photoUrls && item.photo.photoUrls.length > 0) {
                        bestDownloadUrl = item.photo.photoUrls[0].url;
                    }
                }

                const authorName = item.author ? item.author.name : "未知作者";

                videoInfoMap.set(item.photo.id, {
                    id: item.photo.id,
                    caption: item.photo.caption || "",
                    userName: authorName,
                    userId: item.author ? item.author.id : null,
                    tags: item.tags ? item.tags.map(t => t.name) : [],
                    downloadUrl: bestDownloadUrl,
                    hasTriggeredDownload: false
                });
                newCount++;
            }
        });
        if (newCount > 0) updateStat('videos', newCount);
    }

    // ==========================================
    // 【总入口】拦截请求分配引擎与容错逻辑
    // ==========================================
    function handleCommentTrigger(requestData) {
        try {
            const params = JSON.parse(requestData);
            const photoId = params.photoId;

            if (photoId && photoId !== lastTriggeredPhotoId) {
                lastTriggeredPhotoId = photoId;
                currentActivePhotoId = photoId;
                isScrapingActive = false; // 进入新视频，初始化抓取状态锁为 false

                disableAutoPlay();

                showToast('🎬 视频进入', '生命周期开始', `已识别到进入新视频：${photoId}`, '#9b59b6');

                scheduleNextVideo();

                const s = getSettings();

                if (videoInfoMap.has(photoId)) {
                    const fullInfo = videoInfoMap.get(photoId);
                    console.log('%c[视频生命周期] =======================', 'color: #9b59b6; font-weight: bold; background: #f4ecf8; padding: 2px 5px;');
                    console.log(`%c[视频生命周期] 成功进入新视频，基础元数据:`, 'color: #9b59b6; font-weight: bold;');
                    console.log(`%c▶ ID: ${fullInfo.id}\n▶ 作者: ${fullInfo.userName} (UID: ${fullInfo.userId})\n▶ 描述: ${fullInfo.caption}\n▶ 标签: ${fullInfo.tags.join(', ')}\n▶ 资源链: ${fullInfo.downloadUrl}`, 'color: #8e44ad;');
                    console.log('%c=======================================', 'color: #9b59b6; font-weight: bold; background: #f4ecf8; padding: 2px 5px;');
                } else {
                    console.log('%c[视频生命周期] 成功进入新视频: ' + photoId + ' (缓存暂未命中)', 'color: #9b59b6; font-weight: bold;');
                }

                let repliedVideos = GM_getValue('ks_replied_videos', []);
                if (repliedVideos.includes(photoId)) {
                    showToast('⏭️ 极速防重', '识别命中', `视频 [${photoId}] 已曾回评，中止全流程，进入极速跳过机制`, '#f39c12');
                    triggerFastSwitch(3, 'SKIPPING');
                    return;
                }

                // 【重构】：通过闭包异步执行抓取任务，以控制 isScrapingActive 状态锁
                if (s.enableScraping && s.scrapeComments) {
                    isScrapingActive = true;
                    (async () => {
                        try {
                            await fetchCommentsManual(photoId, "");
                        } catch(e) {
                            console.error("[抓取通道异常抛出]", e);
                            showToast('❌ 抓取终止', '发生异常', e.message, '#d63031');
                        } finally {
                            // 确保当前活跃视频ID没变才重置锁
                            if (currentActivePhotoId === photoId) {
                                isScrapingActive = false;
                                console.log('%c[抓取引擎] 当前视频所有评论抓取任务已圆满结束', 'color: #00b894; font-weight: bold;');
                            }
                        }
                    })();
                }

                if (videoInfoMap.has(photoId)) {
                    const fullInfo = videoInfoMap.get(photoId);

                    // 评论开启时，走 testSendComment，赞藏随后继发；评论关闭只开赞藏时，直接触发赞藏。
                    if (s.enableCommenting && s.enabled && fullInfo.userId) {
                        testSendComment(photoId, fullInfo.userId).catch(e => {
                            console.error("[回评引擎致命异常]", e);
                            showToast('🚨 流程异常阻断', '触发安全保护', `原因: ${e.message}<br>系统将启动极速跳过倒计时...`, '#d63031');
                            triggerFastSwitch(3, 'ERROR');
                        });
                    } else if (s.enableAutoInteract) {
                        triggerAutoInteract();
                    }

                    triggerDownloadProcess(photoId).catch(e => {
                        console.error("[下载引擎异常]", e);
                    });
                }
            }
        } catch (e) {}
    }

    const originOpen = XMLHttpRequest.prototype.open;
    const originSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this._url && (this._url.includes('/rest/v/feed/hot') || this._url.includes('/rest/v/feed/profile/list'))) {
                try { parseAndStoreFeeds(JSON.parse(this.responseText)); } catch (e) {}
            }
            if (this._url && this._url.includes('/rest/v/profile/get')) {
                try {
                    const res = JSON.parse(this.responseText);
                    if(res.result === 1) currentUserInfo = res;
                } catch (e) {}
            }
        });

        if (this._url && this._url.includes('/rest/v/photo/comment/list')) {
            handleCommentTrigger(body);
        }
        return originSend.apply(this, arguments);
    };

    const originFetch = window.fetch;
    window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0].url || '');
        const options = args[1] || {};
        const isInternalRequest = options.headers && (options.headers['x-custom-skip'] === 'true');

        if (url.includes('/rest/v/feed/hot') || url.includes('/rest/v/feed/profile/list')) {
            const response = await originFetch(...args);
            const cloneRes = response.clone();
            cloneRes.json().then(parseAndStoreFeeds).catch(() => {});
            return response;
        }

        if (url.includes('/rest/v/profile/get')) {
            const response = await originFetch(...args);
            const cloneRes = response.clone();
            cloneRes.json().then(data => { if(data.result === 1) currentUserInfo = data; }).catch(() => {});
            return response;
        }

        if (url.includes('/rest/v/photo/comment/list')) {
            if (isInternalRequest) return originFetch(...args);
            if (options.body) handleCommentTrigger(options.body);
        }

        return originFetch(...args);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderUI();
            handleRouteChange();
        });
    } else {
        renderUI();
        handleRouteChange();
    }

    console.log('%c[系统注入] 快手神评增强版 v1.0.0 (抓取挂起保护版) 已加载完毕！', 'color: #27ae60; font-size:14px; font-weight: bold;');
})();
