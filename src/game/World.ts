import { openDB } from 'idb';
import { SparseStore, IWorld, TypedArray } from './ECS';

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

export class World implements IWorld {
  public readonly capacity: number;
  public nextEntityId: number = 0;
  public freeIds: number[] = [];


  // Sparse Sets: One per component type
  private componentSets: Map<number, SparseStore<TypedArray>> = new Map();

  constructor(maxEntities: number) {
    this.capacity = maxEntities;

    this.componentSets.set(Component.Position, new SparseStore(maxEntities, Float32Array, 2));
    this.componentSets.set(Component.Velocity, new SparseStore(maxEntities, Float32Array, 2));
    this.componentSets.set(Component.Health, new SparseStore(maxEntities, Uint16Array, 1));
    this.componentSets.set(Component.UnitType, new SparseStore(maxEntities, Uint8Array, 1));
    this.componentSets.set(Component.UnitState, new SparseStore(maxEntities, Uint8Array, 1));
  }


  // --- Entity Management ---

  createEntity(): number {
    const id = this.freeIds.length > 0
      ? this.freeIds.pop()!
      : this.nextEntityId++;

    if (id >= this.capacity) throw new Error("World capacity reached!");
    return id;
  }

  destroyEntity(entity: number) {
    for (const store of this.componentSets.values()) {
      store.remove(entity);
    }
    this.freeIds.push(entity);
  }

  // --- Component Management ---


  addComponent(entity: number, comp: number) {
    this.componentSets.get(comp)!.add(entity);
  }

  removeComponent(entity: number, comp: number) {
    this.componentSets.get(comp)!.remove(entity);
  }

  getComponentSet(comp: number): SparseStore<TypedArray> {
    return this.componentSets.get(comp)!;
  }

  setComponent(entity: number, comp: Component, value: any) {
    this.addComponent(entity, comp);
    const store = this.getComponentSet(comp);
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

  // --- Persistence ---

  async saveToIndexedDB(slotId: string) {
    const sparseSetsData = Array.from(this.componentSets.entries()).map(([comp, set]) => ({
      comp,
      count: set.count,
      dense: set.dense.slice().buffer,
      sparse: set.sparse.slice().buffer,
      data: set.data.slice().buffer
    }));

    const saveState = {
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
      const store = world.getComponentSet(savedSet.comp);
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
