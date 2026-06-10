import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SlaTargets, AlertRule } from "@/types/sac";

interface SettingsState {
  theme: "light" | "dark";
  sla: SlaTargets;
  minScore: number;
  rules: AlertRule;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  setSla: (s: Partial<SlaTargets>) => void;
  setMinScore: (n: number) => void;
  setRules: (r: Partial<AlertRule>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      sla: { whatsapp: 180, chat: 120, email: 600 },
      minScore: 60,
      rules: {
        noResponseMinutes: 10,
        minScore: 60,
        queuePeakThreshold: 12,
        notifyEmail: true,
        notifyWebhook: false,
      },
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setSla: (s) => set((st) => ({ sla: { ...st.sla, ...s } })),
      setMinScore: (n) => set({ minScore: n }),
      setRules: (r) => set((st) => ({ rules: { ...st.rules, ...r } })),
    }),
    { name: "sac-settings" },
  ),
);
