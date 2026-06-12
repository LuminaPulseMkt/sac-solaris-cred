import { create } from "zustand";
import type { Collaborator } from "@/types/sac";

interface CollabState {
  items: Collaborator[];
  add: (c: Omit<Collaborator, "id">) => void;
  update: (id: string, c: Partial<Collaborator>) => void;
  remove: (id: string) => void;
}

export const useCollaboratorsStore = create<CollabState>((set) => ({
  items: [],
  add: (c) => set((s) => ({ items: [...s.items, { ...c, id: `c${Date.now()}` }] })),
  update: (id, c) =>
    set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...c } : it)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
}));
