// options.js
document.addEventListener('DOMContentLoaded', () => {
  // 페이지가 로드되면 저장된 설정을 복원하고 이벤트 리스너를 초기화합니다.
  restoreOptions();
  initializeEventListeners();
});

const enabledCheckbox = document.getElementById('extensionEnabled');
const darkModeEnabled = document.getElementById('darkModeEnabled');
const apiKeyInput = document.getElementById('apiKey');
const targetLangSelect = document.getElementById('targetLang');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDiv = document.getElementById('status');

function applyDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function saveOptions() {
  const isEnabled = enabledCheckbox.checked;
  const isDarkMode = darkModeEnabled.checked;
  const apiKey = apiKeyInput.value.trim();
  const targetLang = targetLangSelect.value;
  
  chrome.storage.sync.set({ isEnabled, isDarkMode, apiKey, targetLang }, () => {
    // 저장 시점에 상태 메시지를 좀 더 명확하게 변경
    const statusMessage = isEnabled ? 'Settings saved. Extension is On.' : 'Settings saved. Extension is Off.';
    showStatus(statusMessage);
    applyDarkMode(isDarkMode); // Save and apply theme immediately
  });
}

function restoreOptions() {
  // [수정] chrome.storage.sync.get 호출 시 기본값을 명시적으로 전달합니다.
  // 이렇게 하면 저장된 값이 없을 때 이 기본값이 사용되어 혼동을 방지합니다.
  chrome.storage.sync.get({
    isEnabled: true, // 기본값: 활성화
    isDarkMode: false, // 기본값: 다크 모드 비활성화
    apiKey: '',
    targetLang: 'EN'
  }, (items) => {
    enabledCheckbox.checked = items.isEnabled;
    darkModeEnabled.checked = items.isDarkMode;
    apiKeyInput.value = items.apiKey;
    targetLangSelect.value = items.targetLang;

    // 저장된 테마 적용
    applyDarkMode(items.isDarkMode);
  });
}

function clearOptions() {
  apiKeyInput.value = '';
  chrome.storage.sync.remove(['apiKey'], () => {
    showStatus('API Key cleared.');
  });
}

function showStatus(msg) {
  statusDiv.textContent = msg;
  setTimeout(() => { statusDiv.textContent = ''; }, 3000);
}

function initializeEventListeners() {
  // 수동 저장 버튼
  saveBtn.addEventListener('click', saveOptions);
  
  // API 키 초기화 버튼
  clearBtn.addEventListener('click', clearOptions);

  // 자동 저장을 위한 이벤트 리스너
  enabledCheckbox.addEventListener('change', saveOptions);
  darkModeEnabled.addEventListener('change', saveOptions);
  apiKeyInput.addEventListener('change', saveOptions); // API 키 입력 필드
  targetLangSelect.addEventListener('change', saveOptions); // 언어 선택 드롭다운

  // 문의/피드백 링크 이벤트 리스너
  const contactLink = document.getElementById('contact-link');
  if (contactLink) {
    contactLink.addEventListener('click', (event) => {
      event.preventDefault();
      const email = 'kjhmoon06@gmail.com';
      const subject = encodeURIComponent('Inquiry/Feedback about Instant Translate');
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`;
      
      // Manifest V3에서는 window.open 대신 chrome.tabs.create 사용을 권장합니다.
      chrome.tabs.create({ url: gmailUrl });
    });
  }
}
