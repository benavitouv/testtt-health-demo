const form = document.querySelector('#claim-form');
const dropZone = document.querySelector('#drop-zone');
const fileInput = document.querySelector('#claim_file');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const statusEl = document.querySelector('#status');
const statusText = document.querySelector('#status-text');
const submitBtn = document.querySelector('#submit-btn');
const successModal = document.querySelector('#success-modal');
const successClose = document.querySelector('#success-close');

let selectedFile = null;

const formatBytes = (bytes) => {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const updateFileMeta = (file) => {
  if (!file) {
    fileName.textContent = 'לא נבחר קובץ';
    fileSize.textContent = '—';
    return;
  }
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
};

const setStatus = (type, message) => {
  statusEl.dataset.type = type;
  statusText.textContent = message;
};

const showSuccessModal = () => {
  successModal.classList.add('is-visible');
  successModal.setAttribute('aria-hidden', 'false');
};

const hideSuccessModal = () => {
  successModal.classList.remove('is-visible');
  successModal.setAttribute('aria-hidden', 'true');
};

const setFile = (file) => {
  selectedFile = file;
  updateFileMeta(file);
};

const syncInputFiles = (file) => {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
};

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    setFile(file);
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove('is-dragover');
  });
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    syncInputFiles(file);
    setFile(file);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('', '');
  hideSuccessModal();

  const file = selectedFile || fileInput.files?.[0];

  if (!file) {
    setStatus('error', 'אנא צרף הפניה רפואית לפני שליחת הבקשה.');
    return;
  }

  submitBtn.disabled = true;
  form.classList.add('is-loading');
  setStatus('info', 'מעלה הפניה רפואית ושולח בקשת טופס 17...');

  try {
    const formData = new FormData(form);
    formData.set('claim_file', file);

    const response = await fetch('/api/submit', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data?.message || 'אירעה שגיאה בעת שליחת הבקשה.');
    }

    setStatus(
      'success',
      'הבקשה נשלחה בהצלחה! אם הכל תקין, תקבל טופס 17.'
    );
    form.reset();
    setFile(null);
    showSuccessModal();
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : 'אירעה שגיאה בלתי צפויה.');
  } finally {
    submitBtn.disabled = false;
    form.classList.remove('is-loading');
  }
});

successClose.addEventListener('click', () => {
  hideSuccessModal();
  setStatus('', '');
});