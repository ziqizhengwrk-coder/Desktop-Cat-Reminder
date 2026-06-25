const params = new URLSearchParams(window.location.search);
const reminderId = params.get('reminderId') || 'stretch';
const label = document.getElementById('label');
const title = document.getElementById('title');
const message = document.getElementById('message');
const done = document.getElementById('done');
const snooze = document.getElementById('snooze');
const close = document.getElementById('close');

const overlayText = {
  'zh-CN': {
    done: '完成',
    snooze: '{minutes} 分钟后提醒',
    close: '关闭提醒',
  },
  en: {
    done: 'Done',
    snooze: '{minutes} min later',
    close: 'Close reminder',
  },
};

function text(language, key, values = {}) {
  const template = overlayText[language]?.[key] || overlayText.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => values[name] ?? '');
}

window.catReminder.onReminderData((data) => {
  const language = data.language || 'zh-CN';
  label.textContent = data.label;
  title.textContent = data.title;
  message.textContent = data.message;
  done.textContent = text(language, 'done');
  snooze.textContent = text(language, 'snooze', { minutes: String(data.snoozeMinutes) });
  close.setAttribute('aria-label', text(language, 'close'));
});

done.addEventListener('click', () => {
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
