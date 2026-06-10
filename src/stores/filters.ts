import { create } from "zustand";
import type { Channel } from "@/types/sac";

export type ScoreBucket = "all" | "high" | "medium" | "low";

interface FiltersState {
  channel: Channel | "all";
  score: ScoreBucket;
  collaboratorId: string | "all";
  search: string;
  setChannel: (c: Channel | "all") => void;
  setScore: (s: ScoreBucket) => void;
  setCollaboratorId: (id: string | "all") => void;
  setSearch: (s: string) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  channel: "all",
  score: "all",
  collaboratorId: "all",
  search: "",
  setChannel: (channel) => set({ channel }),
  setScore: (score) => set({ score }),
  setCollaboratorId: (collaboratorId) => set({ collaboratorId }),
  setSearch: (search) => set({ search }),
  reset: () => set({ channel: "all", score: "all", collaboratorId: "all", search: "" }),
}));
