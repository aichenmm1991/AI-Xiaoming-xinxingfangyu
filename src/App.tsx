/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, RotateCcw, Info, Zap } from 'lucide-react';

// --- Constants & Types ---

const TARGET_SCORE = 1000;
const INITIAL_AMMO = [40, 40, 80, 40, 40];

type GameState = 'START' | 'PLAYING' | 'WON' | 'LOST';

interface Point {
  x: number;
  y: number;
}

interface Entity {
  id: string;
  x: number;
  y: number;
}

interface Rocket extends Entity {
  targetX: number;
  targetY: number;
  speed: number;
  progress: number; // 0 to 1
}

interface Interceptor extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
}

interface Explosion extends Entity {
  radius: number;
  maxRadius: number;
  expanding: boolean;
  life: number; // 0 to 1
}

interface City extends Entity {
  alive: boolean;
}

interface Tower extends Entity {
  alive: boolean;
  ammo: number;
  maxAmmo: number;
}

// --- Utils ---

const distance = (p1: Point, p2: Point) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  
  // Game Objects Refs (to avoid React re-render overhead in game loop)
  const rocketsRef = useRef<Rocket[]>([]);
  const interceptorsRef = useRef<Interceptor[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const towersRef = useRef<Tower[]>([]);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  const t = {
    zh: {
      title: "AI Xiaoming: 星战防御",
      start: "进入战场",
      score: "战绩",
      target: "目标",
      win: "原力与你同在！",
      lose: "基地已沦陷...",
      playAgain: "再次出征",
      ammo: "能量",
      instructions: "点击屏幕发射等离子炮拦截敌机。保护反抗军基地。",
      mission: "击落敌机达到 1000 分以获得胜利"
    },
    en: {
      title: "AI Xiaoming: Galactic Defense",
      start: "Enter Battle",
      score: "Score",
      target: "Target",
      win: "May the Force be with you!",
      lose: "Base Overrun...",
      playAgain: "Deploy Again",
      ammo: "Energy",
      instructions: "Tap to fire plasma bolts at enemy fighters. Protect the Rebel Base.",
      mission: "Reach 1000 points to secure the sector"
    }
  }[lang];

  // --- Initialization ---

  const initGame = useCallback(() => {
    const { width, height } = dimensionsRef.current;
    
    // 5 towers at 1/10, 3/10, 5/10, 7/10, 9/10
    const towerPositions = [0.1, 0.3, 0.5, 0.7, 0.9];
    towersRef.current = towerPositions.map((pos, i) => ({
      id: `tower-${i}`,
      x: width * pos,
      y: height - 50,
      alive: true,
      ammo: INITIAL_AMMO[i],
      maxAmmo: INITIAL_AMMO[i]
    }));

    // 6 cities placed in between
    const cityPositions = [0.2, 0.4, 0.45, 0.55, 0.6, 0.8]; // Adjusted to fit 6 cities
    citiesRef.current = cityPositions.map((pos, i) => ({
      id: `city-${i}`,
      x: width * pos,
      y: height - 40,
      alive: true
    }));

    rocketsRef.current = [];
    interceptorsRef.current = [];
    explosionsRef.current = [];
    setScore(0);
    setGameState('PLAYING');
    lastTimeRef.current = performance.now();
    spawnTimerRef.current = 0;
  }, []);

  // --- Game Loop Logic ---

  const update = (dt: number) => {
    if (gameState !== 'PLAYING') return;

    // Normalize dt to avoid huge jumps on first frame or tab switch
    const delta = Math.min(dt, 100); 

    // 1. Spawn Rockets
    spawnTimerRef.current += delta;
    const spawnRate = Math.max(266, 1000 - (score / 100) * 66); 
    if (spawnTimerRef.current > spawnRate) {
      spawnTimerRef.current = 0;
      const { width } = dimensionsRef.current;
      
      const targets = [...citiesRef.current.filter(c => c.alive), ...towersRef.current.filter(t => t.alive)];
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        rocketsRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: Math.random() * width,
          y: -20,
          targetX: target.x,
          targetY: target.y,
          // Adjusted speed: progress per frame (approx 0.001 - 0.003)
          speed: 0.0015 + Math.random() * 0.0015 + (score / 100000),
          progress: 0
        });
      }
    }

    // 2. Update Rockets (using reverse loop to safely splice)
    for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
      const rocket = rocketsRef.current[i];
      rocket.progress += rocket.speed * (delta / 16.67);
      
      if (rocket.progress >= 1) {
        const city = citiesRef.current.find(c => c.x === rocket.targetX && c.y === rocket.targetY);
        if (city) city.alive = false;
        const tower = towersRef.current.find(t => t.x === rocket.targetX && t.y === rocket.targetY);
        if (tower) tower.alive = false;

        explosionsRef.current.push({
          id: `impact-${Math.random()}`,
          x: rocket.targetX,
          y: rocket.targetY,
          radius: 0,
          maxRadius: 40,
          expanding: true,
          life: 1
        });

        rocketsRef.current.splice(i, 1);
        
        if (towersRef.current.every(t => !t.alive)) {
          setGameState('LOST');
        }
      }
    }

    // 3. Update Interceptors
    for (let i = interceptorsRef.current.length - 1; i >= 0; i--) {
      const inter = interceptorsRef.current[i];
      inter.progress += inter.speed * (delta / 16.67);
      if (inter.progress >= 1) {
        explosionsRef.current.push({
          id: `exp-${Math.random()}`,
          x: inter.targetX,
          y: inter.targetY,
          radius: 0,
          maxRadius: 50,
          expanding: true,
          life: 1
        });
        interceptorsRef.current.splice(i, 1);
      }
    }

    // 4. Update Explosions
    for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
      const exp = explosionsRef.current[i];
      if (exp.expanding) {
        exp.radius += 1.5 * (delta / 16.67);
        if (exp.radius >= exp.maxRadius) {
          exp.expanding = false;
        }
      } else {
        exp.radius -= 0.8 * (delta / 16.67);
        if (exp.radius <= 0) {
          explosionsRef.current.splice(i, 1);
          continue;
        }
      }

      // Check collision with rockets
      for (let j = rocketsRef.current.length - 1; j >= 0; j--) {
        const rocket = rocketsRef.current[j];
        const rx = rocket.x + (rocket.targetX - rocket.x) * rocket.progress;
        const ry = rocket.y + (rocket.targetY - rocket.y) * rocket.progress;
        if (distance({ x: rx, y: ry }, exp) < exp.radius) {
          rocketsRef.current.splice(j, 1);
          setScore(prev => {
            const newScore = prev + 20;
            if (newScore >= TARGET_SCORE) {
              setGameState('WON');
            }
            return newScore;
          });
          explosionsRef.current.push({
            id: `chain-${Math.random()}`,
            x: rx,
            y: ry,
            radius: 0,
            maxRadius: 40,
            expanding: true,
            life: 1
          });
        }
      }
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensionsRef.current;
    ctx.clearRect(0, 0, width, height);

    // Ground - more realistic terrain
    const groundGrad = ctx.createLinearGradient(0, height - 30, 0, height);
    groundGrad.addColorStop(0, '#1a1a1a');
    groundGrad.addColorStop(1, '#000000');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, height - 30, width, 30);

    // Cities (Military Bunkers)
    citiesRef.current.forEach(city => {
      if (!city.alive) return;
      
      ctx.save();
      ctx.translate(city.x, city.y);

      // Bunker main body
      ctx.fillStyle = '#4b5563'; // Gray-600
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-15, -12);
      ctx.lineTo(15, -12);
      ctx.lineTo(20, 0);
      ctx.closePath();
      ctx.fill();

      // Glowing Core
      ctx.fillStyle = '#60a5fa';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#3b82f6';
      ctx.beginPath();
      ctx.arc(0, -6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Slit/Window
      ctx.fillStyle = '#111827';
      ctx.fillRect(-10, -8, 20, 2);

      // Antenna
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, -12);
      ctx.lineTo(10, -20);
      ctx.stroke();

      ctx.restore();
    });

    // Towers
    towersRef.current.forEach(tower => {
      if (!tower.alive) return;
      
      ctx.save();
      ctx.translate(tower.x, tower.y);

      // Base of the cannon
      ctx.fillStyle = '#4b5563'; // Gray-600
      ctx.beginPath();
      ctx.roundRect(-40, 0, 80, 30, 8);
      ctx.fill();
      
      // Turret body
      ctx.fillStyle = '#374151'; // Gray-700
      ctx.beginPath();
      ctx.arc(0, 0, 24, Math.PI, 0);
      ctx.fill();

      // Barrel (pointing up slightly)
      ctx.strokeStyle = '#1f2937'; // Gray-800
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -50);
      ctx.stroke();

      // Barrel detail
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-4, -20);
      ctx.lineTo(-4, -44);
      ctx.stroke();

      ctx.restore();

      // Draw Shield over cannon
      ctx.save();
      ctx.translate(tower.x, tower.y);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; // Blue-500 with alpha
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 60, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      
      // Shield glow effect
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 62, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();

      // Draw Soldier next to cannon
      ctx.save();
      ctx.translate(tower.x + 35, tower.y + 20);
      ctx.strokeStyle = '#374151'; // Dark gray
      ctx.lineWidth = 2;
      
      // Helmet
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(0, -16, 4, Math.PI, 0);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(0, -15, 3, 0, Math.PI * 2);
      ctx.stroke();
      
      // Body (Uniform)
      ctx.strokeStyle = '#4b5563';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, -4);
      ctx.stroke();
      
      // Arms
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(4, -10);
      ctx.stroke();
      
      // Rifle
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(8, -15);
      ctx.stroke();

      // Legs
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(-3, 4);
      ctx.moveTo(0, -4);
      ctx.lineTo(3, 4);
      ctx.stroke();
      
      ctx.restore();
      
      // Ammo indicator removed (Infinite)
    });

    // Rockets
    rocketsRef.current.forEach(rocket => {
      const curX = rocket.x + (rocket.targetX - rocket.x) * rocket.progress;
      const curY = rocket.y + (rocket.targetY - rocket.y) * rocket.progress;
      
      // Calculate angle of descent
      const angle = Math.atan2(rocket.targetY - rocket.y, rocket.targetX - rocket.x);

      // Trail
      ctx.strokeStyle = 'rgba(255, 69, 0, 0.2)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(rocket.x, rocket.y);
      ctx.lineTo(curX, curY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(angle + Math.PI / 2); // Rotate to point downwards

      // Flame
      const flameSize = (5 + Math.random() * 5) * 2;
      const flameGrad = ctx.createLinearGradient(0, 0, 0, flameSize);
      flameGrad.addColorStop(0, '#ff4500');
      flameGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-4, 10);
      ctx.lineTo(0, 10 + flameSize);
      ctx.lineTo(4, 10);
      ctx.fill();

      // Rocket Body (TIE Fighter-ish)
      ctx.fillStyle = '#1f2937'; // Dark
      // Central pod
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      // Wings
      ctx.fillRect(-12, -10, 2, 20);
      ctx.fillRect(10, -10, 2, 20);
      // Connectors
      ctx.fillRect(-10, -1, 4, 2);
      ctx.fillRect(6, -1, 4, 2);

      // Red eye
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // Interceptors
    interceptorsRef.current.forEach(inter => {
      const curX = inter.startX + (inter.targetX - inter.startX) * inter.progress;
      const curY = inter.startY + (inter.targetY - inter.startY) * inter.progress;
      const angle = Math.atan2(inter.targetY - inter.startY, inter.targetX - inter.startX);

      // Trail (Laser beam)
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(inter.startX, inter.startY);
      ctx.lineTo(curX, curY);
      ctx.stroke();

      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(angle + Math.PI / 2);

      // Interceptor Body (Plasma Bolt)
      const boltGrad = ctx.createLinearGradient(0, -10, 0, 10);
      boltGrad.addColorStop(0, '#00ffff');
      boltGrad.addColorStop(1, '#3b82f6');
      ctx.fillStyle = boltGrad;
      ctx.beginPath();
      ctx.roundRect(-2, -15, 4, 30, 2);
      ctx.fill();
      
      // Glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#3b82f6';
      ctx.stroke();

      ctx.restore();

      // Target X
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(inter.targetX - 5, inter.targetY - 5);
      ctx.lineTo(inter.targetX + 5, inter.targetY + 5);
      ctx.moveTo(inter.targetX + 5, inter.targetY - 5);
      ctx.lineTo(inter.targetX - 5, inter.targetY + 5);
      ctx.stroke();
    });

    // Explosions
    explosionsRef.current.forEach(exp => {
      const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.4, '#fbbf24');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
    });

  }, [gameState]);

  useEffect(() => {
    let animationFrameId: number;

    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      update(dt);
      draw();

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, draw]);

  // --- Input Handling ---

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find best tower to fire from (closest alive)
    const availableTowers = towersRef.current
      .filter(t => t.alive)
      .sort((a, b) => distance({ x, y }, a) - distance({ x, y }, b));

    if (availableTowers.length > 0) {
      const tower = availableTowers[0];
      const burstSize = 5;
      
      for (let i = 0; i < burstSize; i++) {
        // Add a small random offset to the target for each missile in the burst
        const offsetX = (Math.random() - 0.5) * 30;
        const offsetY = (Math.random() - 0.5) * 30;

        interceptorsRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          startX: tower.x,
          startY: tower.y,
          x: tower.x,
          y: tower.y,
          targetX: x + offsetX,
          targetY: y + offsetY,
          progress: 0,
          speed: 0.12 + Math.random() * 0.05 // Vary speed slightly for more natural look
        });
      }
    }
  };

  // --- Resize Handling ---

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        dimensionsRef.current = { width, height };
        
        // Re-init if just started or if positions need recalculating
        if (gameState === 'START') {
           // Just update dimensions
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [gameState]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden font-sans select-none touch-none"
      style={{
        backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8)), url("https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1920&q=80")',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        className="block w-full h-full cursor-crosshair"
      />

      {/* HUD */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-white font-mono text-xl">
              {t.score}: {score}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-4 py-1 rounded-lg">
            <Target className="w-4 h-4 text-red-400" />
            <span className="text-white/70 font-mono text-sm">
              {t.target}: {TARGET_SCORE}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg text-sm transition-colors border border-white/10"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </div>

      {/* Ammo HUD (Bottom) - Removed for Infinite Ammo */}
      <div className="absolute bottom-10 left-0 w-full flex justify-center gap-8 pointer-events-none">
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-6"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="space-y-2"
              >
                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter uppercase italic">
                  {t.title}
                </h1>
                <p className="text-blue-400 font-medium tracking-widest uppercase text-sm">
                  AI Xiaoming: Galactic Defense
                </p>
              </motion.div>

              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-left space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-yellow-400 shrink-0 mt-1" />
                  <p className="text-white/80 text-sm leading-relaxed">
                    {t.instructions}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-400 shrink-0 mt-1" />
                  <p className="text-white/80 text-sm leading-relaxed">
                    {t.mission}
                  </p>
                </div>
              </div>

              <button
                onClick={initGame}
                className="group relative w-full bg-white text-black font-bold py-4 rounded-xl text-xl overflow-hidden transition-transform active:scale-95"
              >
                <span className="relative z-10">{t.start}</span>
                <div className="absolute inset-0 bg-blue-500 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </div>
          </motion.div>
        )}

        {(gameState === 'WON' || gameState === 'LOST') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-50 p-6"
          >
            <div className="text-center space-y-8">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: gameState === 'WON' ? [0, 5, -5, 0] : 0
                }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <h2 className={`text-6xl font-black uppercase italic ${gameState === 'WON' ? 'text-yellow-400' : 'text-red-500'}`}>
                  {gameState === 'WON' ? t.win : t.lose}
                </h2>
              </motion.div>

              <div className="space-y-2">
                <p className="text-white/50 uppercase tracking-widest text-sm">{t.score}</p>
                <p className="text-7xl font-mono text-white font-bold">{score}</p>
              </div>

              <button
                onClick={initGame}
                className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-xl font-bold text-xl hover:bg-blue-500 hover:text-white transition-all active:scale-95"
              >
                <RotateCcw className="w-6 h-6" />
                {t.playAgain}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Accents */}
      <div className="absolute inset-0 pointer-events-none border-[20px] border-white/5" />
    </div>
  );
}
