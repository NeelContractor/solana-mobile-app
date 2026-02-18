// App.tsx
import "./src/polyfills";
import "react-native-get-random-values";
import { Buffer } from "buffer";
global.Buffer = Buffer;

const ReactQuery = require("@tanstack/react-query");
const QueryClient = ReactQuery.QueryClient;
const QueryClientProvider = ReactQuery.QueryClientProvider;

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import CheckInScreen from "./src/p-o-p-screens/check-in";
import BadgesScreen from "./src/p-o-p-screens/badge";
import CreateEventScreen from "./src/p-o-p-screens/create-event-screen";
import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";

const queryClient = new QueryClient();

type Screen = "home" | "checkin" | "badges" | "create";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");

  const renderScreen = () => {
    switch (currentScreen) {
      case "checkin": return <CheckInScreen />;
      case "badges": return <BadgesScreen />;
      case "create": return <CreateEventScreen />;
      default: return <HomeScreen onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider>
          <SafeAreaView style={styles.container}>
            {renderScreen()}

            {/* Bottom Nav */}
            <View style={styles.nav}>
              {(["home", "checkin", "badges", "create"] as Screen[]).map((s) => (
                <TouchableOpacity key={s} onPress={() => setCurrentScreen(s)} style={styles.navItem}>
                  <Text style={[styles.navText, currentScreen === s && styles.navActive]}>
                    {s === "home" ? "🏠" : s === "checkin" ? "📍" : s === "badges" ? "🏅" : "➕"}
                  </Text>
                  <Text style={[styles.navLabel, currentScreen === s && styles.navActive]}>
                    {s === "home" ? "Home" : s === "checkin" ? "Check In" : s === "badges" ? "Badges" : "Create"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

function HomeScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <View style={styles.home}>
      <Text style={styles.title}>Proof of Presence</Text>
      <Text style={styles.subtitle}>Decentralized Event Verification</Text>
      <TouchableOpacity style={styles.button} onPress={() => onNavigate("checkin")}>
        <Text style={styles.buttonText}>📍 Check In to Event</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => onNavigate("badges")}>
        <Text style={styles.buttonText}>🏅 My Badges</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => onNavigate("create")}>
        <Text style={styles.buttonText}>➕ Create Event</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f23" },
  home: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "bold", color: "#9945FF", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#aaa", marginBottom: 48 },
  button: { width: "100%", backgroundColor: "#9945FF", padding: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  buttonSecondary: { backgroundColor: "#1a1a3e" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  nav: { flexDirection: "row", backgroundColor: "#1a1a3e", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#2a2a4e" },
  navItem: { flex: 1, alignItems: "center" },
  navText: { fontSize: 20 },
  navLabel: { fontSize: 10, color: "#666", marginTop: 2 },
  navActive: { color: "#9945FF" },
});