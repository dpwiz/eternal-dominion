export class SparseSet {
  public dense: Int32Array;
  public sparse: Int32Array;
  public count: number = 0;

  constructor(capacity: number) {
    this.dense = new Int32Array(capacity);
    this.sparse = new Int32Array(capacity).fill(-1);
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
}

export interface IWorld {
  readonly capacity: number;
  nextEntityId: number;
  freeIds: number[];

  createEntity(): number;
  destroyEntity(entity: number): void;
  addComponent(entity: number, comp: number): void;
  removeComponent(entity: number, comp: number): void;
  getComponentSet(comp: number): SparseSet;
}
