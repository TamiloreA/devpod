// components/ConnectJiraButton.tsx
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { TouchableOpacity, Text, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

const FUNCTIONS_BASE =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ||
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

type Props = { returnTo?: string }; 

export default function ConnectJiraButton({ returnTo }: Props) {
  const start = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) throw new Error("Not signed in");

      const absReturnTo =
        returnTo && returnTo.startsWith("/")
          ? Linking.createURL(returnTo) 
          : returnTo || "";

      const url = `${FUNCTIONS_BASE}/oauth/jira/start?access_token=${encodeURIComponent(
        jwt
      )}${absReturnTo ? `&return_to=${encodeURIComponent(absReturnTo)}` : ""}`;

      await WebBrowser.openBrowserAsync(url, {
        enableBarCollapsing: true,
        showInRecents: true,
      });
    } catch (e: any) {
      Alert.alert("Jira", e?.message ?? "Could not start Jira connect.");
    }
  };

  return (
    <TouchableOpacity
      onPress={start}
      style={{
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
      }}
    >
      <Text style={{ fontWeight: "800", color: "#000" }}>Connect Jira</Text>
    </TouchableOpacity>
  );
}
