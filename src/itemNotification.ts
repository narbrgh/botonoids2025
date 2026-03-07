// Floating "+N" item-earned notifications that rise and fade out.

const NOTIF_DUR_MS = 1500;
const NOTIF_RISE_PX = 50;
const ICON_SIZE = 24;

type ItemNotif = {
  x: number;       // center pixel x
  y: number;       // center pixel y (start)
  startMs: number;
  itemFrame: number; // sprite frame in items32.png (0=silly pad, 1=wallbreaker)
  text: string;      // e.g. "+4"
};

export class ItemNotifications {
  private notifs: ItemNotif[] = [];

  add(x: number, y: number, nowMs: number, itemFrame: number, text: string) {
    this.notifs.push({ x, y, startMs: nowMs, itemFrame, text });
  }

  clear() {
    this.notifs = [];
  }

  draw(ctx: CanvasRenderingContext2D, nowMs: number, itemsImage: HTMLImageElement | null) {
    const remaining: ItemNotif[] = [];
    for (const n of this.notifs) {
      const elapsed = nowMs - n.startMs;
      if (elapsed >= NOTIF_DUR_MS) continue;
      remaining.push(n);

      const t = elapsed / NOTIF_DUR_MS;
      const alpha = 1 - t * t; // quadratic fade
      const dy = -NOTIF_RISE_PX * t;

      const drawY = n.y + dy;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Draw icon
      const iconX = n.x - ICON_SIZE - 2;
      const iconY = drawY - ICON_SIZE / 2;
      if (itemsImage) {
        ctx.drawImage(
          itemsImage,
          0, n.itemFrame * 32, 32, 32,
          iconX, iconY, ICON_SIZE, ICON_SIZE,
        );
      }

      // Draw text
      ctx.font = '700 18px "Goldman"';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(n.text, n.x + 2, drawY);
      ctx.fillStyle = "#fff";
      ctx.fillText(n.text, n.x + 2, drawY);

      ctx.restore();
    }
    this.notifs = remaining;
  }
}
