// Emoji picker for the compose boxes. Emojis are plain Unicode text, so they post on every platform.
(() => {
  const SETS = {
    'Diwali': ['🪔','🎆','🎇','✨','🎉','🎊','🪙','💰','🙏','🕉️','🏠','🌟','🎁','🍬','🧨','🌸','🌼','🏵️','🌺','❤️','🧡','💛','🛍️','👗','🥻','🍫','🍪','🥮','🫙','🕯️','🎶','🏮','💫','⭐','🌙','🔔','🪷','🛕','🤝','🫂','👨‍👩‍👧‍👦','😊','🥳','💐'],
    'Festivals': ['🎄','🎅','🎁','🥂','🍾','🎊','🎈','🎂','🕌','🌙','⭐','🕍','🪁','🌈','🎨','💦','🌾','🐘','🐅','🚩','🇮🇳','🧿','🪔','🔱','🛕','🙏','🪷','🌸','🎭','🥁','🎵','🎶','🎤','🧧','🎆','🎇','🎃','🐰','🥚','🌷','☀️','🌻'],
    'Faces': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','😉','😍','🥰','😘','😗','😋','😎','🤩','🥳','😇','🤗','🤔','🤝','😌','😴','😏','😬','🙃','😮','😲','😳','🥺','😢','😭','😤','😡','🤯','🤒','🥵','🥶','😱','🤫','🤭','😜','🤪'],
    'Hands': ['👍','👏','🙌','🙏','💪','🤝','👌','✌️','🤞','👋','👉','👈','👇','☝️','🤙','🫶','🤲','🫰','🤟','🖐️','✋','🖖','👊','✊','🤛','🤜','🙋','🙆','💁','🤷','🕺','💃','🚶','🏃','👨‍💼','👩‍💼','👨‍🍳','👩‍🍳','🧑‍🔧','🧑‍⚕️'],
    'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💗','💓','💞','💕','💝','💘','💟','❣️','💔','❤️‍🔥','💯','🔥','⭐','🌟','💥','✨','⚡','🌈','🎀','🌹','🌷','🌺','🌻','🌼','🪻','🌸'],
    'Business': ['📢','📣','✅','☑️','📌','📍','📞','☎️','📱','💻','✉️','📧','🌐','💼','📈','📊','🏆','🥇','🎯','⏰','⏳','🗓️','📅','🛒','🏷️','🆕','🔔','💳','💵','💸','🧾','📦','🚚','🏪','🏢','🏭','🔑','🔒','📝','📋','📎','🖊️','🤝','🙏','🔖','🆓','🔥','❗','‼️','⚠️'],
    'Offer': ['🛍️','🛒','🏷️','💥','🔥','🎁','🎉','🆕','🆓','💯','💰','💸','🤑','🪙','💳','🧾','📣','📢','⏰','⏳','⚡','✅','👉','👇','🔔','🎯','🏆','⭐','🌟','✨','‼️','❗','🚨','📍','📞','📱','🚚','🏃','🎟️','🎫','🧧','🏅'],
    'Food': ['🍬','🍫','🍭','🍪','🍩','🍰','🎂','🧁','🥮','🍯','🥜','🍿','🍕','🍔','🍟','🌭','🌮','🌯','🥗','🍜','🍝','🍛','🍲','🍚','🍙','🍘','🥘','🥟','🥞','🧇','🍞','🥐','🧀','🍎','🍌','🍇','🍉','🍊','🥭','🍍','🥥','☕','🍵','🥛','🥤','🧃','🍹','🍷','🥂','🍾'],
    'Nature': ['🌸','🌺','🌻','🌼','🌷','🌹','🪷','🏵️','💐','🌿','🍀','🌱','🌳','🌴','🌵','🍁','🍂','🍃','🌾','☀️','🌤️','⛅','🌈','🌙','⭐','🌟','✨','⚡','🔥','💧','🌊','❄️','🐘','🦚','🦋','🐝','🐞','🐶','🐱','🐄','🐅','🦁','🐒','🐦'],
    'Symbols': ['✅','❌','⭕','❗','❓','‼️','⚠️','🚫','➡️','⬅️','⬆️','⬇️','↗️','🔝','🔜','🔚','➕','➖','✖️','♻️','🔱','🕉️','☮️','♾️','🆗','🆒','🆕','🆓','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','▶️','⏸️','🔁','💬','💭','🗯️','©️','®️','™️'],
  };

  const css = document.createElement('style');
  css.textContent = `
    .emo-bar { margin: 0 0 6px; }
    .emo-panel { border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin-bottom: 8px; background: var(--card); }
    .emo-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .emo-tabs button { padding: 3px 10px; font-size: 13px; }
    .emo-tabs button.on { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
    .emo-grid { display: flex; flex-wrap: wrap; gap: 4px; max-height: 260px; overflow-y: auto; }
    .emo-grid button { border: 0; background: transparent; font-size: 32px; padding: 4px 6px; line-height: 1.1; min-width: 46px; }
    .emo-grid button:hover { background: var(--bg); }
  `;
  document.head.appendChild(css);

  const main = document.getElementById('c-text');
  if (!main) return;
  let target = main;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t === main || (t.tagName === 'TEXTAREA' && t.closest('#c-captions'))) target = t;
  });

  const bar = document.createElement('div');
  bar.className = 'emo-bar';
  bar.innerHTML = '<button type="button" id="emo-toggle">😀 Emoji</button>';
  const panel = document.createElement('div');
  panel.className = 'emo-panel hidden';
  panel.innerHTML = '<div class="emo-tabs"></div><div class="emo-grid"></div>';
  main.parentNode.insertBefore(bar, main);
  main.parentNode.insertBefore(panel, main);

  const tabs = panel.querySelector('.emo-tabs');
  const grid = panel.querySelector('.emo-grid');

  function insert(ch) {
    const ta = target || main;
    const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    const e = ta.selectionEnd == null ? s : ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + ch + ta.value.slice(e);
    const pos = s + ch.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true })); // saves draft + updates counts
  }

  function showSet(name) {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.set === name));
    grid.innerHTML = '';
    for (const ch of SETS[name]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ch;
      b.onmousedown = (ev) => ev.preventDefault(); // keep cursor in the text box
      b.onclick = () => insert(ch);
      grid.appendChild(b);
    }
  }
  for (const name of Object.keys(SETS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.set = name;
    b.textContent = name;
    b.onclick = () => showSet(name);
    tabs.appendChild(b);
  }
  showSet('Diwali');

  document.getElementById('emo-toggle').onclick = () => panel.classList.toggle('hidden');
})();
