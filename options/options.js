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
    // [수정] 상태 메시지를 영어로 변경
    showStatus('Settings saved.');
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
    // [수정] 상태 메시지를 영어로 변경
    showStatus('API Key cleared.');
  });
}

function showStatus(msg) {
  statusDiv.textContent = msg;
  setTimeout(() => { statusDiv.textContent = ''; }, 3000);
}
