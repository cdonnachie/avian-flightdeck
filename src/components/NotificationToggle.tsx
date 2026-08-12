'use client';

import React, { useEffect, useState } from 'react';
import { NotificationClientService } from '@/services/notifications/client/NotificationClientService';
import { Button } from './ui/button';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationContext';

export function NotificationToggle() {
  const { isEnabled, enableNotifications, disableNotifications } = useNotifications();
  const [loading, setLoading] = useState<boolean>(false);

  // Use isEnabled from the NotificationContext instead of local state
  const notificationsEnabled = isEnabled;

  const toggleNotifications = async () => {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      toast.error('Notifications not supported', {
        description: 'Your browser does not support notifications.',
      });
      return;
    }

    setLoading(true);

    try {
      if (notificationsEnabled) {
        // Disable notifications using the context method
        await disableNotifications();
        toast.success('Notifications disabled', {
          description: 'You will no longer receive wallet notifications.',
        });
      } else {
        // Enable notifications using the context method
        const success = await enableNotifications();
        if (success) {
          toast.success('Notifications enabled', {
            description: 'You will now receive wallet notifications.',
          });
        } else {
          toast.error('Permission denied', {
            description: 'Notification permission was denied or setup failed.',
          });
        }
      }
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to toggle notifications. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={notificationsEnabled ? 'default' : 'outline'}
      size="sm"
      onClick={toggleNotifications}
      disabled={loading}
      className={`flex items-center gap-2 ${
        notificationsEnabled
          ? 'bg-primary hover:bg-primary text-white'
          : 'text-muted-foreground'
      }`}
    >
      {loading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ) : notificationsEnabled ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}
    </Button>
  );
}
