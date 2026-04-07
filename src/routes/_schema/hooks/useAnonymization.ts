import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AnonymizationRule } from "#/lib/anonymization-types";
import { extractErrorMessage } from "#/lib/errors";
import {
	createAnonymizationProfileFn,
	deleteAnonymizationProfileFn,
	duplicateAnonymizationProfileFn,
	getAnonymizationProfilesFn,
	getAnonymizationRulesFn,
	saveAnonymizationRulesFn,
} from "#/server/anonymization-fns";

export function useAnonymization(activeConnectionId: number | undefined) {
	const [selectedProfileId, setSelectedProfileId] = useState<number | null>(
		null,
	);

	const profilesQuery = useQuery({
		queryKey: ["anonymization-profiles", activeConnectionId],
		queryFn: async () => {
			if (!activeConnectionId) return [];
			return getAnonymizationProfilesFn({ data: activeConnectionId });
		},
		enabled: !!activeConnectionId,
	});

	const rulesQuery = useQuery({
		queryKey: ["anonymization-rules", selectedProfileId],
		queryFn: async () => {
			if (!selectedProfileId) return [];
			return getAnonymizationRulesFn({ data: selectedProfileId });
		},
		enabled: !!selectedProfileId,
	});

	const createProfileMutation = useMutation({
		mutationFn: async (name: string) => {
			if (!activeConnectionId) throw new Error("No active connection");
			return createAnonymizationProfileFn({
				data: { connectionId: activeConnectionId, name },
			});
		},
		onSuccess: (profile) => {
			profilesQuery.refetch();
			setSelectedProfileId(profile.id);
			toast.success("Profile created", { description: profile.name });
		},
		onError: (error) => {
			toast.error("Failed to create profile", {
				description: extractErrorMessage(error),
			});
		},
	});

	const deleteProfileMutation = useMutation({
		mutationFn: async (profileId: number) => {
			return deleteAnonymizationProfileFn({ data: profileId });
		},
		onSuccess: () => {
			profilesQuery.refetch();
			setSelectedProfileId(null);
			toast.success("Profile deleted");
		},
		onError: (error) => {
			toast.error("Failed to delete profile", {
				description: extractErrorMessage(error),
			});
		},
	});

	const duplicateProfileMutation = useMutation({
		mutationFn: async ({
			profileId,
			newName,
		}: {
			profileId: number;
			newName: string;
		}) => {
			return duplicateAnonymizationProfileFn({ data: { profileId, newName } });
		},
		onSuccess: (profile) => {
			if (profile) {
				profilesQuery.refetch();
				setSelectedProfileId(profile.id);
				toast.success("Profile duplicated", { description: profile.name });
			}
		},
		onError: (error) => {
			toast.error("Failed to duplicate profile", {
				description: extractErrorMessage(error),
			});
		},
	});

	const saveRulesMutation = useMutation({
		mutationFn: async ({
			profileId,
			rules,
		}: {
			profileId: number;
			rules: AnonymizationRule[];
		}) => {
			return saveAnonymizationRulesFn({
				data: {
					profileId,
					rules: rules.map((r) => ({
						tableName: r.tableName,
						columnName: r.columnName,
						method: r.method,
						options: r.options,
					})),
				},
			});
		},
		onSuccess: () => {
			rulesQuery.refetch();
			profilesQuery.refetch();
			toast.success("Rules saved");
		},
		onError: (error) => {
			toast.error("Failed to save rules", {
				description: extractErrorMessage(error),
			});
		},
	});

	return {
		selectedProfileId,
		setSelectedProfileId,
		profilesQuery,
		rulesQuery,
		createProfileMutation,
		deleteProfileMutation,
		duplicateProfileMutation,
		saveRulesMutation,
	};
}
