import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export default function Logo({ size = 'md', showSubtitle = false }: LogoProps) {
  const titleSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
  };
  const subtitleSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className="flex items-center gap-3">
      {/* Colorful block logo */}
      <div className="flex-shrink-0">
        <div className="grid grid-cols-2 gap-0.5">
          <div className={`${size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} bg-blue-600 rounded-sm`}></div>
          <div className={`${size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} bg-red-600 rounded-sm`}></div>
          <div className={`${size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} bg-yellow-500 rounded-sm`}></div>
          <div className={`${size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} bg-green-600 rounded-sm`}></div>
        </div>
      </div>
      <div>
        <div className={`font-bold text-gray-800 leading-tight ${titleSizes[size]}`}>
          <span className="text-blue-600">きづき</span>
          <span className="text-red-600">くみ</span>
          <span className="text-yellow-600">たて</span>
          <span className="text-green-600">工房</span>
        </div>
        {showSubtitle && (
          <div className={`text-gray-500 ${subtitleSizes[size]}`}>
            デモクラシーフィットネス診断
          </div>
        )}
      </div>
    </div>
  );
}
