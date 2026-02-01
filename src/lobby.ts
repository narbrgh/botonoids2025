//lobby.ts

import type {  Role } from './protocol';

export type LobbyEvent = 
| {type: "ready"; ready: boolean; role: Role}
| {type: "name"; name: string }
| {type: "chat"; text: string };

type LobbyState = {
    name: string;
    role: Role;
    ready: boolean;
}

export const lobbyState: LobbyState = {
    name: "",
    role: "randomBot",
    ready: false,
};
export function initLobbyUI(onEvent: (e: LobbyEvent) => void) {
    const nameInput = document.querySelector<HTMLInputElement>("#name-input");
    if (nameInput) {
        nameInput?.addEventListener("input", () => {
            lobbyState.name = nameInput.value;
            onEvent({type: "name", name: nameInput.value });
        });
    }

    const readyBtn = document.querySelector<HTMLButtonElement>(".ready-btn");
    if (readyBtn) {
        readyBtn?.addEventListener("click", () => {
            lobbyState.ready = !lobbyState.ready;
            onEvent({type: "ready", ready: lobbyState.ready , role: lobbyState.role});
            readyBtn.classList.toggle("selected",lobbyState.ready);
            readyBtn.textContent = lobbyState.ready ? "Ready ✔" : "Ready";
        });
    }
}
