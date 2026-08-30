/**
 * Password strength meter + show/hide toggle.
 * Vanilla-JS port of the password-input-2 React component pattern, adapted
 * to this project's plain HTML/JS/Supabase stack (no React/Tailwind here).
 *
 * Usage: attachPasswordStrength('newPass');
 * Call this after the DOM is ready, once per password input you want the
 * meter attached to. Safe to call on multiple inputs on the same page.
 */

const PW_REQUIREMENTS = [
  { key: 'length',  regex: /.{8,}/,                  text: 'At least 8 characters' },
  { key: 'number',  regex: /[0-9]/,                  text: 'At least 1 number' },
  { key: 'lower',   regex: /[a-z]/,                  text: 'At least 1 lowercase letter' },
  { key: 'upper',   regex: /[A-Z]/,                  text: 'At least 1 uppercase letter' },
  { key: 'special', regex: /[!-\/:-@[-`{-~]/,        text: 'At least 1 special character' },
];

const PW_STRENGTH_TEXT = {
  0: 'Enter a password',
  1: 'Weak password',
  2: 'Medium password',
  3: 'Strong password',
  4: 'Very strong password',
  5: 'Excellent password',
};

const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.8 21.8 0 015.06-6.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.8 21.8 0 01-3.22 4.53M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function attachPasswordStrength(inputId, options) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.dataset.pwStrengthAttached) return; // avoid double-attaching if called more than once
  input.dataset.pwStrengthAttached = 'true';

  const opts = Object.assign({ showChecklist: true }, options);

  // --- Wrap the input so we can position a show/hide toggle over it ---
  const wrap = document.createElement('div');
  wrap.className = 'pw-input-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pw-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Show password');
  toggleBtn.innerHTML = EYE_ICON;
  toggleBtn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggleBtn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
    toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  wrap.appendChild(toggleBtn);

  // --- Strength meter + checklist, inserted right after the wrapper ---
  const block = document.createElement('div');
  block.className = 'pw-strength-block';

  const bars = document.createElement('div');
  bars.className = 'pw-bars';
  for (let i = 1; i <= 5; i++) {
    const bar = document.createElement('span');
    bar.className = 'pw-bar';
    bar.dataset.i = i;
    bars.appendChild(bar);
  }
  block.appendChild(bars);

  const label = document.createElement('p');
  label.className = 'pw-strength-label';
  label.innerHTML = '<span>Must contain:</span><span class="pw-strength-text">Enter a password</span>';
  block.appendChild(label);

  let listItems = {};
  if (opts.showChecklist) {
    const list = document.createElement('ul');
    list.className = 'pw-rules';
    list.setAttribute('aria-label', 'Password requirements');
    PW_REQUIREMENTS.forEach(req => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="pw-icon">' + X_ICON + '</span><span>' + req.text + '</span>';
      list.appendChild(li);
      listItems[req.key] = li;
    });
    block.appendChild(list);
  }

  wrap.parentNode.insertBefore(block, wrap.nextSibling);

  function update() {
    const value = input.value;
    let score = 0;

    PW_REQUIREMENTS.forEach(req => {
      const met = req.regex.test(value);
      if (met) score++;
      if (listItems[req.key]) {
        listItems[req.key].classList.toggle('pass', met);
        listItems[req.key].querySelector('.pw-icon').innerHTML = met ? CHECK_ICON : X_ICON;
      }
    });

    bars.querySelectorAll('.pw-bar').forEach(bar => {
      const i = Number(bar.dataset.i);
      bar.className = 'pw-bar' + (i <= score ? ' pw-bar-' + score : '');
    });

    label.querySelector('.pw-strength-text').textContent = value
      ? PW_STRENGTH_TEXT[score]
      : PW_STRENGTH_TEXT[0];
  }

  input.addEventListener('input', update);
  update();
}
