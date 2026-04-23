import { SparseStore, GenericWorld, TypedArray } from './ECS';

// --- Configuration & Types ---

export enum Component {
  Position = 0,
  Velocity = 1,
  Health = 2,
  UnitType = 3,
  UnitState = 4,
  MAX_COMPONENTS,
}

export interface WorldSave {
  id: string;
  capacity: number;
  nextEntityId: number;
  freeIds: number[];
  sparseSetsData: { comp: number; dense: ArrayBuffer; sparse: ArrayBuffer; count: number; data: ArrayBuffer }[];
}

// --- The World ---

export class World extends GenericWorld<Component> {
  constructor(maxEntities: number) {
    super(maxEntities, Component.MAX_COMPONENTS);

    this.stores[Component.Position] = new SparseStore(maxEntities, Float32Array, 2);
    this.stores[Component.Velocity] = new SparseStore(maxEntities, Float32Array, 2);
    this.stores[Component.Health] = new SparseStore(maxEntities, Uint16Array, 1);
    this.stores[Component.UnitType] = new SparseStore(maxEntities, Uint8Array, 1);
    this.stores[Component.UnitState] = new SparseStore(maxEntities, Uint8Array, 1);
  }

  setComponent(entity: number, comp: Component, value: any) {
    this.addComponent(entity, comp);
    const store = this.getStore(comp);
    switch (comp) {
      case Component.Position:
      case Component.Velocity:
        store.set(entity, value[0], 0);
        store.set(entity, value[1], 1);
        break;
      case Component.Health:
      case Component.UnitType:
      case Component.UnitState:
        store.set(entity, value, 0);
        break;
    }
  }


  // Game-specific wrappers to match previous static signatures or expected defaults
  async saveToIndexedDB(slotId: string) {
    await super.saveToIndexedDB(slotId, 'GameDatabase');
  }

  static async loadFromIndexedDB(slotId: string): Promise<World | null> {
    const world = new World(10000); // Create default world, load logic fills it
    const success = await world.loadFromIndexedDB(slotId, 'GameDatabase');
    if (!success) return null;
    return world;
  }
}
