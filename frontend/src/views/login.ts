// ============================================================
// Login Page View
// ============================================================

import { login } from '../auth';

export function renderLoginView(container: HTMLElement): void {
  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'login-page';

  page.innerHTML = `
    <div class="login-card">
      <div class="login-card__brand">NEXUS<span class="login-card__brand-dot">.</span></div>
      <p class="login-card__subtitle">Sign in to continue</p>
      <button class="login-card__btn" id="login-btn">Continue with WorkOS</button>
    </div>
  `;

  container.appendChild(page);

  const btn = page.querySelector('#login-btn');
  btn?.addEventListener('click', () => {
    login();
  });
}
