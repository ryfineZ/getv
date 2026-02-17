'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';

interface VideoTrimmerProps {
  duration: number;
  onTrimChange?: (start: number, end: number) => void;
  disabled?: boolean;
}

function VideoTrimmerInner({ duration, onTrimChange, disabled }: VideoTrimmerProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStartTime(0);
    setEndTime(duration);
  }, [duration]);

  const startPercent = (startTime / duration) * 100;
  const endPercent = (endTime / duration) * 100;

  const handleMouseDown = useCallback((type: 'start' | 'end') => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(type);
  }, [disabled]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current || disabled) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = Math.round(percent * duration);

    if (isDragging === 'start') {
      const newStart = Math.min(time, endTime - 1);
      setStartTime(newStart);
      onTrimChange?.(newStart, endTime);
    } else {
      const newEnd = Math.max(time, startTime + 1);
      setEndTime(newEnd);
      onTrimChange?.(startTime, newEnd);
    }
  }, [isDragging, duration, startTime, endTime, onTrimChange, disabled]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const presets = [
    { label: '前15秒', start: 0, end: Math.min(15, duration) },
    { label: '前30秒', start: 0, end: Math.min(30, duration) },
    { label: '前1分钟', start: 0, end: Math.min(60, duration) },
    { label: '最后30秒', start: Math.max(0, duration - 30), end: duration },
  ];

  const handlePreset = useCallback((start: number, end: number) => {
    if (disabled) return;
    setStartTime(start);
    setEndTime(end);
    onTrimChange?.(start, end);
  }, [disabled, onTrimChange]);

  // 处理精确时间输入
  const handleTimeInput = useCallback((type: 'start' | 'end', value: string) => {
    const parts = value.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      seconds = parts[0] || 0;
    }
    seconds = Math.max(0, Math.min(seconds, duration));

    if (type === 'start') {
      const newStart = Math.min(seconds, endTime - 1);
      setStartTime(newStart);
      onTrimChange?.(newStart, endTime);
    } else {
      const newEnd = Math.max(seconds, startTime + 1);
      setEndTime(newEnd);
      onTrimChange?.(startTime, newEnd);
    }
  }, [duration, startTime, endTime, onTrimChange]);

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* 时间输入区 */}
      <div className="flex items-center gap-3">
        <div className="time-input flex-1">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <input
            type="text"
            value={formatTime(startTime)}
            onChange={(e) => handleTimeInput('start', e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-mono w-16 text-center"
            placeholder="0:00"
          />
        </div>
        <span className="text-[var(--muted-foreground)] text-sm">→</span>
        <div className="time-input flex-1">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <input
            type="text"
            value={formatTime(endTime)}
            onChange={(e) => handleTimeInput('end', e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-mono w-16 text-center"
            placeholder="0:00"
          />
        </div>
        <div className="text-xs text-[var(--primary)] font-medium shrink-0">
          {formatTime(endTime - startTime)}
        </div>
      </div>

      {/* 时间轴 */}
      <div ref={timelineRef} className="trim-timeline">
        {/* 选中区域 */}
        <div
          className="trim-selected"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />

        {/* 起点滑块 */}
        <div
          className={`trim-handle ${isDragging === 'start' ? 'bg-[#A78BFA]' : ''}`}
          style={{ left: `${startPercent}%` }}
          onMouseDown={handleMouseDown('start')}
        />

        {/* 终点滑块 */}
        <div
          className={`trim-handle ${isDragging === 'end' ? 'bg-[#A78BFA]' : ''}`}
          style={{ left: `${endPercent}%` }}
          onMouseDown={handleMouseDown('end')}
        />

        {/* 时间刻度 */}
        <div className="absolute top-full left-0 right-0 flex justify-between text-[10px] text-[var(--muted-foreground)] mt-1.5 px-0.5">
          <span>0:00</span>
          <span>{formatTime(Math.round(duration / 4))}</span>
          <span>{formatTime(Math.round(duration / 2))}</span>
          <span>{formatTime(Math.round(duration * 3 / 4))}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 预设按钮 */}
      <div className="flex gap-2 flex-wrap pt-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset.start, preset.end)}
            disabled={disabled}
            className="px-2.5 py-1 text-xs glass hover:border-[var(--primary-light)] transition disabled:opacity-50 cursor-pointer"
            style={{ borderRadius: '8px' }}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => handlePreset(0, duration)}
          disabled={disabled}
          className="px-2.5 py-1 text-xs glass hover:border-[var(--primary-light)] transition disabled:opacity-50 cursor-pointer"
          style={{ borderRadius: '8px' }}
        >
          全部
        </button>
      </div>
    </div>
  );
}

export const VideoTrimmer = memo(VideoTrimmerInner);
