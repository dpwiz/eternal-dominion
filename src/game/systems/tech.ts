import { GameState } from '../Types';
import { World, Component } from '../World';
import { ALL_TECHS, FUSIONS } from '../Content';

export function hasTech(state: GameState, id: string) { return state.techs.includes(id); }
export function hasFusion(state: GameState, id: string) { return state.fusions.includes(id); }

export function checkLevelUp(state: GameState) {
  if (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext;
    state.level++;
    state.xpToNext = Math.floor(state.xpToNext * 1.5);

    const available = ALL_TECHS.filter(t => {
      if (state.techs.includes(t.id)) return false;
      if (t.id === 'AnimalHusbandry' && !state.techs.includes('HorsebackRiding')) return false;
      if (t.id === 'Crossbows' && !state.techs.includes('Archery')) return false;
      if (t.id === 'Animism' && !state.techs.includes('Mysticism')) return false;
      return true;
    });
    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const picks = shuffled.slice(0, 3);
    picks.push({
      id: 'Resupply',
      name: 'Resupply',
      description: 'Skip this development and gain +2 Supply instead.'
    });

    if (picks.length > 0) {
      state.pendingTechPicks.push(picks);
      if (state.phase === 'PLAYING') {
        state.phase = 'LEVEL_UP';
      }
    }
  }
}

export function pickTech(state: GameState, world: World, techId: string) {
  if (techId === 'Resupply') {
    state.supplies += 2;
    state.pendingTechPicks.shift();
    if (state.pendingTechPicks.length === 0) {
      state.phase = 'PLAYING';
    }
    return;
  }

  const sHealth = world.getStore(Component.Health);
  const sMaxHealth = world.getStore(Component.MaxHealth);
  state.techs.push(techId);
  state.pendingTechPicks.shift();

  if (techId === 'Masonry') {
    for (const city of state.cities) {
      let maxHp = sMaxHealth.get(city.id, 0);
      world.setComponent(city.id, Component.MaxHealth, maxHp + 50);
      sHealth.set(city.id, sHealth.get(city.id, 0) + 50, 0);
    }
  }

  for (const fusion of FUSIONS) {
    if (!state.fusions.includes(fusion.id)) {
      if (fusion.req.every(req => state.techs.includes(req))) {
        state.fusions.push(fusion.id);
      }
    }
  }

  if (state.pendingTechPicks.length === 0) {
    state.phase = 'PLAYING';
  }
}
