import React from 'react';
import { GameState } from '../game/Types';
import { ALL_TECHS, FUSIONS } from '../game/Content';

interface GameUIProps {
  state: GameState;
  onPickTech: (id: string) => void;
  onRestart: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({ state, onPickTech, onRestart }) => {
  const acquiredTechs = state.techs.map(id => ALL_TECHS.find(t => t.id === id)).filter(Boolean);
  const acquiredFusions = state.fusions.map(id => FUSIONS.find(f => f.id === id)).filter(Boolean);

  const hasCalendar = state.techs.includes('Calendar');
  const timeToNextWave = Math.max(0, 10 - (state.time % 10));
  const nextTurn = state.turn + 1;
  let nextWaveEnemies = 'Scouts';
  if (nextTurn > 35) nextWaveEnemies = 'Massive Brute Swarm';
  else if (nextTurn > 30) nextWaveEnemies = 'Warriors, Brutes';
  else if (nextTurn > 20) nextWaveEnemies = 'Scouts, Warriors, Brutes';
  else if (nextTurn > 10) nextWaveEnemies = 'Scouts, Warriors';

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col">
      {/* Top Bar */}
      <div className="bg-slate-900/80 text-white p-4 flex justify-between items-center pointer-events-auto">
        <div className="flex flex-col">
          <span className="text-xl font-bold">Wave {state.turn} / 40</span>
          <span className="text-sm text-slate-300">Phase: {state.phase}</span>
        </div>
        
        <div className="flex flex-col items-center w-1/3">
          <span className="text-sm font-semibold mb-1">Level {state.level}</span>
          <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-200" 
              style={{ width: `${(state.xp / state.xpToNext) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 mt-1">{Math.floor(state.xp)} / {state.xpToNext} XP</span>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-sm text-slate-300">Cities</span>
            <span className="text-xl font-bold">{state.cities.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm text-slate-300">Settlers</span>
            <span className="text-xl font-bold text-green-400">{state.availableCities}</span>
          </div>
        </div>
      </div>

      {/* Acquired Techs & Fusions Panel */}
      {(acquiredTechs.length > 0 || acquiredFusions.length > 0) && (
        <div className="absolute left-4 top-24 w-64 bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto max-h-[calc(100vh-8rem)] overflow-y-auto flex flex-col gap-4 border border-slate-700 shadow-xl">
          {acquiredFusions.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-yellow-400 mb-2 border-b border-slate-700 pb-1">Fusions</h3>
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
              <h3 className="text-lg font-bold text-blue-400 mb-2 border-b border-slate-700 pb-1">Technologies</h3>
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

      {/* Right Side Panels */}
      <div className="absolute right-4 top-24 flex flex-col gap-4 max-h-[calc(100vh-8rem)] overflow-y-auto pointer-events-none w-64">
        {/* Calendar Panel */}
        {hasCalendar && state.phase === 'PLAYING' && (
          <div className="bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto border border-slate-700 shadow-xl shrink-0">
            <h3 className="text-lg font-bold text-purple-400 mb-2 border-b border-slate-700 pb-1">Calendar</h3>
            <div className="flex flex-col gap-2">
              {state.turn < 40 ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Next Wave In:</span>
                    <span className="font-mono font-bold text-lg">{timeToNextWave.toFixed(1)}s</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-sm">Incoming Threats:</span>
                    <span className="text-sm font-semibold text-red-400">{nextWaveEnemies}</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <span className="text-red-500 font-bold text-lg animate-pulse">FINAL WAVE</span>
                  <span className="text-slate-400 text-sm mt-1">Clear remaining enemies</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* City Readouts */}
        {state.cities.length > 0 && (
          <div className="bg-slate-900/80 text-white p-4 rounded-lg pointer-events-auto border border-slate-700 shadow-xl shrink-0">
            <h3 className="text-lg font-bold text-green-400 mb-2 border-b border-slate-700 pb-1">Cities</h3>
            <div className="flex flex-col gap-4">
              {state.cities.map((city, index) => {
                const defenders = state.friendlyUnits.filter(u => u.cityId === city.id).length;
                const maxDefenders = Math.min(6, city.size);
                return (
                  <div key={city.id} className="flex flex-col text-sm">
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>City {index + 1}</span>
                      <span className="text-blue-300">Size {city.size}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-xs mt-1">
                      <span>HP: {Math.floor(city.hp)}/{city.maxHp}</span>
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

      {/* Prompts */}
      {state.phase === 'START' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-lg animate-pulse pointer-events-auto">
          Click anywhere on the map to place your Capital City
        </div>
      )}

      {state.phase === 'PLAYING' && state.availableCities > 0 && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full font-bold shadow-lg animate-pulse pointer-events-auto">
          Click to place a new City (must be 3 tiles away from others)
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
              {state.phase === 'VICTORY' ? 'VICTORY' : 'DEFEAT'}
            </h2>
            <div className="text-slate-300 mb-8 flex flex-col gap-2">
              <p>Survived until Wave: {state.turn}</p>
              <p>Threats Killed: {state.stats.threatsKilled}</p>
              <p>Cities Lost: {state.stats.citiesLost}</p>
              <p>Techs Acquired: {state.techs.length}</p>
              <p>Fusions Discovered: {state.fusions.length}</p>
            </div>
            <button
              onClick={onRestart}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold text-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
