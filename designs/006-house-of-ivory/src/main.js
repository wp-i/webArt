// Native links and details work without JavaScript. This adds menu dismissal.
const menu = document.querySelector('.mobile-nav');
const menuButton = menu.querySelector('summary');
const closeMenu = (returnFocus = false) => {
  if (!menu.open) return;
  menu.open = false;
  if (returnFocus) menuButton.focus();
};

menu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => closeMenu());
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu(true);
});
document.addEventListener('pointerdown', event => {
  if (!menu.contains(event.target)) closeMenu();
});
menu.addEventListener('focusout', event => {
  if (!menu.contains(event.relatedTarget)) closeMenu();
});
const desktop = matchMedia('(min-width: 701px)');
desktop.addEventListener('change', event => {
  if (event.matches) closeMenu();
});
document.documentElement.classList.add('enhanced');
