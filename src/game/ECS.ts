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
}
