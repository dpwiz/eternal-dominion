import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, HEX_SIZE, getWaveComposition } from './game/Engine';
import { Renderer } from './game/Renderer';
import { GameUI } from './components/GameUI';
import { pixelToHex, hexToString, Hex, hexNeighbor, hexDirections } from './game/HexMath';
import { GameState, Terrain } from './game/Types';
import { CampaignEngine } from './game/Campaign';
import { CampaignRenderer } from './game/CampaignRenderer';
import { ALL_TECHS, FUSIONS } from './game/Content';
import { get, set, clear } from 'idb-keyval';

const TerrainDebugPanel = ({ engine, renderer, mousePosRef }: { engine: GameEngine, renderer: Renderer, mousePosRef: React.MutableRefObject<{x: number, y: number}> }) => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let handle: number;
    const loop = () => {
       const mx = mousePosRef.current.x;
       const my = mousePosRef.current.y;
       const worldX = mx - renderer.camera.x;
       const worldY = my - renderer.camera.y;
       const hex = pixelToHex(worldX, worldY, HEX_SIZE);
       
       const tileStr = hexToString(hex);
       const tile = engine.state.tiles.get(tileStr);

       if (tile) {
         const weightsMap = engine.getTerrainBlend(hex.q, hex.r, hex.s, hexDirections);
         const weights: {name: string, w: number}[] = [];
         let pM = 0, pH = 0, pF = 0, pP = 0;
         for (const [t, w] of weightsMap.entries()) {
            weights.push({ name: Terrain[t], w });
            const base = engine.getTerrainBaseProbabilities(t);
            pM += w * base.m;
            pH += w * base.h;
            pF += w * base.f;
            pP += w * base.p;
         }
         
         const centerT = Terrain[engine.centerTerrain];
         const borderT = engine.borderTerrain.map(t => t == null ? '--' : Terrain[t]);

         setData({
           q: hex.q, r: hex.r, s: hex.s,
           terrainStr: Terrain[tile.terrain],
           centerT,
           borderT,
           weights,
           probs: { m: pM, h: pH, f: pF, p: pP }
         });
       } else {
         setData(null);
       }

       handle = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(handle);
  }, [engine, renderer, mousePosRef]);

  if (!data) return null;

  return (
    <div className="absolute bottom-4 right-4 bg-slate-900/95 text-white p-4 rounded-xl border border-slate-700 shadow-2xl pointer-events-none text-xs font-mono w-64 z-50">
      <div className="font-bold text-green-400 mb-2 pb-1 border-b border-slate-700">TERRAIN BLEND DEBUG</div>
      <div className="mb-2">
        HEX: {data.q}, {data.r}, {data.s} <br/>
        RESULT: <span className="text-amber-300 font-bold">{data.terrainStr}</span>
      </div>
      
      <div className="mb-2 text-slate-400">
        <div className="text-[10px] text-slate-500 mb-1 border-b border-slate-700">MACRO MAP</div>
        {(() => {
          const tc = (t: string) => {
            if (t === 'Plains') return '#a3d977';
            if (t === 'Hills') return '#d9b377';
            if (t === 'Forest') return '#4d8c39';
            if (t === 'Mountains') return '#7a7a7a';
            return '#ffffff';
          };
          const ts = (t: string) => <span style={{color: tc(t)}}>{t === '--' ? '--' : t.substring(0,2)}</span>;
          return (
            <div className="flex flex-col items-center gap-1 my-2 font-bold text-sm">
              <div className="flex gap-3">
                {ts(data.borderT[2])} {ts(data.borderT[1])}
              </div>
              <div className="flex gap-3">
                {ts(data.borderT[3])} {ts(data.centerT)} {ts(data.borderT[0])}
              </div>
              <div className="flex gap-3">
                {ts(data.borderT[4])} {ts(data.borderT[5])}
              </div>
            </div>
          );
        })()}
      </div>
      
      <div className="mb-2 text-slate-400">
        <div className="text-[10px] text-slate-500 mb-1 border-b border-slate-700">BARYCENTRIC WEIGHTS</div>
        {data.weights.map((w: any, idx: number) => (
          <div key={idx} className="flex justify-between">
            <span>{w.name}</span>
            <span>{(w.w * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="text-slate-400">
        <div className="text-[10px] text-slate-500 mb-1 border-b border-slate-700">FINAL PROBABILITIES</div>
        <div className="flex justify-between"><span className="text-slate-400">Plains</span><span>{(data.probs.p * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-green-400">Forest</span><span>{(data.probs.f * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-amber-600">Hills</span><span>{(data.probs.h * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-slate-300">Mtns</span><span>{(data.probs.m * 100).toFixed(1)}%</span></div>
      </div>
    </div>
  );
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [view, setView] = useState<'CAMPAIGN' | 'SURVIVAL'>('CAMPAIGN');
  const [showDebug, setShowDebug] = useState(false);
  
  const campaignEngineRef = useRef<CampaignEngine | null>(null);
  const campaignRendererRef = useRef<CampaignRenderer | null>(null);
  
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [, forceRender] = useState(0);

  const activeHexRef = useRef<Hex | null>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Initialize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (rendererRef.current) {
        rendererRef.current.resize(canvas.width, canvas.height);
      }
      if (campaignRendererRef.current) {
        campaignRendererRef.current.resize(canvas.width, canvas.height);
      }
    };
    window.addEventListener('resize', handleResize);
    
    // Init campaign only once
    if (!campaignEngineRef.current) {
      campaignEngineRef.current = new CampaignEngine(1337);
      campaignRendererRef.current = new CampaignRenderer(canvas);
      rendererRef.current = new Renderer(canvas);
      forceRender(v => v + 1);
    }
    
    handleResize();

    const loop = (time: number) => {
      if (lastTimeRef.current !== 0) {
        const dt = (time - lastTimeRef.current) / 1000;
        if (engineRef.current) {
          engineRef.current.update(Math.min(dt, 0.1));
        }
      }
      lastTimeRef.current = time;
      
      if (!engineRef.current && campaignRendererRef.current && campaignEngineRef.current) {
        const worldX = mousePosRef.current.x - campaignRendererRef.current.camera.x;
        const worldY = mousePosRef.current.y - campaignRendererRef.current.camera.y;
        const hoverHexObj = pixelToHex(worldX, worldY, campaignRendererRef.current.HEX_SIZE);
        campaignRendererRef.current.draw(campaignEngineRef.current, hexToString(hoverHexObj));
      } else if (engineRef.current && rendererRef.current) {
        rendererRef.current.draw(engineRef.current.state);
      }
      
      requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  useEffect(() => {
    const doInstaWin = () => {
      if (engineRef.current && view === 'SURVIVAL') {
        engineRef.current.instaWin();
      } else {
        console.warn("instaWin() can only be called while fighting a survival wave!");
      }
    };

    const doInstaLose = () => {
      if (engineRef.current && view === 'SURVIVAL') {
        engineRef.current.instaLose();
      } else {
        console.warn("instaLose() can only be called while fighting a survival wave!");
      }
    };

    (window as any).instaWin = doInstaWin;
    (window as any).instaLose = doInstaLose;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Secret keyboard shortcuts
      if (e.shiftKey) {
        if (e.key.toLowerCase() === 'w') {
          doInstaWin();
        } else if (e.key.toLowerCase() === 'l') {
          doInstaLose();
        } else if (e.key.toLowerCase() === 'd') {
          setShowDebug(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  useEffect(() => {
    if (gameState && (gameState.phase === 'VICTORY' || gameState.phase === 'GAME_OVER') && activeHexRef.current) {
      const macroHexId = hexToString(activeHexRef.current);
      const improvements: Record<string, number> = {};
      
      gameState.tiles.forEach((tile: any, key: string) => {
        if (tile.improvementLevel !== 0 && tile.improvementLevel !== undefined) {
           improvements[key] = tile.improvementLevel;
        }
      });
      
      set(`ruins_${macroHexId}`, improvements).catch(e => console.error(e));
    }
  }, [gameState?.phase]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startSurvival = async (hex: Hex) => {
    activeHexRef.current = hex;
    const tile = campaignEngineRef.current?.tiles.get(hexToString(hex));
    const threatLevel = tile ? tile.threatLevel : 0;
    
    // Check neighbors to build safe edges
    const safeEdges = [false, false, false, false, false, false];
    const borderTerrain: (Terrain | null)[] = [null, null, null, null, null, null];
    let centerTerrain = Terrain.Plains;
    
    if (campaignEngineRef.current) {
       centerTerrain = tile?.terrain ?? Terrain.Plains;
       for (let i = 0; i < 6; i++) {
          const nHex = hexNeighbor(hex, i);
          const nTile = campaignEngineRef.current.tiles.get(hexToString(nHex));
          if (nTile) {
            borderTerrain[i] = nTile.terrain;
            if (nTile.status === 'CLEARED') {
               safeEdges[i] = true;
            }
          }
       }
    }
    
    const macroHexId = hexToString(hex);
    let savedTiles = {};
    try {
      savedTiles = await get(`ruins_${macroHexId}`) || {};
    } catch(e) {}

    // Provide a deterministic seed based on coordinate hash plus threat level
    // q and r will uniquely identify the map tile since the campaign map places it deterministically
    const seed = hex.q * 8731 + hex.r * 19283 + hex.s * 7823 + threatLevel * 991;
    const engine = new GameEngine(threatLevel, safeEdges, seed, centerTerrain, borderTerrain, savedTiles);
    engine.onStateChange = setGameState;
    engineRef.current = engine;
    setGameState(engine.state);
    setView('SURVIVAL');
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (view === 'CAMPAIGN') {
      if (!campaignRendererRef.current || !campaignEngineRef.current) return;
      const worldX = mousePosRef.current.x - campaignRendererRef.current.camera.x;
      const worldY = mousePosRef.current.y - campaignRendererRef.current.camera.y;
      const hex = pixelToHex(worldX, worldY, campaignRendererRef.current.HEX_SIZE);
      const clickedTile = campaignEngineRef.current.tiles.get(hexToString(hex));
      
      if (clickedTile && (clickedTile.status === 'CLAIMABLE' || clickedTile.status === 'CLEARED')) {
        startSurvival(clickedTile.hex);
      }
    } else {
      if (!engineRef.current || !rendererRef.current) return;
      const engine = engineRef.current;
      const renderer = rendererRef.current;

      if (engine.state.phase === 'START' || engine.state.phase === 'PLAYING') {
        const worldX = (mousePosRef.current.x - renderer.camera.x) / renderer.camera.zoom;
        const worldY = (mousePosRef.current.y - renderer.camera.y) / renderer.camera.zoom;
        const hex = pixelToHex(worldX, worldY, HEX_SIZE);
        engine.handleHexClick(hex);
      }
    }
  };

  const handleReturnToCampaign = (victory: boolean) => {
    if (activeHexRef.current && campaignEngineRef.current) {
      const turnsPlayed = engineRef.current ? Math.max(1, engineRef.current.state.turn) : 1;
      const earnedXp = engineRef.current ? Math.floor(engineRef.current.state.stats.cumulativeXp) : 0;
      const techs = engineRef.current ? engineRef.current.state.techs : [];
      const fusions = engineRef.current ? engineRef.current.state.fusions : [];
      campaignEngineRef.current.resolveRun(activeHexRef.current, victory, turnsPlayed, earnedXp, techs, fusions);
    }
    setView('CAMPAIGN');
    engineRef.current = null;
    setGameState(null);
  };

  const handleRestart = () => {
    if (activeHexRef.current) {
      if (campaignEngineRef.current) {
         const turnsPlayed = engineRef.current ? Math.max(1, engineRef.current.state.turn) : 1;
         const earnedXp = engineRef.current ? Math.floor(engineRef.current.state.stats.cumulativeXp) : 0;
         const techs = engineRef.current ? engineRef.current.state.techs : [];
         const fusions = engineRef.current ? engineRef.current.state.fusions : [];
         campaignEngineRef.current.resolveRun(activeHexRef.current, false, turnsPlayed, earnedXp, techs, fusions);
      }
      startSurvival(activeHexRef.current);
    }
  };

  const getCampaignMessage = () => {
    if (!campaignEngineRef.current) return 'Claim territories to expand your village';
    const hasCleared = Array.from(campaignEngineRef.current.tiles.values()).some((t: any) => t.status === 'CLEARED');
    return hasCleared 
      ? 'Claim territories to expand your village' 
      : 'Make landfall and establish a foothold to expand your village';
  };

  const renderProficiencies = () => {
    const profs = campaignEngineRef.current?.proficiencies || {};
    const keys = Object.keys(profs).sort((a,b) => profs[b] - profs[a]);
    if (keys.length === 0) return null;

    return (
        <div className="absolute right-4 top-4 pointer-events-none">
            <div className="bg-slate-900/90 text-white p-4 rounded-xl border border-slate-700 shadow-2xl w-64 max-h-[80vh] overflow-y-auto pointer-events-auto">
              <div className="text-sm text-purple-400 font-bold tracking-wider mb-2">VILLAGE PROFICIENCY</div>
              <div className="flex flex-col gap-1">
                {keys.map(k => {
                   const techDef = ALL_TECHS.find(t => t.id === k);
                   const fDef = FUSIONS.find(f => f.id === k);
                   const name = techDef ? techDef.name : (fDef ? fDef.name : k);
                   const isFusion = !!fDef;

                   return (
                     <div key={k} className="flex justify-between items-center text-sm">
                       <span className={isFusion ? 'text-amber-300' : 'text-slate-300'}>{name}</span>
                       <span className="font-mono text-slate-500">x{profs[k]}</span>
                     </div>
                   );
                })}
              </div>
            </div>
        </div>
    );
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${view === 'CAMPAIGN' ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
      />
      {view === 'SURVIVAL' && gameState && (
        <GameUI 
          state={gameState} 
          threatLevel={engineRef.current?.threatLevel ?? 0}
          onPickTech={(id) => engineRef.current?.pickTech(id)}
          onRestart={handleRestart}
          onReturnToCampaign={handleReturnToCampaign}
        />
      )}
      
      {showDebug && view === 'SURVIVAL' && (() => {
        const tl = engineRef.current?.threatLevel ?? 0;
        const sparkData = Array.from({length: 40}, (_, i) => getWaveComposition(i + 1, tl));
        const maxVal = Math.max(0.1, ...sparkData.flatMap(d => [d.scout, d.warrior, d.brute]));
        const w = 240, h = 60;
        const turnIdx = Math.min(39, Math.max(0, (gameState?.turn ?? 1) - 1));
        return (
          <div className="absolute bottom-4 left-4 pointer-events-none bg-black/80 text-white p-3 rounded font-mono text-sm border border-slate-700 z-50">
            <div className="text-red-400 font-bold mb-1">DEBUG OVERLAY</div>
            <div>Threat Level: {tl}</div>
            <div>Scouts: {(gameState?.currentSpawnRates.scout ?? 0).toFixed(2)}/s</div>
            <div>Warriors: {(gameState?.currentSpawnRates.warrior ?? 0).toFixed(2)}/s</div>
            <div>Brutes: {(gameState?.currentSpawnRates.brute ?? 0).toFixed(2)}/s</div>
            <div>Reinforcements: {(gameState?.currentSpawnRates.reinforcement ?? 0).toFixed(2)}/s</div>
            <div>Time: {Math.floor(gameState?.time ?? 0)}s</div>
            
            <div className="mt-3 border-t border-slate-700 pt-2">
              <div className="text-[10px] text-slate-400 mb-1 flex justify-between">
                <span>SC</span>
                <span>WR</span>
                <span>BR</span>
              </div>
              <svg width={w} height={h} className="bg-slate-900 rounded border border-slate-700">
                {/* Scouts - Slate */}
                <polyline 
                  fill="none" 
                  stroke="#cbd5e1" 
                  strokeWidth="1.5" 
                  points={sparkData.map((d, i) => `${(i / 39) * w},${h - (d.scout / maxVal) * h}`).join(' ')} 
                />
                {/* Warriors - Orange */}
                <polyline 
                  fill="none" 
                  stroke="#fdba74" 
                  strokeWidth="1.5" 
                  points={sparkData.map((d, i) => `${(i / 39) * w},${h - (d.warrior / maxVal) * h}`).join(' ')} 
                />
                {/* Brutes - Red */}
                <polyline 
                  fill="none" 
                  stroke="#fca5a5" 
                  strokeWidth="1.5" 
                  points={sparkData.map((d, i) => `${(i / 39) * w},${h - (d.brute / maxVal) * h}`).join(' ')} 
                />
                {/* Current Wave Marker */}
                <line 
                  x1={(turnIdx / 39) * w} 
                  y1="0" 
                  x2={(turnIdx / 39) * w} 
                  y2={h} 
                  stroke="#3b82f6" 
                  strokeWidth="2" 
                />
              </svg>
            </div>
          </div>
        );
      })()}
      
      {view === 'CAMPAIGN' && (
        <>
          <div className="absolute top-4 left-4 pointer-events-none flex gap-4">
            <div className="bg-slate-900/90 text-white px-4 py-2 rounded-xl border border-slate-700 shadow-2xl">
              <div className="text-sm text-slate-400 font-bold tracking-wider">DAY</div>
              <div className="text-2xl font-mono text-blue-400">
                {campaignEngineRef.current?.days || 1}
              </div>
            </div>
            <div className="bg-slate-900/90 text-white px-4 py-2 rounded-xl border border-slate-700 shadow-2xl">
              <div className="text-sm text-amber-400 font-bold tracking-wider">LEVEL {campaignEngineRef.current?.globalLevel || 1}</div>
              <div className="text-2xl font-mono text-amber-500">
                {Math.floor(campaignEngineRef.current?.globalXp || 0)} <span className="text-sm text-slate-500">XP</span>
              </div>
            </div>
          </div>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="bg-slate-900/90 text-white px-8 py-4 rounded-xl border border-slate-700 shadow-2xl flex flex-col items-center">
              <h1 className="text-3xl font-bold text-green-400 mb-1 tracking-wider">THE WILDS</h1>
              <p className="text-slate-400">{getCampaignMessage()}</p>
            </div>
          </div>
          {renderProficiencies()}
          <div className="absolute bottom-4 right-4">
            <button
              onClick={() => {
                localStorage.removeItem('campaign_save');
                clear().then(() => {
                  window.location.reload();
                });
              }}
              className="bg-red-900/80 hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-red-700 pointer-events-auto"
            >
              Reset Campaign Progress
            </button>
          </div>
        </>
      )}

      {view === 'SURVIVAL' && showDebug && engineRef.current && rendererRef.current && (
         <TerrainDebugPanel engine={engineRef.current} renderer={rendererRef.current} mousePosRef={mousePosRef} />
      )}
    </div>
  );
}
