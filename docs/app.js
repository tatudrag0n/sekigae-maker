(() => {
  'use strict';

  const STORAGE_KEY = 'sekigae-maker.v1';
  const MIN_COUNT = 1;
  const MAX_COUNT = 60;
  const MIN_COLS = 1;
  const MAX_COLS = 10;
  const DEFAULT_COUNT = 24;
  const DEFAULT_COLS = 6;
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

  const els = {
    grid: document.getElementById('seatGrid'),
    count: document.getElementById('countInput'),
    cols: document.getElementById('colsInput'),
    summary: document.getElementById('layoutSummary'),
    cheatBadge: document.getElementById('cheatBadge'),
    toast: document.getElementById('toast'),
    hint: document.getElementById('hint'),
    warn: document.getElementById('warn'),
    settings: document.getElementById('settings'),
    settingsToggle: document.getElementById('settingsToggle'),
    shuffle: document.getElementById('shuffleBtn'),
    reset: document.getElementById('resetBtn'),
  };

  let state = loadState();
  let cheat = false;
  let konamiIndex = 0;
  let toastTimer = 0;
  let drag = null;

  /* ---------------- state ---------------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toInt(value, fallback) {
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function defaultSeats(count) {
    return Array.from({ length: count }, (_, index) => String(index + 1));
  }

  function nextFreeNumber(seats, limit) {
    const used = new Set(seats.filter((value) => value !== ''));
    const ceiling = Math.max(limit, seats.length + 1, 1);
    for (let candidate = 1; candidate <= ceiling + 1; candidate += 1) {
      if (!used.has(String(candidate))) return String(candidate);
    }
    return '';
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const count = clamp(toInt(source.count, DEFAULT_COUNT), MIN_COUNT, MAX_COUNT);
    const cols = clamp(toInt(source.cols, DEFAULT_COLS), MIN_COLS, MAX_COLS);
    const rawSeats = Array.isArray(source.seats) ? source.seats : [];
    const seats = rawSeats
      .slice(0, count)
      .map((value) => String(value == null ? '' : value).slice(0, 4));
    while (seats.length < count) seats.push(nextFreeNumber(seats, count));
    return { count, cols, seats };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (error) {
      /* storage may be unavailable or hold invalid data */
    }
    return { count: DEFAULT_COUNT, cols: DEFAULT_COLS, seats: defaultSeats(DEFAULT_COUNT) };
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* ignore quota / privacy mode errors */
    }
  }

  /* ---------------- rendering ---------------- */

  function createSeat(value, index, animate) {
    const empty = value === '';
    const seat = document.createElement('div');
    seat.className = 'seat'
      + (empty ? ' is-empty' : '')
      + (!empty && value.length > 2 ? ' is-long' : '');
    seat.dataset.index = String(index);
    seat.tabIndex = 0;
    seat.setAttribute('role', 'button');
    seat.setAttribute('aria-label', '席' + (index + 1) + ' 出席番号' + (empty ? 'なし' : value));
    if (cheat) seat.title = 'タップして番号を指定';
    if (animate) seat.style.setProperty('--i', String(index));

    const position = document.createElement('span');
    position.className = 'seat-pos';
    position.textContent = '席' + (index + 1);

    const number = document.createElement('span');
    number.className = 'seat-num';
    number.textContent = empty ? '—' : value;

    seat.append(position, number);
    return seat;
  }

  function render(options) {
    const animate = Boolean(options && options.animate);
    els.grid.style.setProperty('--cols', String(state.cols));

    const fragment = document.createDocumentFragment();
    state.seats.forEach((value, index) => {
      fragment.appendChild(createSeat(value, index, animate));
    });
    els.grid.replaceChildren(fragment);

    if (animate) {
      els.grid.classList.remove('shuffling');
      void els.grid.offsetWidth;
      els.grid.classList.add('shuffling');
    }

    if (document.activeElement !== els.count) els.count.value = String(state.count);
    if (document.activeElement !== els.cols) els.cols.value = String(state.cols);

    const rows = Math.ceil(state.count / state.cols);
    els.summary.textContent = rows + '行 × ' + state.cols + '列 ／ ' + state.count + '席';
    els.hint.textContent = cheat
      ? '不正モード中：席をタップして好きな番号を入れられます（重複・範囲外もOK）'
      : '席をドラッグすると入れ替えできます';
    els.cheatBadge.hidden = !cheat;
    document.body.classList.toggle('cheat-mode', cheat);
    renderWarnings();
  }

  function renderWarnings() {
    if (!cheat) {
      els.warn.hidden = true;
      els.warn.textContent = '';
      return;
    }
    const counts = new Map();
    state.seats.forEach((value) => {
      if (value === '') return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    const duplicates = Array.from(counts.entries()).filter(([, total]) => total > 1);
    if (!duplicates.length) {
      els.warn.hidden = true;
      els.warn.textContent = '';
      return;
    }
    els.warn.hidden = false;
    els.warn.textContent = '⚠ 重複しています：'
      + duplicates.map(([value, total]) => value + '（' + total + '席）').join('、');
  }

  function persistAndRender(options) {
    saveState();
    render(options);
  }

  /* ---------------- actions ---------------- */

  function applyCount(raw) {
    const count = clamp(toInt(raw, state.count), MIN_COUNT, MAX_COUNT);
    if (count === state.count) {
      els.count.value = String(state.count);
      return;
    }
    if (count < state.count) {
      state.seats = state.seats.slice(0, count);
    } else {
      while (state.seats.length < count) state.seats.push(nextFreeNumber(state.seats, count));
    }
    state.count = count;
    persistAndRender();
  }

  function applyCols(raw) {
    const cols = clamp(toInt(raw, state.cols), MIN_COLS, MAX_COLS);
    if (cols === state.cols) {
      els.cols.value = String(state.cols);
      return;
    }
    state.cols = cols;
    persistAndRender();
  }

  function shuffleSeats() {
    const values = state.seats.slice();
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    state.seats = values;
    persistAndRender({ animate: true });
    toast(state.count > 1 ? '席替えしました' : '席が1つしかありません');
  }

  function resetSeats() {
    state.seats = defaultSeats(state.count);
    persistAndRender({ animate: true });
    toast('出席番号順に戻しました');
  }

  function swapSeats(a, b) {
    const seats = state.seats;
    [seats[a], seats[b]] = [seats[b], seats[a]];
    persistAndRender();
    [a, b].forEach((index) => {
      const seat = els.grid.querySelector('.seat[data-index="' + index + '"]');
      if (seat) seat.classList.add('just-swapped');
    });
  }

  function setSeatValue(index, value) {
    state.seats[index] = String(value).trim().slice(0, 4);
    persistAndRender();
  }

  function setCheat(next) {
    cheat = next;
    render();
    if (cheat) {
      document.body.classList.remove('cheat-flash');
      void document.body.offsetWidth;
      document.body.classList.add('cheat-flash');
      toast('不正モード ON ／ 席をタップして番号を指定', 'cheat');
    } else {
      toast('不正モード OFF');
    }
  }

  /* ---------------- toast ---------------- */

  function toast(message, variant) {
    els.toast.textContent = message;
    els.toast.classList.remove('is-show', 'is-cheat');
    if (variant === 'cheat') els.toast.classList.add('is-cheat');
    void els.toast.offsetWidth;
    els.toast.classList.add('is-show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-show'), 2600);
  }

  /* ---------------- inline editor ---------------- */

  function openEditor(index) {
    const seat = els.grid.querySelector('.seat[data-index="' + index + '"]');
    if (!seat) return;

    seat.classList.add('editing');
    seat.replaceChildren();

    const position = document.createElement('span');
    position.className = 'seat-pos';
    position.textContent = '席' + (index + 1);

    const input = document.createElement('input');
    input.className = 'seat-input';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.maxLength = 4;
    input.value = state.seats[index];
    input.setAttribute('aria-label', '席' + (index + 1) + 'に割り当てる番号');

    seat.append(position, input);

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      const value = input.value.trim().slice(0, 4);
      setSeatValue(index, value);
      toast('席' + (index + 1) + ' に「' + (value || '空席') + '」を割り当てました', 'cheat');
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      render();
    };

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);

    input.focus({ preventScroll: true });
    input.select();
  }

  /* ---------------- drag & drop ---------------- */

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const seat = event.target.closest('.seat');
    if (!seat || seat.classList.contains('editing') || event.target.closest('.seat-input')) return;

    if (drag) endDrag();

    drag = {
      index: Number(seat.dataset.index),
      seat,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType !== 'mouse',
      active: false,
      cancelled: false,
      ghost: null,
      target: null,
      offsetX: 0,
      offsetY: 0,
      timer: 0,
    };

    if (drag.touch) drag.timer = window.setTimeout(activateDrag, 180);
  }

  function onPointerMove(event) {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;

    current.x = event.clientX;
    current.y = event.clientY;
    const distance = Math.hypot(current.x - current.startX, current.y - current.startY);

    if (!current.active) {
      if (current.touch) {
        if (distance > 12) {
          window.clearTimeout(current.timer);
          current.cancelled = true;
        }
        return;
      }
      if (distance < 8) return;
      activateDrag();
    }

    if (!current.active) return;
    if (event.cancelable) event.preventDefault();
    positionGhost();
    highlightDropTarget();
  }

  function activateDrag() {
    const current = drag;
    if (!current || current.active || current.cancelled) return;

    current.active = true;
    window.clearTimeout(current.timer);

    const rect = current.seat.getBoundingClientRect();
    const ghost = current.seat.cloneNode(true);
    ghost.classList.remove('editing', 'is-dragging');
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    current.offsetX = current.x - rect.left;
    current.offsetY = current.y - rect.top;
    document.body.appendChild(ghost);
    current.ghost = ghost;

    current.seat.classList.add('is-dragging');
    document.body.classList.add('is-dragging-seat');
    positionGhost();
  }

  function positionGhost() {
    const current = drag;
    if (!current || !current.ghost) return;
    const x = current.x - current.offsetX;
    const y = current.y - current.offsetY;
    current.ghost.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) rotate(2deg) scale(1.03)';
  }

  function highlightDropTarget() {
    const current = drag;
    if (!current || !current.active) return;

    const under = document.elementFromPoint(current.x, current.y);
    const seat = under ? under.closest('.seat') : null;
    const next = seat && seat !== current.seat && !seat.classList.contains('drag-ghost') ? seat : null;

    if (current.target && current.target !== next) current.target.classList.remove('drop-target');
    if (next) next.classList.add('drop-target');
    current.target = next;
  }

  function onPointerUp(event) {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;

    window.clearTimeout(current.timer);
    const index = current.index;
    const wasActive = current.active;
    const droppedOn = current.target ? Number(current.target.dataset.index) : null;
    const distance = Math.hypot(current.x - current.startX, current.y - current.startY);
    const cancelled = current.cancelled;
    endDrag();

    if (wasActive) {
      if (droppedOn !== null && droppedOn !== index) swapSeats(index, droppedOn);
      return;
    }
    if (!cancelled && distance < 10 && cheat) openEditor(index);
  }

  function onPointerCancel(event) {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    window.clearTimeout(current.timer);
    endDrag();
  }

  function endDrag() {
    const current = drag;
    if (!current) return;
    window.clearTimeout(current.timer);
    if (current.ghost) current.ghost.remove();
    if (current.target) current.target.classList.remove('drop-target');
    current.seat.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-seat');
    drag = null;
  }

  /* ---------------- keyboard ---------------- */

  function onKeyDown(event) {
    if (event.isComposing) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

    const key = event.key.toLowerCase();
    if (key === KONAMI[konamiIndex]) {
      konamiIndex += 1;
      if (konamiIndex === KONAMI.length) {
        konamiIndex = 0;
        setCheat(!cheat);
      }
    } else {
      konamiIndex = key === KONAMI[0] ? 1 : 0;
    }
  }

  function onGridKeyDown(event) {
    const seat = event.target.closest('.seat');
    if (!seat || seat.classList.contains('editing') || !cheat) return;
    const index = Number(seat.dataset.index);

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(index);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setSeatValue(index, '');
      toast('席' + (index + 1) + ' を空席にしました', 'cheat');
    }
  }

  /* ---------------- wiring ---------------- */

  function init() {
    render();

    els.grid.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    document.addEventListener('touchmove', (event) => {
      if (drag && drag.active && event.cancelable) event.preventDefault();
    }, { passive: false });

    els.grid.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.seat')) event.preventDefault();
    });

    document.addEventListener('keydown', onKeyDown);
    els.grid.addEventListener('keydown', onGridKeyDown);

    document.addEventListener('click', (event) => {
      const stepButton = event.target.closest('[data-step]');
      if (!stepButton) return;
      const step = Number(stepButton.dataset.step);
      if (stepButton.dataset.target === 'count') applyCount(state.count + step);
      else applyCols(state.cols + step);
    });

    els.count.addEventListener('change', () => applyCount(els.count.value));
    els.count.addEventListener('blur', () => applyCount(els.count.value));
    els.count.addEventListener('focus', (event) => event.target.select());

    els.cols.addEventListener('change', () => applyCols(els.cols.value));
    els.cols.addEventListener('blur', () => applyCols(els.cols.value));
    els.cols.addEventListener('focus', (event) => event.target.select());

    els.shuffle.addEventListener('click', shuffleSeats);
    els.reset.addEventListener('click', resetSeats);
    els.cheatBadge.addEventListener('click', () => setCheat(false));

    els.settingsToggle.addEventListener('click', () => {
      const willShow = els.settings.hasAttribute('hidden');
      if (willShow) els.settings.removeAttribute('hidden');
      else els.settings.setAttribute('hidden', '');
      els.settingsToggle.setAttribute('aria-expanded', String(willShow));
    });
  }

  init();
})();
