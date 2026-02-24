function isPhoneLikeDevice(): boolean {
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  // Treat phone-sized touch devices as unsupported for now.
  return hasCoarsePointer && shortSide <= 700;
}

function renderMobileBlockedScreen(): void {
  document.body.innerHTML = "";

  const root = document.createElement("div");
  root.style.minHeight = "100vh";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.justifyContent = "flex-start";
  root.style.padding = "24px 16px";
  root.style.boxSizing = "border-box";
  root.style.background = "#111";
  root.style.color = "#f3f3f3";
  root.style.fontFamily = "Arial, sans-serif";
  root.style.textAlign = "center";

  const logo = document.createElement("img");
  logo.src = "/sprites/logo.png";
  logo.alt = "Botonoids";
  logo.style.width = "min(92vw, 520px)";
  logo.style.height = "auto";
  logo.style.marginBottom = "20px";

  const message = document.createElement("p");
  message.textContent = "This game is meant for playing on a laptop or desktop; it is not optimized for phones.";
  message.style.maxWidth = "520px";
  message.style.lineHeight = "1.45";
  message.style.margin = "0";
  message.style.fontSize = "18px";

  root.appendChild(logo);
  root.appendChild(message);
  document.body.appendChild(root);
}

if (isPhoneLikeDevice()) {
  renderMobileBlockedScreen();
} else {
  import("./main");
}
