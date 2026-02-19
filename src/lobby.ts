//lobby.ts

import type {  Role, Model, SnapshotPlayer } from './protocol';
import { isRole, isModel } from './protocol';

export type LobbyEvent = 
| {type: "ready"; ready: boolean; role: Role}
| {type: "role"; role: Role}
| {type: "name"; name: string }
| {type: "chat"; text: string }
| {type: "options" }
| {type: "back" };

export type LobbyUIController = {
    appendChat: (line: string) => void;
    setName: (name: string) => void;
    setPlayers: (players: SnapshotPlayer[]) => void;
    setRoomName: (name: string) => void;
    setRoleAvailability: (unavailable: Role[]) => void;
    setReadyState: (ready: boolean) => void;
    resetSelection: () => void;
};

type LobbyState = {
    name: string;
    role: Role | null;
    ready: boolean;
    model: Model;
}

export const lobbyState: LobbyState = {
    name: "",
    role: null,
    ready: false,
    model: "alphanoid",
};
export function initLobbyUI(onEvent: (e: LobbyEvent) => void): LobbyUIController {
    const nameInput = document.querySelector<HTMLInputElement>("#name-input");
    const nameSetBtn = document.querySelector<HTMLButtonElement>("#name-set-btn");
    const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
    const chatSendBtn = document.querySelector<HTMLButtonElement>("#chat-send-btn");
    const backBtn = document.querySelector<HTMLButtonElement>("#lobby-back-btn");
    const optionsBtn = document.querySelector<HTMLButtonElement>("#lobby-options-btn");
    const chatLog = document.querySelector<HTMLDivElement>(".chat-log");
    const playerCards = Array.from(document.querySelectorAll<HTMLDivElement>(".players-grid .player-card"));
    const roomNameEl = document.querySelector<HTMLElement>("#lobby-room-name");
    const currentPlayerNameEl = document.querySelector<HTMLElement>("#current-player-name");

    const readyBtn = document.querySelector<HTMLButtonElement>(".ready-btn");
    const roleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".role-btn"));
    const colorRoles: Role[] = ["goldBot", "silverBot", "whiteBot", "blackBot"];
    const unavailableRoles = new Set<Role>();

    const updateReadyEnabled = () => {
        if (!readyBtn) return;
        const enabled = lobbyState.role !== null;
        readyBtn.disabled = !enabled;
        readyBtn.classList.toggle("inactive", !enabled);
    };

    const resetReadyState = () => {
        lobbyState.ready = false;
        if (!readyBtn) return;
        readyBtn.classList.remove("selected");
        readyBtn.textContent = "Ready";
    };

    const submitName = () => {
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) return;
        lobbyState.name = name;
        if (currentPlayerNameEl) currentPlayerNameEl.textContent = name;
        onEvent({type: "name", name});
    };

    const submitChat = () => {
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (!text) return;
        onEvent({type: "chat", text});
        chatInput.value = "";
    };

    if (nameInput && nameSetBtn) {
        nameSetBtn.addEventListener("click", submitName);
        nameInput.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") submitName();
        });
    }

    if (chatInput && chatSendBtn) {
        chatSendBtn.addEventListener("click", submitChat);
        chatInput.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") submitChat();
        });
    }

    if (backBtn) {
        backBtn.addEventListener("click", () => onEvent({ type: "back" }));
    }

    if (optionsBtn) {
        optionsBtn.addEventListener("click", () => onEvent({ type: "options" }));
    }

    if (readyBtn) {
        readyBtn.addEventListener("click", () => {
            if (lobbyState.role === null) return;
            lobbyState.ready = !lobbyState.ready;
            onEvent({type: "ready", ready: lobbyState.ready , role: lobbyState.role});
            readyBtn.classList.toggle("selected",lobbyState.ready);
            readyBtn.textContent = lobbyState.ready ? "Ready ✔" : "Ready";
        });
    }

    //listener for "role" buttons (gold, silver, black, white, random, observer)
    roleButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.disabled) return;
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
                if (lobbyState.ready) resetReadyState();
                onEvent({ type: "role", role: roleClicked });

                //now highlight the role button that was just selected
                btn.classList.add("selected");
                updateReadyEnabled();
            }
        });
    });

    //listener for "model" buttons (alphanoid, barvinoid, etc)
    document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const model = btn.dataset.model;
            //update state + send event
            console.log("Model button pressed:", model);

            if (model && isModel(model)) {
                lobbyState.model = model;

                //remove selected from all
                document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(b => {
                    b.classList.remove("selected");
                });

                //now add selected to the correct one
                btn.classList.add("selected")
            }
        });
    });
    updateReadyEnabled();

    return {
        appendChat(line: string) {
            if (!chatLog) return;
            const row = document.createElement("div");
            row.textContent = line;
            chatLog.appendChild(row);
            chatLog.scrollTop = chatLog.scrollHeight;
        },
        setName(name: string) {
            lobbyState.name = name;
            if (nameInput) nameInput.value = name;
            if (currentPlayerNameEl) currentPlayerNameEl.textContent = name;
        },
        setPlayers(players: SnapshotPlayer[]) {
            const sorted = [...players].sort((a, b) => a.id - b.id);
            playerCards.forEach((card, i) => {
                card.innerHTML = "";
                if (i >= sorted.length) {
                    card.textContent = "-";
                    return;
                }

                const p = sorted[i];
                const label = (p.name && p.name.trim().length > 0) ? p.name : `Player ${p.id}`;

                const nameEl = document.createElement("span");
                nameEl.className = "player-name";
                nameEl.textContent = label;
                card.appendChild(nameEl);

                if (p.ready && p.role === "observer") {
                    const obs = document.createElement("span");
                    obs.className = "player-status obs";
                    obs.textContent = "obs.";
                    card.appendChild(obs);
                } else if (p.ready) {
                    const ready = document.createElement("span");
                    ready.className = "player-status ready";
                    ready.textContent = "✔";
                    card.appendChild(ready);
                }
            });
        },
        setRoomName(name: string) {
            if (roomNameEl) roomNameEl.textContent = name;
        },
        setRoleAvailability(unavailable: Role[]) {
            unavailableRoles.clear();
            unavailable.forEach((r) => unavailableRoles.add(r));

            for (const btn of roleButtons) {
                const role = btn.dataset.model;
                if (!role || !isRole(role)) continue;
                const disable = colorRoles.includes(role) && unavailableRoles.has(role);
                btn.disabled = disable;
                btn.classList.toggle("inactive", disable);
            }

            if (lobbyState.role && unavailableRoles.has(lobbyState.role)) {
                lobbyState.role = null;
                roleButtons.forEach((b) => b.classList.remove("selected"));
                resetReadyState();
            }

            updateReadyEnabled();
        },
        setReadyState(ready: boolean) {
            lobbyState.ready = ready;
            if (!readyBtn) return;
            readyBtn.classList.toggle("selected", ready);
            readyBtn.textContent = ready ? "Ready ✔" : "Ready";
        },
        resetSelection() {
            lobbyState.role = null;
            unavailableRoles.clear();
            roleButtons.forEach((b) => {
                b.classList.remove("selected");
                b.disabled = false;
                b.classList.remove("inactive");
            });
            resetReadyState();
            updateReadyEnabled();
        },
    };
}
