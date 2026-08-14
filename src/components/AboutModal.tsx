'use client';

import { Info, ExternalLink, X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRouter } from 'next/navigation';
import packageJson from '../../package.json';

// Shadcn UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const router = useRouter();

  const handleOpenAboutPage = () => {
    onClose();
    router.push('/about');
  };

  const content = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <img src="/Avian_logo.svg" alt="Avian" className="h-6 w-6 invert-0 dark:invert" />
            Avian FlightDeck Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground">{packageJson.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Version:</strong> {packageJson.version}
            </div>
            <div>
              <strong>Network:</strong> Avian Mainnet
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleOpenAboutPage}
              className="w-full justify-start"
              size="lg"
            >
              <Info className="h-4 w-4 mr-2" />
              View Features, FAQ & More Info
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Quick Links</h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() =>
                  window.open('https://github.com/AvianNetwork/avian-flightdeck', '_blank')
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Source Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => window.open('https://avn.network', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Avian Network
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-xl font-semibold flex items-center justify-center gap-2">
              <Info className="w-5 h-5 text-avian-500" />
              About FlightDeck
            </DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="absolute right-4 top-4">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </DrawerHeader>

          <div className="px-4 pb-4">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-avian-500" />
            About FlightDeck
          </DialogTitle>
        </DialogHeader>

        {content}
      </DialogContent>
    </Dialog>
  );
}
