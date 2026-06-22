const cat = document.getElementById('cat');

let clickTimer = null;
let drag = null;
let suppressClickUntil = 0;

cat.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  if (Date.now() > suppressClickUntil) {
    window.catReminder.openStatus();
  }
});

cat.addEventListener('click', () => {
  if (Date.now() <= suppressClickUntil) return;
  clearTimeout(clickTimer);
  clickTimer = window.setTimeout(() => {
    cat.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-5px)' },
        { transform: 'translateY(0)' },
      ],
      { duration: 260, easing: 'steps(2, end)' },
    );
  }, 180);
});

cat.addEventListener('pointerdown', (event) => {
  cat.setPointerCapture(event.pointerId);
  drag = {
    lastX: event.screenX,
    lastY: event.screenY,
    moved: false,
  };
});

cat.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const deltaX = event.screenX - drag.lastX;
  const deltaY = event.screenY - drag.lastY;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 1) return;

  drag.moved = true;
  drag.lastX = event.screenX;
  drag.lastY = event.screenY;
  window.catReminder.dragPet(deltaX, deltaY);
});

cat.addEventListener('pointerup', () => {
  if (drag?.moved) {
    suppressClickUntil = Date.now() + 260;
  }
  window.setTimeout(() => {
    drag = null;
  }, 0);
});

cat.addEventListener('pointercancel', () => {
  drag = null;
});

window.catReminder.onPetAlert(() => {
  cat.classList.add('alert');
});

window.catReminder.onPetCalm(() => {
  cat.classList.remove('alert');
});
