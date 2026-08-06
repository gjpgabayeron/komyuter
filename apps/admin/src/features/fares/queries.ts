import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fareConfigKeys } from "@/lib/queryKeys";
import {
  createFareConfig,
  deactivateFareConfig,
  listFareConfigs,
  updateFareConfig,
  type CreateFareConfigPayload,
  type UpdateFareConfigPayload,
} from "./api";

export function useFareConfigsQuery() {
  return useQuery({
    queryKey: fareConfigKeys.all,
    queryFn: listFareConfigs,
    staleTime: 30_000,
  });
}

export function useCreateFareConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFareConfigPayload) => createFareConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fareConfigKeys.all });
      toast.success("Fare configuration created.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateFareConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fareConfigId,
      patch,
    }: {
      fareConfigId: string;
      patch: UpdateFareConfigPayload;
    }) => updateFareConfig(fareConfigId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fareConfigKeys.all });
      toast.success("Fare configuration updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeactivateFareConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fareConfigId: string) => deactivateFareConfig(fareConfigId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fareConfigKeys.all });
      toast.success("Fare configuration deactivated.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
