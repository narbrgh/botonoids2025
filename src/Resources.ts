// src/Resources.ts

export const toLoad = {
  tiles: "/sprites/tiles.png",
  goldBot: "/sprites/goldBot.png",
} as const;

export type ResourceKey = keyof typeof toLoad;

export type ImageResource = {
  image: HTMLImageElement;
  isLoaded: boolean;
};

class Resources {
  // Now images can ONLY be indexed by the known keys (tiles, goldBot)
  readonly images: Record<ResourceKey, ImageResource> = {} as Record<ResourceKey, ImageResource>;

  constructor() {
    (Object.keys(toLoad) as ResourceKey[]).forEach((key) => {
      const img = new Image();
      img.src = toLoad[key];

      this.images[key] = {
        image: img,
        isLoaded: false,
      };

      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }

  isReady(key: ResourceKey): boolean {
    return this.images[key].isLoaded;
  }

  // Optional: handy for "loading screen" logic
  allReady(): boolean {
    return (Object.keys(toLoad) as ResourceKey[]).every((k) => this.images[k].isLoaded);
  }
}

export const resources = new Resources();




/*export type ImageResource = {
  image: HTMLImageElement;
  isLoaded: boolean;
};

//Record makes a <K, V> dictionary. K, V = Key, Value.
//Here it is used to make the "resource map", so sprites can be loaded easily
type ResourceMap = Record<string, string>;

class Resources {
  private readonly toLoad: ResourceMap = {
    tiles: "/sprites/tiles.png",
    goldBot: "/sprites/goldBot.png",
  };

  //Record makes a <K, V> dictionary. K, V = Key, Value.
  //here it is used to make a key ("tiles", "goldBot") which pairs with its value
  //(the image of tiles.png, the image of goldBot.png)
  readonly images: Record<string, ImageResource> = {};

  constructor() {
    Object.keys(this.toLoad).forEach((key) => {
      const img = new Image();
      img.src = this.toLoad[key];

      this.images[key] = {
        image: img,
        isLoaded: false,
      };

      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }

  //** Optional convenience helper 
  isReady(key: string): boolean {
    return this.images[key]?.isLoaded ?? false;
  }
}

export const resources = new Resources();
*/