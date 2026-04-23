import { openDB } from 'idb';
import { SparseSet, IWorld } from './ECS';

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

  // Raw binary buffers for zero-garbage storage
  positionsBuffer: ArrayBuffer;
  velocitiesBuffer: ArrayBuffer;
  healthsBuffer: ArrayBuffer;
  unitTypesBuffer: ArrayBuffer;
  unitStatesBuffer: ArrayBuffer;

  // We must also save the sparse sets to know which entities have which components
  sparseSetsData: { dense: ArrayBuffer; sparse: ArrayBuffer; count: number }[];
}

// --- The World ---

export class World implements IWorld {
  public readonly capacity: number;
  public nextEntityId: number = 0;
  public freeIds: number[] = [];

  // Sparse Sets: One per component type
  private componentSets: SparseSet[];

  // Component Data (Struct of Arrays)
  public positions: Float32Array;
  public velocities: Float32Array;
  public healths: Uint16Array;
  public unitTypes: Uint8Array;
  public unitStates: Uint8Array;

  constructor(maxEntities: number) {
    this.capacity = maxEntities;

    // Initialize exactly one SparseSet per component type
    this.componentSets = Array.from(
      { length: Component.MAX_COMPONENTS },
      () => new SparseSet(maxEntities)
    );

    // Pre-allocate TypedArrays for component data
    this.positions = new Float32Array(maxEntities * 2);
    this.velocities = new Float32Array(maxEntities * 2);
    this.healths = new Uint16Array(maxEntities);
    this.unitTypes = new Uint8Array(maxEntities);
    this.unitStates = new Uint8Array(maxEntities);
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
    // Remove entity from all component sets so systems ignore it
    for (let i = 0; i < Component.MAX_COMPONENTS; i++) {
      this.componentSets[i].remove(entity);
    }
    this.freeIds.push(entity);
  }

  // --- Component Management ---

  addComponent(entity: number, comp: number) {
    this.componentSets[comp].add(entity);
  }

  removeComponent(entity: number, comp: number) {
    this.componentSets[comp].remove(entity);
  }

  getComponentSet(comp: number): SparseSet {
    return this.componentSets[comp];
  }

  setComponent(entity: number, comp: Component, value: any) {
    this.addComponent(entity, comp);
    switch (comp) {
      case Component.Position:
        this.positions[entity * 2] = value[0];
        this.positions[entity * 2 + 1] = value[1];
        break;
      case Component.Velocity:
        this.velocities[entity * 2] = value[0];
        this.velocities[entity * 2 + 1] = value[1];
        break;
      case Component.Health:
        this.healths[entity] = value;
        break;
      case Component.UnitType:
        this.unitTypes[entity] = value;
        break;
      case Component.UnitState:
        this.unitStates[entity] = value;
        break;
    }
  }


  // --- Persistence ---

  async saveToIndexedDB(slotId: string) {
    // Serialize sparse sets
    const sparseSetsData = this.componentSets.map(set => ({
      count: set.count,
      // .slice() copies only the data, .buffer extracts the ArrayBuffer for IDB
      dense: set.dense.slice().buffer,
      sparse: set.sparse.slice().buffer
    }));

    const saveState: WorldSave = {
      id: slotId,
      capacity: this.capacity,
      nextEntityId: this.nextEntityId,
      freeIds: [...this.freeIds],

      sparseSetsData,
      positionsBuffer: this.positions.slice().buffer,
      velocitiesBuffer: this.velocities.slice().buffer,
      healthsBuffer: this.healths.slice().buffer,
      unitTypesBuffer: this.unitTypes.slice().buffer,
      unitStatesBuffer: this.unitStates.slice().buffer,
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
    const saveState = await db.get('saves', slotId) as WorldSave;

    if (!saveState) return null;

    const world = new World(saveState.capacity);
    world.nextEntityId = saveState.nextEntityId;
    world.freeIds = saveState.freeIds;

    // Restore component arrays via fast .set()
    world.positions.set(new Float32Array(saveState.positionsBuffer));
    world.velocities.set(new Float32Array(saveState.velocitiesBuffer));
    world.healths.set(new Uint16Array(saveState.healthsBuffer));
    world.unitTypes.set(new Uint8Array(saveState.unitTypesBuffer));
    world.unitStates.set(new Uint8Array(saveState.unitStatesBuffer));

    // Restore Sparse Sets
    for (let i = 0; i < Component.MAX_COMPONENTS; i++) {
      const savedSet = saveState.sparseSetsData[i];
      world.componentSets[i].count = savedSet.count;
      world.componentSets[i].dense.set(new Int32Array(savedSet.dense));
      world.componentSets[i].sparse.set(new Int32Array(savedSet.sparse));
    }

    return world;
  }
}
