import { Component } from 'solid-js';
import { ChevronUp, ChevronDown, Minus } from 'lucide-solid';
import type { TrendDirection } from '../types';

interface TrendBadgeProps {
  trend: TrendDirection;
  type: 'Liq' | 'Holders';
  size?: 'sm' | 'md';
}

export const TrendBadge: Component<TrendBadgeProps> = (props) => {
  const getColor = () => {
    switch (props.trend) {
      case 'up':
        return 'text-green-500 bg-green-500/10';
      case 'down':
        return 'text-red-500 bg-red-500/10';
      default:
        return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getIcon = () => {
    switch (props.trend) {
      case 'up':
        return <ChevronUp size={props.size === 'sm' ? 12 : 14} />;
      case 'down':
        return <ChevronDown size={props.size === 'sm' ? 12 : 14} />;
      default:
        return <Minus size={props.size === 'sm' ? 12 : 14} />;
    }
  };

  return (
    <div 
      class={`flex items-center gap-1 px-1.5 py-0.5 rd-md ${getColor()} 
        ${props.size === 'sm' ? 'text-2xs' : 'text-xs'}`}
    >
      <span>{props.type}</span>
      {getIcon()}
    </div>
  );
}; 