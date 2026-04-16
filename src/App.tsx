import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GameEngine, HEX_SIZE } from './game/Engine';
import { Renderer } from './game/Renderer';
import { GameUI } from './components/GameUI';
import { pixelToHex } from './game/HexMath';
import { GameState } from './game/Types';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // Initialize game
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
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const engine = new GameEngine();
    engineRef.current = engine;
    
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;

    engine.onStateChange = (state) => {
      setGameState(state);
    };
    
    setGameState(engine.state);

    const loop = (time: number) => {
      if (lastTimeRef.current !== 0) {
        const dt = (time - lastTimeRef.current) / 1000;
        // Cap dt to prevent huge jumps if tab is inactive
        engineRef.current?.update(Math.min(dt, 0.1));
      }
      lastTimeRef.current = time;
      
      if (rendererRef.current && engineRef.current) {
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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engineRef.current || !rendererRef.current) return;
    const engine = engineRef.current;
    const renderer = rendererRef.current;

    if (engine.state.phase === 'START' || (engine.state.phase === 'PLAYING' && engine.state.availableCities > 0)) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Reverse camera transform
      const worldX = (x - renderer.camera.x) / renderer.camera.zoom;
      const worldY = (y - renderer.camera.y) / renderer.camera.zoom;

      const hex = pixelToHex(worldX, worldY, HEX_SIZE);
      engine.placeCity(hex);
    }
  };

  const handleRestart = () => {
    if (engineRef.current) {
      const newEngine = new GameEngine();
      newEngine.onStateChange = setGameState;
      engineRef.current = newEngine;
      setGameState(newEngine.state);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleCanvasClick}
      />
      {gameState && (
        <GameUI 
          state={gameState} 
          onPickTech={(id) => engineRef.current?.pickTech(id)}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
