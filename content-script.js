// content-script.js
(() => {
  let tooltipHost = null;
  let currentShadowRoot = null;
  let anchorElement = null; // 선택된 텍스트를 감쌀 <span> 요소
  let scrollListener = null; // 스크롤 이벤트 리스너 함수
  let intersectionObserver = null; // 앵커의 가시성을 감지할 Observer
  // --- [추가] 시작 ---
  let translationIcon = null; // 번역 아이콘 DOM 요소를 저장할 변수
  let lastSelectionRange = null; // 아이콘 클릭 시 사용할 마지막 선택 영역 정보
  // --- [추가] 끝 --

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

  // --- [추가] 아이콘 관련 함수 ---
  function removeTranslationIcon() {
    if (translationIcon) {
      const iconToRemove = translationIcon;
      translationIcon = null; // 재진입 방지를 위해 즉시 null로 설정
      // 애니메이션을 위해 opacity를 먼저 변경하고 transitionend 후 DOM에서 제거
      iconToRemove.style.opacity = '0';
      iconToRemove.addEventListener('transitionend', () => {
        iconToRemove.remove();
      }, { once: true });
    }
    lastSelectionRange = null;
  }

  function handleIconClick(ev) {
    ev.stopPropagation(); // 페이지의 다른 이벤트에 영향 주지 않도록 함

    if (!lastSelectionRange) return;

    // 기존의 앵커 기반 번역 실행 로직을 재사용하여 스크롤 추적 기능 보장
    startTranslationProcess(lastSelectionRange, 'sentence');

    // 번역이 시작되면 아이콘은 제거
    removeTranslationIcon();
  }

  function createTranslationIcon(range) {
    // 아이콘 표시 전, 기존 툴팁과 아이콘이 있다면 모두 정리
    removeExistingTooltip();
    removeTranslationIcon();

    // 1. 선택 영역의 '끝 지점' 좌표를 정밀하게 계산
    const endRange = range.cloneRange();
    endRange.collapse(false); // Range를 끝 지점으로 축소
    const endRect = endRange.getBoundingClientRect();

    // 2. 마지막 선택 영역 정보 저장
    lastSelectionRange = range;

    // 3. 아이콘 컨테이너(div)와 이미지(img) 생성
    translationIcon = document.createElement('div');
    const iconImg = document.createElement('img');

    // chrome.runtime.getURL을 통해 확장 프로그램 내부 리소스 경로를 가져옴
    iconImg.src = chrome.runtime.getURL('icons/icon16.png');

    // 4. 아이콘 스타일링
    iconImg.style.cssText = `
      width: 16px;
      height: 16px;
    `;
    translationIcon.style.cssText = `
      position: absolute;
      z-index: 2147483646;
      width: 28px;
      height: 28px;
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: opacity 0.15s ease-in-out;
      opacity: 0;
    `;

    // 5. 아이콘 위치 설정 (계산된 끝 지점 기준)
    // [수정] top 계산 방식을 bottom 기준에서 top 기준으로 변경하여 아이콘을 위로 올립니다.
    const iconHeight = 28; // 아이콘의 높이
    const top = endRect.top + window.scrollY - (iconHeight / 2) + (endRect.height / 2);
    const left = endRect.right + window.scrollX + 5; // 약간 오른쪽으로 이동
    translationIcon.style.top = `${top}px`;
    translationIcon.style.left = `${left}px`;

    // 6. DOM에 추가 및 이벤트 리스너 바인딩
    translationIcon.appendChild(iconImg);
    document.body.appendChild(translationIcon);

    // 부드럽게 나타나는 애니메이션
    setTimeout(() => {
      if (translationIcon) translationIcon.style.opacity = '1';
    }, 10);

    translationIcon.addEventListener('click', handleIconClick, { once: true });
  }
  // --- [추가] 끝 ---

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

  function startTranslationProcess(range, type = 'sentence') {
    // 1. 이전 상태 정리 (새로운 번역 시작 전)
    removeExistingTooltip();

    try {
      const selectedText = range.toString().trim();
      if (!selectedText) return;

      // 2. 앵커(<span>) 생성 및 선택 영역 감싸기
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

      // 3. 툴팁 생성, 위치 지정, 번역 요청
      createTooltip(type);
      positionTooltipAtRect(rect, true);
      chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: selectedText });

      // 4. 스크롤 추적 및 자동 닫기 리스너 등록
      scrollListener = () => {
        if (!anchorElement) return;
        const newRect = anchorElement.getBoundingClientRect();
        positionTooltipAtRect(newRect);
      };
      window.addEventListener('scroll', scrollListener, { capture: true, passive: true });

      intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            removeExistingTooltip();
          }
        });
      }, { threshold: 0 });
      intersectionObserver.observe(anchorElement);

    } catch (err) {
      console.error('instant-translate content-script error:', err);
      removeExistingTooltip();
    }
  }

  document.addEventListener('mouseup', (ev) => {
    // 아이콘이나 툴팁 내부를 클릭한 경우는 무시
    if ((tooltipHost && tooltipHost.contains(ev.target)) || (translationIcon && translationIcon.contains(ev.target))) {
      return;
    }

    // Ctrl 키가 눌렸을 경우: 즉시 번역 실행
    if (ev.ctrlKey) {
      removeTranslationIcon(); // 아이콘이 있었다면 제거
      chrome.storage.sync.get({ isEnabled: true }, (settings) => {
        if (!settings.isEnabled) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          removeExistingTooltip();
          return;
        }
        startTranslationProcess(selection.getRangeAt(0), 'sentence');
      });
      return;
    }

    // 더블클릭인 경우(ev.detail > 1), 아이콘을 표시하지 않고 종료
    // (어차피 dblclick 이벤트 핸들러가 즉시 번역을 처리할 것임)
    if (ev.detail > 1) {
      removeTranslationIcon();
      return;
    }

    // 위의 모든 조건에 해당하지 않는 '일반 드래그 선택'의 경우:
    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;

      // 드래그가 끝난 후 selection 객체가 안정화될 시간을 주기 위해 짧은 지연 추가
      setTimeout(() => {
        const selection = window.getSelection();
        // isCollapsed는 선택 영역이 없이 커서만 있는 상태(클릭)를 의미
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          removeTranslationIcon();
          return;
        }
        const selectedText = selection.toString().trim();
        if (!selectedText) {
          removeTranslationIcon();
          return;
        }

        // 유효한 텍스트가 선택되었다면 번역 아이콘 생성
        createTranslationIcon(selection.getRangeAt(0));
      }, 10);
    });
  });

  document.addEventListener('dblclick', (ev) => {
    if (tooltipHost && tooltipHost.contains(ev.target)) {
      return;
    }

    removeTranslationIcon(); // 더블클릭 시 아이콘이 혹시 남아있다면 제거
    chrome.storage.sync.get({ isEnabled: true }, (settings) => {
      if (!settings.isEnabled) return;
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) { return; }
        const selectedWord = selection.toString().trim();
        if (!selectedWord) { return; }
        startTranslationProcess(selection.getRangeAt(0), 'word');
      } catch (err) {
        console.error('instant-translate content-script error on dblclick:', err);
        removeExistingTooltip();
      }
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!currentShadowRoot || !message) return;
    
    const showContent = (text, isFinalState = false) => {
      const container = currentShadowRoot.querySelector('.tooltip-container');
      if (!container) return;
      const contentEl = container.querySelector('.tooltip-content');
      if (contentEl) {
        contentEl.textContent = text;
      }
      container.classList.add('loaded');

      // [수정] 오류나 언어 동일 메시지 등 최종 상태에서는 더 이상 앵커를 추적할 필요가 없으므로 Observer를 해제합니다.
      if (isFinalState && intersectionObserver) {
        intersectionObserver.disconnect();
      }
    };

    if (message.type === 'TRANSLATION_SKIPPED') {
      removeExistingTooltip();
    } else if (message.type === 'TRANSLATION_BYPASSED') {
      showContent(message.text, true); // isFinalState를 true로 전달
    } else if (message.type === 'TRANSLATION_RESULT') {
      showContent(message.translation || '[번역 결과 없음]');
    } else if (message.type === 'TRANSLATION_ERROR') {
      showContent(message.error || '번역 중 오류가 발생했습니다.', true); // isFinalState를 true로 전달
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeExistingTooltip();
      removeTranslationIcon();
    }
  });

  // 페이지 다른 곳을 클릭(mousedown)하면 아이콘 제거
  document.addEventListener('mousedown', (ev) => {
    if (translationIcon && !translationIcon.contains(ev.target)) {
      removeTranslationIcon();
    }
  }, true);

  // --- [추가] 툴팁 외부를 클릭하면 툴팁을 제거하는 리스너 ---
  document.addEventListener('mousedown', (ev) => {
    // 툴팁이 존재하고, 클릭한 대상이 툴팁 자신이 아닐 경우
    if (tooltipHost && !tooltipHost.contains(ev.target)) {
      // 하지만 만약 아이콘을 클릭한 것이라면, 툴팁을 바로 닫지 않도록 예외 처리
      if (translationIcon && translationIcon.contains(ev.target)) {
        return;
      }
      removeExistingTooltip();
    }
  }, true); // capture phase에서 이벤트를 처리하여 다른 이벤트보다 먼저 실행되도록 함

})();
