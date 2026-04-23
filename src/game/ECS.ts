export type TypedArray =
  | Float32Array | Float64Array
  | Int8Array | Int16Array | Int32Array
  | Uint8Array | Uint16Array | Uint32Array;

export interface TypedArrayConstructor<T extends TypedArray> {
  new (length: number): T;
  new (buffer: ArrayBuffer): T;
}

export class SparseStore<T extends TypedArray> {
  public dense: Int32Array;
  public sparse: Int32Array;
  public count: number = 0;

  public data: T;
  public readonly stride: number;

  constructor(capacity: number, ArrayType: TypedArrayConstructor<T>, stride: number = 1) {
    this.dense = new Int32Array(capacity);
    this.sparse = new Int32Array(capacity).fill(-1);
    this.data = new ArrayType(capacity * stride);
    this.stride = stride;
  }

  add(entity: number) {
    if (this.sparse[entity] === -1) {
      this.dense[this.count] = entity;
      this.sparse[entity] = this.count;
      this.count++;
    }
  }

  remove(entity: number) {
    if (this.sparse[entity] !== -1) {
      const indexToRemove = this.sparse[entity];
      const lastEntity = this.dense[this.count - 1];

      this.dense[indexToRemove] = lastEntity;
      this.sparse[lastEntity] = indexToRemove;

      this.sparse[entity] = -1;
      this.count--;
    }
  }

  has(entity: number): boolean {
    return this.sparse[entity] !== -1;
  }

  get(entity: number, element: number = 0): number {
    return this.data[entity * this.stride + element];
  }

  set(entity: number, value: number, element: number = 0): void {
    this.data[entity * this.stride + element] = value;
  }
}

export abstract class GenericWorld<C extends number> {
  public readonly capacity: number;
  public nextEntityId: number = 0;
  public freeIds: number[] = [];

  protected stores: SparseStore<TypedArray>[];

  constructor(capacity: number, maxComponents: number) {
    this.capacity = capacity;
    this.stores = new Array(maxComponents);
  }

  createEntity(): number {
    const id = this.freeIds.length > 0
      ? this.freeIds.pop()!
      : this.nextEntityId++;

    if (id >= this.capacity) throw new Error("World capacity reached!");
    return id;
  }

  destroyEntity(entity: number) {
    for (const store of this.stores) {
      if (store) store.remove(entity);
    }
    this.freeIds.push(entity);
  }

  addComponent(entity: number, comp: C) {
    this.stores[comp as number].add(entity);
  }

  removeComponent(entity: number, comp: C) {
    this.stores[comp as number].remove(entity);
  }

  getStore<T extends TypedArray>(comp: C): SparseStore<T> {
    return this.stores[comp as number] as SparseStore<T>;
  }

  async saveToIndexedDB(slotId: string, dbName: string) {
    const sparseSetsData = this.stores.map((store, comp) => {
      if (!store) return null;
      return {
        comp,
        count: store.count,
        dense: store.dense.slice().buffer,
        sparse: store.sparse.slice().buffer,
        data: store.data.slice().buffer
      };
    }).filter(Boolean);

    const saveState = {
      id: slotId,
      capacity: this.capacity,
      nextEntityId: this.nextEntityId,
      freeIds: [...this.freeIds],
      sparseSetsData,
    };

    const { openDB } = await import('idb');
    const db = await openDB(dbName, 1, {
      upgrade(db) { db.createObjectStore('saves', { keyPath: 'id' }); }
    });

    await db.put('saves', saveState);
  }

  async loadFromIndexedDB(slotId: string, dbName: string): Promise<boolean> {
    const { openDB } = await import('idb');
    const db = await openDB(dbName, 1, {
      upgrade(db) { db.createObjectStore('saves', { keyPath: 'id' }); }
    });
    const saveState = await db.get('saves', slotId) as any;

    if (!saveState) return false;

    this.nextEntityId = saveState.nextEntityId;
    this.freeIds = saveState.freeIds;

    for (const savedSet of saveState.sparseSetsData) {
      const store = this.getStore(savedSet.comp);
      if (store) {
        store.count = savedSet.count;
        store.dense.set(new Int32Array(savedSet.dense));
        store.sparse.set(new Int32Array(savedSet.sparse));

                if (store.data instanceof Float64Array) store.data.set(new Float64Array(savedSet.data));
        else if (store.data instanceof Float32Array) store.data.set(new Float32Array(savedSet.data));
        else if (store.data instanceof Uint32Array) store.data.set(new Uint32Array(savedSet.data));
        else if (store.data instanceof Uint16Array) store.data.set(new Uint16Array(savedSet.data));
        else if (store.data instanceof Uint8Array) store.data.set(new Uint8Array(savedSet.data));
        else if (store.data instanceof Int32Array) store.data.set(new Int32Array(savedSet.data));
        else if (store.data instanceof Int16Array) store.data.set(new Int16Array(savedSet.data));
        else if (store.data instanceof Int8Array) store.data.set(new Int8Array(savedSet.data));
      }
    }

    return true;
  }

}