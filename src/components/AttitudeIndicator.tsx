import React from 'react';

interface AttitudeIndicatorProps {
    /**
     * Show the roll / bank scale at the top. It's sized for a tall or squarish display; drop it on
     * wide, short surfaces where a top-centre arc would float awkwardly.
     */
    roll?: boolean;
    /** Play the one-time skew->level animation on mount (honours prefers-reduced-motion). */
    animate?: boolean;
    className?: string;
}

/**
 * A reusable primary-flight-display backdrop: an artificial horizon (sky/ground split with a mint
 * line), a pitch ladder, the aircraft reference symbol, and an optional roll scale. Renders as an
 * absolute fill, so drop it inside a positioned, `overflow-hidden` parent and layer the surface's
 * own content above it. Styling lives in globals.css under `.att*`.
 *
 * Extracted from the landing page so the lock screen, the loading screen, and the balance card all
 * share one instrument instead of re-implementing the SVGs and the level animation.
 */
export function AttitudeIndicator({
    roll = true,
    animate = true,
    className = '',
}: AttitudeIndicatorProps) {
    return (
        <div
            aria-hidden
            className={`att${animate ? ' att--animate' : ''}${className ? ` ${className}` : ''}`}
        >
            <div className="att__horizon">
                <div className="att__sky" />
                <div className="att__ground" />
                <div className="att__line" />
                {/* pitch-ladder reference marks — drift with the horizon */}
                <div className="att__ladder">
                    <span style={{ top: -56, width: 34 }} />
                    <span style={{ top: -28, width: 22 }} />
                    <span style={{ top: 28, width: 22 }} />
                    <span style={{ top: 56, width: 34 }} />
                </div>
            </div>

            {/* aircraft reference symbol, fixed at the centre of the display */}
            <svg className="att__aircraft" width="150" height="30" viewBox="0 0 150 30">
                <path d="M18 15 L58 15 M92 15 L132 15" stroke="#34F5C6" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M58 15 L64 22 M92 15 L86 22" stroke="#34F5C6" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="75" cy="15" r="3.4" fill="#04121a" stroke="#34F5C6" strokeWidth="2.2" />
            </svg>

            {roll && (
                // roll / bank scale — a fixed reference at the top of the display
                <svg className="att__roll" width="132" height="34" viewBox="0 0 132 34">
                    <path d="M12 30 A56 56 0 0 1 120 30" fill="none" stroke="rgba(230,240,242,0.4)" strokeWidth="1.4" />
                    <path d="M66 6 L61 15 L71 15 Z" fill="#34F5C6" />
                    <path d="M28 20 L26 25 M104 20 L106 25 M66 12 L66 17" stroke="rgba(230,240,242,0.5)" strokeWidth="1.2" />
                </svg>
            )}
        </div>
    );
}
