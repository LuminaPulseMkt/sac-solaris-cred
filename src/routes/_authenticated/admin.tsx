import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createTenant,
  isSuperAdmin,
  listTenants,
} from "@/lib/tenants/tenants.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const checkSuper = useServerFn(isSuperAdmin);
  const list = useServerFn(listTenants);
  const create = useServerFn(createTenant);
  const qc = useQueryClient();

  const { data: superData, isLoading: loadingSuper } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: () => checkSuper(),
    staleTime: 5 * 60_000,
  });

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: () => list(),
    enabled: !!superData?.isSuperAdmin,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", adminEmail: "", adminPassword: "" });

  const mutation = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      toast.success(`Empresa criada com sucesso.`);
      qc.invalidateQueries({ queryKey: ["all-tenants"] });
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
      setOpen(false);
      setForm({ name: "", slug: "", adminEmail: "", adminPassword: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar empresa"),
  });

  if (loadingSuper) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!superData?.isSuperAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta página é exclusiva para super administradores. Adicione seu
            e-mail em <code className="font-mono">app_settings.super_admin_emails</code>.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Empresas cadastradas</h1>
          <p className="text-sm text-muted-foreground">
            Cada empresa fica isolada no seu próprio schema Postgres.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar nova empresa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Empresa B"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                  placeholder="empresa-b"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Apenas minúsculas, números e hífen. Vira o schema <code>empresa_b</code>.
                </p>
              </div>
              <div>
                <Label htmlFor="adminEmail">E-mail do admin</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="adminPassword">Senha inicial</Label>
                <Input
                  id="adminPassword"
                  type="text"
                  value={form.adminPassword}
                  onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                  placeholder="mínimo 8 caracteres"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar empresa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3">
          {tenants.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    schema: {t.schema_name} · slug: {t.slug}
                  </div>
                </div>
                <Badge variant={t.active ? "default" : "secondary"}>
                  {t.active ? "Ativa" : "Inativa"}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {tenants.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma empresa cadastrada ainda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
