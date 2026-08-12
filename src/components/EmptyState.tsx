'use client';

import React from 'react';

interface EmptyStateProps {
    /** A lucide (or compatible) icon component. */
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    /** Optional call-to-action, e.g. a Button. */
    action?: React.ReactNode;
    className?: string;
}

/**
 * A calm, branded empty state: an icon in a soft tile, a title, an optional line of guidance, and
 * an optional action. Used wherever a list or panel has nothing to show yet, so "nothing here"
 * reads as an invitation rather than a dead end.
 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
    return (
        <div
            className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
        >
            {Icon && (
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-muted/50 text-muted-foreground">
                    <Icon className="h-7 w-7" />
                </div>
            )}
            <p className="text-base font-medium">{title}</p>
            {description && (
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
