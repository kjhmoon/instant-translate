// content-script.js
(() => {
  let tooltipHost = null;
  let currentShadowRoot = null;

  const tooltipHTML = `
    <div class="tooltip-container" role="dialog" aria-live="polite">
      <div class="tooltip-loader" aria-hidden="true"></div>
      <div class="tooltip-content"></div>
    </div>
  `;

  const tooltipCSS = `
    :host {
      all: initial;
      --tooltip-transition-duration: 0.2s;
      --tooltip-transition-timing: ease-in-out;
    }
    .tooltip-container {
      box-sizing: border-box;
      max-width: 380px;
      min-width: 120px;
      min-height: 44px; /* 로더 표시를 위한 최소 높이 확보 */
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(32, 32, 32, 0.95);
      color: #fff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      font-size: 13px;
      line-height: 1.3;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      position: absolute;
      z-index: 2147483647;
      max-height: 500px;
      overflow-y: auto;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity var(--tooltip-transition-duration) var(--tooltip-transition-timing),
                  transform var(--tooltip-transition-duration) var(--tooltip-transition-timing);
      scrollbar-width: none; /* Firefox */
    }
    .tooltip-container::-webkit-scrollbar {
        display: none; /* Chrome, Safari, and Opera */
    }
    .tooltip-container.is-sentence {
      width: 350px;
    }
    .tooltip-container.active {
      opacity: 1;
      transform: translateY(0);
    }
    .tooltip-loader {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      margin: 0;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: rgba(255, 255, 255, 0.9);
      animation: spin 0.9s linear infinite;
      transition: opacity 0.2s ease-out;
    }
    /* [수정] 애니메이션이 중앙 위치를 유지하도록 transform 속성 변경 */
    @keyframes spin {
      from {
        transform: translate(-50%, -50%) rotate(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotate(360deg);
      }
    }
    .tooltip-content {
      white-space: pre-wrap;
      word-break: break-word;
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      transition-delay: 0.15s; /* 로더가 사라진 후 텍스트가 나타나도록 지연 */
    }
    .tooltip-container.loaded .tooltip-loader {
      opacity: 0;
      pointer-events: none; /* 애니메이션 후 상호작용 방지 */
    }
    .tooltip-container.loaded .tooltip-content {
      opacity: 1;
    }
  `;

  function removeExistingTooltip() {
    const hostToRemove = tooltipHost;
    if (!hostToRemove) return;

    tooltipHost = null;
    currentShadowRoot = null;

    const container = hostToRemove.shadowRoot?.querySelector('.tooltip-container');

    if (container) {
      container.classList.remove('active');
      container.addEventListener('transitionend', () => {
        hostToRemove.parentNode?.removeChild(hostToRemove);
      }, { once: true });
    } else {
      hostToRemove.parentNode?.removeChild(hostToRemove);
    }
  }

  function createTooltip(rect, type = 'word') {
    removeExistingTooltip();
    tooltipHost = document.createElement('div');
    const shadowRoot = tooltipHost.attachShadow({ mode: 'open' });
    currentShadowRoot = shadowRoot;

    const style = document.createElement('style');
    style.textContent = tooltipCSS;
    shadowRoot.appendChild(style);

    const container = document.createElement('div');
    container.innerHTML = tooltipHTML;
    shadowRoot.appendChild(container);
    
    const tooltipContainer = shadowRoot.querySelector('.tooltip-container');
    if (tooltipContainer && type === 'sentence') {
      tooltipContainer.classList.add('is-sentence');
    }

    const TOOLTIP_ESTIMATED_WIDTH = 360;
    const MARGIN = 10;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const isTooCloseToBottom = rect.bottom > viewportHeight * 0.8 || spaceBelow < 150;
    const isSelectionTooTall = rect.height > viewportHeight / 2;
    const shouldMoveToSide = isTooCloseToBottom || isSelectionTooTall;
    let finalDecision = '';

    if (shouldMoveToSide) {
      const spaceRight = viewportWidth - rect.right;
      const spaceLeft = rect.left;
      if (spaceRight > spaceLeft && spaceRight > TOOLTIP_ESTIMATED_WIDTH + MARGIN) {
        finalDecision = 'Place on the RIGHT';
      } else if (spaceLeft > TOOLTIP_ESTIMATED_WIDTH + MARGIN) {
        finalDecision = 'Place on the LEFT';
      } else {
        finalDecision = 'Place on the RIGHT (Fallback)';
      }
    } else {
      finalDecision = 'Place BELOW';
    }

    const debugInfo = {
      decision: finalDecision,
      reasoning: { shouldMoveToSide, criterion1_isTooCloseToBottom: isTooCloseToBottom, criterion2_isSelectionTooTall: isSelectionTooTall, },
      measurements: { viewport: { H: viewportHeight, W: viewportWidth }, selectionRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height }, calculated: { spaceBelow: spaceBelow } }
    };
    console.log('[Instant Translate] Positioning Report:', debugInfo);

    let top, left;
    if (shouldMoveToSide) {
      top = rect.top + window.scrollY;
      if (finalDecision.includes('RIGHT')) {
        left = rect.right + window.scrollX + MARGIN;
      } else { // LEFT
        left = rect.left + window.scrollX - TOOLTIP_ESTIMATED_WIDTH - MARGIN;
      }
    } else { // BELOW
      top = rect.bottom + window.scrollY + MARGIN;
      left = rect.left + window.scrollX;
      if (left + TOOLTIP_ESTIMATED_WIDTH > window.scrollX + viewportWidth) {
        left = window.scrollX + viewportWidth - TOOLTIP_ESTIMATED_WIDTH - MARGIN;
      }
    }
    
    tooltipHost.style.position = 'absolute';
    tooltipHost.style.top = `${top}px`;
    tooltipHost.style.left = `${Math.max(left, window.scrollX + MARGIN)}px`;
    tooltipHost.style.zIndex = 2147483647;

    document.body.appendChild(tooltipHost);

    setTimeout(() => {
      const activeContainer = shadowRoot.querySelector('.tooltip-container');
      if (activeContainer) {
        activeContainer.classList.add('active');
      }
    }, 10);

    return shadowRoot;
  }

  document.addEventListener('mouseup', (ev) => {
    if (!ev.ctrlKey) {
      removeExistingTooltip();
      return;
    }
    if (tooltipHost && tooltipHost.contains(ev.target)) {
      return;
    }
    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          removeExistingTooltip();
          return;
        }
        const selectedText = selection.toString().trim();
        if (!selectedText) {
          removeExistingTooltip();
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;
        
        createTooltip(rect, 'sentence');
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedText });
      } catch (err) {
        console.error('instant-translate content-script error:', err);
        removeExistingTooltip();
      }
    });
  });

  document.addEventListener('dblclick', (ev) => {
    if (tooltipHost && tooltipHost.contains(ev.target)) {
      return;
    }
    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) { return; }
        const selectedWord = selection.toString().trim();
        if (!selectedWord) { return; }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        createTooltip(rect, 'word');
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedWord });
      } catch (err) {
        console.error('instant-translate content-script error on dblclick:', err);
        removeExistingTooltip();
      }
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!currentShadowRoot || !message) return;
    const showContent = (text) => {
      const container = currentShadowRoot.querySelector('.tooltip-container');
      if (!container) return;
      const contentEl = container.querySelector('.tooltip-content');
      if (contentEl) {
        contentEl.textContent = text;
      }
      container.classList.add('loaded');
    };
    if (message.type === 'TRANSLATION_SKIPPED') {
      removeExistingTooltip();
    } else if (message.type === 'TRANSLATION_BYPASSED') {
      showContent(message.text);
    } else if (message.type === 'TRANSLATION_RESULT') {
      showContent(message.translation || '[번역 결과 없음]');
    } else if (message.type === 'TRANSLATION_ERROR') {
      showContent(message.error || '번역 중 오류가 발생했습니다.');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeExistingTooltip();
  });
})();