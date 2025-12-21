import Vector2 from './Vector2';
import type { ImageResource } from "./Resources";

export type SpriteConfig = {
  resource: ImageResource;   // comes from Resources.ts
  frameSize?: Vector2;       // crop size per frame on the sheet
  hFrames?: number;          // frames per row
  vFrames?: number;          // rows of frames
  frame?: number;            // current frame index
  scale?: number;            // render scale
  position?: Vector2;        // optional: you can use this later if you want
};

export class Sprite {
  readonly resource: ImageResource;
  readonly frameSize: Vector2;
  readonly hFrames: number;
  readonly vFrames: number;

  frame: number;
  scale: number;
  position: Vector2;

  private frameMap: Map<number, Vector2>;

  constructor({
    resource,
    frameSize,
    hFrames,
    vFrames,
    frame,
    scale,
    position,
  }: SpriteConfig) {
    this.resource = resource;
    this.frameSize = frameSize ?? new Vector2(16, 16);
    this.hFrames = hFrames ?? 1;
    this.vFrames = vFrames ?? 1;
    this.frame = frame ?? 0;
    this.scale = scale ?? 1;
    this.position = position ?? new Vector2(0, 0);

    this.frameMap = new Map();
    this.buildFrameMap();
  }

  private buildFrameMap(): void {
    let frameCount = 0;
    for (let v = 0; v < this.vFrames; v++) {
      for (let h = 0; h < this.hFrames; h++) {
        this.frameMap.set(
          frameCount,
          new Vector2(h * this.frameSize.x, v * this.frameSize.y)
        );
        frameCount++;
      }
    }
  }

  drawImage(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.resource.isLoaded) return;

    const frame = this.frameMap.get(this.frame);
    const sx = frame?.x ?? 0;
    const sy = frame?.y ?? 0;

    const fw = this.frameSize.x;
    const fh = this.frameSize.y;

    ctx.drawImage(
      this.resource.image,
      sx, sy, fw, fh,
      x, y, fw * this.scale, fh * this.scale
    );
  }
}
``
