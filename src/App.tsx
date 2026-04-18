import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, HEX_SIZE } from './game/Engine';
import { Renderer } from './game/Renderer';
import { GameUI } from './components/GameUI';
import { pixelToHex, hexToString, Hex, hexNeighbor } from './game/HexMath';
import { GameState } from './game/Types';
import { CampaignEngine } from './game/Campaign';
import { CampaignRenderer } from './game/CampaignRenderer';
import { ALL_TECHS, FUSIONS } from './game/Content';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [view, setView] = useState<'CAMPAIGN' | 'SURVIVAL'>('CAMPAIGN');
  const [showDebug, setShowDebug] = useState(false);
  
  const campaignEngineRef = useRef<CampaignEngine | null>(null);
  const campaignRendererRef = useRef<CampaignRenderer | null>(null);
  
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  
  const [gameState, setGameState] = useState<GameState | null>(null);
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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startSurvival = (hex: Hex) => {
    activeHexRef.current = hex;
    const tile = campaignEngineRef.current?.tiles.get(hexToString(hex));
    const threatLevel = tile ? tile.threatLevel : 0;
    
    // Check neighbors to build safe edges
    const safeEdges = [false, false, false, false, false, false];
    if (campaignEngineRef.current) {
       for (let i = 0; i < 6; i++) {
          const nHex = hexNeighbor(hex, i);
          const nTile = campaignEngineRef.current.tiles.get(hexToString(nHex));
          if (nTile && nTile.status === 'CLEARED') {
             safeEdges[i] = true;
          }
       }
    }
    
    // Seed is ignored right now since generateMap doesn't use it, 
    // but preserving constructor signature if needed or creating new
    const engine = new GameEngine(threatLevel, safeEdges);
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
      
      if (clickedTile && clickedTile.status === 'CLAIMABLE') {
        startSurvival(clickedTile.hex);
      }
    } else {
      if (!engineRef.current || !rendererRef.current) return;
      const engine = engineRef.current;
      const renderer = rendererRef.current;

      if (engine.state.phase === 'START' || (engine.state.phase === 'PLAYING' && engine.state.availableCities > 0)) {
        const worldX = (mousePosRef.current.x - renderer.camera.x) / renderer.camera.zoom;
        const worldY = (mousePosRef.current.y - renderer.camera.y) / renderer.camera.zoom;
        const hex = pixelToHex(worldX, worldY, HEX_SIZE);
        engine.placeCity(hex);
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
    const hasCleared = Array.from(campaignEngineRef.current.tiles.values()).some(t => t.status === 'CLEARED');
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
      
      {showDebug && view === 'SURVIVAL' && (
        <div className="absolute top-4 right-4 pointer-events-none bg-black/80 text-white p-3 rounded font-mono text-sm border border-slate-700 z-50">
          <div className="text-red-400 font-bold mb-1">DEBUG OVERLAY</div>
          <div>Threat Level: {engineRef.current?.threatLevel ?? 0}</div>
          <div>Spawn Rate: {(gameState?.spawnRate ?? 0).toFixed(2)}/s</div>
          <div>Turn: {gameState?.turn ?? 1}</div>
        </div>
      )}
      
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
                window.location.reload();
              }}
              className="bg-red-900/80 hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-red-700"
            >
              Reset Campaign Progress
            </button>
          </div>
        </>
      )}
    </div>
  );
}
