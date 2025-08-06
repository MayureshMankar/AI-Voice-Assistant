import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface VoiceVisualizerProps {
  levels?: number[];
  isActive?: boolean;
  className?: string;
}

export function VoiceVisualizer({ levels, isActive = false, className }: VoiceVisualizerProps) {
  const [animationLevels, setAnimationLevels] = useState<number[]>(new Array(9).fill(20));

  useEffect(() => {
    if (levels && levels.length > 0) {
      setAnimationLevels(levels);
    } else if (isActive) {
      // Generate random animation when active but no real levels
      const interval = setInterval(() => {
        setAnimationLevels(prev => 
          prev.map(() => Math.random() * 60 + 20)
        );
      }, 150);
      
      return () => clearInterval(interval);
    } else {
      // Return to base state when inactive
      setAnimationLevels(new Array(9).fill(20));
    }
  }, [levels, isActive]);

  return (
    <div className={cn("flex items-center justify-center space-x-2 h-32", className)} data-testid="voice-visualizer">
      {animationLevels.map((level, index) => {
        const height = Math.max(20, Math.min(100, level));
        const delay = index * 0.1;
        
        let colorClass = 'bg-blue-500';
        if (index <= 2 || index >= 6) {
          colorClass = 'bg-indigo-500';
        } else if (index === 3 || index === 5) {
          colorClass = 'bg-purple-500';
        } else if (index === 4) {
          colorClass = 'bg-emerald-500';
        }

        return (
          <div
            key={index}
            className={cn(
              "rounded-full transition-all duration-150 ease-out",
              index === 4 ? "w-3" : "w-2",
              colorClass,
              isActive && "animate-pulse"
            )}
            style={{
              height: `${height}px`,
              animationDelay: `${delay}s`,
            }}
            data-testid={`voice-bar-${index}`}
          />
        );
      })}
    </div>
  );
}
