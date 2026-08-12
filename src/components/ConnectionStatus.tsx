'use client';

import React, { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import { WifiOff, Wifi, Globe, ArrowDown, Activity, Server } from 'lucide-react';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface ConnectionStatusProps {
  className?: string;
}

export default function ConnectionStatus({ className = '' }: ConnectionStatusProps) {
  const {
    isConnected,
    serverInfo,
    connectToElectrum,
    disconnectFromElectrum,
    selectElectrumServer,
    testConnection,
    isLoading,
  } = useWallet();

  const [isTesting, setIsTesting] = useState(false);

  const handleConnect = async () => {
    try {
      await connectToElectrum();
      toast.success('Connected', {
        description: `Connected to ${serverInfo.url || 'default server'}`,
      });
    } catch (error) {
      toast.error('Connection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectFromElectrum();
      toast.success('Disconnected', {
        description: 'Disconnected from ElectrumX server',
      });
    } catch (error) {
      toast.error('Disconnect Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleServerSelect = async (index: number) => {
    try {
      await selectElectrumServer(index);
      toast.success('Server Selected', {
        description: `Switched to ${serverInfo.servers[index]?.host || 'selected server'}`,
      });
    } catch (error) {
      toast.error('Server Selection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      if (!isConnected) {
        // If not connected, try to connect first

        await connectToElectrum();
        // If connection succeeds, then test
        const result = await testConnection();
        if (result) {
          toast.success('Connection Test Passed', {
            description: 'Server is responding to ping',
          });
        } else {
          toast.warning('Connection Test Failed', {
            description: 'Server is not responding',
          });
        }
      } else {
        // If already connected, just test
        const result = await testConnection();
        if (result) {
          toast.success('Ping Successful', {
            description: 'Server is responding',
          });
        } else {
          toast.warning('Ping Failed', {
            description: 'Server is not responding',
          });
        }
      }
    } catch (error) {
      toast.error('Connection Test Failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server Connection
          </CardTitle>
          <Badge
            variant={isConnected ? 'default' : 'destructive'}
            className={`flex items-center gap-1 ${isConnected ? 'bg-primary hover:bg-primary' : ''}`}
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                Disconnected
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Current Server:</p>
          <code className="text-sm font-mono px-2 py-1 rounded bg-muted">
            {serverInfo.url || 'No server selected'}
          </code>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isConnected ? (
            <Button
              onClick={handleConnect}
              disabled={isLoading}
              variant="default"
              className="bg-avian-orange hover:bg-avian-orange-dark"
              size="sm"
            >
              {isLoading ? 'Connecting...' : 'Connect'}
            </Button>
          ) : (
            <Button onClick={handleDisconnect} disabled={isLoading} variant="destructive" size="sm">
              Disconnect
            </Button>
          )}

          <Button
            onClick={handleTest}
            disabled={isLoading || isTesting}
            variant="secondary"
            size="sm"
          >
            <Activity className="h-4 w-4 mr-1" />
            {isTesting ? 'Testing...' : isConnected ? 'Ping Server' : 'Test Connection'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4 mr-1" />
                Select Server
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {serverInfo.servers.map((server: any, index: number) => (
                <DropdownMenuItem key={index} onClick={() => handleServerSelect(index)}>
                  <div className="flex flex-col w-full">
                    <span className="font-medium">{server.host}</span>
                    <span className="text-xs text-muted-foreground">
                      {server.region} • {server.protocol}://{server.host}:{server.port}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
