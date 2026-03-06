import type { RoomSummary } from "./protocol";

type RoomsBrowserHandlers = {
  onCreateRoom: (name: string, maxPlayers: number) => void;
  onJoinRoom: (roomId: string) => void;
  onRefreshRooms: () => void;
  onOpenOptions: () => void;
  onHowToPlay: () => void;
};

export type RoomsBrowserController = {
  setRooms: (rooms: RoomSummary[], joinedRoomId: string | null) => void;
  setError: (msg: string) => void;
  setVisible: (visible: boolean) => void;
};

export function initRoomsBrowserUI(handlers: RoomsBrowserHandlers): RoomsBrowserController {
  const root = document.getElementById("rooms-browser");
  const roomsListEl = document.getElementById("rooms-list");
  const roomNameInput = document.getElementById("room-name-input") as HTMLInputElement | null;
  const createRoomBtn = document.getElementById("create-room-btn") as HTMLButtonElement | null;
  const refreshRoomsBtn = document.getElementById("refresh-rooms-btn") as HTMLButtonElement | null;
  const optionsBtn = document.getElementById("rooms-options-btn") as HTMLButtonElement | null;
  const howToPlayBtn = document.getElementById("rooms-how-to-play-btn") as HTMLButtonElement | null;
  const roomsErrorEl = document.getElementById("rooms-error");

  if (!root || !roomsListEl || !roomNameInput || !createRoomBtn || !refreshRoomsBtn || !optionsBtn || !roomsErrorEl) {
    throw new Error("rooms browser DOM is missing required elements");
  }

  let clearErrorTimer: number | null = null;

  createRoomBtn.addEventListener("click", () => {
    const name = roomNameInput.value.trim();
    handlers.onCreateRoom(name, 6);
  });

  refreshRoomsBtn.addEventListener("click", () => {
    handlers.onRefreshRooms();
  });

  optionsBtn.addEventListener("click", () => {
    handlers.onOpenOptions();
  });

  if (howToPlayBtn) {
    howToPlayBtn.disabled = false;
    howToPlayBtn.addEventListener("click", () => {
      handlers.onHowToPlay();
    });
  }

  return {
    setRooms(rooms, joinedRoomId) {
      roomsListEl.innerHTML = "";
      if (rooms.length === 0) {
        roomsListEl.innerHTML = `<div class="room-row"><div>No rooms yet.</div><div></div><div></div><div></div></div>`;
        return;
      }

      for (const room of rooms) {
        const statusLabel =
          room.status === "open" ? "Lobby" :
          room.status === "starting" ? "Starting..." :
          room.status === "in_game" ? "In game" :
          room.status === "finished" ? "Game finished" :
          room.status;
        const canJoin = room.status === "open";
        const row = document.createElement("div");
        row.className = "room-row";
        const youTag = joinedRoomId === room.id ? " (You)" : "";
        row.innerHTML = `
          <div>${room.name}${youTag}</div>
          <div>${room.playerCount}/${room.maxPlayers}</div>
          <div>${statusLabel}</div>
          <button data-room-id="${room.id}" ${canJoin ? "" : "disabled"}>Join</button>
        `;

        const btn = row.querySelector("button");
        if (btn) {
          btn.addEventListener("click", () => handlers.onJoinRoom(room.id));
        }
        roomsListEl.appendChild(row);
      }
    },
    setError(msg) {
      roomsErrorEl.textContent = msg;
      if (clearErrorTimer !== null) {
        window.clearTimeout(clearErrorTimer);
        clearErrorTimer = null;
      }
      if (msg.trim().length > 0) {
        clearErrorTimer = window.setTimeout(() => {
          roomsErrorEl.textContent = "";
          clearErrorTimer = null;
        }, 5000);
      }
    },
    setVisible(visible) {
      root.style.display = visible ? "flex" : "none";
    },
  };
}
