import { create } from "zustand";
export interface SetupDraft {
  name: string;
  state: string;
  district: string;
  village: string;
  area: string;
  areaUnit: "ha" | "acre";
  water: string;
  situation: string;
  crop: string;
}
const initial: SetupDraft = {
  name: "",
  state: "",
  district: "",
  village: "",
  area: "",
  areaUnit: "ha",
  water: "",
  situation: "",
  crop: "",
};
interface UiState {
  setup: SetupDraft;
  step: number;
  composer: Record<string, string>;
  patchSetup: (patch: Partial<SetupDraft>) => void;
  setStep: (step: number) => void;
  clearSetup: () => void;
  setComposer: (role: string, text: string) => void;
}
export const useUi = create<UiState>((set) => ({
  setup: { ...initial },
  step: 0,
  composer: {},
  patchSetup: (patch) => set((s) => ({ setup: { ...s.setup, ...patch } })),
  setStep: (step) => set({ step }),
  clearSetup: () => set({ setup: { ...initial }, step: 0 }),
  setComposer: (role, text) =>
    set((s) => ({ composer: { ...s.composer, [role]: text } })),
}));
