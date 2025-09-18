import * as Linking from "expo-linking";
import React from "react";
import { TouchableOpacity, Text, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

export default function ConnectJiraButton({
  returnTo,
  label = "Connect Jira",
}: {
  returnTo?: string;
  label?: string;
}) {
  const start = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) throw new Error("Not signed in");

      const appReturnUrl = returnTo
        ? Linking.createURL(returnTo.startsWith("/") ? returnTo.slice(1) : returnTo)
        : undefined;

      const fnBase = (supabase as any).functions?._url
        || `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1`;

      const url = new URL(`${fnBase}/oauth/jira/start`);
      url.searchParams.set("access_token", jwt);
      if (appReturnUrl) url.searchParams.set("return_to", appReturnUrl);

      await Linking.openURL(url.toString());
    } catch (e: any) {
      Alert.alert("Jira", e?.message ?? "Could not start Jira connect.");
    }
  };

  return (
    <TouchableOpacity
      onPress={start}
      style={{
        backgroundColor: "#ffffff",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        alignItems: "center",
      }}
      activeOpacity={0.85}
    >
      <Text style={{ fontWeight: "800", color: "#000" }}>{label}</Text>
    </TouchableOpacity>
  );
}
