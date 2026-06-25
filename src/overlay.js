const params = new URLSearchParams(window.location.search);
const reminderId = params.get('reminderId') || 'stretch';
const label = document.getElementById('label');
const title = document.getElementById('title');
const message = document.getElementById('message');
const done = document.getElementById('done');
const snooze = document.getElementById('snooze');
const close = document.getElementById('close');

const titles = {
  stretch: 'Stretch break',
  walk: 'Walk outside',
};

window.catReminder.onReminderData((data) => {
  label.textContent = data.label;
  title.textContent = titles[data.id] || 'Time to move';
  message.textContent = data.message;
  snooze.textContent = `${data.snoozeMinutes} later`;
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
