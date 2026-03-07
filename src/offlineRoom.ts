// offlineRoom.ts
// UI controller for the "Offline Room" screen — lets players configure
// their color/name before a local game starts.

import type { Role, Model } from './protocol';
import type { BotDifficulty, OfflinePlayerConfig } from './localServer';

const COLOR_ROLES: Role[] = ['goldBot', 'pinkBot', 'whiteBot', 'blackBot'];
const DEFAULT_MODEL: Model = 'alphanoid';
const MAX_PLAYERS = 4;
const MAX_HUMANS  = 2;

type SlotType = 'human' | 'bot';

type Slot = {
  type: SlotType;
  role: Role;
  name: string;
  difficulty: BotDifficulty; // ignored for humans
};

function defaultNameForSlot(idx: number, type: SlotType, difficulty: BotDifficulty): string {
  if (type === 'human') return `Player ${idx + 1}`;
  const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  return `${label} Bot`;
}

export type OfflineRoomHandlers = {
  onStart: (configs: OfflinePlayerConfig[]) => void;
  onBack: () => void;
};

export type OfflineRoomController = {
  show: () => void;
  hide: () => void;
};

export function initOfflineRoomUI(handlers: OfflineRoomHandlers): OfflineRoomController {
  const root = document.getElementById('offline-room')!;
  const backBtn  = document.getElementById('offline-room-back-btn')  as HTMLButtonElement;
  const startBtn = document.getElementById('offline-room-start-btn') as HTMLButtonElement;
  const slotsEl  = document.getElementById('offline-room-slots')!;

  // ── State ────────────────────────────────────────────────────────────────────
  let slots: (Slot | null)[] = [null, null, null, null];

  // Seed with one human player in slot 0.
  slots[0] = { type: 'human', role: 'pinkBot', name: 'Player 1', difficulty: 'easy' };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function humanCount(): number {
    return slots.filter(s => s?.type === 'human').length;
  }
  function playerCount(): number {
    return slots.filter(s => s !== null).length;
  }
  function takenRoles(): Set<Role> {
    const taken = new Set<Role>();
    for (const s of slots) if (s) taken.add(s.role);
    return taken;
  }
  function nextFreeRole(): Role | null {
    const taken = takenRoles();
    return COLOR_ROLES.find(r => !taken.has(r)) ?? null;
  }

  function addSlot(idx: number, type: SlotType, difficulty: BotDifficulty): void {
    if (playerCount() >= MAX_PLAYERS) return;
    if (type === 'human' && humanCount() >= MAX_HUMANS) return;
    const role = nextFreeRole();
    if (!role) return;
    const name = defaultNameForSlot(idx, type, difficulty);
    slots[idx] = { type, role, name, difficulty };
    render();
  }

  function removeSlot(idx: number): void {
    slots[idx] = null;
    render();
  }

  function setSlotRole(idx: number, role: Role): void {
    const slot = slots[idx];
    if (!slot) return;
    // Swap roles if role is taken by another slot.
    for (let i = 0; i < 4; i++) {
      if (i !== idx && slots[i]?.role === role) {
        slots[i]!.role = slot.role;
        break;
      }
    }
    slot.role = role;
    render();
  }

  function setSlotName(idx: number, name: string): void {
    const slot = slots[idx];
    if (slot) slot.name = name;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(): void {
    slotsEl.innerHTML = '';
    const taken = takenRoles();

    for (let i = 0; i < MAX_PLAYERS; i++) {
      const slot = slots[i];
      const panel = document.createElement('div');
      panel.className = 'offline-slot';

      if (!slot) {
        // Empty slot: add buttons.
        panel.classList.add('empty');
        const canAddHuman = humanCount() < MAX_HUMANS && playerCount() < MAX_PLAYERS && nextFreeRole() !== null;
        const canAddBot   = playerCount() < MAX_PLAYERS && nextFreeRole() !== null;

        if (canAddHuman) {
          panel.appendChild(makeAddBtn('+ Human', () => addSlot(i, 'human', 'easy')));
        }
        if (canAddBot) {
          panel.appendChild(makeAddBtn('+ Easy Bot',   () => addSlot(i, 'bot', 'easy')));
          panel.appendChild(makeAddBtn('+ Normal Bot', () => addSlot(i, 'bot', 'normal')));
          panel.appendChild(makeAddBtn('+ Hard Bot',   () => addSlot(i, 'bot', 'hard')));
        }
        if (!canAddHuman && !canAddBot) {
          const msg = document.createElement('div');
          msg.className = 'offline-slot-full-msg';
          msg.textContent = playerCount() >= MAX_PLAYERS ? 'Max players reached' : 'No colors available';
          panel.appendChild(msg);
        }
      } else {
        // Occupied slot.
        panel.classList.add('occupied');
        panel.classList.add(slot.role); // for color styling

        // Header row: type label + remove button.
        const header = document.createElement('div');
        header.className = 'offline-slot-header';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'offline-slot-type';
        if (slot.type === 'human') {
          const humanIdx = slots.slice(0, i + 1).filter(s => s?.type === 'human').length;
          const keyHint  = humanIdx === 1 ? 'Arrow Keys' : 'WASD';
          typeLabel.textContent = `Player ${humanIdx} (${keyHint})`;
        } else {
          const label = slot.difficulty.charAt(0).toUpperCase() + slot.difficulty.slice(1);
          typeLabel.textContent = `${label} Bot`;
        }
        header.appendChild(typeLabel);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'offline-slot-remove';
        removeBtn.textContent = '✕';
        // Don't allow removing last player.
        removeBtn.disabled = playerCount() <= 1;
        removeBtn.addEventListener('click', () => removeSlot(i));
        header.appendChild(removeBtn);
        panel.appendChild(header);

        // Name input.
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'offline-slot-name';
        nameInput.value = slot.name;
        nameInput.maxLength = 20;
        nameInput.addEventListener('input', () => setSlotName(i, nameInput.value.trim() || slot.name));
        panel.appendChild(nameInput);

        // Color selector.
        const colorRow = document.createElement('div');
        colorRow.className = 'offline-slot-colors';
        for (const role of COLOR_ROLES) {
          const btn = document.createElement('button');
          btn.className = `offline-color-btn ${role}`;
          btn.dataset.role = role;
          btn.textContent = roleName(role);
          btn.classList.toggle('selected', slot.role === role);
          // Disable if taken by another slot (swap happens automatically).
          btn.addEventListener('click', () => setSlotRole(i, role));
          colorRow.appendChild(btn);
        }
        panel.appendChild(colorRow);
      }

      slotsEl.appendChild(panel);
    }

    // Update Start button.
    startBtn.disabled = playerCount() === 0;
  }

  function makeAddBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'offline-add-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function roleName(role: Role): string {
    switch (role) {
      case 'goldBot':  return 'Gold';
      case 'pinkBot':  return 'Pink';
      case 'whiteBot': return 'White';
      case 'blackBot': return 'Black';
      default: return role;
    }
  }

  // ── Wire buttons ─────────────────────────────────────────────────────────────
  backBtn.addEventListener('click', () => handlers.onBack());

  startBtn.addEventListener('click', () => {
    const configs: OfflinePlayerConfig[] = [];
    let idCounter = 1;
    for (const slot of slots) {
      if (!slot) continue;
      configs.push({
        id: idCounter++,
        name: slot.name.trim() || defaultNameForSlot(configs.length, slot.type, slot.difficulty),
        role: slot.role,
        model: DEFAULT_MODEL,
        isHuman: slot.type === 'human',
        difficulty: slot.difficulty,
      });
    }
    handlers.onStart(configs);
  });

  // Initial render.
  render();

  return {
    show() { root.style.display = 'flex'; render(); },
    hide() { root.style.display = 'none'; },
  };
}
