// content-script.js
(() => {
  let tooltipHost = null; // 전역참조: 현재 주입된 툴팁 호스트 (중복 방지)
  let currentShadowRoot = null;

  // tooltip HTML & CSS (문자열로 보관하여 섀도우 루트에 주입)
  const tooltipHTML = `
    <div class="tooltip-container" role="dialog" aria-live="polite">
      <div class="tooltip-loader" aria-hidden="true"></div>
      <div class="tooltip-content" style="display: none;"></div>
    </div>
  `;

  const tooltipCSS = `
    :host { all: initial; } /* 섀도우 캡슐화 보강 */
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

    const top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;
    const viewportWidth = document.documentElement.clientWidth;
    const estWidth = 360;
    if (left + estWidth > window.scrollX + viewportWidth) {
      left = window.scrollX + viewportWidth - estWidth - 12;
    }
    tooltipHost.style.position = 'absolute';
    tooltipHost.style.top = `${top}px`;
    tooltipHost.style.left = `${Math.max(left, window.scrollX + 8)}px`;
    tooltipHost.style.zIndex = 2147483647;

    document.body.appendChild(tooltipHost);
    return shadowRoot;
  }

  document.addEventListener('mouseup', (ev) => {
    // 툴팁 자체를 클릭한 경우는 무시 (텍스트 복사 등을 위해)
    if (tooltipHost && tooltipHost.contains(ev.target)) {
      return;
    }
      
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

  /*
   [수정] 스크롤 시 툴팁이 사라지는 현상을 막기 위해 아래 이벤트 리스너를 주석 처리합니다.
   이제 툴팁은 스크롤해도 사라지지 않고, 화면의 다른 곳을 클릭하거나 Esc 키를 눌러야 사라집니다.
  */
  // document.addEventListener('scroll', () => {
  //   removeExistingTooltip();
  // }, true);
})();
