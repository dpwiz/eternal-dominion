import { SparseStore, GenericWorld, TypedArray } from './ECS';

// --- Configuration & Types ---

export const MAX_ENTITIES: number = 16 * 1024;

export enum Component {
  Position, // f32 x2
  Health, // f32
  MaxHealth, // f32
  MobType, // u8
  FriendlyType, // u8
  FriendlyState, // u8
  EngineerState, // u8
  Speed, // f32
  Damage, // f32
  TargetId, // u32
  HexPosition, // i16 x2
  HomeHex, // i16 x2
  TargetHex, // i16 x2
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
  constructor(maxEntities: number = MAX_ENTITIES) {
    super(maxEntities, Component.MAX_COMPONENTS);

    this.stores[Component.Position] = new SparseStore(maxEntities, Float32Array, 2);
    this.stores[Component.Health] = new SparseStore(maxEntities, Float32Array, 1);
    this.stores[Component.MaxHealth] = new SparseStore(maxEntities, Float32Array, 1);
    this.stores[Component.MobType] = new SparseStore(maxEntities, Uint8Array, 1);
    this.stores[Component.FriendlyType] = new SparseStore(maxEntities, Uint8Array, 1);
    this.stores[Component.FriendlyState] = new SparseStore(maxEntities, Uint8Array, 1);
    this.stores[Component.EngineerState] = new SparseStore(maxEntities, Uint8Array, 1);
    this.stores[Component.Speed] = new SparseStore(maxEntities, Float32Array, 1);
    this.stores[Component.Damage] = new SparseStore(maxEntities, Float32Array, 1);
    this.stores[Component.TargetId] = new SparseStore(maxEntities, Uint32Array, 1);
    this.stores[Component.HexPosition] = new SparseStore(maxEntities, Int16Array, 2);
    this.stores[Component.HomeHex] = new SparseStore(maxEntities, Int16Array, 2);
    this.stores[Component.TargetHex] = new SparseStore(maxEntities, Int16Array, 2);
  }

  setComponent(entity: number, comp: Component, value: any) {
    this.addComponent(entity, comp);
    const store = this.getStore(comp);
    switch (comp) {
      // 1-element components
      case Component.Health:
      case Component.MaxHealth:
      case Component.MobType:
      case Component.FriendlyType:
      case Component.FriendlyState:
      case Component.EngineerState:
      case Component.Speed:
      case Component.Damage:
      case Component.TargetId:
        store.set(entity, value, 0);
        break;
      // 2-element components
      case Component.Position:
      case Component.HexPosition:
      case Component.HomeHex:
      case Component.TargetHex:
        store.set(entity, value[0], 0);
        store.set(entity, value[1], 1);
        break;
      // default - throw?
    }
  }


  async saveToIndexedDB(slotId: string) {
    await super.saveToIndexedDB(slotId, 'WorldStores');
  }

  static async loadFromIndexedDB(slotId: string): Promise<World | null> {
    const world = new World(); // Create default world, load logic fills it
    const success = await world.loadFromIndexedDB(slotId, 'WorldStores');
    if (!success) return null;
    return world;
  }
}