import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInstanceStatus,
  getInstanceQrCode,
  logoutInstance,
  restartInstance,
} from "@/lib/evolution/instance.functions";
import { Wifi, WifiOff, Loader2, QrCode, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InstanceStatusCardProps {
  instanceName?: string;
  operatorName?: string;
  compact?: boolean;
}

export function InstanceStatusCard({ instanceName, operatorName, compact = false }: InstanceStatusCardProps) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getInstanceStatus);
  const qrFn = useServerFn(getInstanceQrCode);
  const logoutFn = useServerFn(logoutInstance);
  const restartFn = useServerFn(restartInstance);

  const [showQr, setShowQr] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["instance-status", instanceName ?? "me"],
    queryFn: () => statusFn({ data: { instance_name: instanceName } }),
    refetchInterval: 15_000,
    retry: false,
  });

  const {
    data: qrData,
    isPending: loadingQr,
    mutate: generateQr,
  } = useMutation({
    mutationFn: () => qrFn({ data: { instance_name: instanceName } }),
    onSuccess: () => setShowQr(true),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar QR"),
  });

  useEffect(() => {
    if (status?.connected) setShowQr(false);
  }, [status?.connected]);

  const handleLogout = async () => {
    if (!confirm(`Desconectar a instância ${status?.instance}?`)) return;
    try {
      await logoutFn({ data: { instance_name: instanceName } });
      toast.success("Instância desconectada");
      qc.invalidateQueries({ queryKey: ["instance-status", instanceName ?? "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar");
    }
  };

  const handleRestart = async () => {
    try {
      await restartFn({ data: { instance_name: instanceName } });
      toast.success("Instância reiniciada");
      setTimeout(
        () => qc.invalidateQueries({ queryKey: ["instance-status", instanceName ?? "me"] }),
        3000,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reiniciar");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando conexão...
      </div>
    );
  }

  const connected = status?.connected;
  const state = status?.state ?? "unknown";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
        <span className="text-xs text-muted-foreground">
          {connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
        </span>
        {!connected && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => generateQr()}>
            <QrCode className="h-3 w-3 mr-1" /> Reconectar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {connected ? (
            <Wifi className="h-5 w-5 text-green-500" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-500" />
          )}
          <div>
            <p className="text-sm font-medium">{operatorName ?? status?.instance}</p>
            <p className="text-xs text-muted-foreground">{status?.instance}</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            connected
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : state === "connecting"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected
                ? "bg-green-500 animate-pulse"
                : state === "connecting"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500"
            }`}
          />
          {connected ? "Conectado" : state === "connecting" ? "Conectando…" : "Desconectado"}
        </div>
      </div>

      {!connected && (
        <div className="space-y-3">
          {showQr && qrData?.base64 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Abra o WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie o QR
              </p>
              <div className="flex justify-center">
                <img src={qrData.base64} alt="QR Code WhatsApp" className="h-52 w-52 rounded-lg border" />
              </div>
              <p className="text-[11px] text-center text-muted-foreground">
                O QR code expira em 60 segundos. Aguardando conexão…
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => generateQr()} disabled={loadingQr}>
                {loadingQr ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Gerando…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-2" /> Gerar novo QR
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button className="w-full" size="sm" onClick={() => generateQr()} disabled={loadingQr}>
              {loadingQr ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando QR code…
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4 mr-2" /> Gerar QR code para conectar
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {connected && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleRestart}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Reiniciar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" /> Desconectar
          </Button>
        </div>
      )}
    </div>
  );
}
