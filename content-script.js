// content-script.js
(() => {
  let tooltipHost = null;
  let currentShadowRoot = null;

  const tooltipHTML = `
    <div class="tooltip-container" role="dialog" aria-live="polite">
      <div class="tooltip-loader" aria-hidden="true"></div>
      <div class="tooltip-content" style="display: none;"></div>
    </div>
  `;

  const tooltipCSS = `
    :host { all: initial; }
    .tooltip-container {
      box-sizing: border-box;
      width: 350px;
      max-width: 380px;
      min-width: 120px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(32,32,32,0.95);
      color: #fff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      font-size: 13px;
      line-height: 1.3;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
      position: absolute;
      z-index: 2147483647;
      max-height: 500px;
      overflow-y: auto;
    }
    .tooltip-loader {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      margin: 6px auto;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: rgba(255,255,255,0.9);
      animation: spin 0.9s linear infinite;
      display: block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .tooltip-content { white-space: pre-wrap; word-break: break-word; }
  `;

  function removeExistingTooltip() {
    if (tooltipHost && tooltipHost.parentNode) {
      tooltipHost.parentNode.removeChild(tooltipHost);
    }
    tooltipHost = null;
    currentShadowRoot = null;
  }

  function createTooltip(rect) {
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

    // --- 강화된 디버깅 및 위치 계산 로직 ---
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

    // [디버깅] 모든 정보를 담은 객체를 한 번에 출력
    const debugInfo = {
      decision: finalDecision,
      reasoning: {
        shouldMoveToSide,
        criterion1_isTooCloseToBottom: isTooCloseToBottom,
        criterion2_isSelectionTooTall: isSelectionTooTall,
      },
      measurements: {
        viewport: { H: viewportHeight, W: viewportWidth },
        selectionRect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          height: rect.height
        },
        calculated: {
          spaceBelow: spaceBelow
        }
      }
    };
    console.log('[Instant Translate] Positioning Report:', debugInfo);

    // 위치 적용
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
        const shadow = createTooltip(rect);
        const contentEl = shadow.querySelector('.tooltip-content');
        const loaderEl = shadow.querySelector('.tooltip-loader');
        contentEl.style.display = 'none';
        loaderEl.style.display = 'block';
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedText });
      } catch (err) {
        console.error('instant-translate content-script error:', err);
        removeExistingTooltip();
      }
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!currentShadowRoot) return;
    if (message && message.type === 'TRANSLATION_SKIPPED') {
      removeExistingTooltip();
      return;
    }
    if (message && message.type === 'TRANSLATION_RESULT') {
      const contentEl = currentShadowRoot.querySelector('.tooltip-content');
      const loaderEl = currentShadowRoot.querySelector('.tooltip-loader');
      if (loaderEl) loaderEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.textContent = message.translation || '[번역 결과 없음]';
      }
    } else if (message && message.type === 'TRANSLATION_ERROR') {
      const contentEl = currentShadowRoot.querySelector('.tooltip-content');
      const loaderEl = currentShadowRoot.querySelector('.tooltip-loader');
      if (loaderEl) loaderEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.textContent = message.error || '번역 중 오류가 발생했습니다.';
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeExistingTooltip();
  });
})();