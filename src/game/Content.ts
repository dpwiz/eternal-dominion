import { Tech } from './Types';

export const ALL_TECHS: Tech[] = [
  { id: 'BronzeWorking', name: 'Forged Blades', description: '+30% Guard and Cavalry damage' },
  { id: 'Masonry', name: 'Palisade Walls', description: 'Outposts gain +50 max HP and take 1 less damage per hit' },
  { id: 'HorsebackRiding', name: 'Beast Taming', description: 'Spawns a fast cavalry unit to patrol and engage enemies' },
  { id: 'Archery', name: 'Watchtowers', description: 'Outposts fire projectiles at the farthest enemy in range' },
  { id: 'Irrigation', name: 'Field Medics', description: 'Outposts regenerate 5 HP/sec' },
  { id: 'Mining', name: 'High Ground', description: 'Units deal +50% damage while fighting on Hill tiles' },
  { id: 'Mysticism', name: 'Shamanic Wards', description: 'Outposts deal burst damage to nearby enemies every 5 seconds' },
  { id: 'Writing', name: 'Combat Drills', description: '+25% XP gain' },
  { id: 'Exploration', name: 'Pathfinding', description: '+2 outpost engagement radius for Guards and Wards' },
  { id: 'AnimalHusbandry', name: 'Pack Tactics', description: 'Spawns a second cavalry unit per outpost' },
  { id: 'Crossbows', name: 'Crossbows', description: 'Spawns an additional archer unit per outpost' },
  { id: 'Animism', name: 'Animism', description: 'Mystic units grow in size and gain extra range' },
  { id: 'Pottery', name: 'Supply Caches', description: 'New outposts start with +50% HP' },
  { id: 'Calendar', name: 'Threat Assessment', description: 'Wave timer visible. Next wave preview shown.' }
];

export const FUSIONS = [
  { id: 'Aqueducts', req: ['Irrigation', 'Masonry'], name: 'Sanctuary', description: 'Outposts regenerate 15 HP/sec and take 3 less damage per hit' },
  { id: 'WarChariots', req: ['BronzeWorking', 'HorsebackRiding'], name: 'Swift Riders', description: 'Cavalry deals 3x damage, moves faster, adds a unit and extends range' },
  { id: 'Theology', req: ['Writing', 'Mysticism'], name: 'Conversion Ritual', description: 'Burst damage converts enemies (50% chance, 100% with Animism)' },
  { id: 'MountainFortress', req: ['Archery', 'Mining'], name: 'Eagles Nest', description: 'Spawns an additional archer and increases archer range' }
];
