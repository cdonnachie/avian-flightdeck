'use client';

import React, { useState, useEffect } from 'react';
import { Info, CheckCircle2, Bell } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

export const BrowserNotificationHelp: React.FC = () => {
  const [browserName, setBrowserName] = useState<string>('');
  const { testNotification } = useNotifications();

  useEffect(() => {
    // Detect browser
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1) {
      setBrowserName('Chrome');
    } else if (userAgent.indexOf('Firefox') > -1) {
      setBrowserName('Firefox');
    } else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
      setBrowserName('Safari');
    } else if (userAgent.indexOf('Edg') > -1) {
      setBrowserName('Edge');
    } else if (userAgent.indexOf('Brave') > -1 || document.getElementById('brave-icon')) {
      setBrowserName('Brave');
    } else {
      setBrowserName('your browser');
    }
  }, []);

  return (
    <div className="p-4 bg-primary/10 rounded-lg">
      <h3 className="flex items-center gap-2 text-primary font-medium">
        <Info size={16} />
        Browser Notification Settings
      </h3>

      <p className="text-sm mt-2 text-primary">
        You&apos;ve enabled notifications, but they might not always appear as pop-up banners. To
        ensure you see important alerts, you may need to adjust your {browserName} settings.
      </p>

      <Accordion type="single" collapsible className="mt-2">
        <AccordionItem value="browser-settings">
          <AccordionTrigger className="text-sm font-medium text-primary py-2">
            How to configure {browserName} notification settings
          </AccordionTrigger>
          <AccordionContent>
            {browserName === 'Brave' && (
              <div className="space-y-3 text-sm text-primary">
                <p>Follow these steps to ensure Brave shows notification banners:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Click the menu button (three lines) in the top right</li>
                  <li>
                    Select <strong>Settings</strong>
                  </li>
                  <li>
                    Go to <strong>System → Notifications</strong>
                  </li>
                  <li>
                    Make sure <strong>&quote;Show notification banners&quote;</strong> is enabled
                  </li>
                  <li>
                    Ensure <strong>&quote;Show notifications in notification center&quote;</strong>{' '}
                    is enabled
                  </li>
                </ol>
                <div className="mt-3 flex items-center gap-2 text-primary">
                  <CheckCircle2 size={16} />
                  <span>Restart Brave after making these changes</span>
                </div>
              </div>
            )}
            {browserName === 'Chrome' && (
              <div className="space-y-3 text-sm text-primary">
                <p>Follow these steps to ensure Chrome shows notification banners:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Click the menu button (three dots) in the top right</li>
                  <li>
                    Select <strong>Settings</strong>
                  </li>
                  <li>
                    Go to <strong>Privacy and security → Site Settings → Notifications</strong>
                  </li>
                  <li>Find this website in the list and ensure it&apos;s allowed</li>
                </ol>
              </div>
            )}
            {browserName === 'Firefox' && (
              <div className="space-y-3 text-sm text-primary">
                <p>Follow these steps to ensure Firefox shows notification banners:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Click the menu button (three lines) in the top right</li>
                  <li>
                    Select <strong>Settings</strong>
                  </li>
                  <li>
                    Go to <strong>Privacy & Security</strong>
                  </li>
                  <li>
                    Scroll to <strong>Permissions</strong> section
                  </li>
                  <li>
                    Click <strong>Settings...</strong> next to Notifications
                  </li>
                  <li>Find this website and ensure &quote;Allow&quote; is selected</li>
                </ol>
              </div>
            )}
            {browserName !== 'Brave' && browserName !== 'Chrome' && browserName !== 'Firefox' && (
              <div className="text-sm text-primary">
                <p>Check your browser settings to ensure:</p>
                <ul className="list-disc list-inside space-y-2 mt-2 ml-2">
                  <li>Notification permissions are granted for this website</li>
                  <li>Banner notifications are enabled in your browser settings</li>
                  <li>Your system notifications are enabled</li>
                </ul>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          className="text-primary border-primary/30 hover:bg-primary/10 dark:hover:bg-primary/10"
          onClick={() => {
            if (testNotification) {
              testNotification();
              toast.success('Sent a test notification');
            }
          }}
        >
          <Bell className="h-4 w-4 mr-2" />
          Send Test Notification
        </Button>
      </div>
    </div>
  );
};
