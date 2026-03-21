import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export default function Logo({ size = 'md' }: LogoProps) {
  const titleSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };
  const brandSizes = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-sm',
  };
  const blockSize = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  return (
    <div className="flex items-center gap-3">
      {/* Colorful block logo */}
      <div className="flex-shrink-0">
        <div className="grid grid-cols-2 gap-0.5">
          <div className={`${blockSize[size]} bg-blue-600 rounded-sm`}></div>
          <div className={`${blockSize[size]} bg-red-600 rounded-sm`}></div>
          <div className={`${blockSize[size]} bg-yellow-500 rounded-sm`}></div>
          <div className={`${blockSize[size]} bg-green-600 rounded-sm`}></div>
        </div>
      </div>
      <div>
        {/* メインタイトル：デモクラ筋診断 */}
        <div className={`font-bold text-gray-800 leading-tight ${titleSizes[size]}`}>
          デモクラ筋診断
        </div>
        {/* サブ：きづきくみたて工房 */}
        <div className={`text-gray-400 ${brandSizes[size]}`}>
          <span className="text-blue-500">きづき</span>
          <span className="text-red-500">くみ</span>
          <span className="text-yellow-500">たて</span>
          <span className="text-green-500">工房</span>
        </div>
      </div>
    </div>
  );
}
