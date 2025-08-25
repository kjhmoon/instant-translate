// service-worker.js
self.addEventListener('install', () => {
  // 서비스워커는 이벤트 기반이라 특별한 초기화가 필요없음
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  clients.claim();
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'TRANSLATE_TEXT') return;
  const tabId = sender && sender.tab && sender.tab.id;

  // 응답을 비동기적으로 처리할 것을 브라우저에 알림
  (async () => {
    try {
      const text = message.text;
      if (!text || text.trim().length === 0) {
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: 'TRANSLATION_ERROR', error: '번역할 텍스트가 없습니다.' });
        }
        return;
      }

      // 사용자 설정 로드
      const items = await new Promise((resolve) => {
        chrome.storage.sync.get(['apiKey', 'targetLang'], resolve);
      });

      const apiKey = items.apiKey;
      const targetLang = items.targetLang || 'EN';

      if (!apiKey) {
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: 'TRANSLATION_ERROR', error: 'API 키가 설정되어 있지 않습니다. 확장 설정에서 DeepL API 키를 추가하세요.' });
        }
        return;
      }

      // [수정] 실제 번역 호출 후 결과 객체를 받음
      const translationResult = await translateText(text, apiKey, targetLang);
      const detectedLang = translationResult.detected_source_language;
      const translatedText = translationResult.text;
      
      // [수정] 감지된 언어와 목표 언어가 동일하면 안내 메시지를 포함하여 메시지 전송
      if (detectedLang.toUpperCase() === targetLang.toUpperCase()) {
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { 
            type: 'TRANSLATION_BYPASSED',
            text: 'Translation is not performed because it is the same as the target language. Please change the target language.'
          });
        }
        return; // 번역 결과를 보내지 않고 종료
      }

      // 언어가 다를 경우에만 번역 결과 전송
      if (tabId != null) {
        chrome.tabs.sendMessage(tabId, { type: 'TRANSLATION_RESULT', translation: translatedText });
      }

    } catch (err) {
      console.error('service-worker translation error:', err);
      if (sender && sender.tab && sender.tab.id != null) {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'TRANSLATION_ERROR', error: String(err) });
      }
    }
  })();

  return true;
});

/**
 * translateText: DeepL 번역 API 호출
 * [수정] 번역된 텍스트만 반환하는 대신, 전체 응답 객체를 반환하도록 수정
 * @returns {object} e.g., { detected_source_language: 'KO', text: 'Hello' }
 */
async function translateText(text, apiKey, targetLang) {
  const apiUrl = 'https://api-free.deepl.com/v2/translate';
  const body = JSON.stringify({
    text: [text],
    target_lang: targetLang
  });

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'DeepL-Auth-Key ' + apiKey
    },
    body
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`DeepL API error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  if (!data || !data.translations || !data.translations[0]) {
    throw new Error('DeepL 응답 형식이 예상과 다릅니다.');
  }
  // [수정] 전체 번역 결과 객체를 반환
  return data.translations[0];
}