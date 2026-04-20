import React from 'react';
import { GameState, Terrain } from '../game/Types';
import { ALL_TECHS, FUSIONS } from '../game/Content';
import { getWaveComposition } from '../game/Engine';
import { hexToString } from '../game/HexMath';

interface GameUIProps {
  state: GameState;
  threatLevel: number;
  onPickTech: (id: string) => void;
  onRestart: () => void;
  onReturnToCampaign?: (victory: boolean) => void;
}

export const GameUI: React.FC<GameUIProps> = ({ state, threatLevel, onPickTech, onRestart, onReturnToCampaign }) => {
  const acquiredTechs = state.techs.map(id => ALL_TECHS.find(t => t.id === id)).filter(Boolean);
  const acquiredFusions = state.fusions.map(id => FUSIONS.find(f => f.id === id)).filter(Boolean);

  const hasCalendar = state.techs.includes('Calendar');
  const timeToNextWave = Math.max(0, 10 - (state.time % 10));
  const nextTurn = state.turn + 1;
  const nextWaveEnemies = getWaveComposition(nextTurn, threatLevel).text;

  const getTerrainName = (t?: Terrain) => {
    switch (t) {
      case Terrain.Plains: return 'Plains';
      case Terrain.Hills: return 'Hills';
      case Terrain.Forest: return 'Forest';
      case Terrain.Mountains: return 'Mountains';
      default: return 'Unknown';
    }
  };

  const getTerrainColor = (t?: Terrain) => {
    switch (t) {
      case Terrain.Plains: return 'text-[#a3d977]';
      case Terrain.Hills: return 'text-[#d9b377]';
      case Terrain.Forest: return 'text-[#4d8c39]';
      case Terrain.Mountains: return 'text-slate-400';
      default: return 'text-slate-300';
    }
  };

  const sortedCities = [...state.cities].sort((a, b) => {
    const tileA = state.tiles.get(hexToString(a.hex));
    const tileB = state.tiles.get(hexToString(b.hex));
    const typeA = tileA?.terrain ?? -1;
    const typeB = tileB?.terrain ?? -1;
    if (typeA !== typeB) return typeA - typeB;
    return b.size - a.size;
  });

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col">
      {/* Top Bar */}
      <div className="bg-slate-900/80 text-white p-4 flex justify-between items-center pointer-events-auto">
        <div className="flex gap-8 items-center">
          <div className="flex flex-col">
            <span className="text-xl font-bold">Wave {Math.min(state.turn, 40)} / 40</span>
            <span className="text-sm font-semibold text-blue-300">Supplies: {Math.max(0, state.supplies)}</span>
            <span className="text-[10px] text-slate-500">Phase: {state.phase}</span>
          </div>

          {state.turn < 40 && state.phase === 'PLAYING' && (
            <div className="flex flex-col w-32 border-l border-slate-700 pl-8">
              <span className="text-xs text-slate-400 font-bold tracking-wider mb-1">NEXT WAVE IN</span>
              <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-purple-500 h-full" 
                  style={{ width: `${(timeToNextWave / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-center w-1/3">
          <span className="text-sm font-semibold mb-1">Level {state.level}</span>
          <div className="w-full bg-slate-700 h-5 rounded-full overflow-hidden relative flex items-center justify-center">
            <div 
              className="bg-blue-500 h-full transition-all duration-200 absolute left-0 top-0" 
              style={{ width: `${(state.xp / state.xpToNext) * 100}%` }}
            />
            <span className="text-[11px] text-white font-bold tracking-wider z-10 drop-shadow-md">{Math.floor(state.xp)} / {state.xpToNext} XP</span>
          </div>
        </div>
      </div>

      {/* Left Side Panels */}
      <div className="absolute left-4 top-24 flex flex-col gap-4 max-h-[calc(100vh-8rem)] overflow-y-auto pointer-events-none w-64">
        {/* City Readouts */}
        {state.cities.length > 0 && (
          <div className="bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto border border-slate-700 shadow-xl shrink-0">
            <h3 className="text-lg font-bold text-green-400 mb-2 border-b border-slate-700 pb-1">Outposts: {state.cities.length}</h3>
            <div className="flex flex-col gap-2">
              {sortedCities.map((city, index) => {
                const tile = state.tiles.get(hexToString(city.hex));
                const terrainName = getTerrainName(tile?.terrain);
                const terrainColor = getTerrainColor(tile?.terrain);
                const defenders = state.friendlyUnits.filter(u => u.cityId === city.id && u.type === 'guard').length;
                const maxDefenders = Math.min(6, city.size);
                return (
                  <div key={city.id} className="flex flex-col text-sm">
                    <div className="flex justify-between items-center text-slate-400 text-xs mt-1">
                      <span>HP: {Math.floor(city.hp)}/{city.maxHp}</span>
                      <span className={`font-medium px-2 ${terrainColor}`}>{terrainName}</span>
                      <span>Guards: {defenders}/{maxDefenders}</span>
                    </div>
                    <div className="w-full bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="bg-red-500 h-full transition-all duration-200" 
                        style={{ width: `${(city.hp / city.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right Side Panels */}
      <div className="absolute right-4 top-24 flex flex-col gap-4 max-h-[calc(100vh-8rem)] overflow-y-auto pointer-events-none w-64">
        {/* Calendar Panel */}
        {hasCalendar && state.phase === 'PLAYING' && (
          <div className="bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto border border-slate-700 shadow-xl shrink-0">
            <h3 className="text-lg font-bold text-purple-400 mb-2 border-b border-slate-700 pb-1">Threat Assessment</h3>
            <div className="flex flex-col gap-3">
              {state.turn < 40 ? (
                <div className="flex flex-col">
                  <span className="text-slate-400 text-sm">Approaching Horde:</span>
                  <span className="text-sm font-semibold text-red-400 mt-1">{nextWaveEnemies}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <span className="text-red-500 font-bold text-lg animate-pulse">FINAL WAVE</span>
                  <span className="text-slate-400 text-sm mt-1">Clear remaining enemies</span>
                </div>
              )}
              
              <div className="flex flex-col pt-2 border-t border-slate-700/50">
                <span className="text-slate-400 text-xs mb-1">Base Per-Second Influx</span>
                {state.spawnRates.scout > 0 && <span className="text-xs text-slate-300">Scouts: {state.spawnRates.scout.toFixed(2)}/s</span>}
                {state.spawnRates.warrior > 0 && <span className="text-xs text-orange-300">Warriors: {state.spawnRates.warrior.toFixed(2)}/s</span>}
                {state.spawnRates.brute > 0 && <span className="text-xs text-red-300">Brutes: {state.spawnRates.brute.toFixed(2)}/s</span>}
                {state.spawnRates.reinforcement > 0 && <span className="text-xs text-blue-300 mt-1">Reinforcements: {state.spawnRates.reinforcement.toFixed(2)}/s</span>}
              </div>
            </div>
          </div>
        )}

        {/* Acquired Techs & Fusions Panel */}
        {(acquiredTechs.length > 0 || acquiredFusions.length > 0) && (
          <div className="bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto border border-slate-700 shadow-xl shrink-0 flex flex-col gap-4">
            {acquiredFusions.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-yellow-400 mb-2 border-b border-slate-700 pb-1">Fusions: {acquiredFusions.length}</h3>
                <ul className="flex flex-col gap-3">
                  {acquiredFusions.map(f => (
                    <li key={f!.id} className="text-sm">
                      <span className="font-semibold text-yellow-300 block">{f!.name}</span>
                      <span className="text-slate-400 text-xs">{f!.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {acquiredTechs.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-blue-400 mb-2 border-b border-slate-700 pb-1">Developments: {acquiredTechs.length}</h3>
                <ul className="flex flex-col gap-3">
                  {acquiredTechs.map(t => (
                    <li key={t!.id} className="text-sm">
                      <span className="font-semibold text-blue-300 block">{t!.name}</span>
                      <span className="text-slate-400 text-xs">{t!.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prompts */}
      {state.phase === 'START' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-lg animate-pulse pointer-events-auto">
          Click anywhere on the map to place your Capital Outpost
        </div>
      )}

      {state.phase === 'PLAYING' && !state.focusedHex && state.supplies > 0 && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full font-bold shadow-lg animate-pulse pointer-events-auto">
          Select an adjacent tile to guide improvements
        </div>
      )}

      {state.phase === 'PLAYING' && state.supplies <= 0 && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/80 text-white px-6 py-3 rounded-full font-bold shadow-lg border border-red-400 pointer-events-none">
          No More Supplies
        </div>
      )}

      {/* Level Up Modal */}
      {state.phase === 'LEVEL_UP' && state.pendingTechPicks.length > 0 && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-auto">
          <div className="bg-slate-800 p-8 rounded-xl max-w-3xl w-full">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Level Up!</h2>
            <div className="grid grid-cols-3 gap-6">
              {state.pendingTechPicks[0].map(tech => (
                <button
                  key={tech.id}
                  onClick={() => onPickTech(tech.id)}
                  className="bg-slate-700 hover:bg-slate-600 p-6 rounded-lg text-left transition-colors border border-slate-600 hover:border-blue-400 flex flex-col gap-2"
                >
                  <span className="text-xl font-bold text-white">{tech.name}</span>
                  <span className="text-sm text-slate-300">{tech.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game Over / Victory Modal */}
      {(state.phase === 'GAME_OVER' || state.phase === 'VICTORY') && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
          <div className="bg-slate-800 p-8 rounded-xl max-w-md w-full text-center">
            <h2 className={`text-4xl font-bold mb-4 ${state.phase === 'VICTORY' ? 'text-yellow-400' : 'text-red-500'}`}>
              {state.phase === 'VICTORY' ? 'VICTORY' : 'OUTPOSTS FALLEN'}
            </h2>
            <div className="text-slate-300 mb-8 flex flex-col gap-2">
              <p>Survived until Wave: {Math.min(state.turn, 40)}</p>
              <p>Beasts Killed: {state.stats.threatsKilled}</p>
              <p>Outposts Lost: {state.stats.citiesLost}</p>
              <p>Developments Acquired: {state.techs.length}</p>
              <p>Fusions Discovered: {state.fusions.length}</p>
            </div>
            
            {state.phase === 'VICTORY' ? (
              <button
                onClick={() => onReturnToCampaign?.(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold text-lg transition-colors"
              >
                Claim the Land
              </button>
            ) : (
              <button
                onClick={() => onReturnToCampaign?.(false)}
                className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-lg font-bold text-lg transition-colors"
              >
                We'll be back!
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
