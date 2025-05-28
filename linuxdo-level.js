// ==UserScript==
// @name         linux.do 等级监控浮窗
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  进入 linux.do 没有登录注册按钮时，右侧显示等级浮窗，支持0-3级用户
// @author       quintus
// @match        https://linux.do/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_log
// @connect      connect.linux.do
// @connect      linux.do
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
    // 存储数据的键名
    const STORAGE_KEY = 'linux_do_user_trust_level_data_v3';
    const LAST_CHECK_KEY = 'linux_do_last_check_v3';
    
    // 0级和1级用户的升级要求
    const LEVEL_REQUIREMENTS = {
        0: { // 0级升1级
            topics_entered: 5,
            posts_read_count: 30,
            time_read: 600 // 10分钟 = 600秒
        },
        1: { // 1级升2级
            days_visited: 15,
            likes_given: 1,
            likes_received: 1,
            replies_to_different_topics: 3, // 特殊字段，需要单独获取
            topics_entered: 20,
            posts_read_count: 100,
            time_read: 3600 // 60分钟 = 3600秒
        }
    };
    
    // 直接在页面上添加调试浮窗
    const debugDiv = document.createElement('div');
    debugDiv.style.position = 'fixed';
    debugDiv.style.bottom = '10px';
    debugDiv.style.right = '10px';
    debugDiv.style.width = '300px';
    debugDiv.style.maxHeight = '200px';
    debugDiv.style.overflow = 'auto';
    debugDiv.style.background = 'rgba(0,0,0,0.8)';
    debugDiv.style.color = '#0f0';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.zIndex = '10000';
    debugDiv.style.fontFamily = 'monospace';
    debugDiv.style.fontSize = '12px';
    debugDiv.style.display = 'none'; // 默认隐藏
    document.body.appendChild(debugDiv);
    
    // 调试函数
    function debugLog(message) {
        const time = new Date().toLocaleTimeString();
        console.log(`[Linux.do脚本] ${message}`);
        GM_log(`[Linux.do脚本] ${message}`);
        
        const logLine = document.createElement('div');
        logLine.textContent = `${time}: ${message}`;
        debugDiv.appendChild(logLine);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    
    // 按Alt+D显示/隐藏调试窗口
    document.addEventListener('keydown', function(e) {
        if (e.altKey && e.key === 'd') {
            debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
        }
    });
    
    debugLog('脚本开始执行');
    
    // 添加全局样式 - 全新设计
    GM_addStyle(`
        /* 新的悬浮按钮样式 */
        .ld-floating-container {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .ld-floating-btn {
            background: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 1px solid #e5e7eb;
            border-radius: 8px 0 0 8px;
            border-right: none;
            transition: all 0.3s ease;
            cursor: pointer;
            width: 48px;
            padding: 12px 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            user-select: none;
        }

        .ld-floating-btn:hover {
            width: 64px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .ld-btn-icon {
            width: 16px;
            height: 16px;
            color: #6b7280;
        }

        .ld-btn-level {
            font-size: 12px;
            font-weight: bold;
            color: #ea580c;
        }

        .ld-btn-progress-bar {
            width: 32px;
            height: 4px;
            background: #e5e7eb;
            border-radius: 2px;
            overflow: hidden;
        }

        .ld-btn-progress-fill {
            height: 100%;
            background: #ea580c;
            border-radius: 2px;
            transition: width 0.3s ease;
        }

        .ld-btn-stats {
            font-size: 10px;
            color: #6b7280;
        }

        .ld-btn-chevron {
            width: 12px;
            height: 12px;
            color: #9ca3af;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .ld-floating-btn:hover .ld-btn-chevron {
            opacity: 1;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* 弹出窗口样式 */
        .ld-popup {
            position: absolute;
            top: 50%;
            right: 100%;
            margin-right: 8px;
            width: 384px;
            max-height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            border: 1px solid #e5e7eb;
            opacity: 0;
            transform: translate(20px, -50%);
            transition: all 0.2s ease;
            pointer-events: none;
            overflow: hidden;
            overflow-y: auto;
        }

        .ld-popup.show {
            opacity: 1;
            transform: translate(0, -50%);
            pointer-events: auto;
        }

        /* 当弹出窗口可能超出屏幕时的调整 */
        .ld-popup.adjust-top {
            top: 10px;
            max-height: calc(100vh - 20px);
            transform: translate(20px, 0);
        }

        .ld-popup.adjust-top.show {
            transform: translate(0, 0);
        }

        .ld-popup.adjust-bottom {
            top: auto;
            bottom: 10px;
            max-height: calc(100vh - 20px);
            transform: translate(20px, 0);
        }

        .ld-popup.adjust-bottom.show {
            transform: translate(0, 0);
        }

        /* Header 样式 */
        .ld-popup-header {
            padding: 16px;
            border-bottom: 1px solid #f3f4f6;
        }

        .ld-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .ld-user-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .ld-user-dot {
            width: 12px;
            height: 12px;
            background: #ea580c;
            border-radius: 50%;
        }

        .ld-user-name {
            font-size: 14px;
            font-weight: 500;
            color: #374151;
        }

        .ld-level-badge {
            font-size: 12px;
            background: #fed7aa;
            color: #c2410c;
            padding: 4px 8px;
            border-radius: 9999px;
        }

        .ld-progress-section {
            margin-top: 12px;
        }

        .ld-progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .ld-progress-label {
            font-size: 12px;
            color: #6b7280;
        }

        .ld-progress-stats {
            font-size: 12px;
            color: #4b5563;
        }

        .ld-progress-bar-container {
            width: 100%;
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
        }

        .ld-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #fb923c, #ea580c);
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        /* 快速状态卡片 */
        .ld-status-cards {
            padding: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .ld-status-card {
            border-radius: 8px;
            padding: 8px;
        }

        .ld-status-card.failed {
            background: #fef2f2;
        }

        .ld-status-card.passed {
            background: #f0fdf4;
        }

        .ld-card-header {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
        }

        .ld-card-icon {
            width: 12px;
            height: 12px;
        }

        .ld-card-header.failed {
            color: #dc2626;
        }

        .ld-card-header.passed {
            color: #16a34a;
        }

        .ld-card-title {
            font-size: 12px;
            font-weight: 500;
        }

        .ld-card-label {
            font-size: 12px;
            color: #4b5563;
        }

        .ld-card-value {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
        }

        .ld-card-subtitle {
            font-size: 12px;
            margin-top: 2px;
        }

        .ld-card-subtitle.failed {
            color: #dc2626;
        }

        .ld-card-subtitle.passed {
            color: #16a34a;
        }

        /* 详细列表 */
        .ld-details-section {
            border-top: 1px solid #f3f4f6;
        }

        .ld-details-list {
            padding: 12px;
            max-height: 256px;
            overflow-y: auto;
        }

        .ld-detail-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s ease;
        }

        .ld-detail-item:hover {
            background: #f9fafb;
        }

        .ld-detail-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 0;
        }

        .ld-detail-icon {
            width: 12px;
            height: 12px;
            color: #9ca3af;
            flex-shrink: 0;
        }

        .ld-detail-label {
            font-size: 12px;
            color: #4b5563;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ld-detail-right {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .ld-detail-current {
            font-size: 12px;
            font-weight: 500;
            color: #1f2937;
            text-align: right;
        }

        .ld-detail-target {
            font-size: 12px;
            color: #9ca3af;
            text-align: right;
        }

        .ld-detail-status {
            width: 12px;
            height: 12px;
        }

        .ld-detail-status.passed {
            color: #16a34a;
        }

        .ld-detail-status.failed {
            color: #dc2626;
        }

        /* Footer */
        .ld-popup-footer {
            padding: 12px;
            background: #f9fafb;
            border-top: 1px solid #f3f4f6;
            text-align: center;
        }

        .ld-footer-message {
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .ld-footer-message.failed {
            color: #dc2626;
        }

        .ld-footer-message.passed {
            color: #16a34a;
        }

        .ld-footer-time {
            font-size: 12px;
            color: #6b7280;
        }

        /* 刷新按钮 */
        .ld-reload-btn {
            display: block;
            width: calc(100% - 24px);
            margin: 0 12px 12px;
            padding: 8px;
            background: #f3f4f6;
            color: #374151;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 12px;
        }

        .ld-reload-btn:hover {
            background: #e5e7eb;
        }

        .ld-reload-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* 错误状态 */
        .ld-error-container {
            padding: 24px;
            text-align: center;
            color: #6b7280;
        }

        .ld-error-icon {
            font-size: 24px;
            color: #dc2626;
            margin-bottom: 12px;
        }

        .ld-error-title {
            font-weight: 500;
            margin-bottom: 8px;
            color: #dc2626;
            font-size: 14px;
        }

        .ld-error-message {
            margin-bottom: 16px;
            font-size: 12px;
            line-height: 1.5;
        }

        /* 隐藏的iframe */
        .ld-hidden-iframe {
            position: absolute;
            width: 0;
            height: 0;
            border: 0;
            visibility: hidden;
        }

        /* 响应式调整 */
        @media (max-height: 600px) {
            .ld-details-list {
                max-height: 200px;
            }
        }
    `);

    // 工具函数：根据XPath查找元素
    function getElementByXpath(xpath) {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    // 检查是否有注册和登录按钮
    const loginBtnXpath = '//*[@id="ember3"]/div[2]/header/div/div/div[3]/span/span';
    const loginBtn = getElementByXpath(loginBtnXpath);
    
    debugLog('检查登录按钮: ' + (loginBtn ? '存在' : '不存在'));
    
    if (loginBtn) {
        // 有登录注册按钮，不执行后续逻辑
        debugLog('已检测到登录按钮，不显示等级浮窗');
        return;
    }
    
    // 尝试从缓存获取数据
    const cachedData = GM_getValue(STORAGE_KEY);
    const lastCheck = GM_getValue(LAST_CHECK_KEY, 0);
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000; // 一小时的毫秒数
    
    debugLog(`上次检查时间: ${new Date(lastCheck).toLocaleString()}`);
    
    // 创建右侧悬浮按钮容器
    const container = document.createElement('div');
    container.className = 'ld-floating-container';
    
    // 创建悬浮按钮
    const btn = document.createElement('div');
    btn.className = 'ld-floating-btn';
    btn.innerHTML = `
        <svg class="ld-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
        </svg>
        <div class="ld-btn-level">L?</div>
        <div class="ld-btn-progress-bar">
            <div class="ld-btn-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="ld-btn-stats">0/0</div>
        <svg class="ld-btn-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
    `;
    
    // 创建浮窗
    const popup = document.createElement('div');
    popup.className = 'ld-popup';
    
    // 设置默认内容
    popup.innerHTML = `
        <div class="ld-popup-header">
            <div class="ld-header-top">
                <div class="ld-user-info">
                    <div class="ld-user-dot"></div>
                    <span class="ld-user-name">加载中...</span>
                </div>
                <span class="ld-level-badge">升级到等级?</span>
            </div>
            <div class="ld-progress-section">
                <div class="ld-progress-header">
                    <span class="ld-progress-label">完成进度</span>
                    <span class="ld-progress-stats">0/0</span>
                </div>
                <div class="ld-progress-bar-container">
                    <div class="ld-progress-bar" style="width: 0%;"></div>
                </div>
            </div>
        </div>
        <div class="ld-popup-content">
            <div class="ld-status-cards">
                <div class="ld-status-card failed">
                    <div class="ld-card-header failed">
                        <svg class="ld-card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                        <span class="ld-card-title">未达标</span>
                    </div>
                    <div class="ld-card-label">正在加载...</div>
                    <div class="ld-card-value">-</div>
                </div>
                <div class="ld-status-card passed">
                    <div class="ld-card-header passed">
                        <svg class="ld-card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span class="ld-card-title">已完成</span>
                    </div>
                    <div class="ld-card-label">其他要求</div>
                    <div class="ld-card-value">0 / 0</div>
                </div>
            </div>
        </div>
    `;

    // 添加到容器
    container.appendChild(btn);
    container.appendChild(popup);

    // 变量用于跟踪悬停状态
    let isHovered = false;
    let hoverTimeout = null;
    
    // 智能调整弹出窗口位置的函数
    function adjustPopupPosition() {
        const containerRect = container.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        // 移除之前的调整类
        popup.classList.remove('adjust-top', 'adjust-bottom');
        
        // 强制重新计算布局
        popup.offsetHeight;
        
        // 获取弹出窗口的实际高度
        const popupHeight = popup.scrollHeight;
        const margin = 20; // 上下边距
        
        // 计算弹出窗口的理想位置（居中对齐按钮）
        const buttonCenterY = containerRect.top + containerRect.height / 2;
        const idealTop = buttonCenterY - popupHeight / 2;
        const idealBottom = idealTop + popupHeight;
        
        debugLog(`视口高度: ${viewportHeight}, 弹窗高度: ${popupHeight}, 按钮中心Y: ${buttonCenterY}`);
        debugLog(`理想顶部: ${idealTop}, 理想底部: ${idealBottom}`);
        
        // 检查是否超出屏幕顶部
        if (idealTop < margin) {
            popup.classList.add('adjust-top');
            debugLog('弹出窗口调整到顶部对齐');
        }
        // 检查是否超出屏幕底部
        else if (idealBottom > viewportHeight - margin) {
            popup.classList.add('adjust-bottom');
            debugLog('弹出窗口调整到底部对齐');
        }
        // 否则使用居中对齐（默认）
        else {
            debugLog('弹出窗口使用居中对齐');
        }
    }
    
    // 鼠标进入容器时
    container.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        isHovered = true;
        hoverTimeout = setTimeout(() => {
            if (isHovered) {
                // 调整位置
                adjustPopupPosition();
                
                // 显示弹出窗口
                popup.classList.add('show');
            }
        }, 150); // 稍微延迟显示，避免误触
    });
    
    // 鼠标离开容器时
    container.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        isHovered = false;
        hoverTimeout = setTimeout(() => {
            if (!isHovered) {
                popup.classList.remove('show');
            }
        }, 100); // 稍微延迟隐藏，允许鼠标在按钮和弹窗间移动
    });

    // 监听窗口大小变化，重新调整位置
    window.addEventListener('resize', () => {
        if (popup.classList.contains('show')) {
            adjustPopupPosition();
        }
    });

    document.body.appendChild(container);
    
    debugLog('新版按钮和浮窗已添加到页面');
    
    // 如果有缓存数据且时间不超过一小时，直接使用缓存
    if (cachedData && (now - lastCheck < oneHourMs)) {
        debugLog('使用缓存数据');
        updateInfo(
            cachedData.username,
            cachedData.currentLevel,
            cachedData.targetLevel,
            cachedData.trustLevelDetails,
            new Date(lastCheck),
            cachedData.originalHtml || '',
            true // isFromCache
        );
    } else {
        debugLog('缓存过期或不存在，准备安排获取新数据');
        // 延迟后再执行，给页面一点时间稳定
        const delay = 3000; // Increased delay to 3 seconds
        debugLog(`将在 ${delay / 1000} 秒后尝试获取数据...`);
        setTimeout(() => {
            debugLog('Timeout结束，准备调用 fetchDataWithGM');
            fetchDataWithGM();
        }, delay);
    }
    
    // 解析信任级别详情
    function parseTrustLevelDetails(targetInfoDivElement) {
        const details = {
            items: [],
            summaryText: '',
            achievedCount: 0,
            totalCount: 0,
            targetLevelInSummary: null // 从 "不符合信任级别 X 要求" 中提取
        };

        if (!targetInfoDivElement) {
            debugLog('parseTrustLevelDetails: targetInfoDivElement为空');
            return details;
        }

        // 解析表格
        const table = targetInfoDivElement.querySelector('table');
        if (table) {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach((row, index) => {
                if (index === 0) return; // 跳过表头行

                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const label = cells[0].textContent.trim();
                    const currentText = cells[1].textContent.trim();
                    const requiredText = cells[2].textContent.trim();
                    const isMet = cells[1].classList.contains('text-green-500');

                    details.items.push({
                        label: label,
                        current: currentText,
                        required: requiredText,
                        isMet: isMet
                    });

                    if (isMet) {
                        details.achievedCount++;
                    }
                }
            });
            details.totalCount = details.items.length;
        } else {
            debugLog('parseTrustLevelDetails: 未找到表格');
        }

        // 解析总结文本，例如 "不符合信任级别 3 要求，继续加油。"
        const paragraphs = targetInfoDivElement.querySelectorAll('p');
        paragraphs.forEach(p => {
            const text = p.textContent.trim();
            if (text.includes('要求') || text.includes('已满足') || text.includes('信任级别')) {
                details.summaryText = text;
                const levelMatch = text.match(/信任级别\s*(\d+)/);
                if (levelMatch) {
                    details.targetLevelInSummary = levelMatch[1];
                }
            }
        });
        if (!details.summaryText) {
            debugLog('parseTrustLevelDetails: 未找到总结文本段落');
        }

        debugLog(`parseTrustLevelDetails: 解析完成, ${details.achievedCount}/${details.totalCount} 项达标. 总结: ${details.summaryText}. 目标等级从总结文本: ${details.targetLevelInSummary}`);
        return details;
    }

    // 使用 GM_xmlhttpRequest 获取 connect.linux.do 的信息
    function fetchDataWithGM() {
        debugLog('进入 fetchDataWithGM 函数，准备发起 GM_xmlhttpRequest');
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://connect.linux.do/",
                timeout: 15000, // 15秒超时
                onload: function(response) {
                    debugLog(`GM_xmlhttpRequest 成功: status ${response.status}`);
                    if (response.status === 200) {
                        const responseText = response.responseText;
                        debugLog(`GM_xmlhttpRequest 响应状态 200，准备解析HTML。响应体长度: ${responseText.length}`);

                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = responseText;
                        
                        // 1. 解析全局用户名和当前等级 (从 <h1>)
                        let globalUsername = '用户';
                        let currentLevel = '未知';
                        const h1 = tempDiv.querySelector('h1');
                        if (h1) {
                            const h1Text = h1.textContent.trim();
                            // 例如: "你好，一剑万生 (YY_WD) 2级用户" 或 "你好， (yy2025) 0级用户"
                            const welcomeMatch = h1Text.match(/你好，\s*([^(\s]*)\s*\(?([^)]*)\)?\s*(\d+)级用户/i);
                            if (welcomeMatch) {
                                // 优先使用括号内的用户名，如果没有则使用前面的
                                globalUsername = welcomeMatch[2] || welcomeMatch[1] || '用户';
                                currentLevel = welcomeMatch[3];
                                debugLog(`从<h1>解析: 全局用户名='${globalUsername}', 当前等级='${currentLevel}'`);
                            } else {
                                debugLog(`从<h1>解析: 未匹配到欢迎信息格式: "${h1Text}"`);
                            }
                        } else {
                            debugLog('未在响应中找到 <h1> 标签');
                        }

                        // 检查用户等级，决定使用哪种数据获取方式
                        const userLevel = parseInt(currentLevel);
                        if (userLevel === 0 || userLevel === 1) {
                            debugLog(`检测到${userLevel}级用户，使用summary.json获取数据`);
                            fetchLowLevelUserData(globalUsername, userLevel);
                        } else if (userLevel >= 2) {
                            debugLog(`检测到${userLevel}级用户，使用connect.linux.do页面数据`);
                            // 继续原有逻辑处理2级及以上用户
                            processHighLevelUserData(tempDiv, globalUsername, currentLevel);
                        } else {
                            debugLog('无法确定用户等级，显示错误');
                            showError('无法确定用户等级，请检查登录状态');
                        }

                    } else {
                        debugLog(`请求失败，状态码: ${response.status} - ${response.statusText}`);
                        handleRequestError(response);
                    }
                },
                onerror: function(error) {
                    debugLog(`GM_xmlhttpRequest 错误: ${JSON.stringify(error)}`);
                    showError('网络请求错误，请检查连接和油猴插件权限');
                },
                ontimeout: function() {
                    debugLog('GM_xmlhttpRequest 超时');
                    showError('请求超时，请检查网络连接');
                },
                onabort: function() {
                    debugLog('GM_xmlhttpRequest 请求被中止 (onabort)');
                    showError('请求被中止，可能是网络问题或扩展冲突');
                }
            });
            debugLog('GM_xmlhttpRequest 已调用，等待回调');
        } catch (e) {
            debugLog(`调用 GM_xmlhttpRequest 时发生同步错误: ${e.message}`);
            showError('调用请求时出错，请查看日志');
        }
    }
    
    // 将数据保存到缓存
    function saveDataToCache(username, currentLevel, targetLevel, trustLevelDetails, originalHtml) {
        debugLog('保存数据到缓存');
        const dataToCache = {
            username,
            currentLevel,
            targetLevel,
            trustLevelDetails,
            originalHtml,
            cacheTimestamp: Date.now() // 添加一个缓存内的时间戳，方便调试
        };
        GM_setValue(STORAGE_KEY, dataToCache);
        GM_setValue(LAST_CHECK_KEY, Date.now());
    }
    
    // 更新信息显示
    function updateInfo(username, currentLevel, targetLevel, trustLevelDetails, updateTime, originalHtml, isFromCache = false) {
        debugLog(`更新信息: 用户='${username}', 当前L=${currentLevel}, 目标L=${targetLevel}, 详情获取=${trustLevelDetails && trustLevelDetails.items.length > 0}, 更新时间=${updateTime.toLocaleString()}`);
        
        // 计算进度
        const achievedCount = trustLevelDetails ? trustLevelDetails.achievedCount : 0;
        const totalCount = trustLevelDetails ? trustLevelDetails.totalCount : 0;
        const progressPercent = totalCount > 0 ? Math.round((achievedCount / totalCount) * 100) : 0;
        
        // 更新按钮显示
        const levelElement = btn.querySelector('.ld-btn-level');
        const progressFill = btn.querySelector('.ld-btn-progress-fill');
        const statsElement = btn.querySelector('.ld-btn-stats');
        
        if (levelElement) levelElement.textContent = `L${currentLevel || '?'}`;
        if (progressFill) progressFill.style.width = `${progressPercent}%`;
        if (statsElement) statsElement.textContent = `${achievedCount}/${totalCount}`;
        
        // 更新浮窗内容
        updatePopupContent(username, currentLevel, targetLevel, trustLevelDetails, updateTime, originalHtml, isFromCache);
    }
    
    // 更新浮窗内容 - 适配新UI结构
    function updatePopupContent(username, currentLevel, targetLevel, trustLevelDetails, updateTime, originalHtml, isFromCache = false) {
        // 如果加载失败或无数据，显示错误状态
        if (!trustLevelDetails || !trustLevelDetails.items || trustLevelDetails.items.length === 0) {
            showPopupError('无法加载数据', '未能获取到信任级别详情数据，请刷新重试。', updateTime);
            return;
        }

        // 计算进度
        const achievedCount = trustLevelDetails.achievedCount;
        const totalCount = trustLevelDetails.totalCount;
        const progressPercent = Math.round((achievedCount / totalCount) * 100);
        
        // 找到未达标的项目
        const failedItems = trustLevelDetails.items.filter(item => !item.isMet);
        const failedItem = failedItems.length > 0 ? failedItems[0] : null;

        // 获取图标函数
        function getIconSvg(type) {
            const icons = {
                user: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>',
                message: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.991 8.991 0 01-4.92-1.487L3 21l2.513-5.08A8.991 8.991 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"></path>',
                eye: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>',
                thumbsUp: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>',
                warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>',
                shield: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>'
            };
            return icons[type] || icons.user;
        }

        function getItemIcon(label) {
            if (label.includes('访问次数')) return 'user';
            if (label.includes('回复') || label.includes('话题')) return 'message';
            if (label.includes('浏览') || label.includes('已读')) return 'eye';
            if (label.includes('举报')) return 'warning';
            if (label.includes('点赞') || label.includes('获赞')) return 'thumbsUp';
            if (label.includes('禁言') || label.includes('封禁')) return 'shield';
            return 'user';
        }

        // 构建新UI HTML
        let html = `
            <div class="ld-popup-header">
                <div class="ld-header-top">
                    <div class="ld-user-info">
                        <div class="ld-user-dot"></div>
                        <span class="ld-user-name">${username || '用户'}</span>
                    </div>
                    <span class="ld-level-badge">升级到等级${targetLevel}</span>
                </div>
                <div class="ld-progress-section">
                    <div class="ld-progress-header">
                        <span class="ld-progress-label">完成进度</span>
                        <span class="ld-progress-stats">${achievedCount}/${totalCount}</span>
                    </div>
                    <div class="ld-progress-bar-container">
                        <div class="ld-progress-bar" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>
            </div>
            
            <div class="ld-status-cards">
                <div class="ld-status-card failed">
                    <div class="ld-card-header failed">
                        <svg class="ld-card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                        <span class="ld-card-title">未达标</span>
                    </div>
                    <div class="ld-card-label">${failedItem ? failedItem.label : '无'}</div>
                    <div class="ld-card-value">${failedItem ? failedItem.current : '所有要求均已满足'}</div>
                    ${failedItem ? `<div class="ld-card-subtitle failed">需要 ${failedItem.required}</div>` : ''}
                </div>
                <div class="ld-status-card passed">
                    <div class="ld-card-header passed">
                        <svg class="ld-card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span class="ld-card-title">已完成</span>
                    </div>
                    <div class="ld-card-label">其他要求</div>
                    <div class="ld-card-value">${achievedCount} / ${totalCount}</div>
                </div>
            </div>
            
            <div class="ld-details-section">
                <div class="ld-details-list">`;
        
        // 为每个指标生成HTML
        trustLevelDetails.items.forEach(item => {
            const iconType = getItemIcon(item.label);
            html += `
                <div class="ld-detail-item">
                    <div class="ld-detail-left">
                        <svg class="ld-detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${getIconSvg(iconType)}
                        </svg>
                        <span class="ld-detail-label">${item.label}</span>
                    </div>
                    <div class="ld-detail-right">
                        <span class="ld-detail-current">${item.current}</span>
                        <span class="ld-detail-target">/${item.required}</span>
                        <svg class="ld-detail-status ${item.isMet ? 'passed' : 'failed'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${item.isMet ? 
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>' :
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>'
                            }
                        </svg>
                    </div>
                </div>`;
        });
        
        // 添加底部状态和更新时间
        html += `
                </div>
            </div>
            
            <div class="ld-popup-footer">
                <div class="ld-footer-message ${failedItems.length === 0 ? 'passed' : 'failed'}">
                    ${trustLevelDetails.summaryText || (failedItems.length === 0 ? '已满足信任级别要求' : '不符合信任级别要求，继续加油')}
                </div>
                <div class="ld-footer-time">更新于 ${updateTime.toLocaleString()}</div>
            </div>
            
            <button class="ld-reload-btn">刷新数据</button>`;
        
        // 设置内容
        popup.innerHTML = html;
        
        // 添加事件监听器
        setTimeout(() => {
            // 刷新按钮
            const reloadBtn = popup.querySelector('.ld-reload-btn');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', function() {
                    this.textContent = '加载中...';
                    this.disabled = true;
                    fetchDataWithGM();
                    setTimeout(() => {
                        if (!this.isConnected) return; // 检查按钮是否还在DOM中
                        this.textContent = '刷新数据';
                        this.disabled = false;
                    }, 3000);
                });
            }
        }, 100);
    }

    // 显示错误状态的浮窗
    function showPopupError(title, message, updateTime) {
        popup.innerHTML = `
            <div class="ld-error-container">
                <div class="ld-error-icon">❌</div>
                <div class="ld-error-title">${title}</div>
                <div class="ld-error-message">${message}</div>
                <div class="ld-footer-time">尝试时间: ${updateTime ? updateTime.toLocaleString() : '未知'}</div>
            </div>
            <button class="ld-reload-btn">重试</button>
        `;
        
        // 添加重试按钮事件
        setTimeout(() => {
            const retryBtn = popup.querySelector('.ld-reload-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', function() {
                    this.textContent = '加载中...';
                    this.disabled = true;
                    fetchDataWithGM();
                    setTimeout(() => {
                        if (!this.isConnected) return;
                        this.textContent = '重试';
                        this.disabled = false;
                    }, 3000);
                });
            }
        }, 100);
    }
    
    // 显示错误信息 (保留向下兼容)
    function showError(message) {
        debugLog(`显示错误: ${message}`);
        showPopupError('出错了', message, new Date());
    }

    // 处理请求错误
    function handleRequestError(response) {
        let responseBody = response.responseText || ""; 
        debugLog(`响应内容 (前500字符): ${responseBody.substring(0, 500)}`);

        if (response.status === 429) {
            showError('请求过于频繁 (429)，请稍后重试。Cloudflare可能暂时限制了访问。');
        } else if (responseBody.includes('Cloudflare') || responseBody.includes('challenge-platform') || responseBody.includes('Just a moment')) {
             showError('Cloudflare拦截或验证页面。请等待或手动访问connect.linux.do完成验证。');
        } else if (responseBody.includes('登录') || responseBody.includes('注册')) {
            showError('获取数据失败，可能是需要登录 connect.linux.do。');
        } else {
             showError(`获取数据失败 (状态: ${response.status})`);
        }
    }
    
    // 处理2级及以上用户数据（原有逻辑）
    function processHighLevelUserData(tempDiv, globalUsername, currentLevel) {
        let targetInfoDiv = null;
        const potentialDivs = tempDiv.querySelectorAll('div.bg-white.p-6.rounded-lg.mb-4.shadow');
        debugLog(`找到了 ${potentialDivs.length} 个潜在的 'div.bg-white.p-6.rounded-lg.mb-4.shadow' 元素。`);

        for (let i = 0; i < potentialDivs.length; i++) {
            const div = potentialDivs[i];
            const h2 = div.querySelector('h2.text-xl.mb-4.font-bold');
            if (h2 && h2.textContent.includes('信任级别')) {
                targetInfoDiv = div;
                debugLog(`找到包含"信任级别"标题的目标div，其innerHTML (前200字符): ${targetInfoDiv.innerHTML.substring(0,200)}`);
                break;
            }
        }
        
        if (!targetInfoDiv) {
            debugLog('通过遍历和内容检查，未找到包含"信任级别"标题的目标div。');
            showError('未找到包含等级信息的数据块。请检查控制台日志 (Alt+D) 中的HTML内容，并提供一个准确的选择器。');
            return;
        }
        
        debugLog('通过内容匹配，在响应中找到目标信息div。');
        const originalHtml = targetInfoDiv.innerHTML;

        // 从目标div的<h2>解析用户名和目标等级
        let specificUsername = globalUsername;
        let targetLevel = '未知';
        const h2InDiv = targetInfoDiv.querySelector('h2.text-xl.mb-4.font-bold');
        if (h2InDiv) {
            const h2Text = h2InDiv.textContent.trim();
            const titleMatch = h2Text.match(/^(.+?)\s*-\s*信任级别\s*(\d+)\s*的要求/i);
            if (titleMatch) {
                specificUsername = titleMatch[1].trim();
                targetLevel = titleMatch[2];
                debugLog(`从<h2>解析: 特定用户名='${specificUsername}', 目标等级='${targetLevel}'`);
            } else {
                 debugLog(`从<h2>解析: 未匹配到标题格式: "${h2Text}"`);
            }
        } else {
            debugLog('目标div中未找到<h2>标签');
        }

        // 解析信任级别详情
        const trustLevelDetails = parseTrustLevelDetails(targetInfoDiv);

        debugLog(`最终提取信息: 用户名='${specificUsername}', 当前等级='${currentLevel}', 目标等级='${targetLevel}'`);
        updateInfo(specificUsername, currentLevel, targetLevel, trustLevelDetails, new Date(), originalHtml);
        saveDataToCache(specificUsername, currentLevel, targetLevel, trustLevelDetails, originalHtml);
    }
    
    // 处理0级和1级用户数据
    function fetchLowLevelUserData(username, currentLevel) {
        debugLog(`开始获取${currentLevel}级用户 ${username} 的数据`);
        
        // 首先获取summary.json数据
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://linux.do/u/${username}/summary.json`,
            timeout: 15000,
            onload: function(response) {
                debugLog(`summary.json请求成功: status ${response.status}`);
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const userSummary = data.user_summary;
                        debugLog(`获取到用户摘要数据: ${JSON.stringify(userSummary)}`);
                        
                        if (currentLevel === 1) {
                            // 1级用户需要额外获取回复数据
                            fetchUserRepliesData(username, currentLevel, userSummary);
                        } else {
                            // 0级用户直接处理数据
                            processLowLevelUserData(username, currentLevel, userSummary, null);
                        }
                    } catch (e) {
                        debugLog(`解析summary.json失败: ${e.message}`);
                        showError('解析用户数据失败');
                    }
                } else {
                    debugLog(`summary.json请求失败: ${response.status}`);
                    showError(`获取用户数据失败 (状态: ${response.status})`);
                }
            },
            onerror: function(error) {
                debugLog(`summary.json请求错误: ${JSON.stringify(error)}`);
                showError('获取用户数据时网络错误');
            },
            ontimeout: function() {
                debugLog('summary.json请求超时');
                showError('获取用户数据超时');
            }
        });
    }
    
    // 获取用户回复数据（仅1级用户需要）
    function fetchUserRepliesData(username, currentLevel, userSummary) {
        debugLog(`获取用户 ${username} 的回复数据`);
        
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://linux.do/u/${username}/activity/replies`,
            timeout: 15000,
            onload: function(response) {
                debugLog(`replies页面请求成功: status ${response.status}`);
                if (response.status === 200) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = response.responseText;
                    
                    // 统计回复的不同话题数量
                    const replyContainer = tempDiv.querySelector('#main-outlet div:nth-child(3) section div');
                    let repliesCount = 0;
                    
                    if (replyContainer) {
                        const replyItems = replyContainer.querySelectorAll('#user-content > div > div:nth-child(1) > div');
                        repliesCount = Math.min(replyItems.length, 3); // 最多统计3个，满足要求即可
                        debugLog(`找到 ${replyItems.length} 个回复项，统计 ${repliesCount} 个`);
                    } else {
                        debugLog('未找到回复容器');
                    }
                    
                    processLowLevelUserData(username, currentLevel, userSummary, repliesCount);
                } else {
                    debugLog(`replies页面请求失败: ${response.status}`);
                    // 即使获取回复数据失败，也继续处理其他数据，回复数设为0
                    processLowLevelUserData(username, currentLevel, userSummary, 0);
                }
            },
            onerror: function(error) {
                debugLog(`replies页面请求错误: ${JSON.stringify(error)}`);
                processLowLevelUserData(username, currentLevel, userSummary, 0);
            },
            ontimeout: function() {
                debugLog('replies页面请求超时');
                processLowLevelUserData(username, currentLevel, userSummary, 0);
            }
        });
    }
    
    // 处理0级和1级用户的数据
    function processLowLevelUserData(username, currentLevel, userSummary, repliesCount) {
        debugLog(`处理${currentLevel}级用户数据: ${username}`);
        
        const targetLevel = currentLevel + 1; // 目标等级
        const requirements = LEVEL_REQUIREMENTS[currentLevel];
        
        if (!requirements) {
            showError(`未找到等级${currentLevel}的升级要求配置`);
            return;
        }
        
        // 构建升级详情数据
        const trustLevelDetails = {
            items: [],
            summaryText: '',
            achievedCount: 0,
            totalCount: 0,
            targetLevelInSummary: targetLevel.toString()
        };
        
        // 检查各项要求
        Object.entries(requirements).forEach(([key, requiredValue]) => {
            let currentValue = 0;
            let label = '';
            let isMet = false;
            
            switch (key) {
                case 'topics_entered':
                    currentValue = userSummary.topics_entered || 0;
                    label = '浏览的话题';
                    isMet = currentValue >= requiredValue;
                    break;
                case 'posts_read_count':
                    currentValue = userSummary.posts_read_count || 0;
                    label = '已读帖子';
                    isMet = currentValue >= requiredValue;
                    break;
                case 'time_read':
                    currentValue = Math.floor((userSummary.time_read || 0) / 60); // 转换为分钟
                    label = '阅读时间(分钟)';
                    isMet = (userSummary.time_read || 0) >= requiredValue;
                    break;
                case 'days_visited':
                    currentValue = userSummary.days_visited || 0;
                    label = '访问天数';
                    isMet = currentValue >= requiredValue;
                    break;
                case 'likes_given':
                    currentValue = userSummary.likes_given || 0;
                    label = '给出的赞';
                    isMet = currentValue >= requiredValue;
                    break;
                case 'likes_received':
                    currentValue = userSummary.likes_received || 0;
                    label = '收到的赞';
                    isMet = currentValue >= requiredValue;
                    break;
                case 'replies_to_different_topics':
                    currentValue = repliesCount || 0;
                    label = '回复不同话题';
                    isMet = currentValue >= requiredValue;
                    break;
            }
            
            if (label) {
                trustLevelDetails.items.push({
                    label: label,
                    current: currentValue.toString(),
                    required: key === 'time_read' ? Math.floor(requiredValue / 60).toString() : requiredValue.toString(),
                    isMet: isMet
                });
                
                if (isMet) {
                    trustLevelDetails.achievedCount++;
                }
                trustLevelDetails.totalCount++;
            }
        });
        
        // 生成总结文本
        if (trustLevelDetails.achievedCount === trustLevelDetails.totalCount) {
            trustLevelDetails.summaryText = `已满足信任级别 ${targetLevel} 要求`;
        } else {
            trustLevelDetails.summaryText = `不符合信任级别 ${targetLevel} 要求，继续加油`;
        }
        
        debugLog(`${currentLevel}级用户数据处理完成: ${trustLevelDetails.achievedCount}/${trustLevelDetails.totalCount} 项达标`);
        
        // 更新显示
        updateInfo(username, currentLevel.toString(), targetLevel.toString(), trustLevelDetails, new Date(), '', false);
        saveDataToCache(username, currentLevel.toString(), targetLevel.toString(), trustLevelDetails, '');
    }
})();
