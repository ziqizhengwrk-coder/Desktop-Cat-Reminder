const params = new URLSearchParams(window.location.search);
const reminderId = params.get('reminderId') || 'stretch';
const label = document.getElementById('label');
const title = document.getElementById('title');
const message = document.getElementById('message');
const done = document.getElementById('done');
const snooze = document.getElementById('snooze');
const close = document.getElementById('close');
const DONE_LOCK_SECONDS = 60;

const overlayText = {
  'zh-CN': {
    doneReady: '完成',
    doneLocked: '完成（{seconds}s）',
    snooze: '{minutes} 分钟后提醒',
    close: '关闭提醒',
  },
  en: {
    doneReady: 'Done',
    doneLocked: 'Done ({seconds}s)',
    snooze: '{minutes} min later',
    close: 'Close reminder',
  },
};

let language = 'zh-CN';
let doneUnlockAt = Date.now() + DONE_LOCK_SECONDS * 1000;
let doneTimer = null;

function text(language, key, values = {}) {
  const template = overlayText[language]?.[key] || overlayText.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => values[name] ?? '');
}

window.catReminder.onReminderData((data) => {
  language = data.language || 'zh-CN';
  label.textContent = data.label;
  title.textContent = data.title;
  message.textContent = data.message;
  snooze.textContent = text(language, 'snooze', { minutes: String(data.snoozeMinutes) });
  close.setAttribute('aria-label', text(language, 'close'));
  startDoneCountdown();
});

done.addEventListener('click', () => {
  if (Date.now() < doneUnlockAt) return;
  window.catReminder.done(reminderId);
});

snooze.addEventListener('click', () => {
  window.catReminder.snooze(reminderId);
});

close.addEventListener('click', () => {
  window.catReminder.ignore(reminderId);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.catReminder.ignore(reminderId);
  }
});

window.addEventListener('beforeunload', () => {
  clearInterval(doneTimer);
});

function startDoneCountdown() {
  clearInterval(doneTimer);
  done.disabled = true;
  doneUnlockAt = Date.now() + DONE_LOCK_SECONDS * 1000;
  updateDoneCountdown();
  doneTimer = window.setInterval(updateDoneCountdown, 1000);
}

function updateDoneCountdown() {
  const seconds = Math.max(0, Math.ceil((doneUnlockAt - Date.now()) / 1000));
  if (seconds > 0) {
    done.disabled = true;
    done.textContent = text(language, 'doneLocked', { seconds: String(seconds) });
    return;
  }

  done.disabled = false;
  done.textContent = text(language, 'doneReady');
  clearInterval(doneTimer);
  doneTimer = null;
}
