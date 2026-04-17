import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, HEX_SIZE } from './game/Engine';
import { Renderer } from './game/Renderer';
import { GameUI } from './components/GameUI';
import { pixelToHex, hexToString, Hex } from './game/HexMath';
import { GameState } from './game/Types';
import { CampaignEngine } from './game/Campaign';
import { CampaignRenderer } from './game/CampaignRenderer';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [view, setView] = useState<'CAMPAIGN' | 'SURVIVAL'>('CAMPAIGN');
  
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
    const seed = hex.q * 1000 + hex.r + 500000;
    const engine = new GameEngine(seed);
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
      campaignEngineRef.current.resolveRun(activeHexRef.current, victory);
    }
    setView('CAMPAIGN');
    engineRef.current = null;
    setGameState(null);
  };

  const handleRestart = () => {
    if (activeHexRef.current) {
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
          onPickTech={(id) => engineRef.current?.pickTech(id)}
          onRestart={handleRestart}
          onReturnToCampaign={handleReturnToCampaign}
        />
      )}
      
      {view === 'CAMPAIGN' && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="bg-slate-900/90 text-white px-8 py-4 rounded-xl border border-slate-700 shadow-2xl flex flex-col items-center">
              <h1 className="text-3xl font-bold text-green-400 mb-1 tracking-wider">THE WILDS</h1>
              <p className="text-slate-400">{getCampaignMessage()}</p>
            </div>
          </div>
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
