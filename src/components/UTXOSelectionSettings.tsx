import React, { useState, useEffect } from 'react';
import { CoinSelectionStrategy } from '@/services/wallet/UTXOSelectionService';
import {
  Settings,
  Info,
  Zap,
  Shield,
  Layers,
  Target,
  Coins,
  UserCheck,
  X,
  RefreshCw,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

// Import Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UTXOSelectionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (options: {
    strategy: CoinSelectionStrategy;
    feeRate?: number;
    maxInputs?: number;
    minConfirmations?: number;
  }) => void;
  currentOptions?: {
    strategy?: CoinSelectionStrategy;
    feeRate?: number;
    maxInputs?: number;
    minConfirmations?: number;
  };
}

export function UTXOSelectionSettings({
  isOpen,
  onClose,
  onApply,
  currentOptions = {},
}: UTXOSelectionSettingsProps) {
  const [strategy, setStrategy] = useState<CoinSelectionStrategy>(
    currentOptions.strategy || CoinSelectionStrategy.BEST_FIT,
  );
  const [feeRate, setFeeRate] = useState(currentOptions.feeRate || 10000);
  const [maxInputs, setMaxInputs] = useState(currentOptions.maxInputs || 100);
  const [minConfirmations, setMinConfirmations] = useState(currentOptions.minConfirmations || 6);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Sync state with currentOptions when they change
  useEffect(() => {
    setStrategy(currentOptions.strategy || CoinSelectionStrategy.BEST_FIT);
    setFeeRate(currentOptions.feeRate || 10000);
    setMaxInputs(currentOptions.maxInputs || 100);
    setMinConfirmations(currentOptions.minConfirmations || 6);
  }, [currentOptions]);

  if (!isOpen) return null;

  const strategies = [
    {
      value: CoinSelectionStrategy.BEST_FIT,
      name: 'Best Fit',
      description: 'Optimal balance of efficiency and fees',
      icon: <Target className="w-4 h-4" />,
      recommended: true,
    },
    {
      value: CoinSelectionStrategy.SMALLEST_FIRST,
      name: 'Minimize Fees',
      description: 'Select smallest UTXOs first to reduce transaction size',
      icon: <Zap className="w-4 h-4" />,
    },
    {
      value: CoinSelectionStrategy.LARGEST_FIRST,
      name: 'Fewer Inputs',
      description: 'Use larger UTXOs for simpler transactions',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      value: CoinSelectionStrategy.PRIVACY_FOCUSED,
      name: 'Privacy Enhanced',
      description: 'Use multiple inputs for better privacy',
      icon: <Shield className="w-4 h-4" />,
    },
    {
      value: CoinSelectionStrategy.CONSOLIDATE_DUST,
      name: 'Consolidate Dust',
      description: 'Include small UTXOs to clean up wallet',
      icon: <Coins className="w-4 h-4" />,
    },
    {
      value: CoinSelectionStrategy.MANUAL,
      name: 'Manual Selection',
      description: 'Choose specific UTXOs for your transaction',
      icon: <UserCheck className="w-4 h-4" />,
    },
  ];

  const handleApply = () => {
    onApply({
      strategy,
      feeRate,
      maxInputs,
      minConfirmations,
    });
    onClose();
  };

  const handleReset = () => {
    setStrategy(CoinSelectionStrategy.BEST_FIT);
    setFeeRate(10000);
    setMaxInputs(100);
    setMinConfirmations(6);
  };

  const renderContent = () => (
    <div className="space-y-6">
      {/* Strategy Selection */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">UTXO Selection Strategy</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>How your transaction inputs are selected</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="space-y-2">
          {strategies.map((s) => (
            <Card
              key={s.value}
              className={`cursor-pointer transition-colors ${strategy === s.value ? 'border-primary bg-primary/10' : 'hover:border-border/60'
                }`}
              onClick={() => setStrategy(s.value)}
            >
              <CardContent className="p-3 flex items-start gap-3">
                <input
                  type="radio"
                  name="strategy"
                  value={s.value}
                  checked={strategy === s.value}
                  onChange={(e) => setStrategy(e.target.value as CoinSelectionStrategy)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {s.icon}
                    <span className="font-medium">{s.name}</span>
                    {s.recommended && (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 text-primary border-primary/30"
                      >
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div>
        <h3 className="text-sm font-medium mb-3">Advanced Settings</h3>
        <div className="space-y-6">
          {/* Fee Rate */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="fee-rate">Network Fee</Label>
              <span className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                {feeRate.toLocaleString()} sats ({(feeRate / 100000000).toFixed(8)} AVN)
              </span>
            </div>
            <Slider
              id="fee-rate"
              value={[feeRate]}
              onValueChange={(value) => setFeeRate(value[0])}
              min={1000}
              max={100000}
              step={500}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1,000 sats (Low)</span>
              <span>10,000 sats (Default)</span>
              <span>100,000 sats (High)</span>
            </div>
          </div>

          {/* Max Inputs */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="max-inputs">Maximum Inputs</Label>
              <span className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                {maxInputs} UTXOs
              </span>
            </div>
            <Slider
              id="max-inputs"
              value={[maxInputs]}
              onValueChange={(value) => setMaxInputs(value[0])}
              min={1}
              max={500}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 UTXO</span>
              <span>100 UTXOs (Default)</span>
              <span>500 UTXOs (Avian Max)</span>
            </div>
          </div>

          {/* Min Confirmations */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="min-confirmations">Minimum Confirmations</Label>
              <span className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                {minConfirmations === 0 ? 'Any' : `${minConfirmations}+ blocks`}
              </span>
            </div>
            <Slider
              id="min-confirmations"
              value={[minConfirmations]}
              onValueChange={(value) => setMinConfirmations(value[0])}
              min={0}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (Any)</span>
              <span>6 (Recommended)</span>
              <span>10 (Very Safe)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="flex flex-col max-h-[95vh]">
          <DrawerHeader className="flex-shrink-0">
            <DrawerTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Transaction Settings
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4">{renderContent()}</div>

          <DrawerFooter className="flex-shrink-0 gap-2 flex">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button onClick={onClose} variant="secondary" className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleApply} className="flex-1">
              Apply Settings
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Transaction Settings
          </DialogTitle>
        </DialogHeader>

        {renderContent()}

        <DialogFooter className="mt-6 gap-2 flex">
          <Button onClick={handleReset} variant="outline" className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={onClose} variant="secondary" className="flex-1">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
