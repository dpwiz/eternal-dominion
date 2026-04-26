import { Hex } from '../HexMath';
import { FriendlyUnit, MobUnit, FriendlyType, GameState } from '../Types';
import { World, Component } from '../World';

export function getHex(store: any, id: number): Hex | null {
  if (!store.has(id)) return null;
  const q = store.get(id, 0);
  const r = store.get(id, 1);
  if (q === 32767 && r === 32767) return null;
  return { q, r, s: -q-r };
}
export function setHex(store: any, id: number, hex: Hex | null) {
  if (!hex) {
    store.set(id, 32767, 0);
    store.set(id, 32767, 1);
  } else {
    store.set(id, hex.q || 0, 0);
    store.set(id, hex.r || 0, 1);
  }
}

export function getEnemySize(type: MobUnit): number {
  return type === MobUnit.Scout ? 1 : (type === MobUnit.Warrior ? 2 : 4);
}

export function getFriendlySize(unit: FriendlyUnit, world: World, state: GameState): number {
  const sFriendlyType = world.getStore(Component.FriendlyType);

  if (sFriendlyType.get(unit.id, 0) === FriendlyType.Guard) return 2;
  if (sFriendlyType.get(unit.id, 0) === FriendlyType.Cavalry) {
    const idx = unit.cavalryIndex ?? 0;
    if (idx === 0) return 1;
    if (idx === 1) return 2;
    return 4;
  }
  if (sFriendlyType.get(unit.id, 0) === FriendlyType.Mystic) {
    let size = 1;
    if (state.techs.includes('Animism')) size += 1;
    if (state.fusions.includes('Theology')) size += 1;
    return size;
  }
  if (sFriendlyType.get(unit.id, 0) === FriendlyType.Archer) return 1;
  return 1;
}
