//lobby.ts

import type {  Role } from './protocol';
import { isRole } from './protocol';

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
        nameInput.addEventListener("input", () => {
            lobbyState.name = nameInput.value;
            onEvent({type: "name", name: nameInput.value });
        });
    }

    const readyBtn = document.querySelector<HTMLButtonElement>(".ready-btn");
    if (readyBtn) {
        readyBtn.addEventListener("click", () => {
            lobbyState.ready = !lobbyState.ready;
            onEvent({type: "ready", ready: lobbyState.ready , role: lobbyState.role});
            readyBtn.classList.toggle("selected",lobbyState.ready);
            readyBtn.textContent = lobbyState.ready ? "Ready ✔" : "Ready";
        });
    }

    //listener for "role" buttons (gold, silver, black, white, random, observer)
    document.querySelectorAll<HTMLButtonElement>(".role-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const roleClicked = btn.dataset.model;
            //update state + send event
            console.log("Role button pressed:", roleClicked);
            if (roleClicked && isRole(roleClicked)) {

                //first "unhighlight" all of the role buttons
                document.querySelectorAll<HTMLButtonElement>(".role-btn").forEach(b => {
                  b.classList.remove("selected");
                 });

                //update the lobbyState role
                lobbyState.role = roleClicked;

                //now highlight the role button that was just selected
                btn.classList.add("selected");
            }
        });
    });

    //listener for "model" buttons (alphanoid, barvinoid, etc)
    document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const model = btn.dataset.model;
            //update state + send event
            console.log("Model button pressed:", model);
        });
    });
}
