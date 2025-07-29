'use client';

import { useMemo } from 'react';
import zxcvbn from 'zxcvbn';

export type PasswordStrength = 'weak' | 'medium' | 'strong' | null;

const strengthLabels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-400',
  'bg-blue-500',
  'bg-green-600',
];

interface PasswordStrengthProps {
  password: string;
  onStrengthChange?: (strength: PasswordStrength, score: number, feedback: string[]) => void;
  showSuggestions?: boolean;
  className?: string;
}

export default function PasswordStrengthChecker({
  password,
  onStrengthChange,
  showSuggestions = true,
  className = '',
}: PasswordStrengthProps) {
  const result = useMemo(() => {
    const zxResult = zxcvbn(password || '');

    // Map zxcvbn score (0-4) to our strength levels
    let strength: PasswordStrength = null;
    if (password) {
      if (zxResult.score <= 1) strength = 'weak';
      else if (zxResult.score <= 2) strength = 'medium';
      else strength = 'strong';
    }

    // Call onStrengthChange callback if provided
    if (onStrengthChange) {
      onStrengthChange(strength, zxResult.score, zxResult.feedback.suggestions);
    }

    return zxResult;
  }, [password, onStrengthChange]);

  const score = result.score;

  if (!password) {
    return null;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Strength Bar */}
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${strengthColors[score]}`}
          style={{ width: `${(score + 1) * 20}%` }}
        ></div>
      </div>

      {/* Strength Label */}
      <div className="flex justify-between items-center">
        <p
          className={`text-xs font-medium ${score >= 3 ? 'text-green-600' : score >= 2 ? 'text-yellow-600' : 'text-red-600'}`}
        >
          {strengthLabels[score]}
        </p>
      </div>

      {/* Suggestions */}
      {showSuggestions && result.feedback.suggestions.length > 0 && (
        <ul className="text-xs text-gray-600 list-disc pl-4 mt-1">
          {result.feedback.suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
