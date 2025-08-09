'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
  value: string;
  label: string;
  shortLabel?: string; // Optional shorter label for mobile
}

interface ModernDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'default' | 'compact' | 'ultra-compact';
  className?: string;
  label?: string;
  maxWidth?: string;
  selectedValues?: string[]; // For multi-selection highlighting
}

export default function ModernDropdown({
  options,
  value,
  onChange,
  placeholder = 'Välj...',
  size = 'default',
  className = '',
  label,
  maxWidth,
  selectedValues = []
}: ModernDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [buttonWidth, setButtonWidth] = useState<number>(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get the current option
  const currentOption = options.find(opt => opt.value === value);
  
  // Determine display text - always use full label, CSS will handle truncation
  const getDisplayText = () => {
    if (!currentOption) return placeholder;
    return currentOption.label;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      if (dropdownRef.current && targetNode && !dropdownRef.current.contains(targetNode)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside as EventListener);
      document.addEventListener('touchstart', handleClickOutside as EventListener);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
      document.removeEventListener('touchstart', handleClickOutside as EventListener);
    };
  }, [isOpen]);

  // Update button width for dropdown positioning
  useEffect(() => {
    if (buttonRef.current) {
      setButtonWidth(buttonRef.current.offsetWidth);
    }
  }, [isOpen]);

  const getSizeClasses = () => {
    switch (size) {
      case 'compact':
        return 'text-[13px] font-medium px-3 py-2.5 pr-8 rounded-xl w-full h-[40px] flex items-center';
      case 'ultra-compact':
        return 'text-[12px] font-medium px-2.5 py-2 pr-7 rounded-lg w-full h-[36px] flex items-center';
      default:
        return 'text-[14px] font-medium px-4 py-3 pr-10 rounded-2xl min-w-[140px] lg:min-w-[160px] h-[44px] flex items-center';
    }
  };

  const getArrowSize = () => {
    switch (size) {
      case 'ultra-compact':
        return 'w-3 h-3';
      case 'compact':
        return 'w-3.5 h-3.5';
      default:
        return 'w-4 h-4';
    }
  };

  const getArrowPosition = () => {
    switch (size) {
      case 'ultra-compact':
        return 'right-2';
      case 'compact':
        return 'right-2';
      default:
        return 'right-3';
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef} style={{ maxWidth }}>
      {/* Label */}
      {label && (
        <span className={`block font-semibold tracking-[0.5px] uppercase mb-2 ${
          size === 'compact' || size === 'ultra-compact' 
            ? 'text-[10px] text-white/50' 
            : 'text-[11px] text-white/50'
        }`}>
          {label}
        </span>
      )}

      {/* Dropdown Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`
          appearance-none bg-white/[0.1] backdrop-blur-md text-white border border-white/[0.15] 
          focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/40 
          focus:bg-white/[0.15] hover:bg-white/[0.12] hover:border-white/[0.2] hover:shadow-lg
          transition-all duration-300 cursor-pointer shadow-md shadow-black/[0.1]
          text-left relative justify-between
          ${getSizeClasses()}
          ${isOpen ? 'bg-white/[0.15] border-blue-400/40 ring-2 ring-blue-400/50 shadow-lg' : ''}
        `}
      >
        <span className="truncate flex-1 min-w-0">
          {getDisplayText()}
        </span>
        
        {/* Arrow */}
        <ChevronDown 
          className={`${getArrowSize()} text-white/40 pointer-events-none transition-transform duration-200 flex-shrink-0 ml-2 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div 
          className={`absolute top-full left-0 mt-2 bg-black/95 backdrop-blur-2xl border border-white/[0.2] shadow-[0_20px_60px_rgba(0,0,0,0.4)] z-[9999] overflow-hidden animate-dropdown-in ${
            size === 'compact' || size === 'ultra-compact' ? 'rounded-xl' : 'rounded-2xl'
          }`}
          style={{ 
            minWidth: Math.max(buttonWidth, size === 'ultra-compact' ? 120 : size === 'compact' ? 140 : 160),
            width: buttonWidth
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`
                w-full text-left font-medium transition-all duration-200
                hover:bg-white/[0.12] focus:bg-white/[0.12] focus:outline-none
                ${value === option.value || selectedValues.includes(option.value) 
                  ? 'bg-gradient-to-r from-blue-500/25 to-cyan-500/20 text-blue-100 border-l-2 border-blue-400' 
                  : 'text-white/90 hover:text-white'
                }
                ${
                  size === 'compact' || size === 'ultra-compact' 
                    ? 'px-3 py-3 text-[13px]'
                    : 'px-4 py-3.5 text-[14px]'
                }
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}