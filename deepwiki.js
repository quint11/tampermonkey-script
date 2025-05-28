// ==UserScript==
// @name         DeepWikiJump
// @namespace    https://github.com/quint11/tampermonkey-script.git
// @version      1.0
// @description  Add a button to open the corresponding wiki page on DeepWiki
// @author       quintus
// @icon         https://www.google.com/s2/favicons?domain=github.com
// @match        https://github.com/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // 检查当前URL是否符合GitHub项目页面格式
    function isProjectPage() {
        const path = window.location.pathname;
        const parts = path.split('/').filter(part => part);
        
        // 检查是否至少有用户名和仓库名两部分
        return parts.length >= 2;
    }

    function addLinkToCurrentPage() {
        // 如果不是项目页面，则不执行
        if (!isProjectPage()) {
            return;
        }
        
        // 获取指定类名的元素
        const targetElement = document.querySelector('.UnderlineNav-body');
        
        // 检测GitHub界面版本并选择合适的元素
        function detectGitHubUIVersion() {
            // 检查是否为新版GitHub界面
            return document.querySelector('header[role="banner"]') !== null;
        }
        
        // 根据GitHub界面版本选择不同的选择器
        const isNewUI = detectGitHubUIVersion();
        const newUISelectors = [
            '.UnderlineNav-body',
            '.UnderlineNav ul',
            'nav[aria-label="Repository"] ul'
        ];
        
        const oldUISelectors = [
            '.reponav',
            'nav.js-repo-nav ul',
            'ul.pagehead-actions'
        ];
        
        // 根据界面版本选择合适的选择器列表
        const selectorsToTry = isNewUI ? newUISelectors : oldUISelectors;
        
        // 尝试使用备选选择器
        let finalTargetElement = targetElement;
        if (!finalTargetElement) {
            for (const selector of selectorsToTry) {
                const element = document.querySelector(selector);
                if (element) {
                    finalTargetElement = element;
                    break;
                }
            }
        }
        
        if (!finalTargetElement) {
            return;
        }

        // 检查是否已经添加了DeepWiki按钮，避免重复添加
        const existingButton = document.querySelector('.deepwiki-button');
        if (existingButton) {
            return;
        }

        // 获取当前页面路径
        const path = window.location.pathname;
        const parts = path.split('/').filter(part => part);

        const username = parts[0];
        const repo = parts[1];

        // 创建按钮元素
        const wikiButton = document.createElement('a');
        // 增大按钮尺寸
        wikiButton.classList.add('btn', 'btn-lg', 'btn-outline', 'ml-2', 'deepwiki-button');
        // 使用蓝绿渐变背景
        wikiButton.style.background = 'linear-gradient(90deg, #2193b0 0%, #6dd5ed 100%)';
        // 改变按钮文字颜色
        wikiButton.style.color = 'white';
        // 添加阴影效果
        wikiButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        wikiButton.href = `https://deepwiki.com/${username}/${repo}`;
        wikiButton.target = '_blank';
        wikiButton.title = 'Open Wiki on DeepWiki';
        // 添加 alt 属性
        wikiButton.alt = 'Open Wiki on DeepWiki';
        // 添加 cursor 属性
        wikiButton.style.cursor = 'pointer';
        // 设置按钮文字
        wikiButton.textContent = 'DeepWiki';

        // 添加悬停动画
        wikiButton.style.transition = 'all 0.3s ease';
        wikiButton.addEventListener('mouseover', function() {
            this.style.transform = 'scale(1.1)';
            this.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
        });
        wikiButton.addEventListener('mouseout', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        });

        // 创建列表项元素并将按钮添加到其中
        const listItem = document.createElement('li');
        listItem.appendChild(wikiButton);

        // 将列表项添加到目标元素的最后
        try {
            finalTargetElement.appendChild(listItem);
        } catch (error) {
            // 静默处理错误
        }
    }

    // 使用MutationObserver监听DOM变化
    function setupObserver() {
        // 如果不是项目页面，则不设置观察器
        if (!isProjectPage()) {
            return;
        }
        
        // 创建一个观察器实例
        const observer = new MutationObserver(function() {
            // 当DOM变化时尝试添加按钮
            addLinkToCurrentPage();
        });

        // 配置观察选项
        const config = { childList: true, subtree: true };

        // 开始观察document.body的变化
        observer.observe(document.body, config);

        // 页面加载完成后也尝试添加按钮
        addLinkToCurrentPage();
    }
    
    // 监听URL变化（GitHub是SPA应用，页面跳转不会重新加载页面）
    function setupURLChangeListener() {
        let lastURL = location.href;
        
        // 创建一个新的MutationObserver来监听URL变化
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastURL) {
                lastURL = location.href;
                // URL变化后，如果是项目页面则设置观察器
                if (isProjectPage()) {
                    setupObserver();
                }
            }
        });
        
        // 配置观察选项
        urlObserver.observe(document, { subtree: true, childList: true });
    }

    // 添加延迟重试机制
    function retryAddButton() {
        // 延迟1秒后再次尝试添加按钮
        setTimeout(() => {
            addLinkToCurrentPage();
            
            // 如果仍然没有找到按钮，再次延迟尝试
            if (!document.querySelector('.deepwiki-button')) {
                setTimeout(addLinkToCurrentPage, 2000);
            }
        }, 1000);
    }
    
    // 页面加载完成后设置观察器
    window.addEventListener('load', () => {
        setupObserver();
        setupURLChangeListener();
        retryAddButton(); // 添加延迟重试
    });

    // 对于已经加载完成的页面，立即设置观察器
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setupObserver();
        setupURLChangeListener();
        retryAddButton(); // 对于已加载页面也使用延迟重试
    }
})();