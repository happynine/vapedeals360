'use client';

import { useState, useEffect } from 'react';

interface CountdownDisplayProps {
  endTime: string | Date;
  className?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export function CountdownDisplay({ endTime, className = '' }: CountdownDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    const calculateTimeRemaining = (): TimeRemaining | null => {
      const end = new Date(endTime);
      const now = new Date();
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        return null;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds, total: diff };
    };

    // Initial calculation
    setTimeRemaining(calculateTimeRemaining());

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);
      
      // Clear interval when countdown ends
      if (!remaining) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeRemaining) {
    return null;
  }

  // Format: x天x小时x分x秒 (hours/minutes/seconds always 2 digits for consistency)
  const formatCountdown = (t: TimeRemaining): string => {
    const parts: string[] = [];
    
    if (t.days > 0) {
      parts.push(`${t.days}天`);
    }
    
    // Always show hours/minutes/seconds with 2 digits for third-party platform matching
    const hoursStr = t.hours.toString().padStart(2, '0');
    const minutesStr = t.minutes.toString().padStart(2, '0');
    const secondsStr = t.seconds.toString().padStart(2, '0');
    
    parts.push(`${hoursStr}小时`);
    parts.push(`${minutesStr}分`);
    parts.push(`${secondsStr}秒`);
    
    return parts.join('');
  };

  return (
    <div className={`inline-flex items-center gap-1 text-sm font-medium ${className}`}>
      <span className="text-orange-500">{formatCountdown(timeRemaining)}</span>
    </div>
  );
}

// Alternative compact format for smaller spaces
export function CountdownCompact({ endTime, className = '' }: CountdownDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    const calculateTimeRemaining = (): TimeRemaining | null => {
      const end = new Date(endTime);
      const now = new Date();
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        return null;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds, total: diff };
    };

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);
      
      if (!remaining) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeRemaining) {
    return null;
  }

  // Compact format with labels: 8天08时16分41秒 (always 2 digits for hours/minutes/seconds)
  const formatCompact = (t: TimeRemaining): string => {
    const hoursStr = t.hours.toString().padStart(2, '0');
    const minutesStr = t.minutes.toString().padStart(2, '0');
    const secondsStr = t.seconds.toString().padStart(2, '0');
    
    if (t.days > 0) {
      return `${t.days}天${hoursStr}时${minutesStr}分${secondsStr}秒`;
    }
    return `${hoursStr}时${minutesStr}分${secondsStr}秒`;
  };

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded bg-orange-50 text-orange-600 font-semibold text-sm ${className}`}>
      {formatCompact(timeRemaining)}
    </div>
  );
}