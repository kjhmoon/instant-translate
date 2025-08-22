// content-script.js
(() => {
  let tooltipHost = null;
  let currentShadowRoot = null;
  let anchorElement = null; // 선택된 텍스트를 감쌀 <span> 요소
  let scrollListener = null; // 스크롤 이벤트 리스너 함수
  let intersectionObserver = null; // 앵커의 가시성을 감지할 Observer

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
    // 1. 이벤트 리스너 및 Observer 해제
    if (scrollListener) {
      window.removeEventListener('scroll', scrollListener, true);
      scrollListener = null;
    }
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }

    // 2. 툴팁 요소 제거 (애니메이션 포함)
    const hostToRemove = tooltipHost;
    if (hostToRemove) {
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

    // 3. 앵커(<span>)를 해제하고 원래 DOM 구조로 복원
    const anchorToRemove = anchorElement;
    if (anchorToRemove && anchorToRemove.parentNode) {
      const parent = anchorToRemove.parentNode;
      // <span> 안의 모든 자식 노드(주로 텍스트 노드)를 <span> 밖으로 이동
      while (anchorToRemove.firstChild) {
        parent.insertBefore(anchorToRemove.firstChild, anchorToRemove);
      }
      // 비어있는 <span> 제거
      parent.removeChild(anchorToRemove);
      parent.normalize(); // 분리된 텍스트 노드를 병합하여 DOM을 깨끗하게 정리
    }
    anchorElement = null;
  }

  function createTooltip(type = 'word') {
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

    tooltipHost.style.position = 'absolute';
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

  /**
   * 툴팁의 위치를 지정된 사각형(rect)에 따라 계산하고 적용합니다.
   * @param {DOMRect} rect - 위치의 기준이 될 DOMRect 객체 (anchorElement.getBoundingClientRect())
   * @param {boolean} isInitial - 최초 호출 여부 (디버그 로그 출력 제어용)
   */
  function positionTooltipAtRect(rect, isInitial = false) {
    if (!tooltipHost) return;

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

    if (isInitial) {
      const debugInfo = {
        decision: finalDecision,
        reasoning: { shouldMoveToSide, criterion1_isTooCloseToBottom: isTooCloseToBottom, criterion2_isSelectionTooTall: isSelectionTooTall, },
        measurements: { viewport: { H: viewportHeight, W: viewportWidth }, selectionRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height }, calculated: { spaceBelow: spaceBelow } }
      };
      console.log('[Instant Translate] Positioning Report:', debugInfo);
    }
    
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
    
    tooltipHost.style.top = `${top}px`;
    tooltipHost.style.left = `${Math.max(left, window.scrollX + MARGIN)}px`;
  }

  document.addEventListener('mouseup', (ev) => {
    if (!ev.ctrlKey) {
      removeExistingTooltip();
      return;
    }
    if (tooltipHost && tooltipHost.contains(ev.target)) {
      return;
    }

    // 기존 툴팁이 있다면 먼저 정리
    removeExistingTooltip();

    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const selectedText = selection.toString().trim();
        if (!selectedText) return;
        
        const range = selection.getRangeAt(0);

        // 1. 앵커(<span>) 생성 및 선택 영역 감싸기
        anchorElement = document.createElement('span');
        anchorElement.style.all = 'unset'; 
        try {
          range.surroundContents(anchorElement);
        } catch (e) {
          console.warn("Instant Translate: Could not wrap the selected range, it might cross element boundaries.", e);
          anchorElement = null; // 앵커 생성 실패 시 초기화
          return;
        }

        const rect = anchorElement.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          removeExistingTooltip(); // 유효하지 않은 영역이면 정리 후 종료
          return;
        }
        
        // 2. 툴팁 생성, 위치 지정, 번역 요청
        createTooltip('sentence');
        positionTooltipAtRect(rect, true);
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedText });

        // 3. 스크롤 추적 리스너 정의 및 등록
        scrollListener = () => {
          if (!anchorElement) return;
          const newRect = anchorElement.getBoundingClientRect();
          positionTooltipAtRect(newRect);
        };
        window.addEventListener('scroll', scrollListener, { capture: true, passive: true });

        // 4. Intersection Observer 등록 (자동 닫기 기능)
        intersectionObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            // isIntersecting이 false이면, 앵커가 화면에서 사라졌다는 의미
            if (!entry.isIntersecting) {
              removeExistingTooltip();
            }
          });
        }, { threshold: 0 }); // threshold: 0은 1px이라도 보이면 intersecting으로 간주

        intersectionObserver.observe(anchorElement);
        
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

    // 기존 툴팁이 있다면 먼저 정리
    removeExistingTooltip();

    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) { return; }
        const selectedWord = selection.toString().trim();
        if (!selectedWord) { return; }
        const range = selection.getRangeAt(0);

        // 1. 앵커(<span>) 생성 및 선택 영역 감싸기
        anchorElement = document.createElement('span');
        anchorElement.style.all = 'unset';
        try {
          range.surroundContents(anchorElement);
        } catch (e) {
          console.warn("Instant Translate: Could not wrap the selected range, it might cross element boundaries.", e);
          anchorElement = null;
          return;
        }

        const rect = anchorElement.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          removeExistingTooltip();
          return;
        }

        // 2. 툴팁 생성, 위치 지정, 번역 요청
        createTooltip('word');
        positionTooltipAtRect(rect, true);
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedWord });

        // 3. 스크롤 추적 리스너 정의 및 등록
        scrollListener = () => {
          if (!anchorElement) return;
          const newRect = anchorElement.getBoundingClientRect();
          positionTooltipAtRect(newRect);
        };
        window.addEventListener('scroll', scrollListener, { capture: true, passive: true });

        // 4. Intersection Observer 등록 (자동 닫기 기능)
        intersectionObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) {
              removeExistingTooltip();
            }
          });
        }, { threshold: 0 });

        intersectionObserver.observe(anchorElement);

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