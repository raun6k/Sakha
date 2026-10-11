import type {
  Bootstrap,
  OperationInput,
  OperationName,
  OperationOutput,
  SakhaService,
  ServiceRequest,
} from "@sakha/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useRef } from "react";
import { commandKey } from "./http";
export const ServiceContext = createContext<{
  service: SakhaService;
  demo: boolean;
} | null>(null);
export function useService() {
  const context = useContext(ServiceContext);
  if (!context) throw new Error("Sakha service provider is missing.");
  return context;
}
export function useRead<K extends OperationName>(
  name: K,
  request: ServiceRequest<K>,
  enabled = true,
) {
  const { service } = useService();
  return useQuery({
    queryKey: ["sakha", request.params?.farmId ?? "global", name, request],
    queryFn: () => service.execute(name, request),
    enabled,
    retry: 1,
  });
}
export function useFarmId() {
  const q = useRead("bootstrap", { input: {} });
  return (
    q.data?.farms.find((f) => f.setup_complete)?.id ??
    q.data?.farms[0]?.id ??
    ""
  );
}
export function useCommand<K extends OperationName>(
  name: K,
  params?: Record<string, string>,
) {
  const { service } = useService();
  const client = useQueryClient();
  const identities = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: (input: OperationInput<K>) => {
      const hash = JSON.stringify({ name, params, input });
      let key = identities.current.get(hash);
      if (!key) {
        key = commandKey();
        identities.current.set(hash, key);
      }
      return service.execute(name, {
        input,
        params,
        command: { idempotency_key: key },
      } as ServiceRequest<K>);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["sakha"] }),
  });
}
export async function executeCommand<K extends OperationName>(
  service: SakhaService,
  name: K,
  request: Omit<ServiceRequest<K>, "command">,
  key: string = commandKey(),
): Promise<OperationOutput<K>> {
  return service.execute(name, {
    ...request,
    command: { idempotency_key: key },
  });
}
export function bootstrapFarm(bootstrap: Bootstrap) {
  return bootstrap.farms.find((f) => f.setup_complete) ?? bootstrap.farms[0];
}
