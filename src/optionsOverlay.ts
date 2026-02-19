import type { KeyMap } from "./KeyboardController";

export type ControlAction = keyof KeyMap;
export type MusicChoice = "random" | "puzzler" | "happy" | "epic";

export type ControlsState = Record<ControlAction, string>;

export type RebindConflict = {
  action: ControlAction;
  conflictsWith: ControlAction;
  key: string;
};

type OptionsOverlayArgs = {
  controls: ControlsState;
  musicChoice: MusicChoice;
  musicVolume: number;
  sfxVolume: number;
  onOpenChange: (open: boolean) => void;
  onApplyRebind: (action: ControlAction, key: string) => void;
  onCancelRebind: () => void;
  onMusicChoiceChange: (choice: MusicChoice) => void;
  onMusicVolumeChange: (value: number) => void;
  onSfxVolumeChange: (value: number) => void;
  onResetControls: () => void;
};

export type OptionsOverlayController = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  setControls: (controls: ControlsState) => void;
  setMusicChoice: (choice: MusicChoice) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  setRebindPending: (action: ControlAction | null) => void;
  setRebindConflict: (conflict: RebindConflict | null) => void;
};

const ACTION_LABELS: Record<ControlAction, string> = {
  up: "Move Up",
  down: "Move Down",
  left: "Move Left",
  right: "Move Right",
  action: "Action",
  changeItem: "Change Item",
  useItem: "Use Item",
};

const ACTIONS: ControlAction[] = ["up", "down", "left", "right", "action", "changeItem", "useItem"];

export function initOptionsOverlay(args: OptionsOverlayArgs): OptionsOverlayController {
  const root = mustGetById<HTMLElement>("options-overlay");
  const dialog = mustGetById<HTMLElement>("options-dialog");
  const closeBtn = mustGetById<HTMLButtonElement>("options-close-btn");
  const tabControlsBtn = mustGetById<HTMLButtonElement>("options-tab-controls-btn");
  const tabAudioBtn = mustGetById<HTMLButtonElement>("options-tab-audio-btn");
  const controlsTab = mustGetById<HTMLElement>("options-controls-tab");
  const audioTab = mustGetById<HTMLElement>("options-audio-tab");
  const warningEl = mustGetById<HTMLElement>("options-controls-warning");
  const controlsListEl = mustGetById<HTMLElement>("options-controls-list");
  const resetBtn = mustGetById<HTMLButtonElement>("options-controls-reset-btn");
  const musicChoiceButtonsRoot = mustGetById<HTMLElement>("options-music-choice-buttons");
  const musicVolumeRange = mustGetById<HTMLInputElement>("options-music-volume-range");
  const sfxVolumeRange = mustGetById<HTMLInputElement>("options-sfx-volume-range");
  const musicVolumeValue = mustGetById<HTMLElement>("options-music-volume-value");
  const sfxVolumeValue = mustGetById<HTMLElement>("options-sfx-volume-value");

  let isOpen = false;
  let activeTab: "controls" | "audio" = "controls";
  let controls = { ...args.controls };
  let rebindPending: ControlAction | null = null;
  let rebindConflict: RebindConflict | null = null;

  const rowEls = new Map<ControlAction, HTMLElement>();
  const keyEls = new Map<ControlAction, HTMLElement>();
  const musicButtons = new Map<MusicChoice, HTMLButtonElement>();

  function formatKey(key: string): string {
    if (key === " ") return "Space";
    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function setTab(tab: "controls" | "audio"): void {
    activeTab = tab;
    const controlsOn = tab === "controls";
    controlsTab.style.display = controlsOn ? "block" : "none";
    audioTab.style.display = controlsOn ? "none" : "block";
    tabControlsBtn.classList.toggle("selected", controlsOn);
    tabAudioBtn.classList.toggle("selected", !controlsOn);
  }

  function updateWarning(): void {
    if (rebindConflict) {
      warningEl.textContent = `Conflict: "${formatKey(rebindConflict.key)}" is assigned to ${ACTION_LABELS[rebindConflict.action]} and ${ACTION_LABELS[rebindConflict.conflictsWith]}.`;
      warningEl.style.visibility = "visible";
      warningEl.classList.add("visible");
      return;
    }
    if (rebindPending) {
      warningEl.textContent = `Press a key for ${ACTION_LABELS[rebindPending]}. Press Escape to cancel.`;
      warningEl.style.visibility = "visible";
      warningEl.classList.remove("visible");
      return;
    }
    warningEl.textContent = "";
    warningEl.style.visibility = "hidden";
    warningEl.classList.remove("visible");
  }

  function renderControlsRows(): void {
    for (const action of ACTIONS) {
      const row = rowEls.get(action);
      const keyLabel = keyEls.get(action);
      if (!row || !keyLabel) continue;

      keyLabel.textContent = formatKey(controls[action]);

      const inConflict = !!rebindConflict && (rebindConflict.action === action || rebindConflict.conflictsWith === action);
      row.classList.toggle("conflict", inConflict);
      row.classList.toggle("pending", rebindPending === action);
    }
    updateWarning();
  }

  function setVolumeLabel(el: HTMLElement, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    el.textContent = `${Math.round(clamped * 100)}%`;
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    rebindPending = null;
    rebindConflict = null;
    renderControlsRows();
    root.style.display = "none";
    args.onOpenChange(false);
  }

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    root.style.display = "flex";
    args.onOpenChange(true);
    closeBtn.focus();
  }

  for (const action of ACTIONS) {
    const row = document.createElement("div");
    row.className = "options-control-row";

    const label = document.createElement("span");
    label.className = "options-control-label";
    label.textContent = ACTION_LABELS[action];

    const keyLabel = document.createElement("span");
    keyLabel.className = "options-control-key";

    const bindBtn = document.createElement("button");
    bindBtn.textContent = "Rebind";
    bindBtn.addEventListener("click", () => {
      rebindConflict = null;
      rebindPending = action;
      renderControlsRows();
    });

    row.appendChild(label);
    row.appendChild(keyLabel);
    row.appendChild(bindBtn);
    controlsListEl.appendChild(row);
    rowEls.set(action, row);
    keyEls.set(action, keyLabel);
  }

  closeBtn.addEventListener("click", close);
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  dialog.addEventListener("click", (e) => e.stopPropagation());

  tabControlsBtn.addEventListener("click", () => setTab("controls"));
  tabAudioBtn.addEventListener("click", () => setTab("audio"));

  resetBtn.addEventListener("click", () => {
    rebindPending = null;
    rebindConflict = null;
    args.onResetControls();
  });

  for (const btn of Array.from(musicChoiceButtonsRoot.querySelectorAll<HTMLButtonElement>("button[data-choice]"))) {
    const choice = btn.dataset.choice as MusicChoice;
    if (!choice) continue;
    musicButtons.set(choice, btn);
    btn.addEventListener("click", () => {
      args.onMusicChoiceChange(choice);
    });
  }

  musicVolumeRange.addEventListener("input", () => {
    const value = Number(musicVolumeRange.value) / 100;
    setVolumeLabel(musicVolumeValue, value);
    args.onMusicVolumeChange(value);
  });

  sfxVolumeRange.addEventListener("input", () => {
    const value = Number(sfxVolumeRange.value) / 100;
    setVolumeLabel(sfxVolumeValue, value);
    args.onSfxVolumeChange(value);
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isOpen) return;

      if (rebindPending) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          rebindPending = null;
          rebindConflict = null;
          args.onCancelRebind();
          renderControlsRows();
          return;
        }
        args.onApplyRebind(rebindPending, e.key);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    true,
  );

  setTab(activeTab);
  setVolumeLabel(musicVolumeValue, args.musicVolume);
  setVolumeLabel(sfxVolumeValue, args.sfxVolume);
  musicVolumeRange.value = String(Math.round(args.musicVolume * 100));
  sfxVolumeRange.value = String(Math.round(args.sfxVolume * 100));
  setMusicChoiceButtons(args.musicChoice);
  renderControlsRows();
  close();

  return {
    open,
    close,
    isOpen: () => isOpen,
    setControls(nextControls) {
      controls = { ...nextControls };
      renderControlsRows();
    },
    setMusicChoice(choice) {
      setMusicChoiceButtons(choice);
    },
    setMusicVolume(value) {
      musicVolumeRange.value = String(Math.round(Math.max(0, Math.min(1, value)) * 100));
      setVolumeLabel(musicVolumeValue, value);
    },
    setSfxVolume(value) {
      sfxVolumeRange.value = String(Math.round(Math.max(0, Math.min(1, value)) * 100));
      setVolumeLabel(sfxVolumeValue, value);
    },
    setRebindPending(action) {
      rebindPending = action;
      renderControlsRows();
    },
    setRebindConflict(conflict) {
      rebindConflict = conflict;
      renderControlsRows();
    },
  };

  function setMusicChoiceButtons(choice: MusicChoice): void {
    for (const [key, btn] of musicButtons) {
      btn.classList.toggle("selected", key === choice);
    }
  }
}

function mustGetById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("options overlay DOM is missing required elements");
  return el as T;
}
