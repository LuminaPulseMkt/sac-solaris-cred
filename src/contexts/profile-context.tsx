import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/operators/operator-auth.functions";

type Profile = {
  role: "admin" | "operator";
  operator: {
    id: string;
    name: string;
    instance_name: string;
    channel?: string | null;
    status?: string | null;
  } | null;
  email: string;
};

const ProfileContext = createContext<Profile | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const fn = useServerFn(getMyProfile);
  const { data } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });

  return <ProfileContext.Provider value={(data as Profile) ?? null}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function useIsAdmin() {
  const p = useProfile();
  // Default enquanto carrega: assume admin para não bloquear UI
  return !p || p.role === "admin";
}

export function useMyOperatorId() {
  return useProfile()?.operator?.id ?? null;
}
