// options.js
document.addEventListener('DOMContentLoaded', restoreOptions);

const apiKeyInput = document.getElementById('apiKey');
const targetLangSelect = document.getElementById('targetLang');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDiv = document.getElementById('status');

saveBtn.addEventListener('click', saveOptions);
clearBtn.addEventListener('click', clearOptions);

function saveOptions() {
  const apiKey = apiKeyInput.value.trim();
  const targetLang = targetLangSelect.value;
  chrome.storage.sync.set({ apiKey, targetLang }, () => {
    showStatus('설정이 저장되었습니다.');
    // 선택적으로 다른 페이지들에 변경사항을 알릴 수 있음
  });
}

function restoreOptions() {
  chrome.storage.sync.get(['apiKey', 'targetLang'], (items) => {
    if (items.apiKey) apiKeyInput.value = items.apiKey;
    if (items.targetLang) targetLangSelect.value = items.targetLang;
  });
}

function clearOptions() {
  apiKeyInput.value = '';
  chrome.storage.sync.remove(['apiKey'], () => {
    showStatus('API 키가 삭제되었습니다.');
  });
}

function showStatus(msg) {
  statusDiv.textContent = msg;
  setTimeout(() => { statusDiv.textContent = ''; }, 3000);
}
