import { openDB } from 'idb';
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

  async saveToIndexedDB(slotId: string) {
    const sparseSetsData = this.stores.map((store, comp) => ({
      comp,
      count: store.count,
      dense: store.dense.slice().buffer,
      sparse: store.sparse.slice().buffer,
      data: store.data.slice().buffer
    }));

    const saveState: WorldSave = {
      id: slotId,
      capacity: this.capacity,
      nextEntityId: this.nextEntityId,
      freeIds: [...this.freeIds],
      sparseSetsData,
    };

    const db = await openDB('GameDatabase', 1, {
      upgrade(db) { db.createObjectStore('saves', { keyPath: 'id' }); }
    });

    await db.put('saves', saveState);
  }

  static async loadFromIndexedDB(slotId: string): Promise<World | null> {
    const db = await openDB('GameDatabase', 1, {
      upgrade(db) { db.createObjectStore('saves', { keyPath: 'id' }); }
    });
    const saveState = await db.get('saves', slotId) as any;

    if (!saveState) return null;

    const world = new World(saveState.capacity);
    world.nextEntityId = saveState.nextEntityId;
    world.freeIds = saveState.freeIds;

    for (const savedSet of saveState.sparseSetsData) {
      const store = world.getStore(savedSet.comp);
      store.count = savedSet.count;
      store.dense.set(new Int32Array(savedSet.dense));
      store.sparse.set(new Int32Array(savedSet.sparse));

      if (store.data instanceof Float32Array) store.data.set(new Float32Array(savedSet.data));
      else if (store.data instanceof Uint16Array) store.data.set(new Uint16Array(savedSet.data));
      else if (store.data instanceof Uint8Array) store.data.set(new Uint8Array(savedSet.data));
    }

    return world;
  }
}
