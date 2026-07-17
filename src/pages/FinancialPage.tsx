/** Arakne — Financial page (disguised as "Meus Materiais").

  All financial terms are disguised:
  - Empréstimo = "kit de material"
  - Quitação = "padrão concluído"
  - Tier = "nível"
  - Saldo devedor = "materiais em uso"
  - Limite = "materiais disponíveis"
*/

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createEmprestimo,
  ensureToken,
  getEmprestimoIds,
  getMe,
  getIdentificador,
  getConvite,
  pagarEmprestimo,
  addEmprestimoId,
  getEmprestimo,
} from "@/lib/arakne-api";
import type { ConviteResponse, Emprestimo, Usuaria } from "@/lib/arakne-types";

const TIER_LABELS: Record<number, string> = { 0: "Iniciante", 1: "Aprendiz", 2: "Artesã", 3: "Mestra" };
const TIER_LIMITS: Record<number, number> = { 0: 0, 1: 5000, 2: 15000, 3: 40000 };

export default function FinancialPage() {
  const navigate = useNavigate();
  const [usuaria, setUsuaria] = useState<Usuaria | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convite, setConvite] = useState<ConviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Repay modal state
  const [repayModal, setRepayModal] = useState<{
    open: boolean;
    emprestimo: Emprestimo | null;
    valor: string;
    processing: boolean;
    result: { quitado: boolean; tier: number; saldo_devedor: number } | null;
  }>({ open: false, emprestimo: null, valor: "", processing: false, result: null });

  // Invoice display
  const [invoiceDisplay, setInvoiceDisplay] = useState<Emprestimo | null>(null);

  // Tier upgrade animation
  const [tierUpgraded, setTierUpgraded] = useState<number | null>(null);

  useSeoMeta({ title: "Arakne — Meus Materiais" });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await ensureToken();
    if (!token) {
      setError("Não foi possível carregar seus dados. Verifique se o backend está rodando.");
      setLoading(false);
      return;
    }
    let me = await getMe(token);
    let activeToken = token;
    if (!me) {
      localStorage.removeItem("arakne_token");
      const retryToken = await ensureToken();
      if (!retryToken) { setError("Não foi possível carregar seus dados."); setLoading(false); return; }
      me = await getMe(retryToken);
      activeToken = retryToken;
      if (!me) { setError("Não foi possível carregar seus dados."); setLoading(false); return; }
    }
    setUsuaria(me);

    const ids = getEmprestimoIds();
    const results: Emprestimo[] = [];
    for (const id of ids) {
      const emp = await getEmprestimo(id);
      if (emp) results.push(emp);
    }
    results.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    setEmprestimos(results);

    if (me && me.tier >= 3) {
      const conviteData = await getConvite(activeToken);
      if (conviteData) setConvite(conviteData);
    } else {
      setConvite(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const podeEmprestar = usuaria
    ? usuaria.tier >= 1 && !usuaria.tier_congelado && usuaria.saldo_devedor === 0
    : false;
  const limite = usuaria ? TIER_LIMITS[usuaria.tier] ?? 0 : 0;

  const handleSolicitarKit = async () => {
    const ident = getIdentificador();
    if (!ident) return;
    setActionLoading(true);
    const emp = await createEmprestimo(ident);
    if (emp) {
      addEmprestimoId(emp.id);
      setEmprestimos((prev) => [emp, ...prev]);
      setInvoiceDisplay(emp);
      await loadData();
    } else {
      setError("Não foi possível solicitar o kit no momento.");
    }
    setActionLoading(false);
  };

  const openRepayModal = (emp: Emprestimo) => {
    setRepayModal({ open: true, emprestimo: emp, valor: String(emp.valor_sats), processing: false, result: null });
  };
  const closeRepayModal = () => {
    setRepayModal({ open: false, emprestimo: null, valor: "", processing: false, result: null });
  };

  const handleRepay = async () => {
    const emp = repayModal.emprestimo;
    if (!emp) return;
    const valor = parseInt(repayModal.valor, 10);
    if (!valor || valor <= 0) return;

    setRepayModal((prev) => ({ ...prev, processing: true }));
    const result = await pagarEmprestimo(emp.id, valor);

    if (result) {
      setRepayModal((prev) => ({
        ...prev, processing: false,
        result: { quitado: result.quitado, tier: result.tier, saldo_devedor: result.saldo_devedor },
      }));
      if (result.quitado && usuaria && result.tier > usuaria.tier) {
        setTierUpgraded(result.tier);
        setTimeout(() => setTierUpgraded(null), 3000);
      }
      setTimeout(async () => { await loadData(); closeRepayModal(); }, 1800);
    } else {
      setRepayModal((prev) => ({ ...prev, processing: false }));
      setError("Não foi possível concluir o padrão.");
      closeRepayModal();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
        <div className="h-9 w-9 border-3 border-amber-200 border-t-amber-700 rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-950 shadow-sm">
        <span className="text-2xl">🧶</span>
        <span className="text-lg font-bold text-amber-800 dark:text-amber-200">Arakne</span>
        <span className="ml-auto text-xs text-muted-foreground">crochê & tecelagem</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar aos padrões
        </Button>

        <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-4">Meus Materiais</h2>

        {error && (
          <Card className="mb-4 border-red-300 bg-red-50 dark:bg-red-950/30">
            <CardContent className="py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" onClick={() => { setError(null); loadData(); }}>Tentar de novo</Button>
            </CardContent>
          </Card>
        )}

        {/* Tier upgrade banner */}
        {tierUpgraded !== null && (
          <div className="mb-4 rounded-xl border border-green-400 bg-green-50 dark:bg-green-950/30 px-4 py-3 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="text-xl">🎉</span>
            <span className="font-semibold text-green-700 dark:text-green-300 text-sm">
              Nível subiu para {TIER_LABELS[tierUpgraded] ?? tierUpgraded}!
            </span>
          </div>
        )}

        {/* Tier card */}
        <Card className={`mb-3 border-l-4 border-l-amber-700 ${tierUpgraded !== null ? "ring-2 ring-green-300" : ""}`}>
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Nível Atual</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-amber-700 dark:text-amber-300">{usuaria?.tier ?? 0}</span>
                <span className="text-sm text-amber-600 dark:text-amber-400">{TIER_LABELS[usuaria?.tier ?? 0] ?? "—"}</span>
              </div>
            </div>
            {podeEmprestar && <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Disponível</Badge>}
            {usuaria?.tier_congelado && <Badge variant="outline" className="border-orange-400 text-orange-600">Pausado</Badge>}
          </CardContent>
        </Card>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Materiais Disponíveis</p>
              <p className="text-xl font-bold">{limite.toLocaleString("pt-BR")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Materiais em Uso</p>
              <p className="text-xl font-bold">{(usuaria?.saldo_devedor ?? 0).toLocaleString("pt-BR")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Solicitar kit button */}
        {podeEmprestar && (
          <Button onClick={handleSolicitarKit} disabled={actionLoading} className="w-full mb-4 h-12 text-base">
            {actionLoading ? "Solicitando..." : "Solicitar Kit de Material"}
          </Button>
        )}

        {/* History */}
        <Card className="mb-3">
          <CardHeader><CardTitle className="text-base">Histórico de Kits</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {emprestimos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">Nenhum kit solicitado ainda.</p>
            ) : (
              emprestimos.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">Kit #{emp.id}</p>
                    <p className="text-xs text-muted-foreground">{new Date(emp.criado_em).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-amber-700 dark:text-amber-300">{emp.valor_sats.toLocaleString("pt-BR")}</span>
                    {emp.status === "ativo" ? (
                      <Button size="sm" variant="secondary" onClick={() => openRepayModal(emp)} disabled={actionLoading}>
                        Concluir Padrão
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-300">Concluído</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Invite link for tier 3+ */}
        {convite && (
          <Card className="mb-3 border-l-4 border-l-amber-400">
            <CardHeader><CardTitle className="text-base">Convidar Aprendiz</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Compartilhe este link para convidar uma nova aprendiz:</p>
              <div className="flex gap-2">
                <Input readOnly value={window.location.origin + convite.link}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="text-xs font-mono"
                />
                <Button size="icon" variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + convite.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        <Card>
          <CardContent className="py-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Padrões concluídos</span>
            <span className="font-semibold">{usuaria?.padroes_completos ?? 0}</span>
          </CardContent>
        </Card>
      </main>

      {/* Repay modal */}
      <Dialog open={repayModal.open} onOpenChange={(open) => !open && closeRepayModal()}>
        <DialogContent>
          {repayModal.result ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">{repayModal.result.quitado ? "🎉" : "✅"}</div>
              <DialogTitle className="text-lg font-bold text-amber-800 dark:text-amber-200">
                {repayModal.result.quitado ? "Padrão Concluído!" : "Pagamento registrado!"}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {repayModal.result.quitado
                  ? `Seu nível subiu para ${TIER_LABELS[repayModal.result.tier] ?? repayModal.result.tier}!`
                  : `Materiais em uso: ${repayModal.result.saldo_devedor.toLocaleString("pt-BR")}`}
              </DialogDescription>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Concluir Padrão</DialogTitle>
                <DialogDescription>
                  Kit #{repayModal.emprestimo?.id} — Valor total: {repayModal.emprestimo?.valor_sats.toLocaleString("pt-BR")}
                  {usuaria && usuaria.saldo_devedor > 0 && (
                    <> · Materiais em uso: {usuaria.saldo_devedor.toLocaleString("pt-BR")}</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <label className="text-sm font-medium">Quanto você quer pagar?</label>
                <Input type="number" value={repayModal.valor} min={1}
                  onChange={(e) => setRepayModal((prev) => ({ ...prev, valor: e.target.value }))}
                  className="text-lg" autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    const half = Math.floor((repayModal.emprestimo?.valor_sats ?? 0) / 2);
                    setRepayModal((prev) => ({ ...prev, valor: String(half) }));
                  }}>Metade</Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setRepayModal((prev) => ({ ...prev, valor: String(prev.emprestimo?.valor_sats ?? 0) }));
                  }}>Tudo</Button>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={closeRepayModal} disabled={repayModal.processing}>Cancelar</Button>
                  <Button onClick={handleRepay}
                    disabled={repayModal.processing || !repayModal.valor || parseInt(repayModal.valor, 10) <= 0}>
                    {repayModal.processing ? "Processando..." : "Pagar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice display modal */}
      <Dialog open={!!invoiceDisplay} onOpenChange={(open) => !open && setInvoiceDisplay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kit Solicitado! 🧶</DialogTitle>
            <DialogDescription>
              Seu kit de material foi solicitado com sucesso.
              Valor: {invoiceDisplay?.valor_sats.toLocaleString("pt-BR")}
            </DialogDescription>
          </DialogHeader>
          {invoiceDisplay?.invoice_bolt11 && (
            <div className="rounded-lg bg-muted p-3 border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Invoice Lightning:</p>
              <code className="block text-[10px] font-mono break-all max-h-20 overflow-y-auto">
                {invoiceDisplay.invoice_bolt11}
              </code>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Para concluir o padrão, use o botão "Concluir Padrão" no histórico.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setInvoiceDisplay(null)}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
