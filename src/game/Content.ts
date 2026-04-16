import { Tech } from './Types';

export const ALL_TECHS: Tech[] = [
  { id: 'BronzeWorking', name: 'Bronze Working', description: '+30% Guard and Cavalry damage' },
  { id: 'Masonry', name: 'Masonry', description: 'Cities gain +50 max HP and take 1 less damage per hit' },
  { id: 'HorsebackRiding', name: 'Horseback Riding', description: 'Spawns a fast cavalry unit to patrol and engage enemies' },
  { id: 'Archery', name: 'Archery', description: 'Cities fire projectiles at the farthest enemy in range' },
  { id: 'Irrigation', name: 'Irrigation', description: 'Cities regenerate 5 HP/sec' },
  { id: 'Mining', name: 'Mining', description: 'Units deal +50% damage while fighting on Hill tiles' },
  { id: 'Mysticism', name: 'Mysticism', description: 'Cities deal burst damage to nearby enemies every 5 seconds' },
  { id: 'Writing', name: 'Writing', description: '+25% XP gain' },
  { id: 'Exploration', name: 'Exploration', description: '+2 city engagement radius for Guards and Mysticism' },
  { id: 'AnimalHusbandry', name: 'Animal Husbandry', description: 'Spawns a second cavalry unit per city' },
  { id: 'Pottery', name: 'Pottery', description: 'New cities start with +50% HP' },
  { id: 'Calendar', name: 'Calendar', description: 'Wave timer visible. Next wave preview shown.' }
];

export const FUSIONS = [
  { id: 'Aqueducts', req: ['Irrigation', 'Masonry'], name: 'Aqueducts', description: 'Cities regenerate 15 HP/sec and take 3 less damage per hit' },
  { id: 'WarChariots', req: ['BronzeWorking', 'HorsebackRiding'], name: 'War Chariots', description: 'Cavalry deals 3x damage, moves faster' },
  { id: 'Theology', req: ['Writing', 'Mysticism'], name: 'Theology', description: 'Burst damage converts 1 enemy to fight for you' },
  { id: 'MountainFortress', req: ['Archery', 'Mining'], name: 'Mountain Fortress', description: 'Cities on hills gain 8-tile sniper shot, massive damage' }
];
