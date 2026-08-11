'use client';

/**
 * GradientBackground Component
 *
 * Provides beautiful gradient backgrounds for the Avian FlightDeck app.
 *
 */

interface GradientBackgroundProps {
    children: React.ReactNode;
}

export default function GradientBackground({
    children,
}: GradientBackgroundProps) {
    return (
        <div className="min-h-screen w-full relative bg-[#F4F7F8] dark:bg-[#0D1B21]">
            {/* Light mode variant — paper ground with a faint mint horizon glow */}
            <div
                className="absolute inset-0 z-0 block dark:hidden"
                style={{
                    background: 'radial-gradient(145% 100% at 50% 100%, #F4F7F8 82%, #E1FCF4 100%)',
                    backgroundSize: '100% 100%',
                }}
            />
            {/* Dark mode variant — night ground with a teal horizon glow */}
            <div
                className="absolute inset-0 z-0 dark:block hidden"
                style={{
                    background: 'radial-gradient(145% 100% at 50% 100%, #0D1B21 55%, #16525C 100%)',
                    backgroundSize: '100% 100%',
                }}
            />
            <div className="relative z-10">{children}</div>
        </div>
    );

}
