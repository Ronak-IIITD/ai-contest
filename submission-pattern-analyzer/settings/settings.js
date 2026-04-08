import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings.js';

const refs = {
  autoScanCodeforces: document.getElementById('autoScanCodeforces'),
  autoScanLeetCode: document.getElementById('autoScanLeetCode'),
  scanIntervalSeconds: document.getElementById('scanIntervalSeconds'),
  minTierToShowBadge: document.getElementById('minTierToShowBadge'),
  storageRetentionDays: document.getElementById('storageRetentionDays'),
  weightH1: document.getElementById('weightH1'),
  weightH2: document.getElementById('weightH2'),
  weightH3: document.getElementById('weightH3'),
  weightH4: document.getElementById('weightH4'),
  weightH5: document.getElementById('weightH5'),
  mlEnabled: document.getElementById('mlEnabled'),
  mlMode: document.getElementById('mlMode'),
  mlBlend: document.getElementById('mlBlend'),
  mlMinConfidence: document.getElementById('mlMinConfidence'),
  saveBtn: document.getElementById('saveBtn'),
  status: document.getElementById('status'),
};

function storageGet(key, fallback) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: fallback }, (result) => {
      resolve(result[key]);
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime?.lastError;
      if (err) return reject(new Error(err.message));
      resolve(response);
    });
  });
}

function setStatus(text, isError = false) {
  refs.status.textContent = text;
  refs.status.style.color = isError ? '#b91c1c' : '#065f46';
}

function fillForm(settings) {
  refs.autoScanCodeforces.checked = settings.autoScanCodeforces;
  refs.autoScanLeetCode.checked = settings.autoScanLeetCode;
  refs.scanIntervalSeconds.value = settings.scanIntervalSeconds;
  refs.minTierToShowBadge.value = settings.minTierToShowBadge;
  refs.storageRetentionDays.value = settings.storageRetentionDays;

  refs.weightH1.value = settings.weights.H1;
  refs.weightH2.value = settings.weights.H2;
  refs.weightH3.value = settings.weights.H3;
  refs.weightH4.value = settings.weights.H4;
  refs.weightH5.value = settings.weights.H5;

  refs.mlEnabled.checked = settings.ml.enabled;
  refs.mlMode.value = settings.ml.mode;
  refs.mlBlend.value = settings.ml.blend;
  refs.mlMinConfidence.value = settings.ml.minConfidenceToApply;
}

function readForm() {
  return normalizeSettings({
    autoScanCodeforces: refs.autoScanCodeforces.checked,
    autoScanLeetCode: refs.autoScanLeetCode.checked,
    scanIntervalSeconds: refs.scanIntervalSeconds.value,
    minTierToShowBadge: refs.minTierToShowBadge.value,
    storageRetentionDays: refs.storageRetentionDays.value,
    weights: {
      H1: refs.weightH1.value,
      H2: refs.weightH2.value,
      H3: refs.weightH3.value,
      H4: refs.weightH4.value,
      H5: refs.weightH5.value,
    },
    ml: {
      enabled: refs.mlEnabled.checked,
      mode: refs.mlMode.value,
      blend: refs.mlBlend.value,
      minConfidenceToApply: refs.mlMinConfidence.value,
    },
  });
}

refs.saveBtn.addEventListener('click', async () => {
  refs.saveBtn.disabled = true;
  try {
    const settings = readForm();
    const response = await sendMessage({ type: 'SAVE_SETTINGS', settings });
    if (!response?.ok) {
      throw new Error(response?.error ?? 'Save failed');
    }
    fillForm(normalizeSettings(response.settings));
    setStatus('Settings saved');
  } catch (error) {
    setStatus(`Error: ${error?.message ?? 'Unknown error'}`, true);
  } finally {
    refs.saveBtn.disabled = false;
  }
});

async function init() {
  const settings = normalizeSettings(await storageGet('settings', DEFAULT_SETTINGS));
  fillForm(settings);
}

init().catch((error) => setStatus(`Error: ${error?.message ?? 'Failed to load'}`, true));
